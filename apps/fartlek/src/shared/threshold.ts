import { daysBetween, type ISODate } from "./dates";
import type { Lap, Threshold } from "./types";

/**
 * Which laps of a threshold session are the work (Garmin leaves lap intensity empty). Work and rest
 * differ a lot in pace (5:10 vs 9:40), so the rule looks for laps that are *trying* to be intervals.
 * docs/decisions/fartlek-interval-laps.md
 */
export const INTERVAL = {
  /** Shorter laps are rest, strides or warm-up bits. */
  minS: 180,
  /** With an estimate: at most this much slower than threshold pace counts as work (slower than the range shows as "too slow"). */
  overEstimatePct: 10,
  /** Without one: laps within this of the fastest form the work group… */
  nearFastestPct: 10,
  /** …and laps within this of the group's median pace count, so one fast rep doesn't set the bar. */
  nearMedianPct: 5,
} as const;

export function intervalLaps(laps: Lap[], estimatePace?: number | null): Lap[] {
  const long = laps.filter((l) => l.durationS >= INTERVAL.minS && l.distanceM > 0);
  if (!long.length) return [];
  if (estimatePace) {
    const work = long.filter((l) => lapPace(l) <= estimatePace * (1 + INTERVAL.overEstimatePct / 100));
    // An estimate that's far too fast finds nothing; fall back so the session can still correct it.
    if (work.length) return work;
  }
  const speed = (l: Lap) => l.distanceM / l.durationS;
  const fastest = Math.max(...long.map(speed));
  const group = long.map(speed).filter((s) => s >= fastest * (1 - INTERVAL.nearFastestPct / 100)).sort((a, b) => a - b);
  const mid = group.length / 2;
  const median = group.length % 2 ? group[Math.floor(mid)] : (group[mid - 1] + group[mid]) / 2;
  return long.filter((l) => speed(l) >= median * (1 - INTERVAL.nearMedianPct / 100));
}

export const lapPace = (l: Lap) => l.durationS / (l.distanceM / 1000);

/** In range from 15 s faster to 20 s slower than the estimate. */
export type RangeResult = "in" | "above" | "below";
export function rangeCheck(paceSec: number, estimateSec: number): RangeResult {
  const d = paceSec - estimateSec;
  return d < -15 ? "above" : d > 20 ? "below" : "in";
}

/** Latest estimate on or before the date, else the first one (old D41). */
export function thresholdOn(list: Threshold[], date: ISODate): Threshold | null {
  const sorted = list.slice().sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate));
  return [...sorted].reverse().find((t) => t.effectiveDate <= date) ?? sorted[0] ?? null;
}

export interface ThresholdSession { date: ISODate; laps: Lap[] }
export interface ThresholdPoint { date: ISODate; pace: number; hr: number | null; intervals: number }

/** `estimatePace`: the threshold estimate on the session's date, used to pick the interval laps. */
export function sessionPoint(s: ThresholdSession, estimatePace?: number | null): ThresholdPoint | null {
  const iv = intervalLaps(s.laps, estimatePace);
  if (!iv.length) return null;
  const dur = iv.reduce((a, l) => a + l.durationS, 0);
  const dist = iv.reduce((a, l) => a + l.distanceM, 0);
  const hrs = iv.filter((l) => l.avgHr != null);
  const hr = hrs.length ? hrs.reduce((a, l) => a + l.avgHr! * l.durationS, 0) / hrs.reduce((a, l) => a + l.durationS, 0) : null;
  return { date: s.date, pace: dur / (dist / 1000), hr: hr && Math.round(hr), intervals: iv.length };
}

export interface ThresholdProposal { paceSecPerKm: number; hr: number | null; basedOn: number; current: Threshold | null }

/**
 * Proposal from the last 3 threshold sessions within 6 weeks (D16). Offered only when the
 * pace differs from the current estimate by ≥ 5 s/km; the runner accepts or ignores it.
 */
export function proposeThreshold(points: ThresholdPoint[], current: Threshold | null, today: ISODate): ThresholdProposal | null {
  const recent = points.filter((p) => daysBetween(p.date, today) <= 42).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  if (recent.length < 2) return null;
  const pace = Math.round(recent.reduce((a, p) => a + p.pace, 0) / recent.length);
  const hrs = recent.filter((p) => p.hr != null);
  const hr = hrs.length ? Math.round(hrs.reduce((a, p) => a + p.hr!, 0) / hrs.length) : null;
  if (current?.paceSecPerKm && Math.abs(current.paceSecPerKm - pace) < 5) return null;
  return { paceSecPerKm: pace, hr, basedOn: recent.length, current };
}
