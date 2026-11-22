import { and, desc, eq, gte, lt } from "drizzle-orm";
import type { Config } from "./config";
import type { Db } from "./db";
import * as t from "./db/schema";
import { createCipher } from "@homelab/server-kit";
import { getFit, getSettings, saveDetail } from "./repo";
import { addDays, localDate, todayIn, type ISODate } from "../shared/dates";
import { isRunType } from "../shared/types";
import { createGarminProvider } from "./providers/garmin";
import { parseFit } from "./providers/fit";
import type { Provider, ProviderActivity, ProviderDetail } from "./providers/types";
import { ensureEfforts } from "./efforts";

/**
 * Bump when the parsed detail changes shape. Activities stored with an older version are fetched
 * again a batch per sync, newest first; until that succeeds their old laps and stream stay in use.
 * 1: lap offsets, triggers, max HR, cadence and elevation; cadence in the stream; FIT file kept.
 */
export const DETAIL_VERSION = 1;

/** Re-parse the kept FIT file when there is one, so a parser change needs no Garmin call. */
export async function loadDetail(db: Db, userId: number, provider: Provider, id: string): Promise<ProviderDetail> {
  const kept = getFit(db, userId, id);
  if (kept) {
    try { return parseFit(kept); } catch { /* a broken copy: fetch it again */ }
  }
  return provider.detail(id);
}

export interface SyncResult { added: number; updated: number; details: number; detailFailed: number; moreDetails: number; wellnessDays: number; vo2maxDays?: number }

/** VO2max history fetched on the first sync; later syncs fetch the last two weeks. One request per 30 days. */
export const VO2MAX_HISTORY_DAYS = 365;

/** Garmin's running VO2max per day. Optional: a failure is logged and the sync goes on. */
export async function syncVo2max(db: Db, userId: number, provider: Provider, today: ISODate): Promise<number> {
  if (!provider.vo2max) return 0;
  const have = db.select({ date: t.vo2max.date }).from(t.vo2max).where(eq(t.vo2max.userId, userId)).limit(1).get();
  let n = 0;
  try {
    for (let to = today, left = have ? 14 : VO2MAX_HISTORY_DAYS; left > 0; left -= 30) {
      const from = addDays(to, -(Math.min(30, left) - 1));
      for (const r of await provider.vo2max(from, to)) {
        db.insert(t.vo2max).values({ userId, date: r.date, value: r.value }).onConflictDoUpdate({ target: [t.vo2max.userId, t.vo2max.date], set: { value: r.value } }).run();
        n++;
      }
      to = addDays(from, -1);
    }
  } catch (e) {
    console.warn(`VO2max failed: ${(e as Error).message}`);
  }
  return n;
}

function rowFrom(userId: number, a: ProviderActivity) {
  const isRun = isRunType(a.typeKey);
  const z = a.zoneSecs;
  return {
    userId, id: a.id, name: a.name.slice(0, 200), typeKey: a.typeKey, startTimeLocal: a.startTimeLocal, date: localDate(a.startTimeLocal),
    distanceM: a.distanceM, durationS: a.durationS, avgHr: a.avgHr, maxHr: a.maxHr, elevationGain: a.elevationGain,
    zone1: z?.[0] ?? null, zone2: z?.[1] ?? null, zone3: z?.[2] ?? null, zone4: z?.[3] ?? null, zone5: z?.[4] ?? null,
    isRun,
    eventType: a.eventType ?? null,
  };
}

// eventType came later: the first sync after it finds every row changed and so pages back through all of them once.
const SAME_KEYS = ["eventType", "name", "typeKey", "startTimeLocal", "distanceM", "durationS", "avgHr", "maxHr", "elevationGain", "zone1", "zone2", "zone3", "zone4", "zone5"] as const;

/**
 * Activities: newest first, upsert, stop at the first page where nothing is new or changed (old D35).
 * Details (laps + stream) for runs, a capped number per sync, so the first sync stays reasonably quick.
 * Wellness: last 35 days; today and yesterday always refetched, older days only once.
 */
