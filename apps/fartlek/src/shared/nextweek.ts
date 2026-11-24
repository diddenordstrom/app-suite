import { addDays, daysBetween, weekday, type ISODate } from "./dates";
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
  /** The long run never goes past this many km, or this many minutes at easy pace, whichever comes first. */
  longCeiling: { km: 32, min: 180 },
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
 * A lighter week has no such floor, so its long run shrinks with the week.
 */
export const longFor = (ladderKm: number, weekKm: number, longestKm: number, lighter: boolean) =>
  Math.min(ladderKm, Math.max(half(weekKm * longShareAt(weekKm)), lighter ? 0 : longestKm));

export type LongWhy = "step" | "spike" | "ceiling" | "lighter";
export interface LongPlan { km: number; why: LongWhy; longestKm: number }

/** Most km a session may have after a longest run of `longestKm` in the last 30 days (rounded like the engine). */
export const spikeMax = (longestKm: number, limit: number = NEXT.spike) => half(longestKm * (1 + limit));

/**
 * The long run on its ladder: the longest run of the last 30 days + 1 km, no more than 10 % over it, under the
 * ceiling; 70 % of it in a lighter week. A missed long run leaves the longest as it was, so the step repeats.
 * Null without a run in the window (the long run is then a share of the week).
 */
export function longRun(longestKm: number, lighter: boolean, easyPace: number | null, anyKm = longestKm): LongPlan | null {
  if (longestKm <= 0) return null;
  let km: number, why: LongWhy;
  if (lighter) { km = half(longestKm * tune().lighter.long); why = "lighter"; }
  else {
    // `anyKm`: the longest run of any kind, when it is known apart from the longest long run (a planned block).
    const step = longestKm + Math.max(tune().long.stepMinKm, longestKm * tune().long.stepShare), spike = Math.max(longestKm, anyKm) * (1 + NEXT.spike);
    km = half(Math.min(step, spike)); why = step <= spike ? "step" : "spike";
  }
  const ceiling = Math.min(NEXT.longCeiling.km, easyPace ? (NEXT.longCeiling.min * 60) / easyPace : Infinity);
  if (km > ceiling) { km = floorHalf(ceiling); why = "ceiling"; }
  return { km: Math.max(NEXT.easyMinKm, km), why, longestKm };
}

