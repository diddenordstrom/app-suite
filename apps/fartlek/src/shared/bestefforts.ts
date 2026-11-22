/**
 * Best efforts: the longest distance covered in each fixed duration of a run, read from its stream
 * (docs/decisions/fartlek-best-efforts.md). One data foundation for the best-pace curve, critical
 * speed fitted without a test, and the race prediction over time.
 */
import { addDays, type ISODate } from "./dates";
import { fitCriticalSpeed, type CriticalSpeed } from "./criticalspeed";
import type { Stream } from "./types";
import { HALF_M, MARATHON_M, TANDA_VALID_S, csMarathon, decouplingGroup, interpolateTime, median, tandaMarathon, vickersMarathon, type DecouplingGroup } from "./racemodels";

/** Durations kept per run. 3–12 min feed critical speed; the rest draw the curve and the long-race prediction. */
export const EFFORT_DURATIONS = [60, 120, 180, 300, 480, 600, 720, 1200, 1800, 2700, 3600, 5400, 7200] as const;
/** Durations shown in the curve's table (the curve itself draws them all). */
export const TABLE_DURATIONS = [60, 180, 300, 600, 1200, 3600];
/** Window for critical speed: the efforts it can use (3–12 min, the recommended test lengths). */
export const CS_EFFORT_RANGE: [number, number] = [180, 720];
/** How far back the automatic critical speed and the prediction look. Long enough to hold a few hard 3–12 min efforts. */
export const AUTO_WINDOW_DAYS = 84;
/** Rolling comparison when there is no previous block: the last 6 weeks against the 6 before (42 days, as fitness/CTL). */
export const ROLLING_DAYS = 42;
/** Riegel's fatigue exponent for races longer than CS reaches. */
export const RIEGEL_EXPONENT = 1.06;
/** Up to this distance the CS/D′ model predicts; past it Riegel from the best long effort. */
export const CS_MODEL_MAX_KM = 10;
/** A fitted D′ below this means the efforts were probably not all-out (threshold reps, not races), so CS reads low. */
export const LOW_D_PRIME_M = 100;
/** Riegel only extrapolates from efforts at least this long; shorter ones overstate long races. */
export const RIEGEL_MIN_EFFORT_S = 1200;

/** Faster than this is a GPS spike, not running (2:05/km). */
const MAX_SPEED = 8;
/** A gap between samples longer than this is a pause: it adds no time to an effort. */
const PAUSE_S = 15;

export interface Effort { durationS: number; distanceM: number; /** Offset into the activity where it starts, s. */ startS: number }
export interface RunEfforts { efforts: Effort[]; /** Grade-adjusted speed was used. */ gap: boolean }

/**
 * Best distance per duration in one stream. Uses Garmin's grade-adjusted speed when at least half the
 * samples have it, else the raw speed. Time is moving time (pauses are skipped), and an effort window
 * is scaled to exactly its duration.
 */
export function extractEfforts(stream: Stream | null, durations: readonly number[] = EFFORT_DURATIONS): RunEfforts {
  if (!stream || stream.t.length < 2) return { efforts: [], gap: false };
  const gapCount = stream.gap?.filter((v) => v != null).length ?? 0;
  const useGap = gapCount >= stream.t.length / 2;
  const speedAt = (i: number) => {
    const v = (useGap ? stream.gap![i] ?? stream.speed[i] : stream.speed[i]);
    return v != null && v > 0 && v <= MAX_SPEED ? v : 0;
  };
  const n = stream.t.length;
  const T = new Float64Array(n), D = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    const dt = stream.t[i] - stream.t[i - 1];
    const moving = dt > 0 && dt <= PAUSE_S ? dt : 0;
    T[i] = T[i - 1] + moving;
    D[i] = D[i - 1] + moving * speedAt(i - 1);
  }
  const efforts: Effort[] = [];
  for (const w of durations) {
    if (T[n - 1] < w) break;
    let best = 0, bestStart = 0;
    let i = 0;
    for (let j = 1; j < n; j++) {
      while (i + 1 < j && T[j] - T[i + 1] >= w) i++;
      const span = T[j] - T[i];
      if (span < w) continue;
      const dist = ((D[j] - D[i]) * w) / span;
      if (dist > best) { best = dist; bestStart = stream.t[i]; }
    }
    if (best > 0) efforts.push({ durationS: w, distanceM: Math.round(best * 10) / 10, startS: Math.round(bestStart) });
  }
  return { efforts, gap: useGap };
}