export async function syncProvider(
  db: Db, userId: number, provider: Provider,
  opts: { today: ISODate; maxPages?: number; maxDetails?: number; wellnessDays?: number },
): Promise<SyncResult> {
  const res: SyncResult = { added: 0, updated: 0, details: 0, detailFailed: 0, moreDetails: 0, wellnessDays: 0 };
  const maxPages = opts.maxPages ?? 40;

  for (let page = 0; page < maxPages; page++) {
    const list = await provider.activities(page);
    let changed = 0;
    for (const a of list) {
      if (!a.startTimeLocal) continue;
      const row = rowFrom(userId, a);
      const existing = db.select().from(t.activities).where(and(eq(t.activities.userId, userId), eq(t.activities.id, a.id))).get();
      if (!existing) {
        db.insert(t.activities).values({ ...row, detailStatus: row.isRun ? "none" : "na" }).run();
        res.added++;
        changed++;
      } else if (SAME_KEYS.some((k) => existing[k] !== row[k])) {
        db.update(t.activities).set(row).where(and(eq(t.activities.userId, userId), eq(t.activities.id, a.id))).run();
        res.updated++;
        changed++;
      }
    }
    if (!changed || list.length < provider.pageSize) break;
  }

  // Missing details first, then ones stored by an older parser.
  const missing = db.select({ id: t.activities.id }).from(t.activities)
    .where(and(eq(t.activities.userId, userId), eq(t.activities.detailStatus, "none")))
    .orderBy(desc(t.activities.startTimeLocal)).all();
  const outdated = db.select({ id: t.activities.id }).from(t.activities)
    .where(and(eq(t.activities.userId, userId), eq(t.activities.detailStatus, "done"), lt(t.activities.detailVersion, DETAIL_VERSION)))
    .orderBy(desc(t.activities.startTimeLocal)).all();
  const pending = [...missing.map((r) => ({ id: r.id, refresh: false })), ...outdated.map((r) => ({ id: r.id, refresh: true }))];
  const batch = pending.slice(0, opts.maxDetails ?? 25);
  res.moreDetails = pending.length - batch.length;
  for (const { id, refresh } of batch) {
    try {
      saveDetail(db, userId, id, await loadDetail(db, userId, provider, id), DETAIL_VERSION);
      res.details++;
    } catch (e) {
      const detailError = String((e as Error).message).slice(0, 300);
      // A failed refresh keeps the detail the activity already has; it is tried again on the next sync.
      db.update(t.activities).set(refresh ? { detailError } : { detailStatus: "failed", detailError })
        .where(and(eq(t.activities.userId, userId), eq(t.activities.id, id))).run();
      res.detailFailed++;
    }
  }

  const days = opts.wellnessDays ?? 35;
  const from = addDays(opts.today, -(days - 1));
  // A day is "had" once stored; the last week is refetched while it has no sleep score (rows from before sleep was synced).
  const sleepFrom = addDays(opts.today, -6);
  const have = new Set(db.select({ date: t.wellness.date, sleepScore: t.wellness.sleepScore }).from(t.wellness).where(and(eq(t.wellness.userId, userId), gte(t.wellness.date, from))).all()
    .filter((r) => r.sleepScore != null || r.date < sleepFrom).map((r) => r.date));
  const want: ISODate[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(opts.today, -i);
    if (i < 2 || !have.has(d)) want.push(d);
  }
  const rows = await provider.wellness(want);
  const now = Date.now();
  for (const date of want) {
    const w = rows.find((x) => x.date === date);
    const vals = { hrvWeeklyAvg: w?.hrvWeeklyAvg ?? null, hrvLastNight: w?.hrvLastNight ?? null, hrvBaselineLow: w?.hrvBaselineLow ?? null,
      restingHr: w?.restingHr ?? null, bodyBatteryMax: w?.bodyBatteryMax ?? null, sleepScore: w?.sleepScore ?? null, fetchedAt: now };
    db.insert(t.wellness).values({ userId, date, ...vals }).onConflictDoUpdate({ target: [t.wellness.userId, t.wellness.date], set: vals }).run();
    res.wellnessDays++;
  }
  res.vo2maxDays = await syncVo2max(db, userId, provider, opts.today);
  return res;
}

