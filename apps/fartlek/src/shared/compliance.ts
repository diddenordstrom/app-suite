import type { StepSummary } from "./stepmatch";
import { addDays, type ISODate } from "./dates";
import { matchWeek, type Match } from "./matching";
import { KEY_TYPES, type Activity, type Msg, type Workout } from "./types";
import type { ZoneSecs } from "./zones";

/**
 * Week and month "on track" judgement (D11, D13). Tolerant by design:
 * within ~15 % of the target is on track, and one missed session never alone makes a week "behind".
 * No per-day red marks: unmatched past workouts are neutral "missed", unmatched runs are extras.
 */
export const TOLERANCE = 0.15;
export const OVERREACH = 0.25;
export const DONE_SHARE = 0.9;

export type WeekStatus = "on_track" | "behind" | "overreaching" | "in_progress" | "upcoming" | "no_plan";
export type SessionOutcome = "done" | "short" | "to_do" | "missed" | "skipped" | "dropped" | "upcoming" | "rest";

/** A planned run that is more than 10 % longer than the longest run in the 30 days before it (research §5). */
export interface Spike { km: number; refKm: number; pct: number }
export interface SessionView {
  workout: Workout; outcome: SessionOutcome; match: Match | null; activity: Activity | null; spike?: Spike | null;
  /** For a run session with steps: reps in target (added by the plan route). */
  stepSummary?: StepSummary | null;
}
export interface WeekTarget { km: number | null; minutes: number | null; note: string | null }

export interface WeekSummary {
  weekStart: ISODate;
  plannedKm: number;
  plannedMin: number;
  targetKm: number | null;
  actualKm: number;
  actualMin: number;
  runs: number;
  sessions: SessionView[];
  extras: Activity[];
  keyPlanned: number;
  keyDone: number;
  missed: number;
  status: WeekStatus;
  reasons: Msg[];
  backoff: boolean;
  /** Share of time in zones 1–2 on the sessions planned as easy or long that have a run linked; null when none. */
  easyShare: number | null;
}

/** Below this share of Z1–2 time, easy and long sessions are flagged as not easy (a signal, never a status). */
export const EASY_SHARE_FLAG = 0.8;

