import { addDays, range, weekday, type ISODate } from "./dates";
import { plannedKmOf, type SessionView } from "./compliance";
import { gradeEasy } from "./zones";
import { KEY_TYPES, RUN_WORKOUT_TYPES, type Activity, type Workout } from "./types";
import type { Verdict } from "./recovery";
import { longestStep, spikeLimitOf, type RunPoint } from "./blocks";
import { longRun, NEXT, rung, rungBefore, spikeMax, thresholdReps, thresholdSteps, type Thr } from "./nextweek";
import type { Units } from "./format";
import { stepsText, type WorkoutSteps } from "./steps";

/*
 * Home's "Idag" card (docs/decisions/fartlek-today.md): today's session next to today's form, and
 * suggestions only when something happened: a session missed earlier in the week, low form on a key
 * session, or a key session ahead that a missed one has made too big (docs/decisions/fartlek-key-sessions-first.md). Nothing here changes the plan; the client applies a suggestion only when the runner
 * accepts it. Pure, so the server builds the suggestions and the tests pin the rules.
 */

export const TODAY = {
  /** Today's form verdicts that make a key session worth a second look. "stop" (pain veto) already says rest. */
  lowForm: ["backOff"] as Verdict[],
  /** Spreading a struck session's km over the rest of the week: at most this much more per session. */
  rebalance: { easyMax: 0.3, longMax: 0.2 },
  /** Key sessions this many days ahead are checked against what was actually run. */
  aheadDays: 7,
} as const;

/** How the runner says the body feels before a key session on a low-form day. Only "fresh" sets a suggestion aside. */
export const FEELS = ["fresh", "normal", "heavy"] as const;
export type Feel = (typeof FEELS)[number];

const isRun = (w: Workout) => RUN_WORKOUT_TYPES.includes(w.type);
const isHard = (w: Workout) => KEY_TYPES.includes(w.type);
const active = (s: SessionView) => s.workout.status === "planned" && s.workout.type !== "rest";

/** Today's planned sessions, rest days left out. */
export function todaySessions(sessions: SessionView[], today: ISODate): SessionView[] {
  return sessions.filter((s) => s.workout.date === today && s.workout.type !== "rest" && s.workout.status !== "dropped");
}

/**
 * Runs planned on a day already gone this week that nothing has matched yet. Matching is flexible
 * within the week, so these are still "to do": the card asks whether to move or strike them.
 */
export function missedSessions(sessions: SessionView[], today: ISODate): SessionView[] {
  return sessions.filter((s) => s.outcome === "to_do" && s.workout.date < today && active(s) && isRun(s.workout));
}

/**
 * The first day from today to the week's end where `w` fits: a hard session never next to (or on the
 * same day as) another hard one; any session only on a day with no other run. Usual run days first.
 */
export function moveTarget(w: Workout, sessions: SessionView[], today: ISODate, weekEnd: ISODate, runDays: number[]): ISODate | null {
  const others = sessions.filter((s) => active(s) && s.workout.id !== w.id && isRun(s.workout)).map((s) => s.workout);
  const hardOn = new Set(others.filter(isHard).map((o) => o.date));
  const runOn = new Set(others.map((o) => o.date));
  const fits = (d: ISODate) => !runOn.has(d) && (!isHard(w) || (!hardOn.has(addDays(d, -1)) && !hardOn.has(addDays(d, 1))));
  const days = range(today, weekEnd).filter((d) => d > w.date);
  return days.find((d) => fits(d) && runDays.includes(weekday(d))) ?? days.find(fits) ?? null;
}

export interface Change { workoutId: number; date: ISODate; type: Workout["type"]; fromKm: number; toKm: number }
export interface Rebalance { changes: Change[]; placedKm: number; leftoverKm: number; weekKm: number }

/**
 * Spread `km` from a struck session (already dropped, so not in `sessions`' count) over the runs still
 * ahead this week (after today), in whole km:
 * easy runs grow at most 30 % and the long run 20 %, and none past the 30-day rule (10 % over the longest
 * run of the 30 days before it, from `history`). What doesn't fit is left out on purpose rather than squeezed in.
 */
