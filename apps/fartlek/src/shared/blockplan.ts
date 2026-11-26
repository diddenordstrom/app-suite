import { addDays, daysBetween, weekday, type ISODate } from "./dates";
import { COACH, crossLoadPerDay, itemLoad } from "./coach";
import { build, daysAdvice, extraDaysOf, isTimed, type ExtraDays, type BackoffWhy, daysOf, type Shape as WeekShape, evaluate, growthBase, longFor, longRun, NEXT, weekCapWith, rung, spikeMax, thresholdReps, whyOf, withinQuality, type PastWeek, type Suggestion, type SuggestItem, type Thr, type Try, type TryId, type WeekEval, type WeekSeed, type WeekState } from "./nextweek";
import { stridesOf, type StepRefs } from "./steps";
import type { Threshold } from "./types";
import { tune } from "./tuning";
import { blueprintById, blueprintTag, compileSlot, phaseWeekFor, type BlueprintId, type PhaseSlot } from "./blueprints";
import { phaseWarnings, RACE_PHASE, type PhaseSeed, type PhaseWarnings } from "./racephase";
import { formPct } from "./load";
import { inTrackSpan, lighterWip, longTrack, offTrackBase, railLong, RACE_PLAN, trackLong, wipOf, type LongTrack, type OtherRun } from "./raceplan";

/*
 * "Föreslå block" (docs/decisions/fartlek-block-goals.md): plan a 2–4 week block as a whole, with a km goal,
 * and re-plan what is left of it toward the goal after a week went differently. The weekly cap comes from
 * what the runner has shown they tolerate (re-entry up to a recent peak week is faster than +10 %), and the
 * block is judged on its deepest build week, like the block coach. Weeks are built with the week engine
 * (nextweek.ts), key sessions first, and evaluated in a chain, each week starting where the one before ended:
 * the long run steps up from the longest run before it and the threshold session climbs its ladder.
 * Pure: the server gathers the seed, the client evaluates edits live from it.
 */

export const BLOCK = {
  minWeeks: 2,
  maxWeeks: 4,
  /** A block the runner shapes in the editor (adding weeks, or a lighter week first) may be this long. */
  maxEditWeeks: 6,
  /** Proven tolerance: the biggest run week of the last `lookbackWeeks`; counts in full for `fullWeeks`, then fades. */
  tolerance: { lookbackWeeks: 26, fullWeeks: 6, fadePerWeek: 0.02, floor: 0.6 },
  /** Re-entry, below the tolerated peak: a week may grow this much, with the ramp up to COACH.rampRisk. */
  reentryGrowth: NEXT.reentryGrowth,
  /** An A or B race within this many weeks of the block's start: planned with race mode instead. */
  raceWindowWeeks: 16,
  /** A block can start in the running week, from today, while this many of its days are left (Monday–Thursday). */
  minDaysLeft: 4,
  /** Re-planning says the goal is adjusted only past this share of it. */
  goalSlack: 0.03,
  /**
   * A block too hard for its form floor is fitted week by week by bisection: a week goes no lower than `minScale` of what
   * the ramp aims at; when it is too hard at any km (already under the floor) no lower than `stuckScale`.
   * `slack`: a runner who starts near or under the floor may dig this many points of form (% of fitness) deeper
   * than where they start before a block counts as too hard; see `floorFor`.
   */
  fit: { minScale: 0.5, stuckScale: 0.75, steps: 12, slack: 5 },
} as const;

export interface Tolerance {
  /** The tolerated km now: the biggest week after fading. */
  km: number;
  /** The week it comes from, its km as run and how many weeks before the block it was (1 = the week before). */
  peakKm: number;
  peakWeek: ISODate | null;
  weeksAgo: number;
}

/** Proven tolerance from run km per week before the block (oldest first, the last one the week before it). */
export function tolerance(weeks: { weekStart: ISODate; km: number }[]): Tolerance {
  const T = BLOCK.tolerance;
  const recent = weeks.slice(-T.lookbackWeeks);
  let best: Tolerance = { km: 0, peakKm: 0, peakWeek: null, weeksAgo: 0 };
  recent.forEach((w, i) => {
    const ago = recent.length - i;
    const fade = ago <= T.fullWeeks ? 1 : Math.max(T.floor, 1 - T.fadePerWeek * (ago - T.fullWeeks));
    const km = w.km * fade;
    if (km > best.km) best = { km: r1(km), peakKm: r1(w.km), peakWeek: w.weekStart, weeksAgo: ago };
  });
  return best;
}

/** Most km a week can have, with re-entry up to the tolerated load (`weekCapWith` in nextweek.ts). */
export const blockWeekCap = (kmBefore: number[], tolKm: number) => weekCapWith(kmBefore, tolKm);

export interface BlockSeed {
  /** The first week to plan: the block's start, or the first week not started when re-planning. */
  startWeek: ISODate;
  weeks: number;
  /** Fitness and fatigue at the end of the day before `startWeek`. */
  ctl: number;
  atl: number;
  /** Run km of the 3 weeks before `startWeek`, oldest first. */
  kmBefore: number[];
  /** Up to 6 weeks before, for the charts. */
  past: PastWeek[];
  tolerance: Tolerance;
  runDays: number[];
  longRunDay: number;
  threshold: Threshold | null;
  refs: StepRefs;
  crossMin: number;
  /** Gym and other-sport days (docs/decisions/fartlek-gym-cross-days.md); `runDays` already leaves them out. */
  extra?: ExtraDays | null;
  /** End with a lighter week (blocks of 3+ weeks). */
  lighterLast: boolean;
  /** Km to aim for over these weeks; null = as much as is safe. */
  goalKm: number | null;
  /** A lighter week before the block (asked for, or form is heavy): the first week is lighter. */
  lighterFirst?: boolean;
  /** Why the first week is lighter (see `BackoffWhy`); "light" when the caller asked for a lighter start (a pause). */
  lighterFirstWhy?: BackoffWhy | "light" | null;
  /** Build weeks already behind (re-plan): decides whether the last week is the lighter one. */
  buildWeeksDone: number;
  hardBefore: boolean;
  /** As in the week seed: the longest run of the 30 days before `startWeek`, the threshold rung, the faster finish's pace. */
  longestKm: number;
  rung: number;
  tempoPace: number | null;
  /** Most km the first week may have: what the same engine plans for that week alone (set by `suggestBlock`). */
  firstWeekMax?: number | null;
  /** Weeks whose size the runner has decided (their own weekly target): built at that km, never fitted. */
  fixedKm?: (number | null)[];
  /** Which weeks are lighter, decided by the runner (the rhythm picked, or a week's type changed in the editor): replaces the rule in `isLighter`. */
  lighterWeeks?: boolean[];
  /** Every week's role, when a race decides them (`raceRoles`) or the runner set them in the editor: replaces `lighterWeeks` and the rule. */
  roles?: WeekRole[];
  /** The A or B race the weeks lead to (race planning, docs/decisions/fartlek-race-blocks.md). */
  race?: { date: ISODate; priority: "A" | "B" } | null;
  /** The race the first weeks recover from, or a race inside the weeks whose days after it are gated. */
  recovery?: RecoveryRace | null;
  /** The taper's depth, as shares of the peak week (first taper week, race week); set by the search in `suggestBlock`. */
  taper?: { first: number; race: number };
  /** The race-specific phase, when an A marathon or half is within 8 weeks of one of the weeks. */
  phase?: PhaseSeed;
  /** Where a race plan's chunk ramps from (docs/decisions/fartlek-race-plan-skeleton.md); default tolerance.km. Never raises a cap. */
  anchorKm?: number;
  /** After a break of 8+ days: the first build week is at most this many km (RACE_PLAN.back). */
  backKm?: number | null;
  /** Other races in the weeks (B races, A races other than `race`): each week holding one is a B race week. */
  otherRaces?: { date: ISODate; distanceKm?: number }[];
  /**
   * A marathon plan's long-run track (RACE_PLAN.track): the race and the other races on its road, so each week knows whether it
   * is on the track, what its long run is aimed at and how many km carry it. Absent: no track (a half, a block outside a plan).
   */
  track?: { raceDate: ISODate; others: OtherRun[] } | null;
  /** A marathon plan's build phase starts this week: build weeks from it may give the long run RACE_PLAN.marathonLongShare. */
  longShareFrom?: ISODate | null;
  /** The runner's cap on a build week's km for the race the weeks lead to (docs/decisions/fartlek-long-run-ceiling.md). */
  capKm?: number | null;
  /**
   * A block started in the running week, from today (docs/decisions/fartlek-skapa-block.md): the first week's days before
   * `before` are over, and `items` is what was run on them (easy runs of the km run). The first week keeps its whole-week
   * target; its sessions go on the days that are left (what was not run is not made up), never past the target less what
   * was run; the evaluation counts the runs. `weekKm`: what the week then comes to (run + planned), which the caps of the
   * weeks after it grow from (set by `suggestBlock`; null = its target).
   */
  done?: { before: ISODate; items: SuggestItem[]; weekKm?: number | null } | null;
}