/** A stored effort with the run it came from. */
export interface DatedEffort extends Effort { activityId: string; date: ISODate; gap: boolean }
export interface CurvePoint { durationS: number; distanceM: number; paceSecPerKm: number; activityId: string; date: ISODate }

const paceOf = (e: { durationS: number; distanceM: number }) => Math.round((e.durationS / e.distanceM) * 1000);

/** The best effort per duration among efforts dated within [from, to]. */
export function bestCurve(efforts: DatedEffort[], from: ISODate | null, to: ISODate): CurvePoint[] {
  const best = new Map<number, DatedEffort>();
  for (const e of efforts) {
    if ((from && e.date < from) || e.date > to) continue;
    const b = best.get(e.durationS);
    if (!b || e.distanceM > b.distanceM) best.set(e.durationS, e);
  }
  return [...best.values()].sort((a, b) => a.durationS - b.durationS)
    .map((e) => ({ durationS: e.durationS, distanceM: e.distanceM, paceSecPerKm: paceOf(e), activityId: e.activityId, date: e.date }));
}

export interface Period { from: ISODate; to: ISODate }
export interface ComparePeriods {
  kind: "block" | "rolling"; current: Period; previous: Period;
  /** For blocks: their names (null when unnamed) and kinds. */
  currentName?: string | null; previousName?: string | null; currentKind?: string; previousKind?: string;
}

/**
 * What the curve compares: the current block against the one before it when both exist, else the last
 * 6 weeks against the 6 before. `blocks` are [start, end] periods sorted by start.
 */
export function comparePeriods(today: ISODate, blocks: (Period & { name?: string | null; kind?: string })[]): ComparePeriods {
  const i = blocks.findIndex((b) => b.from <= today && b.to >= today);
  if (i > 0) {
    const cur = blocks[i], prev = blocks[i - 1];
    return { kind: "block", current: { from: cur.from, to: today }, previous: { from: prev.from, to: prev.to }, currentName: cur.name ?? null, previousName: prev.name ?? null, currentKind: cur.kind, previousKind: prev.kind };
  }
  return rollingPeriods(today);
}
export function rollingPeriods(today: ISODate): ComparePeriods {
  const from = addDays(today, -(ROLLING_DAYS - 1));
  return { kind: "rolling", current: { from, to: today }, previous: { from: addDays(from, -ROLLING_DAYS), to: addDays(from, -1) } };
}

export interface AutoCs extends CriticalSpeed {
  /** The efforts the fit used, one per duration. */
  efforts: CurvePoint[];
  /** The newest date among them: a test newer than this wins. */
  newest: ISODate;
}

/**
 * Critical speed fitted through the best 3–12 min efforts of the window ending `to`. Null with fewer
 * than three durations, or when the fit is implausible (fitCriticalSpeed's checks).
 */
export function autoCriticalSpeed(efforts: DatedEffort[], to: ISODate, windowDays = AUTO_WINDOW_DAYS): AutoCs | null {
  const pts = bestCurve(efforts, addDays(to, -(windowDays - 1)), to).filter((p) => p.durationS >= CS_EFFORT_RANGE[0] && p.durationS <= CS_EFFORT_RANGE[1]);
  if (pts.length < 3) return null;
  const cs = fitCriticalSpeed(pts.map((p) => ({ distanceM: p.distanceM, durationS: p.durationS })));
  if (!cs) return null;
  return { ...cs, efforts: pts, newest: pts.reduce((a, p) => (p.date > a ? p.date : a), pts[0].date) };
}

