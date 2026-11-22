/**
 * Long-race models with published grounds (docs/decisions/fartlek-best-efforts.md). Riegel's single
 * exponent holds up to the half marathon but runs too fast at the marathon for recreational runners
 * (Vickers & Vertosick 2016), so the marathon gets three estimates that each use something Riegel
 * ignores: weekly volume, durability, or training alone. Coefficients are the papers', unchanged.
 */
import type { Stream } from "./types";

export const HALF_M = 21097.5;
export const MARATHON_M = 42195;
const MILE_M = 1609.344;

/**
 * Vickers & Vertosick 2016, Model 1 (one prior race + typical weekly mileage), 2,303 recreational
 * runners: marathon speed = 0.16018617 + 0.83076202·v + 0.06423826·(weekly miles ÷ 10), where v is the
 * speed Riegel predicts for the marathon (m/s).
 */
export function vickersMarathon(riegelSeconds: number, weeklyKm: number): number {
  const v = MARATHON_M / riegelSeconds;
  const miles = (weeklyKm * 1000) / MILE_M;
  return MARATHON_M / (0.16018617 + 0.83076202 * v + 0.06423826 * (miles / 10));
}

/**
 * Tanda 2011: marathon pace Pm (s/km) = 17.1 + 140·exp(−0.0053·K) + 0.55·P, from the mean weekly km K
 * and mean training pace P (s/km) over 8 weeks. Re-validated on Strava data (Tanda 2022) with an RMSE
 * of 5.4 min for finishes between 2:47 and 3:36.
 */
export function tandaMarathon(weeklyKm: number, meanPaceSecPerKm: number): number {
  return (MARATHON_M / 1000) * (17.1 + 140 * Math.exp(-0.0053 * weeklyKm) + 0.55 * meanPaceSecPerKm);
}
/** Where Tanda 2022 validated the formula. Outside it the estimate is shown but flagged. */
export const TANDA_VALID_S: [number, number] = [2 * 3600 + 47 * 60, 3 * 3600 + 36 * 60];

/**
 * Smyth et al. 2022 (82,303 marathons): runners with low (< 1.1), moderate (1.1–1.2) and high (≥ 1.2)
 * heart-rate-to-speed decoupling ran the marathon at 88, 86 and 82 % of critical speed.
 */
export const CS_FRACTION = { low: 0.88, moderate: 0.86, high: 0.82 } as const;
export type DecouplingGroup = keyof typeof CS_FRACTION;
export const decouplingGroup = (ratio: number): DecouplingGroup => (ratio < 1.1 ? "low" : ratio < 1.2 ? "moderate" : "high");
export const csMarathon = (csMps: number, group: DecouplingGroup) => MARATHON_M / (csMps * CS_FRACTION[group]);

/** A long run for decoupling: at least this much moving time. */
export const DECOUPLING_MIN_S = 90 * 60;
/** Early window (after warm-up) and the late window at the end, in moving seconds. */
const EARLY: [number, number] = [10 * 60, 30 * 60];
const LATE_S = 20 * 60;
/** Late speed must be within this of early speed: a run that changes pace (intervals, walking) says nothing about drift. */
const STEADY = 0.15;

/**
 * Heart-rate-to-speed decoupling of one long run: (HR ÷ speed) over its last 20 minutes against minutes
 * 10–30, the training-run form of Smyth's 35–40 km vs 5–10 km ratio. Grade-adjusted speed when the
 * watch recorded it. Null for short, unsteady or heart-rate-less runs.
 */
export function longRunDecoupling(stream: Stream | null): number | null {
  if (!stream || stream.t.length < 2) return null;
  const useGap = (stream.gap?.filter((v) => v != null).length ?? 0) >= stream.t.length / 2;
  let moving = 0;
  const early = { hr: 0, v: 0, n: 0 }, all: { m: number; hr: number; v: number }[] = [];
  for (let i = 1; i < stream.t.length; i++) {
    const dt = stream.t[i] - stream.t[i - 1];
    if (dt <= 0 || dt > 15) continue;
    moving += dt;
    const hr = stream.hr[i], v = useGap ? stream.gap![i] ?? stream.speed[i] : stream.speed[i];
    if (hr == null || v == null || v <= 0.5) continue;
    all.push({ m: moving, hr, v });
    if (moving >= EARLY[0] && moving < EARLY[1]) { early.hr += hr; early.v += v; early.n++; }
  }
  if (moving < DECOUPLING_MIN_S || early.n < 10) return null;
  const late = all.filter((p) => p.m > moving - LATE_S);
  if (late.length < 10) return null;
  const lateHr = late.reduce((a, p) => a + p.hr, 0) / late.length, lateV = late.reduce((a, p) => a + p.v, 0) / late.length;
  const eHr = early.hr / early.n, eV = early.v / early.n;
  if (Math.abs(lateV - eV) / eV > STEADY) return null;
  return Math.round(((lateHr / lateV) / (eHr / eV)) * 1000) / 1000;
}

export const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

/** Finish time at `m` metres on the power law through two known (distance, time) points. */
export function interpolateTime(m: number, a: [number, number], b: [number, number]): number {
  const k = Math.log(b[1] / a[1]) / Math.log(b[0] / a[0]);
  return a[1] * (m / a[0]) ** k;
}

/** Least-squares slope (seconds per point) of the last `n` non-null values; null with fewer than 3. */
export function trendPerStep(values: (number | null)[], n = 8): number | null {
  const pts = values.slice(-n).map((y, x) => ({ x, y })).filter((p): p is { x: number; y: number } => p.y != null);
  if (pts.length < 3) return null;
  const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length, my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0);
  return sxx ? pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx : null;
}