/** Run km already run in the first week of a block started from today. */
export const doneKmOf = (seed: Pick<BlockSeed, "done">) => r1((seed.done?.items ?? []).filter(isRun).reduce((s, it) => s + it.km, 0));

/** A week's items with what was run on its days that are over (the first week of a block started from today). */
const withDone = (seed: BlockSeed, i: number, items: SuggestItem[]): SuggestItem[] =>
  i === 0 && seed.done ? [...seed.done.items, ...items.filter((it) => it.date >= seed.done!.before)].sort((a, b) => a.date.localeCompare(b.date)) : items;

/**
 * What a week is for. `build` and `lighter` as in any block; before a race, `taper` (the week before the race week)
 * and `race` (the week the race is in). A taper is not a lighter week: it cuts deeper, keeps the run days and a few
 * short fast reps, and the two are never stacked. `recovery`: a week after an A or B race of 10 km or more, a share of
 * the pre-race peak with quality gated by days since the race (docs/decisions/fartlek-post-race-recovery.md).
 */
export type WeekRole = "build" | "lighter" | "taper" | "race" | "recovery";

/** An A or B race of 10 km+ that recovery weeks follow (docs/decisions/fartlek-post-race-recovery.md). */
export interface RecoveryRace {
  date: ISODate;
  distanceKm: number;
  priority: "A" | "B";
  /** Run km of the biggest week in the 6 weeks before the race week; null = take it from the plan or the tolerance. */
  peakKm: number | null;
}

export interface RecoveryRow {
  /** Recovery weeks, and the volume of each as a share of the pre-race peak week. `volume.length === weeks`. */
  weeks: number;
  volume: readonly number[];
  /** Days 1..restDays after the race: no running (0 = none). */
  restDays: number;
  /** First day (days since the race, race day 0) each kind is allowed. */
  strides: number;
  /** The lighter week's session, NEXT.lighterThr (3 × 6 min). */
  thresholdShort: number;
  /** The ladder's rung. */
  thresholdFull: number;
  /** Not generated today; kept so a future generator (and race-phase blueprints) honours it. */
  intervals: number;
}
export type RecoveryBucket = "10k" | "half" | "marathon";

const RECOVERY_A: Record<RecoveryBucket, RecoveryRow> = {
  "10k": { weeks: 1, volume: [0.7], restDays: 0, strides: 4, thresholdShort: 7, thresholdFull: 7, intervals: 10 },
  half: { weeks: 2, volume: [0.5, 0.75], restDays: 0, strides: 6, thresholdShort: 11, thresholdFull: 11, intervals: 14 },
  marathon: { weeks: 4, volume: [0.15, 0.45, 0.65, 0.8], restDays: 3, strides: 12, thresholdShort: 21, thresholdFull: 28, intervals: 28 },
};
const RECOVERY_B: Record<RecoveryBucket, RecoveryRow> = {
  "10k": { weeks: 1, volume: [0.8], restDays: 0, strides: 2, thresholdShort: 4, thresholdFull: 4, intervals: 6 },
  half: { weeks: 1, volume: [0.85], restDays: 0, strides: 4, thresholdShort: 7, thresholdFull: 7, intervals: 8 },
  marathon: { weeks: 2, volume: [0.8, 0.9], restDays: 2, strides: 7, thresholdShort: 13, thresholdFull: 17, intervals: 17 },
};

/** Post-race recovery (docs/decisions/fartlek-post-race-recovery.md). An injury guard: not in TUNE. */
export const RECOVERY = {
  /** Races shorter than this get no recovery weeks. Buckets: < `halfFromKm` 10k, < `marathonFromKm` half, else marathon. */
  minKm: 10, halfFromKm: 15, marathonFromKm: 30,
  /** Long run of a recovery week: this share of the week's km, never over `longMaxKm`, never under NEXT.easyMinKm. */
  longShare: 0.3, longMaxKm: 16,
  /** How far back a race can be and still give recovery weeks (the longest row's weeks). */
  lookbackDays: 28,
  A: RECOVERY_A,
  B: RECOVERY_B,
} as const;

/** The bucket of a race distance; null under RECOVERY.minKm. */
export const recoveryBucket = (km: number): RecoveryBucket | null =>
  km < RECOVERY.minKm ? null : km < RECOVERY.halfFromKm ? "10k" : km < RECOVERY.marathonFromKm ? "half" : "marathon";

/** The row for a race; null for a C race or one under 10 km. */
export function recoveryRow(r: Pick<RecoveryRace, "distanceKm"> & { priority: string }): RecoveryRow | null {
  const b = recoveryBucket(r.distanceKm);
  return b && (r.priority === "A" || r.priority === "B") ? RECOVERY[r.priority][b] : null;
}

/**
 * Which recovery week a plan week is: the one holding the week's middle day (weekStart + 3). Recovery week k covers
 * days 7k+1 .. 7k+7 after the race. Never negative (a week that holds the race reads 0).
 */
export const recoveryWeekOf = (raceDate: ISODate, weekStart: ISODate) =>
  Math.max(0, Math.floor((daysBetween(raceDate, weekStart) + 2) / 7));

/** "recovery" for each of `weeks` weeks from `startWeek` still inside the race's recovery, else null (left to the caller). */
export function recoveryRoles(rec: Pick<RecoveryRace, "date" | "distanceKm"> & { priority: string }, startWeek: ISODate, weeks: number): (WeekRole | null)[] {
  const row = recoveryRow(rec);
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(startWeek, i * 7);
    return row && ws > rec.date && recoveryWeekOf(rec.date, ws) < row.weeks ? "recovery" : null;
  });
}

/** Recovery weeks first (a race week inside them stays a race week, a taper week becomes recovery); the rest as given, or build. */
export function withRecovery(roles: WeekRole[] | null, rec: (WeekRole | null)[]): WeekRole[] | null {
  if (!rec.some(Boolean)) return roles;
  const n = Math.max(rec.length, roles?.length ?? 0);
  return Array.from({ length: n }, (_, i) => {
    const r = rec[i];
    return r && roles?.[i] !== "race" ? r : roles?.[i] ?? "build";
  });
}

export interface PlannedWeek { weekStart: ISODate; lighter: boolean; role: WeekRole; reentry: boolean; cap: number; /** The km the week was asked to have (its sessions may add up to less when the days can't hold them). */ targetKm: number; items: SuggestItem[] }
export interface BlockWeekEval extends WeekEval { weekStart: ISODate; lighter: boolean; role: WeekRole }
export interface BlockEval {
  weeks: BlockWeekEval[];
  km: number;
  /** The deepest build week: its lowest daily form (the day after it included). */
  deepest: { weekStart: ISODate; form: number; formPct: number } | null;
  /** Fitness at the end of the block, and how much it grew. */
  ctl: number;
  ctlGain: number;
  state: WeekState;
  /** Form on race day (yesterday's fitness − fatigue, as on the plan page) when the weeks lead to a race. */
  race: { date: ISODate; form: number; formPct: number } | null;
}

