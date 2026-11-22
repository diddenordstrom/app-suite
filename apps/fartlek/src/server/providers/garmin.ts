import type { ISODate } from "../../shared/dates";
import type { Wellness } from "../../shared/types";
import { parseFit } from "./fit";
import type { DayVo2max, Provider, ProviderActivity } from "./types";

/**
 * Garmin Connect personal API (pull only). Paths from Garmin's official client
 * (github.com/garmin/connect-personal-api-python) and the old app's verified calls.
 * The key is exchanged for a ~24 h JWT; there is no refresh token.
 */
export const TOKEN_PATH = "/personalapitoken-service/personal-api/personal-api-key/token";
const PAGE = 45; // larger pages return HTTP 500

export class GarminError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface TokenStore {
  get(): { token: string; exp: number } | null;
  set(token: string, exp: number): void;
}

type FetchFn = typeof fetch;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function jwtExp(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8")) as { exp?: number };
    if (payload.exp) return payload.exp * 1000;
  } catch { /* fall through */ }
  return Date.now() + 23 * 3600 * 1000;
}

export async function exchangeKey(baseUrl: string, apiKey: string, fetchFn: FetchFn = fetch): Promise<{ token: string; exp: number }> {
  const r = await fetchFn(baseUrl + TOKEN_PATH, { method: "POST", headers: { Accept: "*/*", Authorization: `ApiKey ${apiKey}` } });
  if (r.status === 401 || r.status === 403) throw new GarminError("Garmin rejected the API key. It may be wrong, deleted or expired.", r.status);
  if (!r.ok) throw new GarminError(`Garmin token request failed (HTTP ${r.status})`, r.status);
  const token = (await r.text()).trim().replace(/^"|"$/g, "");
  if (!token) throw new GarminError("Garmin returned an empty token");
  return { token, exp: jwtExp(token) };
}

/**
 * Overall sleep score (0–100) from a daily sleep response. The Personal API returns a flat object
 * with `sleepScores.overall.value`; the Connect web API nests it under `dailySleepDTO`, so accept both.
 */
