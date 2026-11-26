import { addDays, daysBetween, weekday, type ISODate } from "./dates";
import type { PhaseSeed } from "./racephase";
import type { RecoveryRace } from "./blockplan";
import { FORM, formPct } from "./load";
import { COACH, crossLoadPerDay, itemLoad } from "./coach";
import { stepTotals, stridesRepeat, THRESHOLD_WARM_COOL_MIN, withStrides, type StepRefs, type WorkoutSteps } from "./steps";
import type { SessionView } from "./compliance";
import type { Threshold } from "./types";
import { longShareAt, tune } from "./tuning";

const half = (n: number) => Math.round(n * 2) / 2;
const floorHalf = (n: number) => Math.floor(n * 2) / 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

/*
 * "Suggest next week" (docs/decisions/fartlek-suggest-week.md, fartlek-key-sessions-first.md): the key
 * sessions first, then volume. The long run steps up on its own ladder (the longest run of the last 30 days
 * + 1 km, never more than 10 % over it), the threshold session takes the next rung of its ladder, and easy
 * zone 2 runs fill the rest of the week's km. Then one dial, form as a share of fitness: a week too hard gets
 * a shorter threshold session, then fewer zone 2 km; a calm week gets a faster finish on the long run and is
 * left at that (docs/decisions/fartlek-form-relative.md). Every try is kept for the "testing sessions" animation.
 * The result is only a starting point: the client re-evaluates whatever the runner changes with `evaluate`.
 * Pure: the server gathers the seed, the client gets it back to evaluate edits live.
 */

export type Thr = { reps: number; min: number; rest: number };

export const NEXT = {
  /** Long run share of the week when there is no run in the last 30 days to step up from. */
  longShare: 0.28,
  /**
   * No session more than this over the longest run of the last `spikeDays` days. A single session over it
   * was linked to more overuse injuries than changes in weekly km (Frandsen et al., BJSM 2025, 5 205 runners).
   */
  spike: 0.1,
  spikeDays: 30,
  /**
   * The long run never goes past this many km, or this many minutes at easy pace, whichever comes first: one ceiling for plain and
   * key long runs alike, and 3.5 hours (`marathonMin`) instead of 3 in a marathon plan. A ceiling, not a target: the marathon's
   * long-run track aims at 30 km (docs/decisions/fartlek-marathon-long-run-plan.md).
   */
  longCeiling: { km: 32, min: 180, marathonMin: 210 },
  /**
   * Time at threshold (the reps, not warm-up and jogs) a week: at most this share of the week's run km, but
   * never less than the ladder's first rung (3 × 8). So the threshold session stays on 3 × 8 while the
   * volume is built and climbs once the week holds more (from about 45 km at 4:15/km). Daniels has 10 %
   * for one session; 15 % leaves room for a session worth doing at a club runner's volume.
   */
  qualityMax: 0.15,
  /** With fewer run days than this and a week of at least `moreDaysKm`, the dialog suggests another run day. */
  moreDays: 4,
  moreDaysKm: 30,
  /** Easy runs shorter than this are folded into the others. */
  easyMinKm: 3,
  /** Run days a week's volume calls for: from this many km a week, this many days. */
  /** A week that falls this many km short of its target on the days it has needs another day. */
  /** A week for someone with no run history. */
  startKm: 15,
  /**
   * At low volume a build week may always grow this many km, even when that is more than +10 %
   * (docs/decisions/fartlek-low-volume-growth.md): 10 % of 20 km is 2 km, which holds a runner at low volume for months.
   * Injury risk follows single sessions far over the longest run of 30 days more than weekly km (the spike rule stays);
   * the km-ramp limit (`COACH.rampCap`) still holds.
   */
  lowStepKm: 2.5,
  /** A block's ramp climbs `lowStepKm` a build week only while the load it starts from is under this; above it the ramp's shares rule. */
  lowVolumeKm: 40,
  /** A lighter week keeps this share of the week before, and of the longest run. */
  /** Lighter variants when even the base week is too hard: shares of the base km. */
  lighter: [0.9, 0.8] as const,
  /**
   * The threshold ladder: reps × minutes with minutes of jog between, one rung a week. At most 20 min a rep
   * and 40 min at threshold a session; at 2 × 20 it starts over with one rep more. The last rung repeats.
   */
  ladder: [
    { reps: 3, min: 8, rest: 2 }, { reps: 3, min: 10, rest: 2 }, { reps: 3, min: 12, rest: 2 }, { reps: 2, min: 20, rest: 3 },
    { reps: 4, min: 8, rest: 2 }, { reps: 4, min: 10, rest: 2 },
  ] as const satisfies readonly Thr[],
  /** The threshold session of a lighter week. */
  lighterThr: { reps: 3, min: 6, rest: 2 } as const satisfies Thr,
  /** A second threshold session, only with this many run days (so most runs stay easy). */
  second: { reps: 4, min: 6, rest: 1.5 } as const satisfies Thr,
  secondMinDays: 5,
  /**
   * The faster finish of a long run: a quarter of it, 3–5 km, from long runs of 8 km. At threshold pace
   * + 20 s/km (about marathon effort), or goal pace + 10 s/km within 16 weeks of an A race with a goal time.
   */
  tempo: { share: 0.25, minKm: 3, maxKm: 5, fromKm: 8, thrPlus: 20, racePlus: 10, raceWeeks: 16 },
  /** Re-entry, up to a load already handled (the tolerance): at most this on the growth base a week. */
  reentryGrowth: 1.3,
  /** Weeks under this km keep their threshold session shorter than the ladder's first rung (a new runner's small weeks). */
  floorFromKm: 20,
  /** Other sports: at most this many minutes a week from the engine. */
  crossMaxMin: 120,
  /** Easy runs a week that end with strides (6 × 20 s): speed and economy for almost no load. */
  stridesPerWeek: 2,
} as const;