export interface CsTestLike { date: ISODate; csMps: number; dPrimeM: number }
export type CsSource = { source: "auto"; cs: AutoCs } | { source: "test"; cs: CriticalSpeed; date: ISODate; auto: AutoCs | null };

/** The automatic estimate, unless a test on or before `to` is newer than every effort it was fitted from. */
export function chooseCs(auto: AutoCs | null, tests: CsTestLike[], to: ISODate): CsSource | null {
  const test = tests.filter((x) => x.date <= to).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (test && (!auto || test.date > auto.newest)) {
    const cs: CriticalSpeed = { csMps: test.csMps, dPrimeM: test.dPrimeM, paceSecPerKm: Math.round(1000 / test.csMps), r2: null };
    return { source: "test", cs, date: test.date, auto };
  }
  return auto ? { source: "auto", cs: auto } : null;
}

/** Riegel: T2 = T1 × (D2 / D1)^1.06. */
export function riegel(fromS: number, fromM: number, toM: number, exponent = RIEGEL_EXPONENT): number {
  return fromS * (toM / fromM) ** exponent;
}

/** Training around a date that the marathon models need: the 8 weeks before it. */
export interface TrainingContext {
  weeklyKm: number | null;
  meanPaceSecPerKm: number | null;
  /** Median heart-rate-to-speed decoupling of the steady long runs in the window. */
  decoupling: number | null;
  longRuns: number;
}
/** Weeks of training the marathon models look at (Tanda's 8 weeks; Vickers' "typical weekly mileage"). */
export const TRAINING_WEEKS = 8;

export interface RunSummary { date: ISODate; distanceM: number; durationS: number; decoupling: number | null }

export function trainingContext(runs: RunSummary[], to: ISODate): TrainingContext {
  const from = addDays(to, -(TRAINING_WEEKS * 7 - 1));
  const inWin = runs.filter((r) => r.date >= from && r.date <= to);
  const km = inWin.reduce((a, r) => a + r.distanceM, 0) / 1000, secs = inWin.reduce((a, r) => a + r.durationS, 0);
  const dec = inWin.map((r) => r.decoupling).filter((v): v is number => v != null);
  return {
    weeklyKm: inWin.length ? Math.round((km / TRAINING_WEEKS) * 10) / 10 : null,
    meanPaceSecPerKm: km > 0 ? Math.round(secs / km) : null,
    decoupling: median(dec),
    longRuns: dec.length,
  };
}

export type Estimate =
  | { model: "vickers"; seconds: number; weeklyKm: number }
  | { model: "durability"; seconds: number; ratio: number; group: DecouplingGroup; longRuns: number }
  | { model: "tanda"; seconds: number; weeklyKm: number; meanPaceSecPerKm: number; outsideValidated: boolean };

export interface Prediction {
  seconds: number;
  /** cs: (d − D′) ÷ CS. riegel: from a long effort. marathon: median of the estimates. between: on the power law between the half and the marathon. */
  model: "cs" | "riegel" | "marathon" | "between";
  /** For Riegel: the effort it scaled from. */
  from?: CurvePoint;
  /** For the marathon: each model's estimate. */
  estimates?: Estimate[];
}

export function riegelFromCurve(m: number, curve: CurvePoint[]): Prediction | null {
  let best: Prediction | null = null;
  for (const p of curve) {
    if (p.durationS < RIEGEL_MIN_EFFORT_S || p.distanceM >= m) continue;
    const s = riegel(p.durationS, p.distanceM, m);
    if (!best || s < best.seconds) best = { seconds: Math.round(s), model: "riegel", from: p };
  }
  return best;
}