/** Z1–2 share over the easy/long sessions that were run. Heart rate is noisy, so this is info, not a verdict. */
export function easySessionShare(sessions: SessionView[], zonesOf: (a: Activity) => ZoneSecs | null = (a) => a.zoneSecs): { share: number; secs: number; count: number } | null {
  let low = 0, all = 0, count = 0;
  for (const s of sessions) {
    if (!s.activity || !s.activity.isRun || (s.workout.type !== "easy" && s.workout.type !== "long")) continue;
    const z = zonesOf(s.activity);
    if (!z) continue;
    const total = z.reduce((a, b) => a + b, 0);
    if (!total) continue;
    low += z[0] + z[1];
    all += total;
    count++;
  }
  return all ? { share: low / all, secs: all, count } : null;
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

export function plannedKmOf(w: Workout): number {
  if (w.distanceKm != null) return w.distanceKm;
  if (w.durationMin != null && w.type !== "cross" && w.type !== "strength" && w.type !== "rest") return w.durationMin / 6;
  return 0;
}

export function summarizeWeek(
  weekStart: ISODate,
  workouts: Workout[],
  activities: Activity[],
  target: WeekTarget | null,
  today: ISODate,
  zonesOf?: (a: Activity) => ZoneSecs | null,
): WeekSummary {
  const weekEnd = addDays(weekStart, 6);
  const phase: "past" | "current" | "future" = today > weekEnd ? "past" : today < weekStart ? "future" : "current";
  const matches = matchWeek(workouts, activities);
  const byW = new Map(matches.map((m) => [m.workoutId, m]));
  const usedA = new Set(matches.map((m) => m.activityId));
  const aById = new Map(activities.map((a) => [a.id, a]));

  const sessions: SessionView[] = workouts
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)
    .map((w) => {
      const match = byW.get(w.id) ?? null;
      const activity = match ? aById.get(match.activityId) ?? null : null;
      let outcome: SessionOutcome;
      if (w.type === "rest") outcome = "rest";
      else if (activity) {
        const planned = plannedKmOf(w);
        outcome = !planned || activity.distanceM / 1000 >= planned * DONE_SHARE || !activity.isRun ? "done" : "short";
      } else if (w.status === "dropped") outcome = "dropped";
      else if (w.status === "skipped") outcome = "skipped";
      else if (phase === "future" || w.date > today) outcome = phase === "future" ? "upcoming" : "to_do";
      else outcome = phase === "past" ? "missed" : "to_do";
      return { workout: w, outcome, match, activity };
    });

  const active = workouts.filter((w) => w.status !== "dropped" && w.type !== "rest");
  const plannedKm = round1(sum(active.map(plannedKmOf)));
  const plannedMin = sum(active.map((w) => w.durationMin ?? (w.distanceKm ?? 0) * 6));
  const runs = activities.filter((a) => a.isRun);
  const actualKm = round1(sum(runs.map((a) => a.distanceM)) / 1000);
  const actualMin = Math.round(sum(activities.map((a) => a.durationS)) / 60);
  const targetKm = target?.km ?? (plannedKm || null);
  const keyPlanned = active.filter((w) => KEY_TYPES.includes(w.type)).length;
  const keyDone = sessions.filter((s) => KEY_TYPES.includes(s.workout.type) && (s.outcome === "done" || s.outcome === "short")).length;
  const missed = sessions.filter((s) => s.outcome === "missed").length;
  const extras = activities.filter((a) => !usedA.has(a.id));

  const reasons: Msg[] = [];
  let status: WeekStatus;
  if (!targetKm && !workouts.length) status = "no_plan";
  else if (phase === "future") status = "upcoming";
  else {
    const ratio = targetKm ? actualKm / targetKm : 1;
    if (targetKm) reasons.push({ key: "reason.kmOf", params: { actual: actualKm, target: round1(targetKm), pct: Math.round(ratio * 100) } });
    if (keyPlanned) reasons.push({ key: "reason.keyOf", params: { done: keyDone, planned: keyPlanned } });
    if (targetKm && ratio > 1 + OVERREACH) {
      status = "overreaching";
      reasons.push({ key: "reason.wellAbove" });
    } else if (phase === "current") status = "in_progress";
    else if (!targetKm || ratio >= 1 - TOLERANCE) status = "on_track";
    else if (missed === 1 && ratio >= 0.6) {
      status = "on_track";
      reasons.push({ key: "reason.oneMissed" });
    } else status = "behind";
  }
  return {
    weekStart, plannedKm, plannedMin, targetKm, actualKm, actualMin, runs: runs.length, sessions, extras,
    keyPlanned, keyDone, missed, status, reasons, backoff: /backoff/i.test(target?.note ?? ""),
    easyShare: easySessionShare(sessions, zonesOf)?.share ?? null,
  };
}

export type MonthStatus = "on_track" | "behind" | "overreaching" | "in_progress" | "no_plan";
export interface MonthSummary { plannedKm: number; actualKm: number; runs: number; weeks: number; weeksBehind: number; status: MonthStatus; reasons: Msg[] }

/** Month is judged on volume across its weeks; a single behind week does not make it behind. */
export function summarizeMonth(weeks: WeekSummary[], finished: boolean): MonthSummary {
  const plannedKm = round1(sum(weeks.map((w) => w.targetKm ?? 0)));
  const actualKm = round1(sum(weeks.map((w) => w.actualKm)));
  const runs = sum(weeks.map((w) => w.runs));
  const weeksBehind = weeks.filter((w) => w.status === "behind").length;
  const reasons: Msg[] = [];
  let status: MonthStatus;
  if (!plannedKm) status = "no_plan";
  else {
    const ratio = actualKm / plannedKm;
    reasons.push({ key: "reason.kmOf", params: { actual: actualKm, target: plannedKm, pct: Math.round(ratio * 100) } });
    if (weeksBehind) reasons.push({ key: "reason.weeksBehind", params: { count: weeksBehind } });
    if (ratio > 1 + OVERREACH) status = "overreaching";
    else if (!finished) status = "in_progress";
    else if (ratio >= 1 - TOLERANCE || (ratio >= 0.7 && weeksBehind <= 1)) status = "on_track";
    else status = "behind";
  }
  return { plannedKm, actualKm, runs, weeks: weeks.length, weeksBehind, status, reasons };
}