/** The ladder's rung `i` (the last one repeats). */
export const rung = (i: number): Thr => ({ ...NEXT.ladder[Math.max(0, Math.min(i, NEXT.ladder.length - 1))] });

/** The threshold reps of a session: the first repeat at threshold, as reps and minutes (km reps at `pace` s/km). */
export function thresholdReps(s: WorkoutSteps | null, pace: number | null = null): { reps: number; min: number } | null {
  const r = s?.items.find((x) => x.kind === "repeat" && x.work.target?.kind === "threshold");
  if (!r || r.kind !== "repeat") return null;
  const min = r.work.min ?? (r.work.km != null && pace ? (r.work.km * pace) / 60 : null);
  return min != null ? { reps: r.times, min } : null;
}

/**
 * The rung after a session that was run: the next one when it is on the ladder, else the first rung with
 * more minutes at threshold than it had. Nothing to go on: the first rung.
 */
export function nextRung(s: WorkoutSteps | null, pace: number | null = null): number {
  const r = thresholdReps(s, pace);
  if (!r) return 0;
  const at = NEXT.ladder.findIndex((x) => x.reps === r.reps && x.min === r.min);
  if (at >= 0) return Math.min(at + 1, NEXT.ladder.length - 1);
  const more = NEXT.ladder.findIndex((x) => x.reps * x.min > r.reps * r.min);
  return more >= 0 ? more : NEXT.ladder.length - 1;
}

/** Outcomes of a threshold session that count as run, or still to run: a missed or struck one doesn't. */
const RAN = new Set<SessionView["outcome"]>(["done", "short", "to_do", "upcoming"]);

/**
 * The threshold rung for a session on `date`: the one after the last threshold session before it that was
 * run (matched to an activity) or is still to run. A missed one leaves the rung where it was, like a missed
 * long run leaves the long run's step. Race-phase sessions (tagged, planned as threshold) are not the ladder.
 */
export function rungBefore(date: ISODate, sessions: SessionView[], pace: number | null): number {
  const last = sessions
    .filter((s) => s.workout.type === "threshold" && !s.workout.blueprint && s.workout.steps && s.workout.date < date && RAN.has(s.outcome))
    .sort((a, b) => b.workout.date.localeCompare(a.workout.date))[0];
  return last ? nextRung(last.workout.steps, pace) : 0;
}

/**
 * The long run a week of `weekKm` can carry: the ladder's km, but not past the week's share (`longShareAt`)
 * unless the runner has already run that far (the ladder holds at the longest run instead of stepping further).
 * A lighter week has no such floor, so its long run shrinks with the week. `minShare`: the share the week may give the long run
 * at least (a marathon plan's build and race-phase weeks, RACE_PLAN.marathonLongShare).
 */
export const longFor = (ladderKm: number, weekKm: number, longestKm: number, lighter: boolean, minShare = 0) =>
  Math.min(ladderKm, Math.max(half(weekKm * Math.max(longShareAt(weekKm), minShare)), lighter ? 0 : longestKm));

export type LongWhy = "step" | "spike" | "ceiling" | "lighter";
export interface LongPlan { km: number; why: LongWhy; longestKm: number }

/** Most km a session may have after a longest run of `longestKm` in the last 30 days (rounded like the engine). */
export const spikeMax = (longestKm: number, limit: number = NEXT.spike) => half(longestKm * (1 + limit));

/**
 * The long run on its ladder: the longest run of the last 30 days + 1 km, no more than 10 % over it, under the
 * ceiling (`marathon`: the longer time limit of a marathon plan); 70 % of it in a lighter week. A missed long run leaves the longest as it was, so the step repeats.
 * Null without a run in the window (the long run is then a share of the week).
 */
export function longRun(longestKm: number, lighter: boolean, easyPace: number | null, anyKm = longestKm, marathon = false): LongPlan | null {
  if (longestKm <= 0) return null;
  let km: number, why: LongWhy;
  if (lighter) { km = half(longestKm * tune().lighter.long); why = "lighter"; }
  else {
    // `anyKm`: the longest run of any kind, when it is known apart from the longest long run (a planned block).
    const step = longestKm + Math.max(tune().long.stepMinKm, longestKm * tune().long.stepShare), spike = Math.max(longestKm, anyKm) * (1 + NEXT.spike);
    km = half(Math.min(step, spike)); why = step <= spike ? "step" : "spike";
  }
  const ceiling = Math.min(NEXT.longCeiling.km, easyPace ? ((marathon ? NEXT.longCeiling.marathonMin : NEXT.longCeiling.min) * 60) / easyPace : Infinity);
  if (km > ceiling) { km = floorHalf(ceiling); why = "ceiling"; }
  return { km: Math.max(NEXT.easyMinKm, km), why, longestKm };
}

export type SuggestType = "easy" | "long" | "threshold" | "cross" | "strength";
/** Sessions planned in minutes, not km: other sports and gym. They count for no run km. */
export const isTimed = (type: SuggestType) => type === "cross" || type === "strength";
/** Minutes a planned gym session gets, for its load (docs/decisions/fartlek-gym-cross-days.md). */
export const GYM_MIN = 60;

