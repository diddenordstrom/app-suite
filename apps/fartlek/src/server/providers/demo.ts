import { addDays, weekStartOf, type ISODate } from "../../shared/dates";
import type { Lap, Stream, Wellness, ZoneBounds } from "../../shared/types";
import { zoneSecsFromStream } from "../../shared/zones";
import type { Provider, ProviderActivity, ProviderDetail } from "./types";

/**
 * Demo provider: ~18 weeks of believable training generated on the fly, so the app can be tried
 * without a Garmin key. Goes through the same sync path as Garmin.
 */
const WATCH_ZONES: ZoneBounds = [118, 137, 155, 170];
export const DEMO_WEEKS_BACK = 18;

function rng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/** Weekly km for week offset w (0 = current week): ramps up with a backoff every 4th week. */
export function demoWeekKm(w: number): number {
  const i = w + DEMO_WEEKS_BACK;
  const base = 30 + i * 1.1;
  return Math.round(((i + 1) % 4 === 0 ? base * 0.75 : base) * 10) / 10;
}

/** The weekly pattern: [day offset from Monday, type, share of week km]. */
export const DEMO_PATTERN: [number, "easy" | "threshold" | "long", number][] = [
  [1, "easy", 0.22],
  [3, "threshold", 0.25],
  [5, "easy", 0.18],
  [6, "long", 0.35],
];

interface Generated { a: ProviderActivity; detail: ProviderDetail }

/**
 * Laps every 1 km as auto-lap makes them, with no lap press: the edges fall mid-rep, so the steps are
 * found in the stream instead (docs/decisions/fartlek-stream-steps.md).
 */
function autoLaps(stream: Stream, durationS: number): Lap[] {
  const laps: Lap[] = [];
  let start = 0, dist = 0, mark = 1000, hr: number[] = [], cad: number[] = [];
  const close = (end: number, len: number, last: boolean) => {
    const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);
    laps.push({ index: laps.length, distanceM: Math.round(len), durationS: Math.round(end - start), avgHr: avg(hr), startS: Math.round(start), trigger: last ? "end" : "distance", maxHr: hr.length ? Math.max(...hr) : null, cadence: avg(cad), elevGain: null, elevLoss: null });
    start = end; hr = []; cad = [];
  };
  let lapDist = 0;
  stream.t.forEach((t, i) => {
    const dt = (stream.t[i + 1] ?? durationS) - t;
    const d = (stream.speed[i] ?? 0) * dt;
    if (stream.hr[i] != null) hr.push(stream.hr[i]!);
    if (stream.cad?.[i] != null) cad.push(stream.cad[i]!);
    dist += d; lapDist += d;
    if (dist >= mark) { close(t + dt, lapDist, false); lapDist = 0; mark += 1000; }
  });
  if (lapDist > 1) close(durationS, lapDist, true);
  else laps[laps.length - 1].trigger = "end";
  return laps;
}

function buildRun(r: () => number, id: string, date: ISODate, kind: "easy" | "threshold" | "long", km: number, progress: number, noLapPress = false): Generated {
  const thrPace = 295 - progress * 15; // s/km, improves over the block
  const easyPace = 350 - progress * 12;
  const easyHr = 143 - progress * 5;
  const segs: { m: number; pace: number; hr: number }[] = [];
  if (kind === "threshold") {
    segs.push({ m: 2000, pace: easyPace, hr: easyHr });
    const reps = 3; // matches the demo plan's threshold steps (seed.ts)
    for (let i = 0; i < reps; i++) {
      segs.push({ m: 2000, pace: thrPace + (r() - 0.5) * 6, hr: 167 + r() * 3 });
      if (i < reps - 1) segs.push({ m: 400, pace: easyPace + 40, hr: 150 });
    }
    const used = segs.reduce((a, s) => a + s.m, 0);
    segs.push({ m: Math.max(km * 1000 - used, 1000), pace: easyPace, hr: easyHr });
  } else {
    const p = kind === "long" ? easyPace + 8 : easyPace;
    segs.push({ m: km * 1000, pace: p + (r() - 0.5) * 10, hr: easyHr + (kind === "long" ? 3 : 0) + (r() - 0.5) * 4 });
  }
  const stream: Stream = { t: [], hr: [], speed: [], alt: [], cad: [] };
  // Cadence rises with speed, roughly as it does for a recreational runner.
  const cadFor = (pace: number) => 162 + (350 - pace) / 6;
  const laps: Lap[] = [];
  let t = 0, dist = 0, lapIdx = 0;
  for (const s of segs) {
    // Easy segments are split into 1 km laps like auto-lap; work reps are one lap each.
    const lapLen = kind === "threshold" && s.hr > 160 ? s.m : 1000;
    let segDone = 0;
    while (segDone < s.m - 1) {
      const len = Math.min(lapLen, s.m - segDone);
      const dur = (len / 1000) * s.pace;
      const lapStart = t;
      let lapHrSum = 0, lapCadSum = 0, lapMaxHr = 0, n = 0, up = 0, down = 0, prevAlt: number | null = null;
      for (let x = 0; x < dur; x += 5) {
        const drift = kind === "long" ? (t / 3600) * 4 : 0;
        const hr = Math.round(s.hr + drift + (r() - 0.5) * 6);
        stream.t.push(Math.round(t + x));
        stream.hr.push(hr);
        stream.speed.push(Math.round((1000 / s.pace) * (1 + (r() - 0.5) * 0.06) * 100) / 100);
        const alt = Math.round((40 + Math.sin((dist + (x / dur) * len) / 700) * 12) * 10) / 10;
        stream.alt.push(alt);
        const cad = Math.round(cadFor(s.pace) + (r() - 0.5) * 3);
        stream.cad!.push(cad);
        if (prevAlt != null) { if (alt > prevAlt) up += alt - prevAlt; else down += prevAlt - alt; }
        prevAlt = alt;
        lapHrSum += hr;
        lapCadSum += cad;
        lapMaxHr = Math.max(lapMaxHr, hr);
        n++;
      }
      const last = segDone + len >= s.m - 1 && s === segs[segs.length - 1];
      laps.push({
        index: lapIdx++, distanceM: len, durationS: Math.round(dur), avgHr: n ? Math.round(lapHrSum / n) : null,
        startS: Math.round(lapStart), trigger: last ? "end" : len === lapLen && lapLen === 1000 ? "distance" : "manual",
        maxHr: n ? lapMaxHr : null, cadence: n ? Math.round(lapCadSum / n) : null, elevGain: Math.round(up), elevLoss: Math.round(down),
      });
      t += dur;
      dist += len;
      segDone += len;
    }
  }
  const hrs = stream.hr.filter((h): h is number => h != null);
  const name = kind === "threshold" ? "Tröskel 3x2 km" : kind === "long" ? "Long run" : r() > 0.5 ? "Easy run" : "Morning run";
  return {
    a: {
      id, name, typeKey: "running", startTimeLocal: `${date} 07:${String(Math.floor(r() * 50) + 10)}:00`,
      distanceM: Math.round(dist), durationS: Math.round(t), avgHr: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length),
      maxHr: Math.max(...hrs), elevationGain: Math.round(km * 8), zoneSecs: zoneSecsFromStream(stream, WATCH_ZONES),
    },
    detail: { laps: noLapPress ? autoLaps(stream, Math.round(t)) : laps, stream },
  };
}

