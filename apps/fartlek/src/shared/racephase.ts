import { riegel } from "./bestefforts";
import type { ISODate } from "./dates";

/*
 * The race-specific phase before an A-race marathon or half (docs/decisions/fartlek-race-specific-phase.md).
 * The numbers of the phase live here; the blueprints they steer are in blueprints.ts.
 */

export const RACE_PHASE = {
  /** The weeks before the race, race week included, that make up the phase. */
  weeks: 8,
  /** Tolerated weekly km from which a third (ladder) session may stay and blueprints enter at `entryHigh`. */
  highKm: 60,
  /** A phase build week under `weekKm`, or a longest long run under `longKm`, warns (never refuses). */
  warn: { weekKm: 40, longKm: 25 },
  /** A predicted marathon pace is held to this share of critical speed at most. */
  mpCapOfCs: 0.94,
  /** Goal and prediction further apart than this share make the engine ask which to train for. */
  askPct: 0.03,
  /** Within this many days of the race no long run is moved; a missed one is dropped. */
  noMoveDays: 21,
  /** Form (%) the two build weeks before the taper aim at. */
  deepAim: -25,
  /** Under this share of judged work reps in target in a key session counts as missed paces. */
  paceMissShare: 0.5,
  /** The `READINESS.pain` limits Idag already uses: pain that stops the phase's progression. */
  injury: { level: 8, repeatLevel: 5, repeatDays: 3, windowDays: 7 },
} as const;

/** The paces (sec/km) the phase trains at; null when no source gives one (targets then fall back to zones). */
export interface RacePaces { mp: number | null; hmp: number | null }

/* ---------- Marathon pace ---------- */

const HALF_KM = 21.0975, MARATHON_KM = 42.195;

export type PaceSource = "prediction" | "capped" | "goal" | "threshold" | "none";
export type PaceChoice = "prediction" | "goal";

export interface RacePaceInput {
  /** The race's distance: within 1 km of the half or the marathon. */
  distanceKm: number;
  /** The predicted pace (sec/km) of a marathon and of a half; null when the prediction has no inputs. */
  predMp: number | null;
  predHmp: number | null;
  /** Critical speed, m/s. */
  csMps: number | null;
  goalSeconds: number | null;
  /** Threshold pace, sec/km. */
  thresholdPace: number | null;
  /** What the runner picked when asked; with none, the prediction is used and `ask` says whether to ask. */
  choice?: PaceChoice | null;
}
export interface RacePaceResult {
  mp: number | null; hmp: number | null; source: PaceSource;
  /** Goal and prediction differ by more than `RACE_PHASE.askPct`: the engine must ask which to train for. */
  ask: boolean;
  /** MP comes from a goal faster than the cap (94 % of CS): the engine warns. */
  overCap: boolean;
}

/** The pace at `toKm` of a runner who ran `paceSec` sec/km over `fromKm` (Riegel). */
const scaleTo = (paceSec: number, fromKm: number, toKm: number) => riegel(paceSec * fromKm, fromKm * 1000, toKm * 1000) / toKm;

/**
 * The paces the race phase trains at. Prediction first (it carries the least injury risk): MP is held to
 * `mpCapOfCs` of CS, HMP is not. A goal the runner picked wins over the cap and sets `overCap`; with no prediction
 * the goal is used, then threshold (MP = thr / 0.9, HMP = thr / 0.96, the inverse of `neededThreshold`), then none.
 * Goal and prediction more than `askPct` apart set `ask` until the runner has chosen.
 */
export function racePace(i: RacePaceInput): RacePaceResult {
  const marathon = Math.abs(i.distanceKm - MARATHON_KM) <= 1;
  const goal = i.goalSeconds ? i.goalSeconds / i.distanceKm : null;
  const cap = i.csMps ? 1000 / (RACE_PHASE.mpCapOfCs * i.csMps) : null;
  const round = (x: number | null) => (x == null ? null : Math.round(x));
  const fromGoal = (): RacePaceResult => {
    const mp = marathon ? goal! : scaleTo(goal!, i.distanceKm, MARATHON_KM);
    const hmp = marathon ? scaleTo(goal!, i.distanceKm, HALF_KM) : goal!;
    return { mp: round(mp), hmp: round(hmp), source: "goal", ask: false, overCap: cap != null && mp < cap - 0.5 };
  };
  if (i.choice === "goal" && goal) return fromGoal();

  const ownPred = marathon ? i.predMp : i.predHmp;
  if (ownPred != null || i.predMp != null || i.predHmp != null) {
    let mp = i.predMp ?? scaleTo(i.predHmp!, HALF_KM, MARATHON_KM);
    const hmp = i.predHmp ?? scaleTo(i.predMp!, MARATHON_KM, HALF_KM);
    let source: PaceSource = "prediction";
    if (cap != null && mp < cap) { mp = cap; source = "capped"; }
    const ask = !i.choice && goal != null && ownPred != null && Math.abs(goal - ownPred) / ownPred > RACE_PHASE.askPct;
    return { mp: round(mp), hmp: round(hmp), source, ask, overCap: false };
  }
  if (goal) return fromGoal();
  if (i.thresholdPace) return { mp: round(i.thresholdPace / 0.9), hmp: round(i.thresholdPace / 0.96), source: "threshold", ask: false, overCap: false };
  return { mp: null, hmp: null, source: "none", ask: false, overCap: false };
}

/* ---------- What the server shows ---------- */

export interface PaceView { mp: number | null; hmp: number | null; source: PaceSource; overCap: boolean }
export interface PaceQuestion {
  /** "choose": goal and prediction are far apart. "recalc": a B race was run since the paces were locked. */
  kind: "choose" | "recalc";
  current: PaceView | null; prediction: PaceView; goal: PaceView | null;
}
export interface RacePaceView {
  raceId: number; name: string; date: ISODate; kind: "marathon" | "half"; wip: number;
  paces: PaceView; locked: boolean; lockedOn: ISODate | null; question: PaceQuestion | null;
}