/**
 * The days the runner gyms and does other sport (docs/decisions/fartlek-gym-cross-days.md), weekdays 0 = Sunday. No run
 * goes on them, and a quality session is not put on the day after gym when another day will do.
 */
export interface ExtraDays { gym: number[]; cross: { day: number; min: number }[];
  /** Whether a short easy run may go after gym ("gym") or after gym and cross-training ("all") when the run days don't hold the week. */
  doubles?: DoublesMode }
export type DoublesMode = "off" | "gym" | "all";

/** The days a double may go on this week: gym days, then cross-training days when allowed; never the day before the long run. */
function doubleDays(seed: Pick<WeekSeed, "extra" | "longRunDay">, days: ISODate[], longDay: ISODate): ISODate[] {
  const x = seed.extra;
  if (!x?.doubles || x.doubles === "off") return [];
  const wds = [...x.gym, ...(x.doubles === "all" ? x.cross.map((c) => c.day) : [])];
  const before = addDays(longDay, -1);
  return wds.map((wd) => days.find((d) => weekday(d) === wd)).filter((d): d is ISODate => !!d && d !== before && d !== longDay);
}
/** The weekdays an `ExtraDays` takes from running. */
export const extraDaysOf = (x: ExtraDays | null | undefined) => (x ? [...new Set([...x.gym, ...x.cross.map((c) => c.day)])] : []);
export interface SuggestItem {
  date: ISODate; type: SuggestType; km: number; durationMin: number | null; steps: WorkoutSteps | null;
  /** Race-phase blueprint tag (shared/blueprints.ts), kept through writing, undo and copying. */
  blueprint?: string | null;
  /** A second session on a day that already has one (an easy run after gym): `markDoubles` sets it. */
  double?: boolean;
}

/** The short easy run of a double, after gym or cross-training. */
export const DOUBLE = { km: 5 } as const;

/**
 * Which session is a day's second: a gym or cross-training session stays the day's own, a run beside it is the double;
 * two runs on a day make the later one the double. The editors key a day's sessions on this.
 */
export function markDoubles(items: SuggestItem[]): SuggestItem[] {
  const out: SuggestItem[] = [];
  const dates = [...new Set(items.map((it) => it.date))].sort();
  for (const d of dates) {
    const on = items.filter((it) => it.date === d);
    const main = on.find((it) => isTimed(it.type)) ?? on.find((it) => !it.double) ?? on[0];
    for (const it of [main, ...on.filter((x) => x !== main)]) {
      const plain = { ...it };
      delete plain.double;
      out.push(it === main ? plain : { ...plain, double: true });
    }
  }
  return out;
}

export interface PastWeek { weekStart: ISODate; km: number; ctl: number; atl: number }
export interface WeekSeed {
  weekStart: ISODate;
  /** Fitness and fatigue at the end of the day before the week (planned load up to then included). */
  ctl: number;
  atl: number;
  /** Run km of the 3 weeks before, oldest first: the coach's ramp window. */
  kmBefore: number[];
  /** Up to 6 weeks before, oldest first, for the charts. */
  past: PastWeek[];
  runDays: number[];
  longRunDay: number;
  threshold: Threshold | null;
  refs: StepRefs;
  /** Minutes a week of other sports already counted (the runner's habit). */
  crossMin: number;
  /** Gym and other-sport days, placed as sessions (then `crossMin` is 0, so their load is not counted twice). */
  extra?: ExtraDays | null;
  /** A km target the runner set for the week, used instead of the ramp. */
  targetKm: number | null;
  /** A lighter week: asked for (a target noted "backoff") or form is heavy. A rhythm of build weeks is the block's job, not a reason here. */
  backoff: boolean;
  /** Why the week is lighter (`backoffWhy`); null when it isn't. */
  backoffWhy?: BackoffWhy | null;
  /** A hard session (threshold, intervals, long run or race) on the day before the week, for the adjacency check. */
  hardBefore?: boolean;
  /** The longest single run of the 30 days before the week, run or planned ahead (0 = none). */
  longestKm: number;
  /** The threshold ladder's rung for the week (after the last threshold session that wasn't skipped). */
  rung: number;
  /** Pace (s/km) of a long run's faster finish: goal pace + 10 s near an A race, else threshold + 20 s; null without. */
  tempoPace: number | null;
  /** The load already handled (the block's tolerance: the best recent week, faded with time); 0 = none. */
  toleranceKm?: number;
  /** The race-specific phase, when an A marathon or half is within 8 weeks (docs/decisions/fartlek-race-specific-phase.md). */
  phase?: PhaseSeed;
  /** A race of 10 km+ whose recovery reaches this week (docs/decisions/fartlek-post-race-recovery.md). */
  recovery?: RecoveryRace | null;
}

export type WeekState = "under" | "ok" | "over";
export interface WeekEval {
  km: number;
  /** Change on the growth base (0.1 = +10 %), null without one. */
  growth: number | null;
  /** What growth is measured on: the week before, or the 3-week mean when that is higher (see weekCap). */
  growthBase: "week" | "mean";
  /** This week / mean of it and the 3 before. */
  acwr: number | null;
  /** Lowest form in the week, the day after it included (so a Sunday long run counts), and as a share of fitness. */
  low: number;
  lowPct: number;
  /** Form the day after the week, when its last session is in; the week is judged on it as a share of fitness. */
  form: number;
  formPct: number;
  ctl: number;
  atl: number;
  /** Form at the end of the week. */
  tsb: number;
  longKm: number;
  longShare: number;
  /** The longest run of the 30 days before the week, and the most km a session may have (10 % over it; null without one). */
  longestKm: number;
  spikeMax: number | null;
  /** The longest session of the week when it is over `spikeMax`. */
  spike: { km: number; date: ISODate } | null;
  /** Km in threshold reps / run km, and whether that is over the cap (`qualityMax`, the first rung always allowed). */
  qualityShare: number;
  qualityOver: boolean;
  hard: number;
  /** Two hard days (threshold or long) next to each other. */
  adjacent: boolean;
  state: WeekState;
}