export function generateDemo(seed: number, today: ISODate): { list: Generated[]; wellness: Wellness[] } {
  const r = rng(seed * 7919 + 13);
  const list: Generated[] = [];
  const thisWeek = weekStartOf(today, "monday");
  for (let w = -DEMO_WEEKS_BACK; w <= 0; w++) {
    const ws = addDays(thisWeek, w * 7);
    const km = demoWeekKm(w);
    const progress = (w + DEMO_WEEKS_BACK) / DEMO_WEEKS_BACK;
    for (const [off, kind, share] of DEMO_PATTERN) {
      const date = addDays(ws, off);
      if (date >= today) continue;
      if (r() < 0.08) continue; // life happens
      const shift = r() < 0.2 ? -1 : 0; // sometimes a day early
      const d = addDays(date, shift);
      // Last week's threshold run has auto-laps only (no lap press), so the demo shows steps found in the stream.
      list.push(buildRun(r, `demo:${d}-${kind}`, d, kind, Math.round(km * share * (0.92 + r() * 0.16) * 10) / 10, progress, w === -1 && kind === "threshold"));
    }
    const wed = addDays(ws, 2);
    if (wed < today && r() < 0.7) {
      list.push({
        a: { id: `demo:${wed}-bike`, name: "Commute ride", typeKey: "cycling", startTimeLocal: `${wed} 17:30:00`, distanceM: 15000, durationS: 2700,
          avgHr: 122, maxHr: 140, elevationGain: 60, zoneSecs: [1500, 1200, 0, 0, 0] },
        detail: { laps: [], stream: null },
      });
    }
  }
  list.sort((x, y) => y.a.startTimeLocal.localeCompare(x.a.startTimeLocal));
  const wellness: Wellness[] = [];
  for (let i = 0; i < 35; i++) {
    const date = addDays(today, -i);
    wellness.push({
      date,
      hrvWeeklyAvg: Math.round(61 + r() * 6),
      hrvLastNight: Math.round(55 + r() * 18),
      hrvBaselineLow: 55,
      restingHr: Math.round(49 + r() * 4),
      bodyBatteryMax: Math.round(65 + r() * 30),
      sleepScore: Math.round(62 + r() * 30),
    });
  }
  return { list, wellness };
}

export function createDemoProvider(seed: number, today: ISODate): Provider {
  const { list, wellness } = generateDemo(seed, today);
  const byId = new Map(list.map((g) => [g.a.id, g]));
  const PAGE = 45;
  return {
    name: "demo",
    pageSize: PAGE,
    async activities(page) { return list.slice(page * PAGE, (page + 1) * PAGE).map((g) => g.a); },
    async detail(id) {
      const g = byId.get(id);
      if (!g) throw new Error("unknown demo activity");
      return g.detail;
    },
    async wellness(dates) { return wellness.filter((w) => dates.includes(w.date)); },
    /** A slow climb from 49 to about 52 over the year, updated every few days like a watch. */
    async vo2max(from, to) {
      const out: { date: ISODate; value: number }[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const daysAgo = Math.round((Date.parse(today) - Date.parse(d)) / 86400000);
        if (daysAgo < 0 || daysAgo % 3) continue;
        out.push({ date: d, value: Math.round((52 - (daysAgo / 365) * 3 + Math.sin(daysAgo / 9) * 0.3) * 10) / 10 });
      }
      return out;
    },
  };
}