/**
 * Predicted finish time.
 * - Up to 10 km: (distance − D′) ÷ CS.
 * - Up to the half marathon: Riegel (1.06) from the long effort (≥ 20 min) that predicts fastest; it is
 *   well calibrated there (Vickers & Vertosick 2016).
 * - Marathon: the median of the estimates that have their inputs (racemodels.ts): Riegel corrected for
 *   weekly volume (Vickers), CS × the share of it runners with your durability held (Smyth), and Tanda.
 * - Between the half and the marathon: on the power law through those two predictions.
 * Each falls back to the other models when its inputs are missing; null without any.
 */
export function predictRace(distanceKm: number, cs: CriticalSpeed | null, curve: CurvePoint[], ctx: TrainingContext | null = null): Prediction | null {
  const m = distanceKm * 1000;
  const fromCs = cs && m > cs.dPrimeM ? Math.round((m - cs.dPrimeM) / cs.csMps) : null;
  if (distanceKm <= CS_MODEL_MAX_KM && fromCs) return { seconds: fromCs, model: "cs" };
  if (m <= HALF_M * 1.02) return riegelFromCurve(m, curve) ?? (fromCs ? { seconds: fromCs, model: "cs" } : null);
  if (Math.abs(m - MARATHON_M) / MARATHON_M <= 0.02) return marathon(m, cs, curve, ctx) ?? riegelFromCurve(m, curve) ?? (fromCs ? { seconds: fromCs, model: "cs" } : null);
  const half = predictRace(HALF_M / 1000, cs, curve, ctx), full = predictRace(MARATHON_M / 1000, cs, curve, ctx);
  if (half && full) return { seconds: Math.round(interpolateTime(m, [HALF_M, half.seconds], [MARATHON_M, full.seconds])), model: "between" };
  return riegelFromCurve(m, curve);
}

function marathon(m: number, cs: CriticalSpeed | null, curve: CurvePoint[], ctx: TrainingContext | null): Prediction | null {
  const scale = m / MARATHON_M;
  const est: Estimate[] = [];
  const r = riegelFromCurve(MARATHON_M, curve);
  if (r && ctx?.weeklyKm != null) est.push({ model: "vickers", seconds: Math.round(vickersMarathon(r.seconds, ctx.weeklyKm) * scale), weeklyKm: ctx.weeklyKm });
  if (cs && ctx?.decoupling != null) {
    const group = decouplingGroup(ctx.decoupling);
    est.push({ model: "durability", seconds: Math.round(csMarathon(cs.csMps, group) * scale), ratio: ctx.decoupling, group, longRuns: ctx.longRuns });
  }
  if (ctx?.weeklyKm != null && ctx.meanPaceSecPerKm != null) {
    const s = tandaMarathon(ctx.weeklyKm, ctx.meanPaceSecPerKm);
    est.push({ model: "tanda", seconds: Math.round(s * scale), weeklyKm: ctx.weeklyKm, meanPaceSecPerKm: ctx.meanPaceSecPerKm, outsideValidated: s < TANDA_VALID_S[0] || s > TANDA_VALID_S[1] });
  }
  const mid = median(est.map((e) => e.seconds));
  return mid == null ? null : { seconds: Math.round(mid), model: "marathon", from: r?.from, estimates: est };
}

export interface PredictionPoint { date: ISODate; seconds: number | null; model: Prediction["model"] | null }

/**
 * One prediction per week end (`weekEnds`, sorted), each from the window of efforts and the training
 * ending that day, with the critical speed chosen as on that day.
 */
export function predictionHistory(distanceKm: number, efforts: DatedEffort[], tests: CsTestLike[], weekEnds: ISODate[], runs: RunSummary[] = []): PredictionPoint[] {
  return weekEnds.map((d) => {
    const chosen = chooseCs(autoCriticalSpeed(efforts, d), tests, d);
    const p = predictRace(distanceKm, chosen?.cs ?? null, bestCurve(efforts, addDays(d, -(AUTO_WINDOW_DAYS - 1)), d), trainingContext(runs, d));
    return { date: d, seconds: p?.seconds ?? null, model: p?.model ?? null };
  });
}
