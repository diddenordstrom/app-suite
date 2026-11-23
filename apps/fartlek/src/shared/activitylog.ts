import { daysBetween, type ISODate } from "./dates";
import type { Msg, Stream } from "./types";

/** What the runner writes down about one activity. Everything is optional. */
export interface ActivityLog {
  note: string | null;
  /** Session RPE, 0–10. */
  rpe: number | null;
  /** Total carbohydrate taken during the session, grams. */
  carbsG: number | null;
  /** Stomach symptoms, 0–10 each. */
  nausea: number | null;
  bloating: number | null;
  cramps: number | null;
  /** How the last third of the session felt, 0–10 (10 = strong). */
  feel: number | null;
}

export const EMPTY_LOG: ActivityLog = { note: null, rpe: null, carbsG: null, nausea: null, bloating: null, cramps: null, feel: null };

/** sRPE load: RPE (0–10) × minutes. 60 min at 5 gives 300. */
export function srpeLoad(rpe: number | null, durationS: number): number | null {
  if (rpe == null || durationS <= 0) return null;
  return Math.round(rpe * (durationS / 60));
}

/** Carbohydrate intake per hour of the session. Sessions under 20 minutes give no meaningful rate. */
export function carbsPerHour(carbsG: number | null, durationS: number): number | null {
  if (carbsG == null || durationS < 20 * 60) return null;
  return Math.round(carbsG / (durationS / 3600));
}

/** The worst of the three symptoms, or null when none was rated. */
export function giScore(l: Pick<ActivityLog, "nausea" | "bloating" | "cramps">): number | null {
  const v = [l.nausea, l.bloating, l.cramps].filter((x): x is number => x != null);
  return v.length ? Math.max(...v) : null;
}

/* ---- Gut training ---- */

export interface FuelPoint { date: ISODate; gPerH: number; gi: number | null }

export const FUEL_START = 60;
export const FUEL_MIN = 45;
export const FUEL_MAX = 120;
export const FUEL_STEP = 10;
/** Raise the target at most this often (days). */
export const FUEL_STEP_DAYS = 14;
/** Symptoms up to this level count as a clean session; from BAD_GI the target comes down. */
export const CLEAN_GI = 3;
export const BAD_GI = 6;

export interface FuelAdvice {
  /** Suggested intake for the next long session, g/h. */
  gPerH: number;
  action: "start" | "raise" | "hold" | "lower";
  /** Why, as a message key + params (rendered by the client). */
  reason: Msg;
}

/**
 * Gut-training suggestion from earlier sessions (oldest to newest), after the usual progression:
 * start around 60 g/h, add 10 g/h about every other week while the stomach copes, and never
 * above 120. It is advice only and never edits the plan. Sessions without a symptom rating
 * are not treated as clean, so the target holds.
 */
export function fuelAdvice(points: FuelPoint[]): FuelAdvice {
  const pts = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const last = pts.at(-1);
  if (!last) return { gPerH: FUEL_START, action: "start", reason: { key: "fuel.start", params: { g: FUEL_START } } };
  if (last.gi == null) return { gPerH: last.gPerH, action: "hold", reason: { key: "fuel.rateFirst", params: { g: last.gPerH } } };
  if (last.gi >= BAD_GI) {
    const next = Math.max(FUEL_MIN, last.gPerH - FUEL_STEP);
    return { gPerH: next, action: "lower", reason: { key: "fuel.lower", params: { gi: last.gi, g: last.gPerH, next } } };
  }
  if (last.gi > CLEAN_GI) return { gPerH: last.gPerH, action: "hold", reason: { key: "fuel.holdSymptoms", params: { gi: last.gi, g: last.gPerH } } };

  // Clean session: when did this level (±5 g/h) first become clean in an unbroken run?
  let first = last;
  for (let i = pts.length - 2; i >= 0; i--) {
    const p = pts[i];
    if (p.gi == null || p.gi > CLEAN_GI || Math.abs(p.gPerH - last.gPerH) > 5) break;
    first = p;
  }
  const days = daysBetween(first.date, last.date);
  if (days >= FUEL_STEP_DAYS) {
    const next = Math.min(FUEL_MAX, last.gPerH + FUEL_STEP);
    if (next === last.gPerH) return { gPerH: last.gPerH, action: "hold", reason: { key: "fuel.top", params: { g: last.gPerH } } };
    return { gPerH: next, action: "raise", reason: { key: "fuel.raise", params: { g: last.gPerH, days, next } } };
  }
  return { gPerH: last.gPerH, action: "hold", reason: { key: "fuel.holdClean", params: { g: last.gPerH, count: FUEL_STEP_DAYS - days } } };
}

/* ---- Durability ---- */

/** Efficiency drift (% lost from first to last third): under `stable` holds up, from `high` fades a lot. */
export const DRIFT = { stable: 5, high: 10 } as const;
export type DriftZone = "stable" | "fading" | "high";
export const driftZone = (pct: number): DriftZone => (pct < DRIFT.stable ? "stable" : pct < DRIFT.high ? "fading" : "high");

export interface Durability {
  /** Speed per heartbeat (m/s per bpm × 1000) in the first and last third of the run. */
  first: number;
  last: number;
  /** Percent loss of efficiency from first to last third. Positive = fading. */
  driftPct: number;
  /** Pace (s/km) and HR in each third, for display. */
  thirds: { pace: number; hr: number }[];
}

const WARMUP_S = 5 * 60;
const MIN_DURABILITY_S = 75 * 60;
const MIN_SAMPLES_PER_THIRD = 60;

/**
 * Pace-to-heart-rate drift over a long run: how much less speed each heartbeat buys in the last
 * third compared with the first. The first five minutes are skipped as warm-up. Returns null for
 * runs under 75 minutes or when a third has too few valid samples.
 * Hills and heat move the number, so read it across several long runs, not from one.
 */
export function durability(stream: Stream | null): Durability | null {
  if (!stream || stream.t.length < 3) return null;
  const end = stream.t[stream.t.length - 1];
  if (end < MIN_DURABILITY_S) return null;
  const from = WARMUP_S;
  const span = (end - from) / 3;
  const sums = [0, 1, 2].map(() => ({ n: 0, v: 0, hr: 0 }));
  for (let i = 0; i < stream.t.length; i++) {
    const t = stream.t[i], v = stream.speed[i], hr = stream.hr[i];
    if (t < from || v == null || hr == null || v < 0.5 || hr < 60) continue;
    const k = Math.min(2, Math.floor((t - from) / span));
    sums[k].n++; sums[k].v += v; sums[k].hr += hr;
  }
  if (sums.some((s) => s.n < MIN_SAMPLES_PER_THIRD)) return null;
  const thirds = sums.map((s) => ({ v: s.v / s.n, hr: s.hr / s.n }));
  const eff = (x: { v: number; hr: number }) => (x.v / x.hr) * 1000;
  const first = eff(thirds[0]), last = eff(thirds[2]);
  return {
    first: Math.round(first * 100) / 100,
    last: Math.round(last * 100) / 100,
    driftPct: Math.round((1 - last / first) * 1000) / 10,
    thirds: thirds.map((x) => ({ pace: Math.round(1000 / x.v), hr: Math.round(x.hr) })),
  };
}