/**
 * Why a week (or a block's first week) is lighter: the runner asked for it, the rhythm (three build weeks at a new
 * high: tendons and bones need a lighter week to adapt, however fresh the runner feels), or form (heavy: fatigue
 * well above fitness, `FORM.heavy`). Only "form" means the runner is tired.
 */
export type BackoffWhy = "asked" | "form";

/** Form is heavy (under `FORM.heavy` as a share of fitness): the week starts lighter whatever the km say. */
export const formHeavy = (ctl: number, atl: number) => ctl > 0 && formPct(ctl - atl, ctl) < FORM.heavy;

export type TryId = "volume" | "shorter" | "tempo" | "second" | "cross" | "lighter" | "easier" | "backoff" | "target" | "start";
export interface Try { id: TryId; km: number; form: number | null; state: WeekState | "skip"; params: Record<string, number | string> }
/** Why the week looks as it does, one line in the dialog. */
export interface Why { long: LongPlan | null; thr: Thr | null; rung: number | null; z2Km: number; tempo: boolean; moreDays?: boolean;
  /** The week climbs back to a load already handled (km), so it may grow more than +10 %. */
  reentryKm?: number | null }
export interface Suggestion { items: SuggestItem[]; targetKm: number; eval: WeekEval; tries: Try[]; chosen: TryId; before: { km: number; tsb: number }; why: Why }

/** The threshold template the quick-add uses: 10 min easy, reps × min at threshold with jog between, 10 min easy. */
export function thresholdSteps(reps: number, min: number, rest = 2, cool = THRESHOLD_WARM_COOL_MIN, warm = THRESHOLD_WARM_COOL_MIN): WorkoutSteps {
  return { v: 1, items: [
    { kind: "step", step: { min: warm, target: { kind: "easy" } } },
    { kind: "repeat", times: reps, work: { min, target: { kind: "threshold" } }, rest: { min: rest, target: { kind: "jog" } } },
    { kind: "step", step: { min: cool, target: { kind: "easy" } } },
  ] };
}

/** A long run with its last km at `pace` (s/km): a quarter of it, 3–5 km. Null when the run is too short for one. */
export function tempoLong(km: number, pace: number): WorkoutSteps | null {
  const T = NEXT.tempo;
  if (km < T.fromKm) return null;
  const fast = Math.min(T.maxKm, Math.max(T.minKm, half(km * T.share)));
  return { v: 1, items: [
    { kind: "step", step: { km: r1(km - fast), target: { kind: "easy" } } },
    { kind: "step", step: { km: fast, target: { kind: "pace", secPerKm: Math.round(pace) } } },
  ] };
}

export const stepsKm = (s: WorkoutSteps, refs: StepRefs) => r1(stepTotals(s, refs).km);

/** Run days a week of `km` calls for (3 up to 7). */
export const daysFor = (km: number) => {
  const f = tune().daysFromKm;
  return ([[4, f.d4], [5, f.d5], [6, f.d6], [7, f.d7]] as const).reduce((d, [days, from]) => (km >= from ? days : d), 3 as number);
};

/** One planned week as `daysAdvice` reads it: the km it was asked to have, and the sessions it got. */
export interface AdviceWeek { weekStart: ISODate; targetKm: number; lighter?: boolean; items: SuggestItem[] }
/**
 * "Add a run day": the plan needs more days than the runner has. `why` lists the signals: the biggest week
 * calls for more days (`peak`), and/or a week can't be spread over the days it has (`fit`, the easy runs
 * would have to be longer than the long run or break the 30-day rule). `free` lists the days that aren't run
 * days, the one furthest from the hard sessions first.
 */
export interface DaysAdvice { have: number; need: number; why: ("peak" | "fit")[]; peakKm: number; shortKm: number; free: number[];
  /** Allowing a short easy run after gym would settle it too (offered beside the days, or alone when no day is free). */
  doubles?: boolean }

const runKmOf = (weeks: AdviceWeek[]) => weeks.reduce((a, w) => a + w.items.filter((it) => !isTimed(it.type)).reduce((s, it) => s + it.km, 0), 0);
/** Run sessions in the biggest build week: what an extra day should raise for the `peak` signal to be worth a question. */
const peakSessions = (weeks: AdviceWeek[]) => {
  const builds = weeks.filter((w) => !w.lighter);
  const peak = (builds.length ? builds : weeks).reduce((m, w) => (w.targetKm > m.targetKm ? w : m), weeks[0]);
  return peak.items.filter((it) => !isTimed(it.type)).length;
};

/** Most km a week falls short of its target on the days it has. */
const shortOf = (weeks: AdviceWeek[]) => r1(Math.max(0, ...weeks.map((w) => w.targetKm - w.items.filter((it) => !isTimed(it.type)).reduce((s, it) => s + it.km, 0))));

/**
 * `trial` plans the same weeks again with a given set of run days. With it, the days the runner has are judged on
 * `trial(runDays)`, whole weeks from the same engine as the days tried, so a plan clipped to the days still ahead
 * (a running week, whose `targetKm` counts the days that are over) never reads as a week falling short. A signal
 * only becomes a question if some free day would settle it in that plan: for `fit`, the week no longer falls
 * short; for `peak`, the peak week gets another session or the plan more run km. `free` lists only those days,
 * so accepting the advice never leads to the same question again, and a day the engine would leave empty is never offered.
 */