/** The user's Garmin provider, with the short-lived token cached encrypted in the DB. */
export function garminProviderFor(db: Db, config: Config, userId: number): Provider | null {
  const acc = db.select().from(t.garminAccounts).where(eq(t.garminAccounts.userId, userId)).get();
  if (!acc) return null;
  const cipher = createCipher(config.masterKey);
  return createGarminProvider({
    baseUrl: config.garminBaseUrl,
    apiKey: cipher.decrypt(acc.keyEnc),
    tokens: {
      get() {
        const a = db.select().from(t.garminAccounts).where(eq(t.garminAccounts.userId, userId)).get();
        return a?.tokenEnc && a.tokenExp ? { token: cipher.decrypt(a.tokenEnc), exp: a.tokenExp } : null;
      },
      set(token, exp) {
        db.update(t.garminAccounts).set({ tokenEnc: token ? cipher.encrypt(token) : null, tokenExp: token ? exp : null })
          .where(eq(t.garminAccounts.userId, userId)).run();
      },
    },
  });
}

/** Visiting the app syncs on its own when the last sync is older than this. No polling: only on visit, and once a morning for the morning notification (morning.ts). */
export const AUTO_SYNC_AFTER_MS = 60 * 60 * 1000;

export type SyncOutcome = { ok: true; result: SyncResult } | { ok: false; error: string };

/**
 * Runs syncs so a user never has two going at once: a second request (another tab, the auto sync
 * and the button) joins the one in flight. Also decides whether a visit is due an automatic sync;
 * attempts are remembered in memory, so a failing Garmin isn't retried on every page view.
 */
export function createSyncRunner(db: Db, config: Config, now: () => number = Date.now) {
  const inFlight = new Map<number, Promise<SyncOutcome>>();
  const lastAttempt = new Map<number, number>();

  const account = (userId: number) => db.select().from(t.garminAccounts).where(eq(t.garminAccounts.userId, userId)).get();

  function isSyncing(userId: number) { return inFlight.has(userId); }

  function autoDue(userId: number) {
    const acc = account(userId);
    if (!acc || inFlight.has(userId)) return false;
    const last = Math.max(acc.lastSyncAt ?? 0, lastAttempt.get(userId) ?? 0);
    return now() - last > AUTO_SYNC_AFTER_MS;
  }

  /** Start a sync, or join the one already running. Null when Garmin isn't connected. */
  function run(userId: number, provider: Provider | null = garminProviderFor(db, config, userId)): Promise<SyncOutcome> | null {
    const running = inFlight.get(userId);
    if (running) return running;
    if (!provider) return null;
    lastAttempt.set(userId, now());
    const p = (async (): Promise<SyncOutcome> => {
      await Promise.resolve(); // so `inFlight.set` below always happens before the `finally`
      try {
        const result = await syncProvider(db, userId, provider, { today: todayIn(getSettings(db, userId).timezone) });
        db.update(t.garminAccounts).set({ lastSyncAt: now(), lastError: null }).where(eq(t.garminAccounts.userId, userId)).run();
        ensureEfforts(db, userId, 3000);
        return { ok: true, result };
      } catch (e) {
        const error = (e as Error).message;
        db.update(t.garminAccounts).set({ lastError: error }).where(eq(t.garminAccounts.userId, userId)).run();
        return { ok: false, error };
      } finally {
        inFlight.delete(userId);
      }
    })();
    inFlight.set(userId, p);
    return p;
  }

  return { run, isSyncing, autoDue };
}
export type SyncRunner = ReturnType<typeof createSyncRunner>;