export function rebalance(km: number, sessions: SessionView[], today: ISODate, history: RunPoint[] = []): Rebalance {
  const r = TODAY.rebalance;
  const weekKm = sessions.filter((s) => active(s) && isRun(s.workout)).reduce((a, s) => a + plannedKmOf(s.workout), 0);
  const open = sessions.filter((s) => active(s) && s.outcome !== "done" && s.outcome !== "short" && s.workout.date > today
    && (s.workout.type === "easy" || s.workout.type === "long") && !s.workout.steps && s.workout.distanceKm);
  const slots = open.map((s) => {
    const from = s.workout.distanceKm!;
    const long = s.workout.type === "long";
    const ref = longestStep(s.workout.date, from, history)?.refKm ?? 0;
    const cap = Math.min(from * (1 + (long ? r.longMax : r.easyMax)), ref > 0 ? spikeMax(ref) : Infinity);
    return { s, from, to: from, room: Math.max(0, Math.floor(cap - from)) };
  });
  let left = Math.round(km);
  // One km at a time to the slot with the most room left, so the extra spreads out instead of piling on one run.
  while (left > 0) {
    const slot = slots.filter((x) => x.room > 0).sort((a, b) => b.room - a.room || a.s.workout.date.localeCompare(b.s.workout.date))[0];
    if (!slot) break;
    slot.to += 1; slot.room -= 1; left -= 1;
  }
  const changes = slots.filter((x) => x.to > x.from).map((x) => ({ workoutId: x.s.workout.id, date: x.s.workout.date, type: x.s.workout.type, fromKm: x.from, toKm: x.to }));
  const placed = changes.reduce((a, c) => a + c.toKm - c.fromKm, 0);
  return { changes, placedKm: placed, leftoverKm: Math.max(0, Math.round(km) - placed), weekKm: Math.round((weekKm + placed) * 10) / 10 };
}

export type LowFormPlan =
  | { kind: "swap"; workout: Workout; other: Workout }
  | { kind: "move"; workout: Workout; date: ISODate };

/**
 * Low form on a key session today: swap it with a later easy run in the week when the key session
 * fits that day, else move it to a free day where it fits. Null when nothing fits (the verdict's
 * general advice stands) or when form isn't low.
 */
export function lowFormPlan(verdict: Verdict, sessions: SessionView[], today: ISODate, weekEnd: ISODate, runDays: number[]): LowFormPlan | null {
  if (!TODAY.lowForm.includes(verdict)) return null;
  const key = todaySessions(sessions, today).find((s) => s.outcome === "to_do" && isHard(s.workout) && s.workout.type !== "race");
  if (!key) return null;
  const w = key.workout;
  const hardOn = new Set(sessions.filter((s) => active(s) && s.workout.id !== w.id && isHard(s.workout)).map((s) => s.workout.date));
  const easy = sessions.find((s) => active(s) && s.outcome === "to_do" && s.workout.type === "easy" && s.workout.date > today
    && !hardOn.has(addDays(s.workout.date, -1)) && !hardOn.has(addDays(s.workout.date, 1)) && !hardOn.has(s.workout.date));
  if (easy) return { kind: "swap", workout: w, other: easy.workout };
  const date = moveTarget(w, sessions, addDays(today, 1), weekEnd, runDays);
  return date ? { kind: "move", workout: w, date } : null;
}

/** A key session ahead to bring back in line with what was run. Nothing changes until the runner accepts. */
export type KeyFix =
  | { kind: "long"; workout: Workout; fromKm: number; toKm: number; longestKm: number }
  | { kind: "threshold"; workout: Workout; from: { reps: number; min: number }; to: Thr; lastRun: { reps: number; min: number } | null; stepsText: string };

const ahead = (s: SessionView, today: ISODate) =>
  s.workout.status === "planned" && (s.outcome === "to_do" || s.outcome === "upcoming")
  && s.workout.date >= today && s.workout.date <= addDays(today, TODAY.aheadDays);

/**
 * The next long run and threshold session in the coming week, checked against the rules the engine plans
 * by (`sessions` with a few weeks before, `history` the runs of the 30-day look-back):
 * - a long run more than 10 % over the longest run of the 30 days before it (after a missed long run, say)
 *   comes back to the long run's step: the longest + 1 km;
 * - a threshold session a rung (or more) ahead of the ladder, because the one before it was missed or
 *   struck, comes back to the rung after the last one run.
 * Only sessions the engine could have planned: a long run without steps, a threshold session on the ladder.
 */