export type BlockTryId = "read" | "start" | "volume" | "goal" | "lighter" | "tempo" | "second" | "cross" | "taper" | "deep";
export interface BlockTry { id: BlockTryId; form: number | null; state: WeekState | "skip" | "info"; params: Record<string, number | string> }
export interface BlockSuggestion {
  weeks: PlannedWeek[];
  eval: BlockEval;
  tries: BlockTry[];
  chosen: BlockTryId;
  /** What the weeks add up to, and how far that falls short of the goal asked for (0 when it fits). */
  goalKm: number;
  shortBy: number;
  /** What the race-specific phase warns about; null outside a phase. */
  phaseWarnings: PhaseWarnings | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const floorHalf = (n: number) => Math.floor(n * 2) / 2 + 0;
const isRun = (it: SuggestItem) => !isTimed(it.type);

/** The week engine's seed for week `i`, starting from where the weeks before it ended. */
function weekSeedOf(seed: BlockSeed, i: number, ctl: number, atl: number, kmBefore: number[], hardBefore: boolean, longestKm = seed.longestKm): WeekSeed {
  return {
    weekStart: addDays(seed.startWeek, i * 7), ctl, atl, kmBefore: kmBefore.slice(-3), past: [],
    runDays: seed.runDays, longRunDay: seed.longRunDay, threshold: seed.threshold, refs: seed.refs,
    crossMin: seed.crossMin, extra: seed.extra ?? null, targetKm: null, backoff: false, hardBefore,
    longestKm, rung: seed.rung, tempoPace: seed.tempoPace, toleranceKm: seed.tolerance.km,
    ...(seed.phase ? { phase: seed.phase } : {}),
  };
}

/** The last week is lighter in a block of 3+ weeks; re-planning a block's last week or two keeps it so. */
/**
 * The lighter weeks: the first when one is due before the block (`lighterFirst`, the same rule as "Föreslå
 * veckan"), and the last in a block of 3+ weeks, unless the block began lighter and is too short for both.
 */
export const isLighter = (seed: BlockSeed, i: number) =>
  seed.roles ? seed.roles[i] === "lighter"
  : seed.lighterWeeks ? !!seed.lighterWeeks[i]
  : (!!seed.lighterFirst && i === 0)
  || (seed.lighterLast && i === seed.weeks - 1 && i > 0 && !(seed.lighterFirst && seed.weeks < 5)
    && (seed.weeks >= 3 || (seed.buildWeeksDone > 0 && seed.weeks + seed.buildWeeksDone >= 3)));

/** A week's role: as decided (`roles`), else build or lighter by the rule. */
export const roleOf = (seed: BlockSeed, i: number): WeekRole => seed.roles?.[i] ?? (isLighter(seed, i) ? "lighter" : "build");
const isBuild = (seed: BlockSeed, i: number) => roleOf(seed, i) === "build";

/* ---------- Race planning: roles and blocks counted back from the race ---------- */

/** A block of a race plan: its length and what it is (counted back from the race, docs/decisions/fartlek-race-blocks.md). */
export interface RaceChunk { weeks: number; kind: "inPhase" | "build" | "peak"; roles: WeekRole[] }

/**
 * The blocks from the start week to an A race `weeks` away (the race week included), counted back in 4-week blocks:
 * the last is the form peak (2:2, or 1:2, 0:2 and the race week alone when fewer weeks are left), the ones before it
 * builds (3:1), and what is left at the front a shorter block that puts the runner in phase (2:1, 1:1, or one base week).
 */
export function raceChunks(weeks: number): RaceChunk[] {
  const peakLen = Math.min(4, weeks);
  const peakRoles: WeekRole[] = [...Array<WeekRole>(Math.max(0, peakLen - 2)).fill("build"), ...(peakLen >= 2 ? ["taper", "race"] as WeekRole[] : ["race"] as WeekRole[])];
  const chunks: RaceChunk[] = [{ weeks: peakLen, kind: "peak", roles: peakRoles }];
  let left = weeks - peakLen;
  while (left >= 4) { chunks.unshift({ weeks: 4, kind: "build", roles: ["build", "build", "build", "lighter"] }); left -= 4; }
  if (left > 0) {
    const roles: WeekRole[] = left === 1 ? ["build"] : [...Array<WeekRole>(left - 1).fill("build"), "lighter"];
    chunks.unshift({ weeks: left, kind: "inPhase", roles });
  }
  return chunks;
}

/**
 * Every week's role up to a race: an A race as `raceChunks`; a B race keeps the usual rhythm (a lighter week after
 * three builds) and only its own week is a race week, a mini-taper with no taper week before it. A tired start
 * makes a first build week lighter.
 */
export function raceRoles(weeks: number, priority: "A" | "B", lighterFirst = false): WeekRole[] {
  const roles: WeekRole[] = priority === "A" ? raceChunks(weeks).flatMap((c) => c.roles)
    : Array.from({ length: weeks }, (_, i) => (i === weeks - 1 ? "race" : (i + 1) % 4 === 0 ? "lighter" : "build"));
  if (lighterFirst && roles[0] === "build") roles[0] = "lighter";
  return roles;
}

/**
 * The form (% of fitness) a build week may reach before the block is too hard: `COACH.floor`, or for a runner who
 * starts near it, `BLOCK.fit.slack` points deeper than where they start. A floor measured from zero is a cliff
 * for someone already tired from the week before: a block that digs 3 points deeper would be cut to key sessions only.
 */
export const floorFor = (seed: Pick<BlockSeed, "ctl" | "atl">) => {
  const start = seed.ctl > 0 ? ((seed.ctl - seed.atl) / seed.ctl) * 100 : 0;
  return Math.min(COACH.floor, start - BLOCK.fit.slack);
};

/** Evaluate the weeks in a chain: each starts with the fitness, fatigue and km window the one before left. */
export function evaluateBlock(seed: BlockSeed, planned: SuggestItem[][]): BlockEval {
  // The runs already done in the first week count in the load and the km, like the sessions ahead.
  const weeks = planned.map((items, i) => withDone(seed, i, items));
  let ctl = seed.ctl, atl = seed.atl, hardBefore = seed.hardBefore, longest = seed.longestKm;
  const window = [...seed.kmBefore];
  const out: BlockWeekEval[] = [];
  weeks.forEach((items, i) => {
    const ws = weekSeedOf(seed, i, ctl, atl, window, hardBefore, longest);
    const e = evaluate(ws, items);
    longest = Math.max(longest, ...items.filter(isRun).map((it) => it.km));
    out.push({ ...e, weekStart: ws.weekStart, lighter: isLighter(seed, i), role: roleOf(seed, i) });
    ctl = e.ctl; atl = e.atl; window.push(e.km);
    const last = addDays(ws.weekStart, 6);
    hardBefore = items.some((it) => it.date === last && (it.type === "threshold" || it.type === "long"));
  });
  const build = out.filter((w) => w.role === "build");
  const deepestW = build.reduce<BlockWeekEval | null>((m, w) => (!m || w.lowPct < m.lowPct ? w : m), null);
  const deepest = deepestW ? { weekStart: deepestW.weekStart, form: deepestW.low, formPct: deepestW.lowPct } : null;
  // The ramp flags a build week, unless the week stays within the proven tolerance (re-entry).
  const ramp = build.some((w) => (w.acwr ?? 0) > COACH.rampRisk + 0.005 && w.km > seed.tolerance.km + 0.05);
  const state: WeekState = !deepest ? "ok" : deepest.formPct < floorFor(seed) || ramp ? "over" : deepest.formPct > COACH.goal ? "under" : "ok";
  return { weeks: out, km: r1(out.reduce((s, w) => s + w.km, 0)), deepest, ctl: r1(ctl), ctlGain: r1(ctl - seed.ctl), state, race: raceDayForm(seed, weeks, out) };
}

/**
 * Form on race day: the weeks before the race week as evaluated, then the race week day by day up to the day before
 * the race (form on a day is the day before's fitness − fatigue). Null without a race in the weeks.
 */
function raceDayForm(seed: BlockSeed, weeks: SuggestItem[][], ev: BlockWeekEval[]): BlockEval["race"] {
  const race = seed.race;
  if (!race) return null;
  const i = Math.floor(daysBetween(seed.startWeek, race.date) / 7);
  if (i < 0 || i >= weeks.length) return null;
  let ctl = i > 0 ? ev[i - 1].ctl : seed.ctl, atl = i > 0 ? ev[i - 1].atl : seed.atl;
  const ws = addDays(seed.startWeek, i * 7);
  const cross = crossLoadPerDay(seed.crossMin);
  for (let d = ws; d < race.date; d = addDays(d, 1)) {
    const load = weeks[i].filter((it) => it.date === d).reduce((s, it) => s + itemLoad({ type: it.type, km: it.km, durationMin: it.durationMin, steps: it.steps }, seed.threshold), 0) + cross;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
  }
  const form = ctl - atl;
  return { date: race.date, form: r1(form), formPct: r1(ctl > 0 ? (form / ctl) * 100 : 0) };
}

/** The marathon long-run track of the seed's weeks (RACE_PLAN.track); null without one. */
const trackOf = (seed: Pick<BlockSeed, "track" | "startWeek">): LongTrack | null =>
  seed.track ? longTrack(addDays(seed.startWeek, (wipOf(seed.startWeek, seed.track.raceDate) - 1) * 7), seed.track.others) : null;

export interface Volume { km: number; cap: number; reentry: boolean; lighter: boolean; role: WeekRole }

/**
 * Km per week at `scale`. A build week aims at the tolerated km times its place on `TUNE.ramp` (low first, high
 * last), held to its safe cap (each cap from the weeks before it, planned ones included); a lighter week keeps
 * `TUNE.lighter.volume` of the week before. `fixed` are weeks already decided: they keep their km, and the caps after
 * them follow from those.
 */
function volumes(seed: BlockSeed, scale: number, given: number[] = []): Volume[] {
  const fixed = Array.from({ length: seed.weeks }, (_, i) => given[i] ?? seed.fixedKm?.[i] ?? undefined);
  const window = [...seed.kmBefore];
  const noHistory = !window.some((k) => k > 0);
  const buildWeeks = Array.from({ length: seed.weeks }, (_, i) => i).filter((i) => isBuild(seed, i)).length;
  const anchor = Math.max(seed.anchorKm ?? seed.tolerance.km, NEXT.startKm);
  const out: Volume[] = [];
  const track = trackOf(seed);
  let built = 0;
  for (let i = 0; i < seed.weeks; i++) {
    const role = roleOf(seed, i);
    const lighter = role !== "build";
    let v: Volume;
    if (role === "taper" || role === "race") {
      // A share of the peak: the biggest build week planned (or run) before it. A B race week keeps a share of a normal week.
      const peak = Math.max(0, ...out.filter((x) => x.role === "build").map((x) => x.km), ...(out.some((x) => x.role === "build") ? [] : window.slice(-3)));
      const prev = out.at(-1)?.km ?? window.at(-1) ?? 0;
      // A race week is an A race week only when it holds an A `seed.race`; any other race week (a B race, an other race) keeps a share of a normal week.
      const ws = addDays(seed.startWeek, i * 7);
      const aWeek = role === "race" && seed.race?.priority === "A" && seed.race.date >= ws && seed.race.date <= addDays(ws, 6);
      const share = role === "taper" ? seed.taper?.first ?? tune().taper.first
        : aWeek ? seed.taper?.race ?? tune().taper.race : tune().taper.bRace;
      const base = role === "race" && !aWeek ? prev : peak;
      v = { km: fixed[i] ?? floorHalf(base * share), cap: base, reentry: false, lighter, role };
    } else if (role === "recovery" && seed.recovery && recoveryRow(seed.recovery)) {
      // A fixed share of the pre-race peak: never fitted, ramped or held to the week cap (docs/decisions/fartlek-post-race-recovery.md).
      const row = recoveryRow(seed.recovery)!;
      const k = Math.min(recoveryWeekOf(seed.recovery.date, addDays(seed.startWeek, i * 7)), row.volume.length - 1);
      // The pre-race peak: a build week planned before it (a re-plan with the race inside), else the run peak, else the tolerance.
      const plannedPeak = Math.max(0, ...out.filter((x) => x.role === "build").map((x) => x.km));
      const peak = plannedPeak || seed.recovery.peakKm || seed.tolerance.peakKm || Math.max(0, ...window.slice(-3));
      v = { km: fixed[i] ?? floorHalf(peak * row.volume[k]), cap: peak, reentry: false, lighter, role };
    } else if (lighter) {
      const prev = out.at(-1)?.km ?? window.at(-1) ?? 0;
      v = { km: fixed[i] ?? floorHalf(prev * tune().lighter.volume), cap: prev, reentry: false, lighter, role };
    } else {
      const grown = noHistory && !out.length ? { cap: NEXT.startKm, reentry: false } : blockWeekCap(window, seed.tolerance.km);
      // A marathon's week at a long-run target may go back to the level it had before a lighter week (no more than that): the mean of
      // the three weeks would otherwise keep it a little under, and the long run it carries a little short of its target.
      const wip = seed.track ? wipOf(addDays(seed.startWeek, i * 7), seed.track.raceDate) : 0;
      const carry = track ? track.carryKm(wip) : 0;
      const back = track?.at(wip) && lighterWip(wip + 1) ? window.at(-2) ?? 0 : 0;
      const { cap, reentry } = back > grown.cap ? { cap: back, reentry: grown.reentry } : grown;
      // Where this build week sits on the ramp: 0 = first, 1 = last (a lone build week sits in the middle).
      const at = buildWeeks > 1 ? built / (buildWeeks - 1) : 0.5;
      // A marathon's week on the track grows toward the km that carry its long run (and the runs after it), never past the caps below.
      // At low volume the ramp's 5–10 % is a km or two: each build week may climb `NEXT.lowStepKm` instead (docs/decisions/fartlek-low-volume-growth.md).
      const step = anchor < NEXT.lowVolumeKm ? anchor + NEXT.lowStepKm * built : 0;
      const aim = Math.max(anchor * (tune().ramp.from + (tune().ramp.to - tune().ramp.from) * at), carry, step) * scale;
      // The first week is never bigger than the week button's suggestion: after a jump that one backs off.
      const first = (i === 0 ? Math.min(seed.firstWeekMax ?? Infinity, seed.backKm ?? Infinity) : Infinity);
      // The runner's own cap for the race holds every build week (a lower ceiling, never a higher one).
      const top = Math.min(first, seed.capKm ?? Infinity);
      v = { km: fixed[i] ?? floorHalf(Math.min(cap, aim, top)), cap: r1(Math.min(cap, top)), reentry, lighter, role };
      built++;
    }
    out.push(v);
    // The weeks after a first week started from today grow from what that week comes to, not from its target.
    window.push(i === 0 && seed.done?.weekKm != null ? seed.done.weekKm : v.km);
  }
  return out;
}

/** The block's km per week without sessions: the race plan's cheap projection (docs/decisions/fartlek-race-plan-skeleton.md). */
export const projectVolumes = (seed: BlockSeed) => volumes(seed, 1);

/** The scale of the caps that adds up to `goal` (bisection: the total grows with the scale). */
function scaleFor(seed: BlockSeed, goal: number): number {
  let lo = 0.2, hi = 1;
  for (let k = 0; k < 24; k++) {
    const mid = (lo + hi) / 2;
    if (volumes(seed, mid).reduce((s, v) => s + v.km, 0) > goal) hi = mid; else lo = mid;
  }
  return lo;
}

interface Shape { scale: number; tempo: boolean; second: number; crossMin: number }

/**
 * Concrete weeks for a shape: volumes, then the key sessions week by week. The long run steps up from the
 * longest run before it (the weeks planned before it count), the threshold session takes the next rung each
 * build week; the lighter week has 70 % of both.
 */
function weeksFor(seed: BlockSeed, shape: Shape, kms?: number[]): PlannedWeek[] {
  const vols = volumes(seed, shape.scale).map((v, i) => (kms?.[i] == null ? v : { ...v, km: kms[i] }));
  const buildIdx = vols.map((v, i) => (v.lighter ? -1 : vols.slice(0, i + 1).filter((x) => !x.lighter).length - 1));
  const builds = buildIdx.filter((b) => b >= 0).length;
  // The long run steps up from the longest long run before it; the 30-day rule counts any run.
  let longest = seed.longestKm, any = Math.max(seed.longestKm, ...(seed.done?.items ?? []).filter(isRun).map((it) => it.km));
  // The race phase's blueprints step on along the plan: one step each time a full session is planned (a held one never advances).
  const steps: Record<string, number> = { ...(seed.phase?.steps ?? {}) };
  // The next rung: phase weeks go on from where the build weeks before the phase left the ladder.
  let ladderNext = 0;
  // Post-race recovery (docs/decisions/fartlek-post-race-recovery.md): the days after a race of 10 km+ are gated by days since it.
  const rec = seed.recovery ?? null;
  const row = rec ? recoveryRow(rec) : null;
  const track = trackOf(seed);
  const dayOf = (d: ISODate) => (rec ? daysBetween(rec.date, d) : -1);
  let recStarted = false;
  return vols.map((v, i) => {
    const plain = weekSeedOf(seed, i, 0, 0, [], false);
    // Doubles only in build weeks: a lighter, taper, race or recovery week is where the body rests.
    const ws = v.role !== "build" && plain.extra?.doubles && plain.extra.doubles !== "off" ? { ...plain, extra: { ...plain.extra, doubles: "off" as const } } : plain;
    const last = addDays(ws.weekStart, 6);
    const recWeek = v.role === "recovery";
    // The weeks after recovery step up from what recovery planned, not from the race or the long runs before it.
    if (recWeek && !recStarted) { longest = 0; any = 0; recStarted = true; }
    const phase = seed.phase && v.role !== "race" && !recWeek ? phaseWeekFor(seed.phase, ws.weekStart, seed.runDays, seed.longRunDay) : null;
    // A marathon plan's build and race-phase weeks may give the long run more of the week (docs/decisions/fartlek-long-run-ceiling.md);
    // a week on its long-run track takes the track's run, up to half of the week (docs/decisions/fartlek-marathon-long-run-plan.md).
    const marathon = seed.phase?.race.kind === "marathon" || !!seed.track;
    const share = v.role === "build" && (marathon || (seed.longShareFrom != null && ws.weekStart >= seed.longShareFrom)) ? RACE_PLAN.marathonLongShare : 0;
    const long = longRun(longest, v.lighter, seed.refs.easyPace, any, marathon);
    const wip = seed.track ? wipOf(ws.weekStart, seed.track.raceDate) : seed.phase ? wipOf(ws.weekStart, seed.phase.race.date) : null;
    const entry = track && wip != null && v.role === "build" ? track.at(wip) : null;
    const onRail = track && wip != null && v.role === "build" && !entry;
    let longKm = recWeek ? Math.max(NEXT.easyMinKm, Math.min(RECOVERY.longMaxKm, floorHalf(v.km * RECOVERY.longShare)))
      : long && entry ? trackLong(entry, long.km, v.km)
      : long && onRail ? railLong(inTrackSpan(track, wip!) ? offTrackBase(long.km, v.km, longest) : longFor(long.km, v.km, longest, v.lighter, share), long.km, v.km, longest, track.stepNeed(wip!))
      : long ? longFor(long.km, v.km, longest, v.lighter, share) : null;
    // The long-run peak is held, not raised, in the build weeks close to the race (docs/decisions/fartlek-race-plan-skeleton.md).
    if (seed.phase && v.role === "build" && longKm != null && longest > 0) {
      const w = wipOf(ws.weekStart, seed.phase.race.date), h = RACE_PLAN.longPeak[seed.phase.race.kind];
      if (w >= h.holdTo && w <= h.holdFrom) longKm = Math.min(longKm, longest);
    }
    const maxKm = any > 0 ? spikeMax(any) : null;
    // After the race: until the full threshold gate only the short session, and none before the short gate.
    const afterRace = !!row && v.role !== "race" && dayOf(last) > 0;
    const thrGated = afterRace && (recWeek || dayOf(ws.weekStart) < row!.thresholdFull);
    // The phase's sessions: a held one (a share of the step) only in a lighter or taper week; where the week or the day can't hold the
    // blueprint (or its fallback) the plain session of the week stays instead, so the runner always gets a week.
    let thr: Thr[];
    let phased: WeekShape["phase"];
    if (thrGated) thr = dayOf(last) >= row!.thresholdShort ? [{ ...NEXT.lighterThr }] : [];
    else if (phase && seed.phase) {
      const stepOf = (id: BlueprintId) => steps[id] ?? 0;
      const ctx = { weekKm: v.km, maxKm, paces: seed.phase.paces };
      const item = (c: NonNullable<ReturnType<typeof compileSlot>>) => {
        if (!c.held) steps[c.id] = Math.min(c.step + 1, blueprintById(c.id).steps.length - 1);
        return { steps: c.steps, blueprint: blueprintTag(c.id, c.step, c.held) };
      };
      const slot = (x: PhaseSlot | null) => (x && v.role === "build" && x.held != null ? { ...x, held: undefined } : x);
      const lSlot = slot(phase.long), qSlot = slot(phase.quality);
      const hold = seed.phase.injury;
      const l = lSlot && longKm != null ? compileSlot(lSlot, stepOf, { ...ctx, longKm }, hold) : null;
      const q = qSlot ? compileSlot(qSlot, stepOf, ctx, hold) : null;
      phased = { long: l ? item(l) : null, quality: q ? [{ ...item(q), ...(qSlot?.day ? { date: qSlot.day } : {}) }] : [] };
      // A quality session of the phase takes the threshold session's place, the ladder stays as a third from `highKm` a week.
      const third = v.role === "build" && v.km >= RACE_PHASE.highKm && daysOf(ws).slots.length >= NEXT.secondMinDays;
      if (q || !qSlot && !phase.quality) thr = third ? [rung(seed.rung + ladderNext++)] : [];
      else thr = v.lighter ? [{ ...NEXT.lighterThr }] : [rung(seed.rung + ladderNext++)];
    } else if (v.role === "race") thr = [{ ...RACE_SHARPEN }];
    else if (v.lighter) thr = [{ ...NEXT.lighterThr }];
    else {
      const main = rung(seed.rung + buildIdx[i]);
      ladderNext = buildIdx[i] + 1;
      // A second session in the last `second` build weeks, deepest first.
      thr = buildIdx[i] >= builds - shape.second ? [main, { ...NEXT.second }] : [main];
    }
    const tempo = shape.tempo && !v.lighter && thr.length === 1 && !phase ? seed.tempoPace : null;
    const strides = afterRace && dayOf(ws.weekStart) > 0 && dayOf(last) < row!.strides ? { strides: 0 } : {};
    // The rest days after the race are not run days, so the week's runs land on the days left (gateAfterRace still drops any).
    const restDays = afterRace && row!.restDays > 0 ? Array.from({ length: 7 }, (_, k) => addDays(ws.weekStart, k)).filter((d) => dayOf(d) >= 1 && dayOf(d) <= row!.restDays).map(weekday) : [];
    const runDays = restDays.length && seed.runDays.some((x) => !restDays.includes(x)) ? seed.runDays.filter((x) => !restDays.includes(x)) : seed.runDays;
    const shapeOf = (km: number, long: number | null, q: Thr[]): WeekShape => ({ km, longKm: long, tempo, thr: withinQuality(q, v.km, seed.refs), crossMin: v.lighter ? 0 : shape.crossMin,
      maxKm, ...strides, ...(phased && !thrGated ? { phase: phased } : {}) });
    const whole = build(runDays === seed.runDays ? ws : { ...ws, runDays }, shapeOf(v.km, longKm, thr));
    let built = whole;
    if (i === 0 && seed.done) {
      // Started from today (docs/decisions/fartlek-skapa-block.md): the week as planned whole, its days that are over
      // dropped. What was not run on them is not made up: those days are the week's easing. What was run counts, so
      // the days ahead never take the week past its target: then they get the target less what was run.
      const before = seed.done.before;
      built = whole.filter((it) => it.date >= before);
      const left = Math.max(0, floorHalf(v.km - doneKmOf(seed)));
      if (weekKm(built) > left + 0.5) {
        const ahead = runDays.filter((wd) => Array.from({ length: 7 }, (_, k) => addDays(ws.weekStart, k)).some((d) => d >= before && weekday(d) === wd));
        const on = { ...ws, runDays: ahead };
        const long = longKm == null ? null : Math.min(longKm, left);
        built = ahead.length && left >= NEXT.easyMinKm ? build(on, shapeOf(left, long, thr)) : [];
        // The key sessions may not take the days ahead past what is left either: the threshold goes first.
        if (weekKm(built) > left + 0.5 && thr.length) built = build(on, { ...shapeOf(left, long, []), ...(phased && !thrGated ? { phase: { long: phased.long, quality: [] } } : {}) });
      }
    }
    let items = seed.race ? aroundRace(built, seed.race.date, ws.weekStart) : built;
    for (const o of seed.otherRaces ?? []) if (o.date >= ws.weekStart && o.date <= last) items = aroundRace(items, o.date, ws.weekStart);
    items = gateAfterRace(items, rec, row);
    longest = Math.max(longest, ...items.filter((it) => it.type === "long").map((it) => it.km));
    any = Math.max(any, ...items.filter(isRun).map((it) => it.km));
    // A marathon plan's other race is a run of its distance: a half on the way counts as a long run done.
    if (track) for (const o of seed.otherRaces ?? []) if (o.distanceKm != null && o.date >= ws.weekStart && o.date <= last) { longest = Math.max(longest, o.distanceKm); any = Math.max(any, o.distanceKm); }
    return { weekStart: ws.weekStart, lighter: v.lighter, role: v.role, reentry: v.reentry, cap: v.cap, targetKm: v.km, items };
  });
}

/** The race week's one quality session: a few short reps that keep the legs sharp without tiring them. */
const RACE_SHARPEN: Thr = { reps: 4, min: 3, rest: 2 };
/** Days before the race the last quality session may be, and the most an easy run after the race may be. */
const RACE = { sharpenBefore: 3, afterKm: 5 } as const;

/**
 * The days around the race, whatever weekday it is on: nothing on race day or the day before, the last quality
 * session `RACE.sharpenBefore` days before or earlier (moved there when the day is free, else dropped), and only
 * short easy runs after it in the same week.
 */
function aroundRace(items: SuggestItem[], race: ISODate, weekStart: ISODate): SuggestItem[] {
  const before = addDays(race, -1), sharpenBy = addDays(race, -RACE.sharpenBefore);
  const taken = new Set(items.map((it) => it.date));
  const out: SuggestItem[] = [];
  for (const it of items) {
    if (it.date === race || it.date === before) continue;
    if (it.type === "threshold" && it.date > sharpenBy && it.date < race) {
      const to = [sharpenBy, addDays(sharpenBy, -1)].find((d) => !taken.has(d) && d >= weekStart);
      if (to) { taken.add(to); out.push({ ...it, date: to }); }
      continue;
    }
    if (it.date > race && daysBetween(race, it.date) < 7) {
      // Gym and other sport wait for the week after the race.
      if (!isTimed(it.type)) out.push({ date: it.date, type: "easy", km: Math.min(it.km, RACE.afterKm), durationMin: null, steps: null });
      continue;
    }
    out.push(it);
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const easyOf = (it: SuggestItem): SuggestItem => ({ date: it.date, type: "easy", km: it.km, durationMin: null, steps: null });

/**
 * The days after a race of 10 km+ (docs/decisions/fartlek-post-race-recovery.md): no running on days 1..restDays,
 * strides only from `strides`, threshold only from `thresholdShort` (moved later in the week when a later easy day can take it,
 * else run easy), a race-phase session only from `intervals`. Race day and the days before it are aroundRace's.
 */
export function gateAfterRace(items: SuggestItem[], rec: Pick<RecoveryRace, "date"> | null, row: RecoveryRow | null): SuggestItem[] {
  if (!rec || !row) return items;
  const d = (it: SuggestItem) => daysBetween(rec.date, it.date);
  const out: SuggestItem[] = [];
  for (const it of items) {
    if (d(it) <= 0) { out.push(it); continue; }
    if (d(it) <= row.restDays && it.type !== "cross") continue;
    let x = it;
    // A race-phase session waits for the intervals gate: a long one becomes a plain long run, a quality one an easy run.
    if (x.blueprint && d(x) < row.intervals) x = x.type === "long" ? { date: x.date, type: "long", km: x.km, durationMin: null, steps: null } : easyOf(x);
    if (x.type === "easy" && stridesOf(x.steps) && d(x) < row.strides) x = { ...x, steps: null };
    out.push(x);
  }
  // A threshold session before its gate swaps days with the latest easy run that may have it, else is run easy.
  for (let k = 0; k < out.length; k++) {
    const it = out[k];
    if (it.type !== "threshold" || d(it) <= 0 || d(it) >= row.thresholdShort) continue;
    const j = out.map((x, idx) => ({ x, idx })).filter(({ x }) => x.type === "easy" && d(x) >= row.thresholdShort).map(({ idx }) => idx).at(-1);
    if (j == null) { out[k] = easyOf(it); continue; }
    const easy = out[j];
    out[j] = { ...it, date: easy.date };
    out[k] = { ...easy, date: it.date, ...(easy.type === "easy" && stridesOf(easy.steps) && d(it) < row.strides ? { steps: null } : {}) };
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

const evalOf = (seed: BlockSeed, weeks: PlannedWeek[]) => evaluateBlock(seed, weeks.map((w) => w.items));

/** Taper depths tried before an A race, shallow to deep: shares of the peak week for the taper week and the race week. */
const TAPER_DEPTHS: [number, number][] = [[0.8, 0.6], [0.75, 0.55], [0.7, 0.5], [0.65, 0.45], [0.6, 0.4], [0.55, 0.35]];

/** A build week is too hard: its deepest form is under the floor, or its km ramp is risky above what the runner has tolerated. */
const tooHard = (seed: BlockSeed, w: BlockWeekEval) =>
  w.lowPct < floorFor(seed) || ((w.acwr ?? 0) > COACH.rampRisk + 0.005 && w.km > seed.tolerance.km + 0.05);

/**
 * The block's km week by week, when the full ramp is too hard: each build week gets the largest km, up to what
 * the ramp aims at, that is not too hard given the weeks planned before it (bisection per week). A tired start
 * then costs the first week, not the whole block, so the block still rises. A week that is too hard at any km
 * (the runner is already deeper than the floor) keeps whichever of the lowest and the aimed km leaves the
 * shallower form, never a block of key sessions only.
 */
function fitWeeks(seed: BlockSeed, base: Shape): number[] {
  const kms: number[] = [];
  const weeksCount = seed.weeks;
  for (let i = 0; i < weeksCount; i++) {
    // The caps and aims for this week and after, from the weeks already fitted.
    const ahead = volumes(seed, base.scale, kms);
    const v = ahead[i];
    if (v.lighter || seed.fixedKm?.[i] != null) { kms.push(v.km); continue; }
    const later = ahead.slice(i + 1).map((a) => a.km);
    const week = (km: number) => evalOf(seed, weeksFor(seed, base, [...kms, km, ...later])).weeks[i];
    let lo = v.km * BLOCK.fit.minScale, hi = v.km;
    if (!tooHard(seed, week(hi))) { kms.push(hi); continue; }
    if (tooHard(seed, week(lo))) {
      // Nothing helps: keep the shallower of the aimed km and a modest cut, never a collapse.
      const cut = v.km * BLOCK.fit.stuckScale;
      kms.push(week(cut).lowPct > week(hi).lowPct ? floorHalf(cut) : hi);
      continue;
    }
    for (let k = 0; k < BLOCK.fit.steps; k++) {
      const mid = (lo + hi) / 2;
      if (tooHard(seed, week(mid))) hi = mid; else lo = mid;
    }
    kms.push(floorHalf(lo));
  }
  return kms;
}

/**
 * Suggest the block: the weeks at their caps (or scaled to the goal), and a faster finish on the long runs
 * when the deepest week is calm (form above the build band, as a share of fitness),
 * or lighter weeks when it is too hard. Every try is kept for the "testing" animation.
 */
export function suggestBlock(seed: BlockSeed): BlockSuggestion {
  // Started from today: plan once to see what the first week comes to (run + the days left), then plan the weeks after it
  // from that, so a week whose first days were not run doesn't raise the caps after it as if it had been run in full.
  if (seed.done && seed.done.weekKm === undefined) {
    const first = suggestBlock({ ...seed, done: { ...seed.done, weekKm: null } });
    const w0 = first.weeks[0];
    const km = w0 ? r1(doneKmOf(seed) + weekKm(w0.items)) : null;
    return km != null && km < w0.targetKm - 0.5 ? suggestBlock({ ...seed, done: { ...seed.done, weekKm: km } }) : first;
  }
  // The block never starts bigger than the same engine plans that week on its own ("Föreslå veckan"): it backs off
  // after a jump, judged on the form the week starts with.
  if (seed.firstWeekMax === undefined) {
    const week = seed.weeks > 1 && seed.kmBefore.some((k) => k > 0) && isBuild(seed, 0)
      ? suggestBlock({ ...seed, weeks: 1, lighterLast: false, goalKm: null, fixedKm: seed.fixedKm?.slice(0, 1), firstWeekMax: null }).weeks[0].targetKm : null;
    return suggestBlock({ ...seed, firstWeekMax: week });
  }
  const tries: BlockTry[] = [];
  const t = seed.tolerance;
  tries.push({ id: "read", form: Math.round((seed.ctl - seed.atl) * 10) / 10, state: "info",
    params: { km: seed.kmBefore.at(-1) ?? 0, peak: t.peakKm, peakWeek: t.peakWeek ?? "", ago: t.weeksAgo, tol: t.km } });

  const maxKm = volumes(seed, 1).reduce((s, v) => s + v.km, 0);
  const goalAsked = seed.goalKm;
  const base: Shape = { scale: goalAsked != null && goalAsked < maxKm ? scaleFor(seed, goalAsked) : 1, tempo: false, second: 0, crossMin: 0 };
  const run = (id: BlockTryId, shape: Shape, params: BlockTry["params"] = {}, kms?: number[]) => {
    const weeks = weeksFor(seed, shape, kms);
    const e = evalOf(seed, weeks);
    tries.push({ id, form: e.deepest?.form ?? null, state: e.state, params: { km: e.km, weeks: e.weeks.map((w) => w.km).join(" → "), ...params } });
    return { weeks, e, shape };
  };
  const finish = (id: BlockTryId, chosen: { weeks: PlannedWeek[]; e: BlockEval; shape: Shape }): BlockSuggestion => {
    // The last two build weeks may aim deep inside the form band; if race-day form then leaves its window, the plain weeks stay.
    const deep = deepen(chosen);
    if (deep) {
      tries.push({ id: "deep", form: deep.e.deepest?.form ?? null, state: deep.e.state, params: { km: deep.e.km, weeks: deep.e.weeks.map((w) => w.km).join(" → ") } });
      const fit = taperFit(deep);
      const f = fit.e.race?.form;
      if (f != null && f >= COACH.race.low && f <= COACH.race.high) return finished(id, fit);
    }
    return finished(id, taperFit(chosen));
  };
  /**
   * The race phase's deep aim (docs/decisions/fartlek-race-specific-phase.md): the two build weeks right before the first taper
   * week get the largest km, between the planned km and the week's cap, whose deepest form is `RACE_PHASE.deepAim` or higher and is
   * not too hard, so the taper has more to bring back. No guard changes: the cap, the floor and the ramp stay what they were. A
   * week already deeper than the aim at its planned km is left alone. Null when nothing is deeper, or with back-off or injury.
   */
  const deepen = (r: { weeks: PlannedWeek[]; e: BlockEval; shape: Shape }) => {
    const ph = seed.phase;
    if (!ph || ph.backOff || ph.injury || seed.race?.priority !== "A") return null;
    const taper = r.weeks.findIndex((w) => w.role === "taper");
    const idx = [taper - 2, taper - 1].filter((i) => i >= 0 && r.weeks[i].role === "build");
    if (taper < 0 || !idx.length) return null;
    const kms = r.weeks.map((w) => (w.role === "build" || w.role === "lighter" ? w.targetKm : undefined)) as number[];
    let changed = false;
    for (const i of idx) {
      const week = (km: number) => evalOf(seed, weeksFor(seed, r.shape, kms.map((k, j) => (j === i ? km : k)))).weeks[i];
      const fits = (km: number) => { const w = week(km); return w.lowPct >= RACE_PHASE.deepAim && !tooHard(seed, w); };
      let lo = kms[i], hi = r.weeks[i].cap;
      if (hi <= lo || !fits(lo)) continue;
      if (fits(hi)) lo = hi;
      else for (let k = 0; k < BLOCK.fit.steps; k++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; }
      const km = floorHalf(lo);
      if (km > kms[i]) { kms[i] = km; changed = true; }
    }
    if (!changed) return null;
    const weeks = weeksFor(seed, r.shape, kms);
    return { weeks, e: evalOf(seed, weeks), shape: r.shape };
  };
  /**
   * Before an A race: the taper's depth that lands race-day form in `COACH.race`, tried from shallow to deep on the
   * chosen build weeks (the Bosquet range, about −40 to −60 % over the two weeks); the closest when none does, and the
   * `TUNE.taper` shares when race-day form can't be simulated.
   */
  const taperFit = (r: { weeks: PlannedWeek[]; e: BlockEval; shape: Shape }) => {
    if (seed.race?.priority !== "A" || !r.weeks.some((w) => w.role === "taper" || w.role === "race")) return r;
    const kms = r.weeks.map((w) => (w.role === "build" || w.role === "lighter" ? w.targetKm : undefined)) as number[];
    const at = (first: number, race: number) => {
      const sd = { ...seed, taper: { first, race } };
      const weeks = weeksFor(sd, r.shape, kms);
      return { weeks, e: evalOf(sd, weeks), shape: r.shape };
    };
    // How far a race-day form is from the window (0 inside it).
    const miss = (f: number) => (f < COACH.race.low ? COACH.race.low - f : f > COACH.race.high ? f - COACH.race.high : 0);
    let closest: { x: ReturnType<typeof at>; miss: number } | null = null;
    for (const [first, race] of TAPER_DEPTHS) {
      const x = at(first, race);
      const f = x.e.race?.form;
      if (f == null) break;
      const inside = miss(f) === 0;
      tries.push({ id: "taper", form: f, state: inside ? "ok" : f < COACH.race.low ? "over" : "under", params: { first: Math.round(first * 100), race: Math.round(race * 100) } });
      if (inside) return x;
      if (!closest || miss(f) < closest.miss) closest = { x, miss: miss(f) };
      if (f > COACH.race.high) break;
    }
    // None lands inside: the depth that came closest; the TUNE shares when race-day form can't be simulated.
    return closest?.x ?? at(tune().taper.first, tune().taper.race);
  };
  const finished = (id: BlockTryId, r: { weeks: PlannedWeek[]; e: BlockEval }): BlockSuggestion => ({
    weeks: r.weeks, eval: r.e, tries, chosen: id, goalKm: r.e.km, shortBy: goalAsked != null ? Math.max(0, r1(goalAsked - r.e.km)) : 0,
    phaseWarnings: seed.phase ? phaseWarnings(r.weeks.map((w) => ({ weekStart: w.weekStart, build: w.role === "build", km: weekKm(w.items),
      longKm: w.items.filter((it) => it.type === "long").reduce<number | null>((m, it) => (m == null || it.km > m ? it.km : m), null) })), seed.phase) : null,
  });

  const noHistory = !seed.kmBefore.some((k) => k > 0);
  const first = run(noHistory ? "start" : goalAsked != null ? "goal" : "volume", base, goalAsked != null ? { goal: goalAsked } : {});
  if (first.e.state === "ok" || noHistory) return finish(noHistory ? "start" : goalAsked != null ? "goal" : "volume", first);

  if (first.e.state === "over") {
    // Week by week: each build week as big as its form allows (see fitWeeks), so the block still rises.
    const kms = fitWeeks(seed, base);
    const aimed = volumes(seed, base.scale).reduce((a, v) => a + v.km, 0);
    return finish("lighter", run("lighter", base, { pct: Math.max(0, Math.round((1 - kms.reduce((a, k) => a + k, 0) / aimed) * 100)) }, kms));
  }

  // Calm (deepest form above the build band): a faster finish on the long runs, and that's it. Form is a
  // guard, not a target (docs/decisions/fartlek-form-relative.md): the volume rules decide the load.
  const bestId: BlockTryId = goalAsked != null ? "goal" : "volume";
  if (seed.tempoPace) {
    const r = run("tempo", { ...base, tempo: true }, { pace: Math.round(seed.tempoPace) });
    if (r.e.state !== "over") return finish("tempo", r);
  }
  return finish(bestId, first);
}

/** Run km of a week's items. */
export const weekKm = (items: SuggestItem[]) => r1(items.filter(isRun).reduce((s, it) => s + it.km, 0));

/** "Add a run day" for a suggested block (nextweek.ts `daysAdvice`): null when the days it has will do. */
export const blockDaysAdvice = (seed: BlockSeed, weeks: PlannedWeek[]) => {
  // Judged on whole weeks: a first week started from today plans only the days ahead, and no added day changes the days that are over.
  const whole = seed.done ? { ...seed, done: null } : seed;
  // Doubles are offered when the runner gyms and hasn't allowed them yet (docs/decisions/fartlek-gym-cross-days.md).
  const x = whole.extra;
  const doublesTrial = x?.gym.length && (x.doubles ?? "off") === "off" ? () => suggestBlock({ ...whole, extra: { ...x, doubles: "gym" } }).weeks : undefined;
  return daysAdvice(whole.runDays, whole.longRunDay, weeks, (runDays) => suggestBlock({ ...whole, runDays }).weeks, { blocked: extraDaysOf(x), doublesTrial });
};

/* ---------- "Föreslå veckan": the same engine with one week ---------- */

/** A week seed as a one-week block: the runner's own target is a fixed week, a lighter week due is a lighter first week. */
export function weekAsBlock(seed: WeekSeed): BlockSeed {
  // Without a measured tolerance, what the weeks before show.
  const tol = seed.toleranceKm ?? Math.max(0, ...seed.kmBefore);
  return {
    startWeek: seed.weekStart, weeks: 1, ctl: seed.ctl, atl: seed.atl, kmBefore: seed.kmBefore, past: seed.past,
    tolerance: { km: tol, peakKm: tol, peakWeek: null, weeksAgo: 0 },
    runDays: seed.runDays, longRunDay: seed.longRunDay, threshold: seed.threshold, refs: seed.refs, crossMin: seed.crossMin,
    ...(seed.extra ? { extra: seed.extra } : {}),
    lighterLast: false, goalKm: null, lighterFirst: !!seed.backoff, lighterFirstWhy: seed.backoffWhy ?? null, buildWeeksDone: 0, hardBefore: !!seed.hardBefore,
    longestKm: seed.longestKm, rung: seed.rung, tempoPace: seed.tempoPace ?? null, firstWeekMax: null,
    fixedKm: [seed.targetKm ?? null],
    ...(seed.phase ? { phase: seed.phase } : {}),
    // A recovery week due takes over from a lighter week due (docs/decisions/fartlek-post-race-recovery.md).
    ...(seed.recovery ? { recovery: seed.recovery, ...(recoveryRoles(seed.recovery, seed.weekStart, 1)[0] ? { roles: ["recovery"] as WeekRole[] } : {}) } : {}),
  };
}

/**
 * "Föreslå veckan": the block engine planning one week, so a week and a block can never disagree. The engine's tries
 * become the week dialog's lines, and the week gets its "why" line.
 */
export const suggestWeek = (seed: WeekSeed): Suggestion => asWeekSuggestion(seed, suggestBlock(weekAsBlock(seed)));

/** The engine's one-week plan in the week dialog's shape; `clipped` when the range left out some of its days (planrange.ts). */
export function asWeekSuggestion(seed: WeekSeed, s: BlockSuggestion, clipped?: { items: SuggestItem[]; eval: WeekEval }): Suggestion {
  const w = clipped ? { ...s.weeks[0], items: clipped.items } : s.weeks[0];
  const e = clipped?.eval ?? s.eval.weeks[0];
  const history = seed.kmBefore.some((k) => k > 0);
  const lighter = !!seed.backoff;
  const gb = growthBase(seed.kmBefore).base;
  const idOf = (id: BlockTryId): TryId =>
    seed.targetKm != null ? "target" : lighter && history ? "backoff" : id === "start" ? "start" : id === "tempo" ? "tempo" : id === "lighter" ? "lighter" : "volume";
  // A faster finish the long run is too short for changes nothing: shown as skipped, as the week dialog always did.
  const longItem = w.items.find((it) => it.type === "long");
  const tempoUsed = !!longItem?.steps;
  const tries: Try[] = s.tries.filter((tr) => tr.id !== "read").map((tr) => {
    const km = typeof tr.params.km === "number" ? tr.params.km : w.targetKm;
    const id = idOf(tr.id);
    if (id === "tempo" && !tempoUsed) return { id, km, form: null, state: "skip" as const, params: { why: longItem ? "short" : "noLong" } };
    const params: Try["params"] = id === "tempo" ? { pace: tr.params.pace ?? 0 }
      : id === "lighter" ? { pct: tr.params.pct ?? 0 }
      : id === "backoff" ? { pct: Math.round((1 - tune().lighter.volume) * 100), why: seed.backoffWhy ?? "form", formPct: Math.round(formPct(seed.ctl - seed.atl, seed.ctl)) }
      : { pct: gb ? Math.round((km / gb - 1) * 100) : 0 };
    return { id, km, form: tr.form ?? e.low, state: tr.state === "info" ? "ok" : tr.state, params };
  });
  // The ladder session, not a race-phase one (tagged, typed threshold, placed first).
  const thrItem = w.items.find((it) => it.type === "threshold" && !it.blueprint);
  const reps = thrItem ? thresholdReps(thrItem.steps) : null;
  const thr: Thr | null = reps ? { reps: reps.reps, min: Math.round(reps.min), rest: 2 } : null;
  const at = !lighter && thr ? NEXT.ladder.findIndex((x) => x.reps === thr.reps && x.min === thr.min) : -1;
  const why = whyOf(w.items, longRun(seed.longestKm, lighter, seed.refs.easyPace), thr, at >= 0 ? at : null);
  why.moreDays = daysOf(seed).slots.length < NEXT.moreDays && e.km >= NEXT.moreDaysKm;
  why.reentryKm = w.reentry ? seed.toleranceKm ?? null : null;
  return {
    items: w.items, targetKm: w.targetKm, eval: e, tries, chosen: s.chosen === "tempo" && !tempoUsed ? idOf("volume") : idOf(s.chosen),
    before: { km: r1(seed.kmBefore.at(-1) ?? 0), tsb: r1(seed.ctl - seed.atl) }, why,
  };
}
