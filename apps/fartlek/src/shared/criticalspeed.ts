/**
 * Critical speed (CS): the border between heavy and severe intensity. Below it the body holds a
 * steady state for a long time; above it you spend a limited reserve, D′ (metres), until you stop.
 * Linear model: distance = CS × time + D′.
 */
export interface Effort { distanceM: number; durationS: number }
export interface CriticalSpeed {
  /** Critical speed, m/s. */
  csMps: number;
  /** Distance reserve above CS, metres. */
  dPrimeM: number;
  paceSecPerKm: number;
  /** Fit quality, only with three or more efforts. */
  r2: number | null;
}

/** Recommended effort length is 3–12 min; these wider bounds only reject clear typos. */
export const MIN_EFFORT_S = 120;
export const MAX_EFFORT_S = 1800;
const MIN_SPREAD_S = 60;
const CS_RANGE: [number, number] = [1.5, 8.5];

const plausible = (cs: number, dPrime: number) => Number.isFinite(cs) && Number.isFinite(dPrime) && cs >= CS_RANGE[0] && cs <= CS_RANGE[1] && dPrime >= 0;
const build = (cs: number, dPrime: number, r2: number | null): CriticalSpeed => ({
  csMps: Math.round(cs * 1000) / 1000,
  dPrimeM: Math.round(dPrime),
  paceSecPerKm: Math.round(1000 / cs),
  r2,
});

/**
 * Least-squares line through two or more maximal efforts. Returns null when the efforts are too
 * alike in length to separate CS from D′, are out of range, or give a negative D′ (an effort was
 * not truly maximal, or a time or distance was mistyped).
 */
export function fitCriticalSpeed(efforts: Effort[]): CriticalSpeed | null {
  if (efforts.length < 2) return null;
  if (efforts.some((e) => !(e.distanceM > 0) || e.durationS < MIN_EFFORT_S || e.durationS > MAX_EFFORT_S)) return null;
  const ts = efforts.map((e) => e.durationS);
  if (Math.max(...ts) - Math.min(...ts) < MIN_SPREAD_S) return null;
  const n = efforts.length;
  const mt = ts.reduce((a, b) => a + b, 0) / n;
  const md = efforts.reduce((a, e) => a + e.distanceM, 0) / n;
  const sxx = efforts.reduce((a, e) => a + (e.durationS - mt) ** 2, 0);
  const sxy = efforts.reduce((a, e) => a + (e.durationS - mt) * (e.distanceM - md), 0);
  const cs = sxy / sxx;
  const dPrime = md - cs * mt;
  if (!plausible(cs, dPrime)) return null;
  let r2: number | null = null;
  if (n >= 3) {
    const ssTot = efforts.reduce((a, e) => a + (e.distanceM - md) ** 2, 0);
    const ssRes = efforts.reduce((a, e) => a + (e.distanceM - (cs * e.durationS + dPrime)) ** 2, 0);
    r2 = ssTot > 0 ? Math.round((1 - ssRes / ssTot) * 1000) / 1000 : null;
  }
  return build(cs, dPrime, r2);
}

export const THREE_MIN_S = 180;
/**
 * 3-minute all-out test: CS is the average speed over the last 30 seconds, and D′ is what the
 * first minutes gave above that speed. Needs the total distance and the distance of the last 30 s.
 */
export function fromThreeMinute(totalM: number, last30M: number): CriticalSpeed | null {
  if (!(totalM > 0) || !(last30M > 0)) return null;
  const cs = last30M / 30;
  const dPrime = totalM - cs * THREE_MIN_S;
  return plausible(cs, dPrime) ? build(cs, dPrime, null) : null;
}

/** Share of CS where the first threshold sits on average, with the 95 % interval of 26 studies (Hunter et al. 2024). */
export const FIRST_THRESHOLD_SHARE = { mean: 0.823, low: 0.811, high: 0.836 };

export interface CsZones {
  /** Pace at the first threshold, and the paces for the ends of the interval (faster, slower). */
  firstThreshold: { pace: number; paceFast: number; paceSlow: number };
  /** Pace at CS itself. */
  cs: number;
}

/**
 * The norwegian-style threshold window runs from the first threshold up to just under CS. The
 * share is an average over many runners and varied between studies (80.6–84.2 %), so test for precise zones.
 */
export function csZones(cs: CriticalSpeed): CsZones {
  const at = (share: number) => Math.round(1000 / (cs.csMps * share));
  return {
    firstThreshold: { pace: at(FIRST_THRESHOLD_SHARE.mean), paceFast: at(FIRST_THRESHOLD_SHARE.high), paceSlow: at(FIRST_THRESHOLD_SHARE.low) },
    cs: cs.paceSecPerKm,
  };
}

export interface ThresholdComparison {
  /** Threshold pace minus CS pace, s/km. Positive: the threshold is slower than CS, as expected. */
  gapSecPerKm: number;
  /** "above_cs": the threshold is faster than CS, so one of the two is probably off. */
  status: "consistent" | "above_cs";
}

/** Lactate threshold lies below CS, so an entered threshold clearly faster than CS points to a wrong estimate. */
export function compareWithThreshold(csPace: number, thresholdPace: number): ThresholdComparison {
  const gap = Math.round(thresholdPace - csPace);
  return { gapSecPerKm: gap, status: gap < -5 ? "above_cs" : "consistent" };
}

/** `12:05` (m:ss) or `1:02:05` (h:mm:ss) → seconds. */
export function parseClock(s: string): number | null {
  const m = s.trim().match(/^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  const [h, mi, se] = [Number(m[1] ?? 0), Number(m[2]), Number(m[3])];
  if (se > 59 || (m[1] != null && mi > 59)) return null;
  return h * 3600 + mi * 60 + se;
}