export function daysAdvice(runDays: number[], longRunDay: number, weeks: AdviceWeek[], trial?: (runDays: number[]) => AdviceWeek[],
  o: { /** Gym and cross-training days: never offered. */ blocked?: number[]; /** The same weeks with doubles after gym allowed. */ doublesTrial?: () => AdviceWeek[] } = {}): DaysAdvice | null {
  const blocked = o.blocked ?? [];
  const have = new Set(runDays.length ? runDays : [longRunDay]).size;
  if (have >= 7 || !weeks.length) return null;
  if (trial) weeks = trial(runDays);
  if (!weeks.length) return null;
  const builds = weeks.filter((w) => !w.lighter);
  const peakKm = Math.max(0, ...(builds.length ? builds : weeks).map((w) => w.targetKm));
  const shortKm = shortOf(weeks);
  let why: DaysAdvice["why"] = [];
  const needPeak = daysFor(peakKm);
  if (needPeak > have) why.push("peak");
  if (shortKm > tune().shortKm) why.push("fit");
  if (!why.length) return null;
  const first = weeks[0];
  const hard = first.items.filter((it) => it.type === "threshold" || it.type === "long").map((it) => it.date);
  const gap = (wd: number) => {
    const d = Array.from({ length: 7 }, (_, i) => addDays(first.weekStart, i)).find((x) => weekday(x) === wd)!;
    return hard.length ? Math.min(...hard.map((h) => { const g = Math.abs(daysBetween(h, d)); return Math.min(g, 7 - g); })) : 7;
  };
  const taken = new Set(runDays.length ? runDays : [longRunDay]);
  const order = Array.from({ length: 7 }, (_, i) => weekday(addDays(first.weekStart, i)));
  // Gym and other-sport days are never offered as run days: the runner said those days are taken.
  let free = order.filter((wd) => !taken.has(wd) && !blocked.includes(wd)).sort((a, b) => gap(b) - gap(a) || order.indexOf(a) - order.indexOf(b));
  let doubles = false;
  if (trial) {
    const judge = (w: AdviceWeek[]) => ({ fits: shortOf(w) <= tune().shortKm, grows: r1(runKmOf(w) - runKmOf(weeks)) >= tune().shortKm || peakSessions(w) > peakSessions(weeks) });
    const tried = free.map((wd) => ({ wd, ...judge(trial([...taken, wd])) }));
    const dbl = o.doublesTrial ? judge(o.doublesTrial()) : null;
    // A shortfall no single day (nor a double) settles is not about days: it is not asked about.
    if (why.includes("fit") && !tried.some((x) => x.fits) && !dbl?.fits) why = why.filter((x) => x !== "fit");
    if (!why.length) return null;
    const settles = (x: { fits: boolean; grows: boolean }) => (why.includes("fit") ? x.fits : x.grows);
    free = tried.filter(settles).map((x) => x.wd);
    doubles = !!dbl && settles(dbl);
    if (!free.length && !doubles) return null;
  }
  return { have, need: Math.max(needPeak, why.includes("fit") ? have + 1 : 0), why, peakKm: r1(peakKm), shortKm, free, ...(doubles ? { doubles } : {}) };
}

/** The week's days in order, and which of them are run days and the long-run day. */
export function daysOf(seed: Pick<WeekSeed, "weekStart" | "runDays" | "longRunDay">) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(seed.weekStart, i));
  const runDays = seed.runDays.length ? seed.runDays : [seed.longRunDay];
  const slots = days.filter((d) => runDays.includes(weekday(d)));
  const longDay = slots.find((d) => weekday(d) === seed.longRunDay) ?? slots.at(-1)!;
  return { days, slots, longDay };
}

const isHard = (it: SuggestItem | undefined) => !!it && (it.type === "threshold" || it.type === "long");

/** Km run at threshold in a session's reps: minutes at the threshold pace, or the reps' own km. */
function workKm(it: SuggestItem, refs: StepRefs): number {
  if (!it.steps) return it.km * 0.5;
  let km = 0;
  for (const x of it.steps.items) {
    if (x.kind !== "repeat" || x.work.target?.kind !== "threshold") continue;
    const one = x.work.km ?? (x.work.min != null && refs.thresholdPace ? (x.work.min * 60) / refs.thresholdPace : 0);
    km += x.times * one;
  }
  return km;
}

