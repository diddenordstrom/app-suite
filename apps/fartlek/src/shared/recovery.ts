import { addDays, daysBetween, range, type ISODate } from "./dates";
import { FORM } from "./load";
import { RACE_PHASE } from "./racephase";
import type { Checkin, Msg, PainEntry, Wellness } from "./types";

/* ---------- Pain (old 3.12) ---------- */

export type Trend = "rising" | "falling" | "steady";
export interface AreaTrend { area: string; levels: number[]; latest: number; trend: Trend }

/** Last 5 runs per area; a run without an entry counts as 0. Rising/falling when the newer half averages > 0.5 off the older half. */
export function painTrends(runs: { id: string; date: ISODate }[], entries: PainEntry[]): AreaTrend[] {
  const last = runs.slice().sort((a, b) => a.date.localeCompare(b.date)).slice(-5);
  const areas = [...new Set(entries.map((e) => e.area))];
  return areas.map((area) => {
    const levels = last.map((r) =>
      Math.max(0, ...entries.filter((e) => e.area === area && (e.activityId === r.id || (!e.activityId && e.date === r.date))).map((e) => e.level)),
    );
    return { area, levels, latest: levels.at(-1) ?? 0, trend: trendOf(levels) };
  }).filter((t) => t.levels.some((l) => l > 0));
}

export function trendOf(levels: number[]): Trend {
  if (levels.length < 2) return "steady";
  const half = Math.floor(levels.length / 2);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const older = avg(levels.slice(0, half));
  const newer = avg(levels.slice(levels.length - half));
  return newer - older > 0.5 ? "rising" : older - newer > 0.5 ? "falling" : "steady";
}

/* ---------- Readiness: today's form (decision: docs/decisions/fartlek-readiness.md) ---------- */

/**
 * Every threshold today's form uses. The ⓘ tips read these too, so the text and the maths never
 * drift apart. Each signal takes off up to `max` points from 10, sliding linearly between `from`
 * and `to` instead of jumping at one cut-off.
 */
export const READINESS = {
  /** Mean of the last `nights` nights' HRV vs Garmin's baseline low; full deduction `fullBelowPct` % under it. */
  hrv: { nights: 2, fullBelowPct: 20, max: 3 },
  /** Soreness from the latest check-in (today or yesterday): `from` costs 1, each step above 1 more. */
  soreness: { from: 3, max: 3 },
  /** Acute:chronic km, last 7 days vs the 28-day weekly average, today left out. Needs 28 days of history. */
  km: { from: 1.3, to: 1.5, max: 2 },
  /** Resting HR, mean of the last `days` calendar days vs the 28-day mean (needs `minValues` of them). */
  rhr: { days: 3, perBeat: 0.4, max: 2, minValues: 7 },
  /** Pain logged in the last `days` days: 1 for a rising area, 1 for level `level` or more. */
  pain: { days: 7, level: 5, max: 2 },
  /** Pain at `level` or more in the last `days` days (the day it was logged counts) caps the score at `cap` and says rest. */
  painVeto: { level: 8, days: 3, cap: 2 },
  /** Form (TSB) from the load model: from the "heavy" edge down to `to`. */
  /** Form in % of fitness: from overload (−25 %) down to −40 % the score loses up to 1.5. */
  form: { from: FORM.heavy, to: -40, max: 1.5 },
  /** Garmin's sleep score for the latest night (today or yesterday). */
  sleep: { from: 70, to: 40, max: 1.5 },
  /** Score bands: at least `fine` → go, at least `trim` → take it easier, lower → back off. */
  verdict: { fine: 8, trim: 6 },
} as const;

export type SignalKey = "hrv" | "soreness" | "km" | "rhr" | "pain" | "form" | "sleep";
/** HRV and resting HR are the body's own answer; without them the score is shown as uncertain. */
export const KEY_SIGNALS: readonly SignalKey[] = ["hrv", "rhr"];

export type Verdict = "fine" | "trim" | "backOff" | "stop";
/**
 * One input to today's form. `points` is what it takes off (in steps of 0.5), `value` the number
 * shown next to it, null when there is no fresh data (then it costs nothing). `partial` marks a value
 * built on fewer days than the window. `detail` is a message key + params; the client renders it.
 */
export interface Signal { key: SignalKey; points: number; value: number | null; partial: boolean; detail: Msg }
/**
 * `score`: 1–10, null until there is something to go on besides pain. `verdict` follows the score,
 * except pain at 8+ (`veto`), which says rest. `uncertain`: HRV or resting HR has no fresh data.
 */
export interface Readiness { verdict: Verdict; score: number | null; veto: boolean; uncertain: boolean; signals: Signal[] }

