import { addDays, daysBetween, type ISODate } from "./dates";
import { COACH, crossLoadPerDay, itemLoad } from "./coach";
import { build, daysAdvice, type BackoffWhy, daysOf, type Shape as WeekShape, evaluate, growthBase, longFor, longRun, NEXT, weekCapWith, rung, spikeMax, thresholdReps, whyOf, withinQuality, type PastWeek, type Suggestion, type SuggestItem, type Thr, type Try, type TryId, type WeekEval, type WeekSeed, type WeekState } from "./nextweek";
import type { StepRefs } from "./steps";
import type { Threshold } from "./types";
import { tune } from "./tuning";
import { blueprintById, blueprintTag, compileSlot, phaseWeekFor, type BlueprintId, type PhaseSlot } from "./blueprints";
import { phaseWarnings, RACE_PHASE, type PhaseSeed, type PhaseWarnings } from "./racephase";
import { formPct } from "./load";

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
  /** An A or B race this many days before the start: recover before a block is suggested. */
  afterRaceDays: 14,
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
  /** The taper's depth, as shares of the peak week (first taper week, race week); set by the search in `suggestBlock`. */
  taper?: { first: number; race: number };
  /** The race-specific phase, when an A marathon or half is within 8 weeks of one of the weeks. */
  phase?: PhaseSeed;
}

/**
 * What a week is for. `build` and `lighter` as in any block; before a race, `taper` (the week before the race week)
 * and `race` (the week the race is in). A taper is not a lighter week: it cuts deeper, keeps the run days and a few
 * short fast reps, and the two are never stacked.
 */
export type WeekRole = "build" | "lighter" | "taper" | "race";

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

export type BlockTryId = "read" | "start" | "volume" | "goal" | "lighter" | "tempo" | "second" | "cross" | "taper";
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
const isRun = (it: SuggestItem) => it.type !== "cross";