export function evaluate(seed: WeekSeed, items: SuggestItem[]): WeekEval {
  const { days } = daysOf(seed);
  let ctl = seed.ctl, atl = seed.atl, low = ctl - atl, lowPct = formPct(ctl - atl, ctl);
  const cross = crossLoadPerDay(seed.crossMin);
  for (const d of days) {
    const load = items.filter((it) => it.date === d).reduce((s, it) => s + itemLoad({ type: it.type, km: it.km, durationMin: it.durationMin, steps: it.steps }, seed.threshold), 0) + cross;
    low = Math.min(low, ctl - atl);
    lowPct = Math.min(lowPct, formPct(ctl - atl, ctl));
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
  }
  low = Math.min(low, ctl - atl);
  lowPct = Math.min(lowPct, formPct(ctl - atl, ctl));
  const runs = items.filter((it) => !isTimed(it.type));
  const km = r1(runs.reduce((s, it) => s + it.km, 0));
  const { base, on } = growthBase(seed.kmBefore);
  const win = [...seed.kmBefore.slice(-3), km];
  const chronic = win.reduce((a, b) => a + b, 0) / win.length;
  const longKm = r1(runs.filter((it) => it.type === "long").reduce((s, it) => s + it.km, 0));
  const byDay = days.map((d) => items.find((it) => it.date === d && isHard(it)));
  const thrKm = runs.filter((it) => it.type === "threshold").reduce((s, it) => s + workKm(it, seed.refs), 0);
  const acwr = chronic > 0 && seed.kmBefore.some((k) => k > 0) ? r2(km / chronic) : null;
  const max = seed.longestKm > 0 ? spikeMax(seed.longestKm) : null;
  const top = runs.reduce<SuggestItem | null>((m, it) => (!m || it.km > m.km ? it : m), null);
  const form = ctl - atl, pct = formPct(form, ctl);
  // Judged like a block's deepest week: on the lowest form in the week, as a share of fitness. Form is a guard,
  // not a target (docs/decisions/fartlek-form-relative.md): "under" is a calm week, fine. The km ramp doesn't
  // count while the week stays within the load already handled (re-entry).
  const ramp = (acwr ?? 0) > COACH.rampRisk && km > (seed.toleranceKm ?? 0) + 0.05;
  const state: WeekState = lowPct < COACH.floor || ramp ? "over" : lowPct > COACH.goal ? "under" : "ok";
  return {
    km, growth: base > 0 ? r2(km / base - 1) : null, growthBase: on, acwr, low: r1(low), lowPct: r1(lowPct), form: r1(form), formPct: r1(pct), ctl: r1(ctl), atl: r1(atl), tsb: r1(form),
    longKm, longShare: km ? r2(longKm / km) : 0, longestKm: seed.longestKm, spikeMax: max,
    spike: max != null && top && top.km > max + 0.05 ? { km: top.km, date: top.date } : null,
    qualityShare: km ? r2(thrKm / km) : 0,
    qualityOver: thrKm > qualityCapKm(km, seed.refs) + 0.05,
    hard: runs.filter((it) => it.type === "threshold").length,
    adjacent: byDay.some((h, i) => (i > 0 ? !!h && !!byDay[i - 1] : !!h && !!seed.hardBefore)), state,
  };
}

/**
 * Most km the week can have: +10 % on the week before, or on the mean of the 3 weeks before when that is
 * higher (so one short week doesn't shrink the next), and always inside the ramp cap.
 */
export function weekCap(kmBefore: number[]): number {
  const s3 = kmBefore.slice(-3).reduce((a, b) => a + b, 0);
  const ramp = (COACH.rampCap * s3) / (4 - COACH.rampCap);
  const base = growthBase(kmBefore).base;
  return Math.min(Math.max(base * COACH.weekGrowth, base + NEXT.lowStepKm), ramp);
}

export function growthBase(kmBefore: number[]): { base: number; on: "week" | "mean" } {
  const last3 = kmBefore.slice(-3);
  const prev = last3.at(-1) ?? 0;
  const mean = last3.length ? last3.reduce((a, b) => a + b, 0) / last3.length : 0;
  return mean > prev ? { base: mean, on: "mean" } : { base: prev, on: "week" };
}

/**
 * Most km a week can have, for the week and the block alike. Up to the tolerated peak (`toleranceKm`) it is re-entry to a load already handled: up to
 * +30 % on the growth base and a ramp up to `rampRisk`. Above it the careful cap (+10 %, ramp 1.3) holds.
 */
export function weekCapWith(kmBefore: number[], tolKm: number): { cap: number; reentry: boolean } {
  const last3 = kmBefore.slice(-3);
  const prev = last3.at(-1) ?? 0;
  // A week may always hold the level of the one before, even when a break keeps the ramp low.
  const normal = Math.max(weekCap(kmBefore), prev);
  if (tolKm > normal) {
    const s3 = last3.reduce((a, b) => a + b, 0);
    // After a break (an empty week in the window) the ramp says nothing about a load already handled.
    const breakIn = last3.some((k) => k <= 0);
    const ramp = breakIn ? Infinity : (COACH.rampRisk * s3) / (4 - COACH.rampRisk);
    const re = Math.min(tolKm, growthBase(kmBefore).base * NEXT.reentryGrowth, Math.max(prev, ramp));
    if (re > normal) return { cap: re, reentry: true };
  }
  return { cap: normal, reentry: false };
}

/** Most km at threshold a week may have: `qualityMax` of its run km, never less than the first rung. */
export function qualityCapKm(km: number, refs: StepRefs): number {
  const first = NEXT.ladder[0];
  const floor = refs.thresholdPace ? (first.reps * first.min * 60) / refs.thresholdPace : 0;
  return Math.max(NEXT.qualityMax * km, floor);
}

/**
 * Fit the threshold sessions to the week's volume (`qualityCapKm`): a second session goes first, then the
 * main one steps down the ladder, never below its first rung. A session off the ladder (the lighter week's
 * 3 × 6) is left as it is. So the ladder only climbs as fast as the volume lets it.
 */