export interface ReadinessInput {
  today: ISODate;
  /** Run km per day. */
  dailyKm: Map<ISODate, number>;
  /** Date of the first activity ever, for "is there 28 days of history". */
  firstActivity: ISODate | null;
  /** Today's form (fitness − fatigue) from the load model, and as a share of fitness; null without any load. */
  tsb: number | null;
  /** Judged on this when given (docs/decisions/fartlek-form-relative.md), else on `tsb`. */
  formPct?: number | null;
  painTrends: AreaTrend[];
  pain: PainEntry[];
  wellness: Wellness[];
  checkins: Checkin[];
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
/** Linear from 0 at `from` to `max` at `to` (either direction), rounded to half points. */
const slide = (v: number, from: number, to: number, max: number) => halves(clamp01((v - from) / (to - from)) * max);
const halves = (x: number) => Math.round(x * 2) / 2;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round1 = (x: number) => Math.round(x * 10) / 10;
/** Is `d` within the last `days` days, today included? */
const within = (d: ISODate, today: ISODate, days: number) => d <= today && daysBetween(d, today) < days;
const missing = (key: SignalKey, detail: Msg = { key: "detail.noData" }): Signal => ({ key, points: 0, value: null, partial: false, detail });

/**
 * Real injury, not daily form (docs/decisions/fartlek-race-specific-phase.md): pain at `RACE_PHASE.injury.level` or more
 * in the last `windowDays` days (today included), or at `repeatLevel` or more on `repeatDays` different days of them. It
 * holds the race phase's progression and offers a re-plan; a bad day on its own never does.
 */
export interface InjuryStop { reason: "severe" | "repeated"; /** The highest level that counted. */ level: number; dates: ISODate[] }
export function injuryStop(pain: PainEntry[], today: ISODate): InjuryStop | null {
  const L = RACE_PHASE.injury;
  const recent = pain.filter((p) => within(p.date, today, L.windowDays));
  const severe = recent.filter((p) => p.level >= L.level);
  if (severe.length) return { reason: "severe", level: Math.max(...severe.map((p) => p.level)), dates: [...new Set(severe.map((p) => p.date))].sort() };
  const some = recent.filter((p) => p.level >= L.repeatLevel);
  const dates = [...new Set(some.map((p) => p.date))].sort();
  return dates.length >= L.repeatDays ? { reason: "repeated", level: Math.max(...some.map((p) => p.level)), dates } : null;
}

/** Advice only, never edits the plan (D15), and doesn't look at the plan at all: is the body up for today's session? */
export function readiness(i: ReadinessInput): Readiness {
  const signals = [hrvSignal(i), sorenessSignal(i), kmSignal(i), rhrSignal(i), painSignal(i), formSignal(i), sleepSignal(i)];
  const veto = i.pain.some((p) => p.level >= READINESS.painVeto.level && within(p.date, i.today, READINESS.painVeto.days));
  const hasData = signals.some((s) => s.key !== "pain" && s.value != null);
  if (!hasData && !veto) return { verdict: "fine", score: null, veto, uncertain: true, signals };

  const off = signals.reduce((a, s) => a + s.points, 0);
  // 8.5 rounds down: when it's a toss-up, the cautious number.
  let score = Math.max(1, Math.min(10, Math.ceil(10 - off - 0.5)));
  if (veto) score = Math.min(score, READINESS.painVeto.cap);
  const v = READINESS.verdict;
  const verdict: Verdict = veto ? "stop" : score >= v.fine ? "fine" : score >= v.trim ? "trim" : "backOff";
  const uncertain = signals.some((s) => KEY_SIGNALS.includes(s.key) && s.value == null);
  return { verdict, score, veto, uncertain, signals };
}

function hrvSignal(i: ReadinessInput): Signal {
  const c = READINESS.hrv;
  const recent = i.wellness.filter((w) => within(w.date, i.today, 7));
  const nights = recent.filter((w) => w.hrvLastNight != null && within(w.date, i.today, c.nights)).map((w) => w.hrvLastNight!);
  const low = recent.filter((w) => w.hrvBaselineLow != null).sort((a, b) => b.date.localeCompare(a.date))[0]?.hrvBaselineLow;
  if (!nights.length || low == null) return missing("hrv");
  const avg = Math.round(mean(nights));
  const belowPct = ((low - avg) / low) * 100;
  return { key: "hrv", points: slide(belowPct, 0, c.fullBelowPct, c.max), value: avg, partial: nights.length < c.nights, detail: { key: "detail.hrv", params: { avg, low, nights: nights.length } } };
}

function sorenessSignal(i: ReadinessInput): Signal {
  const c = READINESS.soreness;
  // Only the latest check-in (today's, else yesterday's) counts, so re-checking in today replaces yesterday's soreness.
  const sore = i.checkins.filter((x) => x.soreness != null && within(x.date, i.today, 2)).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!sore) return missing("soreness", { key: "detail.noCheckin" });
  const s = sore.soreness!;
  return { key: "soreness", points: Math.min(c.max, Math.max(0, s - c.from + 1)), value: s, partial: false, detail: { key: "detail.soreness", params: { value: s } } };
}