export function keyFixes(sessions: SessionView[], history: RunPoint[], today: ISODate, o: { easyPace: number | null; thresholdPace: number | null; units: Units }): KeyFix[] {
  const out: KeyFix[] = [];
  const next = (type: Workout["type"]) => sessions.filter((s) => s.workout.type === type && ahead(s, today)).sort((a, b) => a.workout.date.localeCompare(b.workout.date))[0];

  const long = next("long");
  if (long && !long.workout.steps && long.workout.distanceKm) {
    const from = long.workout.distanceKm;
    const ref = longestStep(long.workout.date, from, history)?.refKm ?? 0;
    const step = ref > 0 ? longRun(ref, false, o.easyPace) : null;
    if (step && from > spikeMax(ref, spikeLimitOf(long.workout)) + 0.05 && step.km < from) out.push({ kind: "long", workout: long.workout, fromKm: from, toKm: step.km, longestKm: ref });
  }

  const thr = next("threshold");
  const reps = thr ? thresholdReps(thr.workout.steps) : null;
  const at = reps ? NEXT.ladder.findIndex((x) => x.reps === reps.reps && x.min === reps.min) : -1;
  if (thr && reps && at >= 0) {
    const want = rungBefore(thr.workout.date, sessions, o.thresholdPace);
    if (want < at) {
      const to = rung(want);
      const prev = sessions.filter((s) => s.workout.type === "threshold" && s.workout.date < thr.workout.date && (s.outcome === "done" || s.outcome === "short"))
        .sort((a, b) => b.workout.date.localeCompare(a.workout.date))[0];
      const steps: WorkoutSteps = thresholdSteps(to.reps, to.min, to.rest);
      const lastRun = prev ? thresholdReps(prev.workout.steps, o.thresholdPace) : null;
      out.push({ kind: "threshold", workout: thr.workout, from: reps, to, lastRun: lastRun && { reps: lastRun.reps, min: Math.round(lastRun.min) }, stepsText: stepsText(steps, "en", o.units) });
    }
  }
  return out;
}

/* ---------- Moving a missed session: take over an easy run's day (docs/decisions/fartlek-adaptive-engine.md) ---------- */

export type MovePlan =
  | { kind: "move"; date: ISODate }
  /** The key session takes over an easy run's day; the easy run goes to a free day, or is struck when there is none. */
  | { kind: "swap"; date: ISODate; other: Workout; otherTo: ISODate | null };

/**
 * Where a missed session can go: a free day where it fits (`moveTarget`), else, for a key session, the day of a later
 * easy run where a hard session fits. The easy run then moves to the first free day after it, or is struck: an easy run
 * is what the week can spare, never the key session.
 */
export function movePlan(w: Workout, sessions: SessionView[], today: ISODate, weekEnd: ISODate, runDays: number[]): MovePlan | null {
  const free = moveTarget(w, sessions, today, weekEnd, runDays);
  if (free) return { kind: "move", date: free };
  if (!isHard(w)) return null;
  const others = sessions.filter((s) => active(s) && s.workout.id !== w.id && isRun(s.workout));
  const hardOn = new Set(others.filter((s) => isHard(s.workout)).map((s) => s.workout.date));
  const easy = others.filter((s) => s.workout.type === "easy" && s.outcome !== "done" && s.outcome !== "short" && s.workout.date >= today && s.workout.date > w.date
    && !hardOn.has(addDays(s.workout.date, -1)) && !hardOn.has(addDays(s.workout.date, 1)))
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date))[0];
  if (!easy) return null;
  // With the key session on the easy run's day, where does the easy run fit?
  const after = sessions.map((s) => (s.workout.id === w.id ? { ...s, workout: { ...s.workout, date: easy.workout.date } } : s));
  return { kind: "swap", date: easy.workout.date, other: easy.workout, otherTo: moveTarget(easy.workout, after, today, weekEnd, runDays) };
}

/* ---------- A session much harder than planned: the dial, in order ---------- */

export const HARD = {
  /** A session counts as much harder than planned at this share of its planned load, and at least `minExtra` more. */
  over: 1.3,
  minExtra: 20,
  /** Looked back this many days for it. */
  lookBack: 2,
  /** Easy runs left in the week lose this share when nothing closer helps. */
  trim: 0.1,
  /** The long run is shortened only when today's form score is this or lower and it is this close. */
  longScore: 5,
  longDays: 2,
} as const;

export interface LoadedSession { workout: Workout; actual: number; planned: number }
export interface HardChange { workoutId: number; date: ISODate; type: Workout["type"]; fromKm: number; toKm: number; toType?: Workout["type"]; stepsText?: string; moveTo?: ISODate }
export type HardStep = "nextDayEasy" | "rungDown" | "trimEasy" | "shortenLong";
export interface TooHard { session: Workout; actual: number; planned: number; step: HardStep; changes: HardChange[] }

/** The most recent session in the last days that was much harder than planned (a race always is). */
export function hardSession(done: LoadedSession[], today: ISODate): LoadedSession | null {
  const from = addDays(today, -HARD.lookBack);
  return done.filter((d) => d.workout.date >= from && d.workout.date <= today
    && (d.workout.type === "race" || (d.actual >= d.planned * HARD.over && d.actual - d.planned >= HARD.minExtra)))
    .sort((a, b) => b.workout.date.localeCompare(a.workout.date))[0] ?? null;
}