export type SuggestType = "easy" | "long" | "threshold" | "cross";
export interface SuggestItem {
  date: ISODate; type: SuggestType; km: number; durationMin: number | null; steps: WorkoutSteps | null;
  /** Race-phase blueprint tag (shared/blueprints.ts), kept through writing, undo and copying. */
  blueprint?: string | null;
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
export interface DaysAdvice { have: number; need: number; why: ("peak" | "fit")[]; peakKm: number; shortKm: number; free: number[] }

const runKmOf = (weeks: AdviceWeek[]) => weeks.reduce((a, w) => a + w.items.filter((it) => it.type !== "cross").reduce((s, it) => s + it.km, 0), 0);
/** Run sessions in the biggest build week: what an extra day should raise for the `peak` signal to be worth a question. */
const peakSessions = (weeks: AdviceWeek[]) => {
  const builds = weeks.filter((w) => !w.lighter);
  const peak = (builds.length ? builds : weeks).reduce((m, w) => (w.targetKm > m.targetKm ? w : m), weeks[0]);
  return peak.items.filter((it) => it.type !== "cross").length;
};

/**
 * `trial` plans the same weeks again with a given set of run days. With it, a signal only becomes a question if
 * some free day would make a difference in that plan (more run km, or more sessions in the peak week), and
 * `free` lists only those days: a day the engine would leave empty is never offered.
 */
export function daysAdvice(runDays: number[], longRunDay: number, weeks: AdviceWeek[], trial?: (runDays: number[]) => AdviceWeek[]): DaysAdvice | null {
  const have = new Set(runDays.length ? runDays : [longRunDay]).size;
  if (have >= 7 || !weeks.length) return null;
  const builds = weeks.filter((w) => !w.lighter);
  const peakKm = Math.max(0, ...(builds.length ? builds : weeks).map((w) => w.targetKm));
  const shortKm = r1(Math.max(0, ...weeks.map((w) => w.targetKm - w.items.filter((it) => it.type !== "cross").reduce((s, it) => s + it.km, 0))));
  const why: DaysAdvice["why"] = [];
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
  let free = order.filter((wd) => !taken.has(wd)).sort((a, b) => gap(b) - gap(a) || order.indexOf(a) - order.indexOf(b));
  const tried = trial ? free.map((wd) => { const w = trial([...taken, wd]); return { wd, gainKm: r1(runKmOf(w) - runKmOf(weeks)), sessions: peakSessions(w) }; }) : [];
  if (trial) free = tried.filter((x) => x.gainKm >= tune().shortKm || x.sessions > peakSessions(weeks)).map((x) => x.wd);
  if (trial && !free.length) return null;
  return { have, need: Math.max(needPeak, why.includes("fit") ? have + 1 : 0), why, peakKm: r1(peakKm), shortKm, free };
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
  const runs = items.filter((it) => it.type !== "cross");
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
  return Math.min(growthBase(kmBefore).base * COACH.weekGrowth, ramp);
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
}

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
export function build(seed: Pick<WeekSeed, "weekStart" | "runDays" | "longRunDay" | "refs">, shape: Shape): SuggestItem[] {
  const { days, slots, longDay } = daysOf(seed);
  const items: SuggestItem[] = [];
  const total = half(shape.km);
  const longKm = shape.longKm ?? Math.max(NEXT.easyMinKm, half(total * NEXT.longShare));
  const longSteps = shape.tempo ? tempoLong(longKm, shape.tempo) : null;
  items.push({ date: longDay, type: "long", km: longSteps ? stepsKm(longSteps, seed.refs) : longKm, durationMin: null, steps: longSteps });
  if (slots.length === 1) return items;

  const thr = shape.thr.slice(0, Math.max(0, slots.length - 1));
  const others = slots.filter((d) => d !== longDay);
  // Days apart around the week: the long run comes back on the same day every week, so a Monday is next to
  // the Sunday long run before it, not six days from it.
  const idx = (d: ISODate) => days.indexOf(d);
  const apart = (a: ISODate, b: ISODate) => { const g = Math.abs(idx(a) - idx(b)); return Math.min(g, 7 - g); };
  const hardDays: ISODate[] = [longDay];
  const thrDays: ISODate[] = [];
  for (let k = 0; k < thr.length; k++) {
    // The free run day furthest from every hard day so far; earlier wins a tie.
    let best: ISODate | null = null, gap = -1;
    for (const d of others) {
      if (thrDays.includes(d)) continue;
      const g = Math.min(...hardDays.map((h) => apart(h, d)));
      if (g > gap) { gap = g; best = d; }
    }
    thrDays.push(best!);
    hardDays.push(best!);
  }
  let used = items[0].km;
  thr.forEach((s, k) => {
    const steps = thresholdFor(s, seed.refs, shape.maxKm);
    const km = stepsKm(steps, seed.refs);
    used += km;
    items.push({ date: thrDays[k], type: "threshold", km, durationMin: null, steps });
  });

  // Zone 2 fills the rest: halves, the last run takes what is left so the week adds up. As few easy runs as
  // keep each under `TUNE.easy.ofLong` of the long run (never shorter than the minimum), on the first run days;
  // the last ones stay free.
  let easyDays = others.filter((d) => !thrDays.includes(d));
  const rest = total - used;
  const easyMax = Math.max(NEXT.easyMinKm, tune().easy.ofLong * items[0].km);
  // As many easy runs as keep each under its share of the long run, and at least as many as the week's volume
  // calls for (`daysFor`: 5 run days from 40 km): otherwise a growing long run lets the easy runs grow with it,
  // a free day never changes the plan, and the week is never offered the day it needs.
  const want = Math.max(1, Math.ceil(rest / easyMax - 1e-9), daysFor(total) - 1 - thr.length);
  while (easyDays.length && (easyDays.length > want || rest / easyDays.length < NEXT.easyMinKm)) easyDays = easyDays.slice(0, -1);
  // An easy run stays shorter than a long run on its ladder (a long run from a share of the week leaves them be).
  const most = shape.longKm == null ? Infinity : Math.max(NEXT.easyMinKm, longKm - 1);
  if (easyDays.length) {
    const each = Math.min(most, half(rest / easyDays.length));
    easyDays.forEach((d, k) => {
      const km = k === easyDays.length - 1 ? Math.min(most, r1(rest - each * (easyDays.length - 1))) : each;
      items.push({ date: d, type: "easy", km, durationMin: null, steps: null });
    });
  }
  // Without a ladder to step from (no run in 30 days), the long run takes what no easy run could.
  if (shape.longKm == null && !easyDays.length && rest > 0) items[0].km = half(items[0].km + rest);
  addStrides(items, seed.refs);
  if (shape.crossMin > 0) {
    const free = days.find((d) => !items.some((it) => it.date === d));
    if (free) items.push({ date: free, type: "cross", km: 0, durationMin: shape.crossMin, steps: null });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
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
    if (it.type !== "easy" || it.steps) continue;
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