export function withinQuality(thr: Thr[], km: number, refs: StepRefs): Thr[] {
  const pace = refs.thresholdPace;
  if (!pace || !thr.length) return thr;
  const cap = qualityCapKm(km, refs) + 0.05;
  const work = (xs: Thr[]) => xs.reduce((s, x) => s + (x.reps * x.min * 60) / pace, 0);
  let out = thr.map((x) => ({ ...x }));
  if (out.length > 1 && work(out) > cap) out = out.slice(0, 1);
  let at = NEXT.ladder.findIndex((x) => x.reps === out[0].reps && x.min === out[0].min);
  while (at > 0 && work(out) > cap) out = [rung(--at), ...out.slice(1)];
  // A small week (a new runner's): under the first rung too, shorter reps (never under 5 min), then fewer (never under 2).
  if (km < NEXT.floorFromKm && at <= 0) {
    const small = (NEXT.qualityMax * km * pace) / 60 + 0.5;
    const m = out[0];
    while (m.reps * m.min > small && m.min > 5) m.min -= 1;
    while (m.reps * m.min > small && m.reps > 2) m.reps -= 1;
  }
  return out;
}

export interface Shape {
  km: number;
  /** The long run's km from its ladder; null = a share of the week. */
  longKm: number | null;
  /** Pace of the long run's faster finish; null = all easy. */
  tempo: number | null;
  thr: Thr[];
  crossMin: number;
  /** Most km any session may have (the 30-day rule); null = no limit. */
  maxKm?: number | null;
  /** Easy runs with strides this week; default NEXT.stridesPerWeek (0 in the first days after a race, docs/decisions/fartlek-post-race-recovery.md). */
  strides?: number;
  /**
   * The race-specific phase's sessions (blueprints compiled to steps): the long run replaces the plain or faster-finish one,
   * and the quality sessions come before the threshold ones, typed `threshold` and tagged. A `date` is the day they are placed on.
   */
  phase?: { long: PhaseItem | null; quality: (PhaseItem & { date?: ISODate })[] };
}
export interface PhaseItem { steps: WorkoutSteps; blueprint: string }

/** How many days apart a quality session on the day after gym counts as losing: a soft rule, never a lock. */
const AFTER_GYM_COST = 1.5;

/** Warm-up and cool-down (min) a threshold session tries, shortest last, to stay under the 30-day rule. */
const WARM_COOL: [number, number][] = [[THRESHOLD_WARM_COOL_MIN, THRESHOLD_WARM_COOL_MIN], [10, 8], [8, 8], [8, 5], [5, 5]];

/** A threshold session's steps, its warm-up and cool-down shortened when it would be over `maxKm`. */
function thresholdFor(s: Thr, refs: StepRefs, maxKm: number | null | undefined): WorkoutSteps {
  let steps = thresholdSteps(s.reps, s.min, s.rest);
  for (const [warm, cool] of WARM_COOL) {
    steps = thresholdSteps(s.reps, s.min, s.rest, cool, warm);
    if (maxKm == null || stepsKm(steps, refs) <= maxKm + 0.05) break;
  }
  return steps;
}

/**
 * One concrete week for a shape, key sessions first: the long run on the long-run day at its ladder's km,
 * the threshold sessions on the run days furthest from the hard days, then easy zone 2 runs share what is
 * left of the week's km (a run too short is dropped; none is longer than the long run).
 */