function kmSignal(i: ReadinessInput): Signal {
  const c = READINESS.km;
  if (!i.firstActivity || daysBetween(i.firstActivity, i.today) < 28) return missing("km", { key: "detail.shortHistory" });
  const sum = (from: number) => range(addDays(i.today, from), addDays(i.today, -1)).reduce((a, d) => a + (i.dailyKm.get(d) ?? 0), 0);
  const acute = sum(-7), chronicWeek = sum(-28) / 4;
  // The 28 days include the last 7, so no km at all is the only way to get here.
  if (chronicWeek <= 0) return missing("km", { key: "detail.noRuns" });
  const ratio = Math.round((acute / chronicWeek) * 100) / 100;
  return { key: "km", points: slide(ratio, c.from, c.to, c.max), value: ratio, partial: false, detail: { key: "detail.acwr", params: { km: round1(acute), avg: round1(chronicWeek) } } };
}

function rhrSignal(i: ReadinessInput): Signal {
  const c = READINESS.rhr;
  const month = i.wellness.filter((w) => w.restingHr != null && within(w.date, i.today, 28));
  const last = month.filter((w) => within(w.date, i.today, c.days)).sort((a, b) => b.date.localeCompare(a.date));
  if (month.length < c.minValues || !last.length) return missing("rhr");
  const now = mean(last.map((w) => w.restingHr!)), avg = mean(month.map((w) => w.restingHr!));
  const diff = now - avg;
  return {
    key: "rhr", points: halves(Math.min(c.max, Math.max(0, diff * c.perBeat))), value: Math.round(now), partial: last.length < c.days,
    detail: { key: "detail.rhr", params: { avg: Math.round(avg), diff: `${diff >= 0 ? "+" : "−"}${Math.abs(Math.round(diff))}`, days: last.length } },
  };
}

function painSignal(i: ReadinessInput): Signal {
  const c = READINESS.pain;
  const recent = i.pain.filter((p) => within(p.date, i.today, c.days));
  const level = Math.max(0, ...recent.map((p) => p.level));
  const rising = i.painTrends.filter((t) => t.trend === "rising");
  const points = Math.min(c.max, (rising.length ? 1 : 0) + (level >= c.level ? 1 : 0));
  const detail: Msg = rising.length ? { key: "detail.painRising", params: { areas: rising.map((t) => t.area).join(", ") } }
    : level ? { key: "detail.painLevel", params: { level } } : { key: "detail.noPain" };
  return { key: "pain", points, value: level, partial: false, detail };
}

function formSignal(i: ReadinessInput): Signal {
  const c = READINESS.form;
  if (i.tsb == null) return missing("form");
  const tsb = Math.round(i.tsb);
  const pct = Math.round(i.formPct ?? i.tsb);
  return { key: "form", points: slide(pct, c.from, c.to, c.max), value: tsb, partial: false, detail: { key: "detail.form", params: { tsb, pct } } };
}

function sleepSignal(i: ReadinessInput): Signal {
  const c = READINESS.sleep;
  const night = i.wellness.filter((w) => w.sleepScore != null && within(w.date, i.today, 2)).sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!night) return missing("sleep");
  const s = Math.round(night.sleepScore!);
  return { key: "sleep", points: slide(s, c.from, c.to, c.max), value: s, partial: false, detail: { key: "detail.sleep", params: { value: s } } };
}

/* ---------- Races (old 3.6, D22) ---------- */

export function goalPace(goalSeconds: number, distanceKm: number): number {
  return goalSeconds / distanceKm;
}

/** Threshold pace needed for a goal: goal pace × typical share of threshold speed. */
export function neededThreshold(goalPaceSec: number, distanceKm: number): number {
  const share = Math.abs(distanceKm - 21.0975) <= 1 ? 0.96 : Math.abs(distanceKm - 42.195) <= 1 ? 0.9 : 0.93;
  return goalPaceSec * share;
}

/** Days until a date, split into whole weeks and leftover days (the client words it). */
export interface Countdown { days: number; weeks: number; restDays: number }
export function countdown(today: ISODate, date: ISODate): Countdown {
  const days = daysBetween(today, date);
  const left = Math.max(0, days);
  return { days, weeks: Math.floor(left / 7), restDays: left % 7 };
}

