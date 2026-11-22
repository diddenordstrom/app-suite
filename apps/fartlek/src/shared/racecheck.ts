import { predictRace, riegelFromCurve, type CurvePoint, type Prediction, type TrainingContext } from "./bestefforts";
import type { CriticalSpeed } from "./criticalspeed";
import { MARATHON_M } from "./racemodels";

/*
 * Races as the answer key for the predictions (docs/decisions/fartlek-race-results.md): recognising a
 * race among the synced runs, and what every model said the day before it. Only races count: a hard
 * training run has no taper and no race day, so comparing against it would be noise.
 */

/** Bump when a model changes: older checks are kept, a new row is written for the new version. */
export const RACE_CHECK_VERSION = 1;

/** Standard distances (km) a run is matched to, and how far GPS may read short or long (watches mostly read long). */
export const STANDARD_KM = [5, 10, 21.0975, 42.195] as const;
export const DIST_TOL = { short: 0.01, long: 0.03 } as const;

export function standardDistance(distanceM: number): number | null {
  for (const km of STANDARD_KM) {
    const r = distanceM / (km * 1000);
    if (r >= 1 - DIST_TOL.short && r <= 1 + DIST_TOL.long) return km;
  }
  return null;
}

/**
 * Average HR as a share of threshold HR that a race at each distance reaches at least: a 5 or 10 km is
 * run around threshold or above, a half a little under, a marathon well under.
 */
export const RACE_HR_SHARE: Record<(typeof STANDARD_KM)[number], number> = { 5: 0.97, 10: 0.96, 21.0975: 0.93, 42.195: 0.86 };

export type RaceReason = "garmin" | "effort";

/** Why a run looks like a race (Garmin marked it, or a standard distance run hard), or null. */
export function raceReason(a: { distanceM: number; avgHr: number | null; eventType: string | null }, thresholdHr: number | null): RaceReason | null {
  const km = standardDistance(a.distanceM);
  if (a.eventType === "race") return "garmin";
  if (km == null || a.avgHr == null || !thresholdHr) return null;
  return a.avgHr >= RACE_HR_SHARE[km as keyof typeof RACE_HR_SHARE] * thresholdHr ? "effort" : null;
}

export interface ModelCheck { model: "cs" | "riegel" | "vickers" | "durability" | "tanda"; seconds: number }

/**
 * Every model's estimate for a distance from what was known on a day, the shown prediction among them.
 * CS is given for every distance as a diagnostic (it is only used up to 10 km), Riegel up to the
 * marathon, and the three marathon models at the marathon.
 */
export function modelChecks(distanceKm: number, cs: CriticalSpeed | null, curve: CurvePoint[], ctx: TrainingContext | null): { main: Prediction | null; models: ModelCheck[] } {
  const m = distanceKm * 1000;
  const models: ModelCheck[] = [];
  if (cs && m > cs.dPrimeM) models.push({ model: "cs", seconds: Math.round((m - cs.dPrimeM) / cs.csMps) });
  const r = riegelFromCurve(m, curve);
  if (r) models.push({ model: "riegel", seconds: r.seconds });
  const main = predictRace(distanceKm, cs, curve, ctx);
  if (Math.abs(m - MARATHON_M) / MARATHON_M <= 0.02) for (const e of main?.estimates ?? []) models.push({ model: e.model, seconds: e.seconds });
  return { main, models };
}

/** Prediction against the result: seconds (+ = the prediction was slower than the race) and as a share. */
export const missOf = (predicted: number, result: number) => ({ seconds: predicted - result, share: predicted / result - 1 });