export function sleepScoreOf(res: unknown): number | null {
  const r = res as { dailySleepDTO?: Record<string, unknown>; sleepScores?: unknown } | null;
  const scores = (r?.dailySleepDTO?.sleepScores ?? r?.sleepScores) as { overall?: { value?: unknown } } | undefined;
  return num(scores?.overall?.value) ?? num(r?.dailySleepDTO?.sleepScore) ?? null;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

export function mapActivity(a: Record<string, unknown>): ProviderActivity | null {
  const id = a.activityId;
  if (id == null) return null;
  const type = (a.activityType as { typeKey?: string } | undefined)?.typeKey ?? "other";
  const zones = [1, 2, 3, 4, 5].map((i) => num(a[`hrTimeInZone_${i}`]));
  return {
    id: `garmin:${id}`,
    name: String(a.activityName ?? type),
    typeKey: type,
    startTimeLocal: String(a.startTimeLocal ?? a.startTimeGMT ?? ""),
    distanceM: num(a.distance) ?? 0,
    durationS: num(a.duration) ?? num(a.movingDuration) ?? 0,
    avgHr: num(a.averageHR),
    maxHr: num(a.maxHR),
    elevationGain: num(a.elevationGain),
    zoneSecs: zones.some((z) => z != null) ? (zones.map((z) => z ?? 0) as ProviderActivity["zoneSecs"]) : null,
    eventType: (a.eventType as { typeKey?: unknown } | undefined)?.typeKey as string | undefined ?? null,
  };
}

/**
 * Highest Body Battery level in a daily report entry. Rows of `bodyBatteryValuesArray` are
 * [timestamp, level], with the column order given by `bodyBatteryValueDescriptorDTOList`.
 */
export function maxBodyBattery(entry: Record<string, unknown>): number | null {
  const direct = num(entry.bodyBatteryHighestValue) ?? num(entry.highest) ?? num(entry.maxBodyBattery);
  if (direct != null) return direct;
  const desc = entry.bodyBatteryValueDescriptorDTOList as { bodyBatteryValueDescriptorIndex?: number; bodyBatteryValueDescriptorKey?: string }[] | undefined;
  const col = desc?.find((d) => d.bodyBatteryValueDescriptorKey === "bodyBatteryLevel")?.bodyBatteryValueDescriptorIndex ?? 1;
  const arr = entry.bodyBatteryValuesArray as unknown[] | undefined;
  if (Array.isArray(arr)) {
    const levels = arr.map((v) => (Array.isArray(v) ? num(v[col]) : null)).filter((v): v is number => v != null);
    if (levels.length) return Math.max(...levels);
  }
  return null;
}

/**
 * One day of Garmin's VO2max (`/metrics-service/metrics/maxmet/daily`): running ("generic") only, the
 * precise value when there is one. Days without a running value give null.
 */
export function mapVo2max(e: Record<string, unknown>): DayVo2max | null {
  const g = e.generic as Record<string, unknown> | null | undefined;
  if (!g || typeof g.calendarDate !== "string") return null;
  const v = num(g.vo2MaxPreciseValue) ?? num(g.vo2MaxValue);
  return v != null && v > 0 ? { date: g.calendarDate.slice(0, 10), value: Math.round(v * 10) / 10 } : null;
}

/** Split sorted dates into consecutive [start, end] ranges of at most `size` days (Garmin refuses long ranges). */
export function dateChunks(sorted: ISODate[], size = 7): [ISODate, ISODate][] {
  const out: [ISODate, ISODate][] = [];
  for (let i = 0; i < sorted.length; i += size) {
    const part = sorted.slice(i, i + size);
    out.push([part[0], part[part.length - 1]]);
  }
  return out;
}

export function createGarminProvider(opts: { baseUrl: string; apiKey: string; tokens: TokenStore; fetchFn?: FetchFn }): Provider {
  const fetchFn = opts.fetchFn ?? fetch;
  async function token(): Promise<string> {
    const cached = opts.tokens.get();
    if (cached && cached.exp - Date.now() > 3600_000) return cached.token;
    const fresh = await exchangeKey(opts.baseUrl, opts.apiKey, fetchFn);
    opts.tokens.set(fresh.token, fresh.exp);
    return fresh.token;
  }

  /** GET with 429 back-off: wait for retry-after (default 20 s, max 60 s), up to 3 retries. */
  async function get(path: string, accept = "application/json"): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      const r = await fetchFn(opts.baseUrl + path, { headers: { Accept: accept, Authorization: `Bearer ${await token()}` } });
      if (r.status === 429 && attempt < 3) {
        const wait = Math.min(Number(r.headers.get("retry-after")) || 20, 60);
        await sleep(wait * 1000);
        continue;
      }
      if (r.status === 401) opts.tokens.set("", 0);
      if (!r.ok) throw new GarminError(`Garmin ${path.split("?")[0]} failed (HTTP ${r.status})`, r.status);
      return r;
    }
  }
  const json = async <T>(path: string): Promise<T | null> => {
    const r = await get(path);
    const text = await r.text();
    return text ? (JSON.parse(text) as T) : null;
  };

  return {
    name: "garmin",
    pageSize: PAGE,
    async activities(page) {
      const list = await json<Record<string, unknown>[]>(`/activitylist-service/activities/search/activities?start=${page * PAGE}&limit=${PAGE}`);
      return (list ?? []).map(mapActivity).filter((a): a is ProviderActivity => !!a);
    },
    async detail(id) {
      const raw = id.replace(/^garmin:/, "");
      const r = await get(`/download-service/files/activity/${raw}`, "application/zip, application/x-zip-compressed, application/octet-stream");
      return parseFit(new Uint8Array(await r.arrayBuffer()));
    },
    async wellness(dates: ISODate[]) {
      if (!dates.length) return [];
      const sorted = [...dates].sort();
      const bb = new Map<string, number | null>();
      for (const [from, to] of dateChunks(sorted)) {
        try {
          const rep = await json<Record<string, unknown>[]>(`/wellness-service/wellness/bodyBattery/reports/daily?startDate=${from}&endDate=${to}`);
          for (const e of rep ?? []) if (typeof e.date === "string") bb.set(e.date, maxBodyBattery(e));
        } catch (e) {
          console.warn(`Body Battery ${from}..${to} failed: ${(e as Error).message}`); // optional data, keep syncing
        }
      }
      const out: Wellness[] = [];
      let sleepWarned = false;
      for (const date of sorted) {
        const [hrv, hr, sleepRes] = await Promise.all([
          json<{ hrvSummary?: { weeklyAvg?: number; lastNightAvg?: number; baseline?: { balancedLow?: number } } }>(`/hrv-service/hrv/${date}`).catch(() => null),
          json<{ restingHeartRate?: number }>(`/wellness-service/wellness/dailyHeartRate?date=${date}`).catch(() => null),
          json<unknown>(`/wellness-service/wellness/dailySleep?date=${date}`).catch((e: Error) => {
            if (!sleepWarned) console.warn(`Sleep ${date} failed: ${e.message}`); // optional data, keep syncing
            sleepWarned = true;
            return null;
          }),
        ]);
        out.push({
          date,
          hrvWeeklyAvg: num(hrv?.hrvSummary?.weeklyAvg),
          hrvLastNight: num(hrv?.hrvSummary?.lastNightAvg),
          hrvBaselineLow: num(hrv?.hrvSummary?.baseline?.balancedLow),
          restingHr: num(hr?.restingHeartRate),
          bodyBatteryMax: bb.get(date) ?? null,
          sleepScore: sleepScoreOf(sleepRes),
        });
      }
      return out;
    },
    /** Answers with a personal API key (checked Nov 2026); race predictions on the same service do not. */
    async vo2max(from, to) {
      const list = await json<unknown>(`/metrics-service/metrics/maxmet/daily/${from}/${to}`);
      return (Array.isArray(list) ? list : []).map((r) => mapVo2max(r as Record<string, unknown>)).filter((r): r is DayVo2max => !!r);
    },
  };
}