/**
 * After a session much harder than planned, the first step of the dial that applies (the long run keeps its step as
 * long as anything else helps): a key session the next day moves (or becomes easy), a threshold session within two
 * days goes a rung down, the easy runs left in the week lose 10 %, and only with low form and the long run within two
 * days is the long run shortened. Nothing changes until the runner accepts.
 */
export function tooHardPlan(hard: LoadedSession, sessions: SessionView[], today: ISODate, weekEnd: ISODate, runDays: number[], o: { score: number | null; units: Units }): TooHard | null {
  const day = hard.workout.date;
  const open = sessions.filter((s) => active(s) && isRun(s.workout) && s.workout.id !== hard.workout.id && s.outcome !== "done" && s.outcome !== "short" && s.workout.date >= today && s.workout.date <= weekEnd)
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date));
  const out = (step: HardStep, changes: HardChange[]): TooHard => ({ session: hard.workout, actual: hard.actual, planned: hard.planned, step, changes });
  const km = (w: Workout) => plannedKmOf(w);

  // 1. The next day easy: a key session there moves to a free day where it fits, else it becomes an easy run.
  const next = open.find((s) => s.workout.date === addDays(day, 1) && isHard(s.workout) && s.workout.type !== "race");
  if (next) {
    const to = moveTarget(next.workout, sessions, addDays(day, 2) > today ? addDays(day, 2) : today, weekEnd, runDays);
    return out("nextDayEasy", [to
      ? { workoutId: next.workout.id, date: next.workout.date, type: next.workout.type, fromKm: km(next.workout), toKm: km(next.workout), moveTo: to }
      : { workoutId: next.workout.id, date: next.workout.date, type: next.workout.type, fromKm: km(next.workout), toKm: km(next.workout), toType: "easy", stepsText: "" }]);
  }

  // 2. A threshold session on the ladder within two days: a rung down.
  const thr = open.find((s) => s.workout.type === "threshold" && s.workout.date <= addDays(day, 2));
  const reps = thr ? thresholdReps(thr.workout.steps) : null;
  const at = reps ? NEXT.ladder.findIndex((x) => x.reps === reps.reps && x.min === reps.min) : -1;
  if (thr && at > 0) {
    const to = rung(at - 1);
    return out("rungDown", [{ workoutId: thr.workout.id, date: thr.workout.date, type: "threshold", fromKm: km(thr.workout), toKm: km(thr.workout),
      stepsText: stepsText(thresholdSteps(to.reps, to.min, to.rest), "en", o.units) }]);
  }

  // 3. The easy runs left in the week, 10 % shorter (whole half km).
  const easy = open.filter((s) => s.workout.type === "easy" && !s.workout.steps && s.workout.distanceKm);
  const trims = easy.map((s) => ({ workoutId: s.workout.id, date: s.workout.date, type: s.workout.type, fromKm: s.workout.distanceKm!, toKm: Math.floor(s.workout.distanceKm! * (1 - HARD.trim) * 2) / 2 }))
    .filter((c) => c.toKm < c.fromKm);
  if (trims.length) return out("trimEasy", trims);

  // 4. Last, and only with low form: the long run, if it is within two days.
  const long = open.find((s) => s.workout.type === "long" && !s.workout.steps && s.workout.distanceKm && s.workout.date <= addDays(today, HARD.longDays));
  if (long && o.score != null && o.score <= HARD.longScore) {
    const from = long.workout.distanceKm!;
    return out("shortenLong", [{ workoutId: long.workout.id, date: long.workout.date, type: "long", fromKm: from, toKm: Math.floor(from * (1 - HARD.trim) * 2) / 2 }]);
  }
  return null;
}

/**
 * Easy or long runs in the last days that weren't easy by the app's own easy grade ("off", under 80 % at or below the easy
 * band): said, never a change to the plan. `scoreOf` is the easy score the rest of the app shows (`easyScore`); without
 * it, the share of zones 1–2.
 */
const zoneShare = (a: Activity) => { const z = a.zoneSecs; const all = z ? z.reduce((x, y) => x + y, 0) : 0; return z && all ? (z[0] + z[1]) / all : null; };
export function tooFastEasy(sessions: SessionView[], today: ISODate, scoreOf: (a: Activity) => number | null = zoneShare): Workout[] {
  const from = addDays(today, -HARD.lookBack);
  return sessions.filter((s) => (s.workout.type === "easy" || s.workout.type === "long") && s.activity && s.workout.date >= from && s.workout.date <= today)
    .filter((s) => { const v = scoreOf(s.activity!); return v != null && gradeEasy(v) === "off"; })
    .map((s) => s.workout);
}