/** The week engine's seed for week `i`, starting from where the weeks before it ended. */
function weekSeedOf(seed: BlockSeed, i: number, ctl: number, atl: number, kmBefore: number[], hardBefore: boolean, longestKm = seed.longestKm): WeekSeed {
  return {
    weekStart: addDays(seed.startWeek, i * 7), ctl, atl, kmBefore: kmBefore.slice(-3), past: [],
    runDays: seed.runDays, longRunDay: seed.longRunDay, threshold: seed.threshold, refs: seed.refs,
    crossMin: seed.crossMin, targetKm: null, backoff: false, hardBefore,
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
export function evaluateBlock(seed: BlockSeed, weeks: SuggestItem[][]): BlockEval {
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

interface Volume { km: number; cap: number; reentry: boolean; lighter: boolean; role: WeekRole }

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
  const anchor = Math.max(seed.tolerance.km, NEXT.startKm);
  const out: Volume[] = [];
  let built = 0;
  for (let i = 0; i < seed.weeks; i++) {
    const role = roleOf(seed, i);
    const lighter = role !== "build";
    let v: Volume;
    if (role === "taper" || role === "race") {
      // A share of the peak: the biggest build week planned (or run) before it. A B race week keeps a share of a normal week.
      const peak = Math.max(0, ...out.filter((x) => x.role === "build").map((x) => x.km), ...(out.some((x) => x.role === "build") ? [] : window.slice(-3)));
      const prev = out.at(-1)?.km ?? window.at(-1) ?? 0;
      const share = role === "taper" ? seed.taper?.first ?? tune().taper.first
        : seed.race?.priority === "B" ? tune().taper.bRace : seed.taper?.race ?? tune().taper.race;
      const base = seed.race?.priority === "B" && role === "race" ? prev : peak;
      v = { km: fixed[i] ?? floorHalf(base * share), cap: base, reentry: false, lighter, role };
    } else if (lighter) {
      const prev = out.at(-1)?.km ?? window.at(-1) ?? 0;
      v = { km: fixed[i] ?? floorHalf(prev * tune().lighter.volume), cap: prev, reentry: false, lighter, role };
    } else {
      const { cap, reentry } = noHistory && !out.length ? { cap: NEXT.startKm, reentry: false } : blockWeekCap(window, seed.tolerance.km);
      // Where this build week sits on the ramp: 0 = first, 1 = last (a lone build week sits in the middle).
      const at = buildWeeks > 1 ? built / (buildWeeks - 1) : 0.5;
      const aim = anchor * (tune().ramp.from + (tune().ramp.to - tune().ramp.from) * at) * scale;
      // The first week is never bigger than the week button's suggestion: after a jump that one backs off.
      const first = i === 0 && seed.firstWeekMax != null ? seed.firstWeekMax : Infinity;
      v = { km: fixed[i] ?? floorHalf(Math.min(cap, aim, first)), cap: r1(Math.min(cap, first)), reentry, lighter, role };
      built++;
    }
    out.push(v);
    window.push(v.km);
  }
  return out;
}

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
  let longest = seed.longestKm, any = seed.longestKm;
  // The race phase's blueprints step on along the plan: one step each time a full session is planned (a held one never advances).
  const steps: Record<string, number> = { ...(seed.phase?.steps ?? {}) };
  let ladderUsed = 0;
  return vols.map((v, i) => {
    const ws = weekSeedOf(seed, i, 0, 0, [], false);
    const phase = seed.phase && v.role !== "race" ? phaseWeekFor(seed.phase, ws.weekStart, seed.runDays, seed.longRunDay) : null;
    const long = longRun(longest, v.lighter, seed.refs.easyPace, any);
    const longKm = long ? longFor(long.km, v.km, longest, v.lighter) : null;
    const maxKm = any > 0 ? spikeMax(any) : null;
    // The phase's sessions: a held one (a share of the step) only in a lighter or taper week; where the week or the day can't hold the
    // blueprint (or its fallback) the plain session of the week stays instead, so the runner always gets a week.
    let thr: Thr[];
    let phased: WeekShape["phase"];
    if (phase && seed.phase) {
      const stepOf = (id: BlueprintId) => steps[id] ?? 0;
      const ctx = { weekKm: v.km, maxKm, paces: seed.phase.paces };
      const item = (c: NonNullable<ReturnType<typeof compileSlot>>) => {
        if (!c.held) steps[c.id] = Math.min(c.step + 1, blueprintById(c.id).steps.length - 1);
        return { steps: c.steps, blueprint: blueprintTag(c.id, c.step, c.held) };
      };
      const slot = (x: PhaseSlot | null) => (x && v.role === "build" && x.held != null ? { ...x, held: undefined } : x);
      const lSlot = slot(phase.long), qSlot = slot(phase.quality);
      const l = lSlot && longKm != null ? compileSlot(lSlot, stepOf, { ...ctx, longKm }) : null;
      const q = qSlot ? compileSlot(qSlot, stepOf, ctx) : null;
      phased = { long: l ? item(l) : null, quality: q ? [{ ...item(q), ...(qSlot?.day ? { date: qSlot.day } : {}) }] : [] };
      // A quality session of the phase takes the threshold session's place, the ladder stays as a third from `highKm` a week.
      const third = v.role === "build" && v.km >= RACE_PHASE.highKm && daysOf(ws).slots.length >= NEXT.secondMinDays;
      if (q || !qSlot && !phase.quality) thr = third ? [rung(seed.rung + ladderUsed++)] : [];
      else thr = v.lighter ? [{ ...NEXT.lighterThr }] : [rung(seed.rung + ladderUsed++)];
    } else if (v.role === "race") thr = [{ ...RACE_SHARPEN }];
    else if (v.lighter) thr = [{ ...NEXT.lighterThr }];
    else {
      const main = rung(seed.rung + buildIdx[i]);
      // A second session in the last `second` build weeks, deepest first.
      thr = buildIdx[i] >= builds - shape.second ? [main, { ...NEXT.second }] : [main];
    }
    const tempo = shape.tempo && !v.lighter && thr.length === 1 && !phase ? seed.tempoPace : null;
    const built = build(ws, { km: v.km, longKm, tempo, thr: withinQuality(thr, v.km, seed.refs), crossMin: v.lighter ? 0 : shape.crossMin,
      maxKm, ...(phased ? { phase: phased } : {}) });
    const items = seed.race ? aroundRace(built, seed.race.date, ws.weekStart) : built;
    longest = Math.max(longest, ...items.filter((it) => it.type === "long").map((it) => it.km));
    any = Math.max(any, ...items.filter(isRun).map((it) => it.km));
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
      if (it.type !== "cross") out.push({ date: it.date, type: "easy", km: Math.min(it.km, RACE.afterKm), durationMin: null, steps: null });
      continue;
    }
    out.push(it);
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
    const r = taperFit(chosen);
    return finished(id, r);
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
export const blockDaysAdvice = (seed: BlockSeed, weeks: PlannedWeek[]) =>
  daysAdvice(seed.runDays, seed.longRunDay, weeks, (runDays) => suggestBlock({ ...seed, runDays }).weeks);

/* ---------- "Föreslå veckan": the same engine with one week ---------- */

/** A week seed as a one-week block: the runner's own target is a fixed week, a lighter week due is a lighter first week. */
export function weekAsBlock(seed: WeekSeed): BlockSeed {
  // Without a measured tolerance, what the weeks before show.
  const tol = seed.toleranceKm ?? Math.max(0, ...seed.kmBefore);
  return {
    startWeek: seed.weekStart, weeks: 1, ctl: seed.ctl, atl: seed.atl, kmBefore: seed.kmBefore, past: seed.past,
    tolerance: { km: tol, peakKm: tol, peakWeek: null, weeksAgo: 0 },
    runDays: seed.runDays, longRunDay: seed.longRunDay, threshold: seed.threshold, refs: seed.refs, crossMin: seed.crossMin,
    lighterLast: false, goalKm: null, lighterFirst: !!seed.backoff, lighterFirstWhy: seed.backoffWhy ?? null, buildWeeksDone: 0, hardBefore: !!seed.hardBefore,
    longestKm: seed.longestKm, rung: seed.rung, tempoPace: seed.tempoPace ?? null, firstWeekMax: null,
    fixedKm: [seed.targetKm ?? null],
    ...(seed.phase ? { phase: seed.phase } : {}),
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
  const thrItem = w.items.find((it) => it.type === "threshold");
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
