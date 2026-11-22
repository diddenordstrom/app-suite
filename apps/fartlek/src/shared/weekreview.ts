import { plannedKmOf, type SessionView } from "./compliance";
import { CATCHUP_LIMIT } from "./blocks";
import type { ISODate } from "./dates";
import { RUN_WORKOUT_TYPES, SKIP_REASONS, type Workout } from "./types";

/*
 * Home's Monday check-in (docs/decisions/fartlek-adaptive-engine.md): how last week went, why a stretch of it
 * was missed, and what we suggest because of it. The block is judged as a whole and per week, never day by
 * day. Pure: the server builds the review from last week's sessions, the card works out the recommendation
 * from the reasons the runner picks. Nothing here changes the plan.
 */

export const REVIEW = {
  /** This many missed or struck runs in a row ask why (a whole missed week included). */
  askAfter: 2,
  /** A missed easy run lifts the next long run only when it was at least this long. */
  catchUpMinKm: 4,
  /** The lift: this many km on top of the long run's step, at most. The 15 % cap is `CATCHUP_LIMIT` in blocks.ts. */
  catchUpKm: 1,
  /** "Lighter" repeats the week at about this share. */
  lighterShare: 0.8,
} as const;

/** The reasons offered, in chip order. Every one is also a skip reason stored on the missed sessions. */
export const REASONS = ["sick", "injury", "time", "stress", "travel", "tired", "other"] as const satisfies readonly (typeof SKIP_REASONS)[number][];
export type Reason = (typeof REASONS)[number];

/** What the answer decides: a pause (repeat the week as re-entry), a lighter repeat with nothing caught up, or the week again as planned. */
export type Recommendation = "pause" | "light" | "repeat";

export function recommend(reasons: Reason[]): Recommendation {
  if (reasons.includes("sick") || reasons.includes("injury")) return "pause";
  if (reasons.includes("stress") || reasons.includes("tired")) return "light";
  return "repeat";
}

/** Anything but an unexplained miss: nothing is caught up. */
export const explainsMiss = (reasons: Reason[]) => reasons.some((r) => r !== "other");

/** The one reason stored on each missed session when several are picked: the most serious first. */
const SEVERITY: Reason[] = ["sick", "injury", "stress", "tired", "travel", "time", "other"];
export const primaryReason = (reasons: Reason[]): Reason | null => SEVERITY.find((r) => reasons.includes(r)) ?? null;

const isRun = (w: Workout) => RUN_WORKOUT_TYPES.includes(w.type);
/** A planned run that never happened: unmatched, skipped, or struck by the runner. */
const isMiss = (s: SessionView) => s.outcome === "missed" || s.outcome === "skipped" || s.outcome === "dropped" || (s.outcome === "to_do" && s.workout.status === "planned");

export interface WeekReview {
  weekStart: ISODate;
  plannedRuns: number;
  doneRuns: number;
  plannedKm: number;
  doneKm: number;
  /** The missed run sessions, in date order. */
  missed: Workout[];
  /** The longest stretch of missed runs in a row. */
  inARow: number;
  /** Nothing was run in a week with at least two planned runs. */
  wholeWeek: boolean;
  /** Every miss already has a reason. */
  explained: boolean;
  /** quiet: all done; small: some missed, absorbed or caught up; ask: a stretch missed, the card asks why. */
  kind: "quiet" | "small" | "ask";
}

/** Last week's review; null when it had no planned runs (nothing to say). Only for a week that is over. */
export function reviewWeek(week: { weekStart: ISODate; sessions: SessionView[]; actualKm: number }, today: ISODate): WeekReview | null {
  const runs = week.sessions.filter((s) => isRun(s.workout) && s.workout.type !== "race").sort((a, b) => a.workout.date.localeCompare(b.workout.date));
  if (!runs.length) return null;
  const over = runs.filter((s) => s.workout.date < today);
  if (!over.length) return null;
  let inARow = 0, streak = 0;
  for (const s of over) { streak = isMiss(s) ? streak + 1 : 0; inARow = Math.max(inARow, streak); }
  const missedS = over.filter(isMiss);
  const doneRuns = over.filter((s) => s.outcome === "done" || s.outcome === "short").length;
  const wholeWeek = doneRuns === 0 && over.length >= REVIEW.askAfter;
  const missed = missedS.map((s) => s.workout);
  return {
    weekStart: week.weekStart,
    plannedRuns: over.length,
    doneRuns,
    plannedKm: Math.round(over.reduce((a, s) => a + plannedKmOf(s.workout), 0) * 10) / 10,
    doneKm: Math.round(week.actualKm * 10) / 10,
    missed,
    inARow,
    wholeWeek,
    explained: missed.length > 0 && missed.every((w) => !!w.skipReason),
    kind: !missed.length ? "quiet" : inARow >= REVIEW.askAfter ? "ask" : "small",
  };
}

export interface CatchUp { workoutId: number; date: ISODate; fromKm: number; toKm: number; longestKm: number; missedKm: number }

/**
 * A skipped easy run with no reason lets this week's long run go a little past its step, since the legs are
 * rested: `REVIEW.catchUpKm` on top, never more than 15 % over the longest run of 30 days (`CATCHUP_LIMIT`;
 * the usual limit is 10 %). Only for an unexplained miss, never after illness, pain, stress or travel, and
 * only on a long run without steps, as the engine planned it. Null when nothing is lifted.
 */
export function longRunCatchUp(review: WeekReview, longRun: Workout | null, longestKm: number): CatchUp | null {
  if (!longRun || longRun.steps || !longRun.distanceKm || longestKm <= 0 || review.missed.length !== 1) return null;
  const miss = review.missed[0];
  if (miss.type !== "easy" || miss.skipReason || plannedKmOf(miss) < REVIEW.catchUpMinKm) return null;
  const from = longRun.distanceKm;
  const cap = Math.floor(longestKm * (1 + CATCHUP_LIMIT) * 2) / 2;
  const to = Math.min(from + REVIEW.catchUpKm, cap);
  return to > from + 0.05 ? { workoutId: longRun.id, date: longRun.date, fromKm: from, toKm: to, longestKm, missedKm: plannedKmOf(miss) } : null;
}