export function build(seed: Pick<WeekSeed, "weekStart" | "runDays" | "longRunDay" | "refs" | "extra">, shape: Shape): SuggestItem[] {
  const items = buildRuns(seed, shape);
  const { days } = daysOf(seed);
  if (seed.extra) {
    // The days the runner gave: gym and other sport go there, beside a run only on the long-run day (it is never moved).
    for (const d of days) {
      const wd = weekday(d);
      if (seed.extra.gym.includes(wd)) items.push({ date: d, type: "strength", km: 0, durationMin: GYM_MIN, steps: null });
      const c = seed.extra.cross.find((x) => x.day === wd);
      if (c && c.min > 0) items.push({ date: d, type: "cross", km: 0, durationMin: c.min, steps: null });
    }
  } else if (shape.crossMin > 0) {
    const free = days.find((d) => !items.some((it) => it.date === d));
    if (free) items.push({ date: free, type: "cross", km: 0, durationMin: shape.crossMin, steps: null });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

function buildRuns(seed: Pick<WeekSeed, "weekStart" | "runDays" | "longRunDay" | "refs" | "extra">, shape: Shape): SuggestItem[] {
  const { days, slots, longDay } = daysOf(seed);
  const items: SuggestItem[] = [];
  const total = half(shape.km);
  const longKm = shape.longKm ?? Math.max(NEXT.easyMinKm, half(total * NEXT.longShare));
  const phaseLong = shape.phase?.long ?? null;
  const longSteps = phaseLong ? phaseLong.steps : shape.tempo ? tempoLong(longKm, shape.tempo) : null;
  items.push({ date: longDay, type: "long", km: longSteps ? stepsKm(longSteps, seed.refs) : longKm, durationMin: null, steps: longSteps, ...(phaseLong ? { blueprint: phaseLong.blueprint } : {}) });
  if (slots.length === 1) return items;

  // The phase's quality sessions come first, then the threshold ones, on the run days furthest from the hard days.
  const quals: (PhaseItem & { date?: ISODate })[] = [
    ...(shape.phase?.quality ?? []),
    ...shape.thr.map((s) => ({ steps: thresholdFor(s, seed.refs, shape.maxKm), blueprint: "" })),
  ].slice(0, Math.max(0, slots.length - 1));
  const thr = quals;
  const others = slots.filter((d) => d !== longDay);
  // Days apart around the week: the long run comes back on the same day every week, so a Monday is next to
  // the Sunday long run before it, not six days from it.
  const idx = (d: ISODate) => days.indexOf(d);
  const apart = (a: ISODate, b: ISODate) => { const g = Math.abs(idx(a) - idx(b)); return Math.min(g, 7 - g); };
  const hardDays: ISODate[] = [longDay];
  const thrDays: ISODate[] = [];
  // The day after gym takes a quality session only when every other day is worse by more than this many days apart.
  const gym = seed.extra?.gym ?? [];
  const afterGym = (d: ISODate) => gym.includes(weekday(addDays(d, -1)));
  for (let k = 0; k < thr.length; k++) {
    // The free run day furthest from every hard day so far; earlier wins a tie.
    let best: ISODate | null = null, gap = -1;
    const wanted = thr[k].date;
    if (wanted && others.includes(wanted) && !thrDays.includes(wanted)) best = wanted;
    else for (const d of others) {
      if (thrDays.includes(d)) continue;
      const g = Math.min(...hardDays.map((h) => apart(h, d))) - (afterGym(d) ? AFTER_GYM_COST : 0);
      if (g > gap) { gap = g; best = d; }
    }
    thrDays.push(best!);
    hardDays.push(best!);
  }
  let used = items[0].km;
  thr.forEach((q, k) => {
    const km = stepsKm(q.steps, seed.refs);
    used += km;
    items.push({ date: thrDays[k], type: "threshold", km, durationMin: null, steps: q.steps, ...(q.blueprint ? { blueprint: q.blueprint } : {}) });
  });

  // Zone 2 fills the rest: halves, the last run takes what is left so the week adds up. As few easy runs as
  // keep each under `TUNE.easy.ofLong` of the long run (never shorter than the minimum), on the first run days;
  // the last ones stay free.
  let easyDays = others.filter((d) => !thrDays.includes(d));
  let rest = total - used;
  const easyMax = Math.max(NEXT.easyMinKm, tune().easy.ofLong * items[0].km);
  // As many easy runs as keep each under its share of the long run, and at least as many as the week's volume
  // calls for (`daysFor`: 5 run days from 50 km): otherwise a growing long run lets the easy runs grow with it,
  // a free day never changes the plan, and the week is never offered the day it needs.
  const want = Math.max(1, Math.ceil(rest / easyMax - 1e-9), daysFor(total) - 1 - thr.length);
  while (easyDays.length && (easyDays.length > want || rest / easyDays.length < NEXT.easyMinKm)) easyDays = easyDays.slice(0, -1);
  // An easy run stays shorter than a long run on its ladder (a long run from a share of the week leaves them be).
  const most = shape.longKm == null ? Infinity : Math.max(NEXT.easyMinKm, longKm - 1);
  // Doubles (docs/decisions/fartlek-gym-cross-days.md): when the week wants more runs than its run days hold, or its easy runs
  // can't carry the rest, a short easy run goes after gym (or cross-training, when allowed), never the day before the long run.
  const dbl = doubleDays(seed, days, longDay);
  if (dbl.length && rest > 0) {
    const missing = want - easyDays.length;
    const short = rest - easyDays.length * most;
    let k = Math.min(dbl.length, Math.max(missing, short > tune().shortKm ? Math.ceil(short / DOUBLE.km) : 0));
    const km = k > 0 ? Math.min(DOUBLE.km, half(rest / (easyDays.length + k))) : 0;
    if (km < NEXT.easyMinKm) k = 0;
    for (const d of dbl.slice(0, k)) items.push({ date: d, type: "easy", km, durationMin: null, steps: null, double: true });
    rest -= k * km;
  }
  if (easyDays.length) {
    const each = Math.min(most, half(rest / easyDays.length));
    easyDays.forEach((d, k) => {
      const km = k === easyDays.length - 1 ? Math.min(most, r1(rest - each * (easyDays.length - 1))) : each;
      items.push({ date: d, type: "easy", km, durationMin: null, steps: null });
    });
  }
  // Without a ladder to step from (no run in 30 days), the long run takes what no easy run could.
  if (shape.longKm == null && !easyDays.length && rest > 0) items[0].km = half(items[0].km + rest);
  addStrides(items, seed.refs, shape.strides ?? NEXT.stridesPerWeek);
  return items;
}

/**
 * Strides on the first easy runs of the week (never the long run). The run before them shrinks by
 * what the strides and jogs add, so the week's km stay the same; a run too short for that keeps none.
 */
export function addStrides(items: SuggestItem[], refs: StepRefs, perWeek: number = NEXT.stridesPerWeek): void {
  const extra = stepsKm({ v: 1, items: [stridesRepeat()] }, refs);
  let left = perWeek;
  for (const it of [...items].sort((a, b) => a.date.localeCompare(b.date))) {
    if (left <= 0) break;
    if (it.type !== "easy" || it.steps || it.double) continue;
    const base = Math.floor((it.km - extra) * 10 + 1e-9) / 10;
    if (base < NEXT.easyMinKm) continue;
    it.steps = withStrides({ km: base });
    it.km = stepsKm(it.steps, refs);
    left--;
  }
}

/** Why a built week looks as it does: the long run's step, the threshold rung, the zone 2 km. */
export function whyOf(items: SuggestItem[], long: LongPlan | null, thr: Thr | null, rungAt: number | null): Why {
  return {
    long, thr, rung: rungAt, tempo: items.some((it) => it.type === "long" && !!it.steps),
    z2Km: r1(items.filter((it) => it.type === "easy").reduce((s, it) => s + it.km, 0)),
  };
}

/*
 * "Föreslå veckan" is the block engine with one week (blockplan.ts `suggestWeek`): one engine for a week, a block and
 * any range (docs/decisions/fartlek-adaptive-engine.md). The rules for building a week live above; the search lives there.
 */
