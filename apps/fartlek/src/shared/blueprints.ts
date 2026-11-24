import { RACE_PHASE, type RacePaces } from "./racephase";
import type { StepDef, StepItem, StepTarget, WorkoutSteps } from "./steps";

/*
 * Blueprints of the race-specific phase (docs/decisions/fartlek-race-specific-phase.md, build plan).
 * Plain data that compiles to the WorkoutSteps the runner already sees: sizes are km, scaled to the runner's week
 * and long run when compiled. The file is versioned, diffed and tested like code.
 */

export type BlueprintId = "mp-long" | "progressive-long" | "fast-finish-long" | "mp-alternations" | "mp-tempo"
  | "dress-rehearsal" | "hmp-repeats" | "hmp-alternations" | "hmp-progressive-long" | "hmp-fast-finish-long";
export type PaceKey = "mp" | "hmp" | "steady" /* mp + 15 s */ | "mpFast" /* mp − 10 s */;
export type Off = "z2" | "jog" | "easy";
export type BpStep =
  | { kind: "block"; km: number; pace: PaceKey }
  | { kind: "reps"; times: number; onKm: number; off: Off; offKm?: number; offMin?: number; pace: PaceKey }
  | { kind: "finish"; segs: { km: number; pace: PaceKey }[] };
export interface Blueprint {
  id: BlueprintId; race: "marathon" | "half"; slot: "long" | "quality";
  /** The SuggestType it is planned as. */
  type: "long" | "threshold";
  /** Long slot only. */
  layout?: "middle" | "end";
  /** The progression, index 0..n. */
  steps: readonly BpStep[];
  /** First step when the tolerated km is at least `RACE_PHASE.highKm` (else 0). */
  entryHigh: number;
  caps: { workOfLong?: number; sessionOfWeek?: number; workOfWeek?: number };
  requires: { minWeekKm?: number; minLongKm?: number; minRunDays?: number };
  /** Used when `requires` fails; null = a plain easy long run. */
  fallback: BlueprintId | null;
  /** Easy km before (quality 2) and after (quality 1; middle-layout long 2) the work. */
  warmKm?: number; coolKm?: number;
}

const block = (km: number, pace: PaceKey): BpStep => ({ kind: "block", km, pace });
const reps = (times: number, onKm: number, off: Off, pace: PaceKey, offKm?: number, offMin?: number): BpStep =>
  ({ kind: "reps", times, onKm, off, pace, ...(offKm != null ? { offKm } : {}), ...(offMin != null ? { offMin } : {}) });
const finish = (...segs: [number, PaceKey][]): BpStep => ({ kind: "finish", segs: segs.map(([km, pace]) => ({ km, pace })) });
const alt = (times: number, km: number, pace: PaceKey) => reps(times, km, "z2", pace, km);

export const BLUEPRINTS: readonly Blueprint[] = [
  // Marathon
  {
    id: "mp-long", race: "marathon", slot: "long", type: "long", layout: "middle",
    steps: [8, 12, 16, 18, 20].map((km) => block(km, "mp")), entryHigh: 1,
    caps: { workOfLong: 0.6 }, requires: { minLongKm: 14 }, fallback: "fast-finish-long", coolKm: 2,
  },
  {
    id: "progressive-long", race: "marathon", slot: "long", type: "long", layout: "end",
    steps: [3, 4, 5, 6].map((km) => finish([km, "steady"], [km, "mp"])), entryHigh: 1,
    caps: { workOfLong: 0.5 }, requires: {}, fallback: null,
  },
  {
    id: "fast-finish-long", race: "marathon", slot: "long", type: "long", layout: "end",
    steps: [3, 4, 5, 6, 8].map((km) => finish([km, "mpFast"])), entryHigh: 1,
    caps: { workOfLong: 0.25 }, requires: {}, fallback: null,
  },
  {
    id: "mp-alternations", race: "marathon", slot: "quality", type: "threshold",
    steps: [alt(2, 2, "hmp"), alt(2, 3, "hmp"), alt(3, 2, "hmp"), alt(3, 3, "hmp"), alt(4, 3, "hmp")], entryHigh: 1,
    caps: { sessionOfWeek: 0.3 }, requires: { minWeekKm: 35 }, fallback: "mp-tempo",
  },
  {
    id: "mp-tempo", race: "marathon", slot: "quality", type: "threshold",
    steps: [block(6, "mp"), block(8, "mp"), reps(2, 5, "easy", "mp", 1), block(10, "mp"), reps(2, 6, "easy", "mp", 1),
      block(12, "mp"), reps(2, 8, "easy", "mp", 1)], entryHigh: 2,
    caps: { workOfWeek: 0.25 }, requires: {}, fallback: null,
  },
  {
    // One session, no progression: the second step is the same session for a runner at 60 km a week or more.
    id: "dress-rehearsal", race: "marathon", slot: "quality", type: "threshold",
    steps: [block(8, "mp"), block(10, "mp")], entryHigh: 1,
    caps: {}, requires: {}, fallback: null,
  },
  // Half
  {
    id: "hmp-repeats", race: "half", slot: "quality", type: "threshold",
    steps: [[3, 2], [4, 2], [3, 3], [5, 2], [4, 3], [3, 4], [2, 6]].map(([n, km]) => reps(n, km, "jog", "hmp", undefined, 2)), entryHigh: 2,
    caps: { workOfWeek: 0.2 }, requires: {}, fallback: null,
  },
  {
    id: "hmp-alternations", race: "half", slot: "quality", type: "threshold",
    steps: [alt(4, 1, "hmp"), alt(5, 1, "hmp"), alt(6, 1, "hmp"), reps(4, 2, "z2", "hmp", 1), reps(5, 2, "z2", "hmp", 1)], entryHigh: 1,
    caps: { sessionOfWeek: 0.3 }, requires: { minWeekKm: 30 }, fallback: "hmp-repeats",
  },
  {
    id: "hmp-progressive-long", race: "half", slot: "long", type: "long", layout: "end",
    steps: [[2, 2], [3, 2], [3, 3], [4, 3], [4, 4]].map(([a, b]) => finish([a, "mp"], [b, "hmp"])), entryHigh: 1,
    caps: { workOfLong: 0.45 }, requires: {}, fallback: null,
  },
  {
    id: "hmp-fast-finish-long", race: "half", slot: "long", type: "long", layout: "end",
    steps: [2, 3, 4, 5].map((km) => finish([km, "hmp"])), entryHigh: 1,
    caps: { workOfLong: 0.25 }, requires: {}, fallback: null,
  },
];

export const blueprintById = (id: BlueprintId): Blueprint => BLUEPRINTS.find((b) => b.id === id)!;

/* ---------- Schedule ---------- */

/** One slot of a phase week: a blueprint, `held` (a share of the step's size, in a lighter or taper week), `daysOut` (the day to place it). */
export interface PhaseSlot { id: BlueprintId; held?: number; daysOut?: number }
/** The long run and the quality session of a week; null is an easy long run / no phase session. */
export interface PhaseWeek { long: PhaseSlot | null; quality: PhaseSlot | null }

const wk = (long: BlueprintId | null, quality: PhaseSlot | BlueprintId | null): PhaseWeek =>
  ({ long: long ? { id: long } : null, quality: typeof quality === "string" ? { id: quality } : quality });

/**
 * The blueprint of each slot by `wip`, the weeks in phase: `floor(days from week start to race / 7) + 1`, so the race
 * week is 1. W1 is the race week as today (the sharpener). A phase shorter than 8 weeks uses the bottom rows.
 */
export const PHASE_SCHEDULE: Record<"marathon" | "half", Record<number, PhaseWeek>> = {
  marathon: {
    8: wk("progressive-long", "mp-tempo"),
    7: wk("mp-long", "mp-alternations"),
    6: wk("fast-finish-long", "mp-tempo"), // first 30–32 km chance
    5: wk(null, { id: "mp-tempo", held: 0.7 }), // lighter
    4: wk("fast-finish-long", "mp-alternations"), // deep; second 30–32 km chance
    3: wk("mp-long", "mp-tempo"), // deep; peak MP
    2: wk(null, { id: "dress-rehearsal", daysOut: 10 }), // taper; run day nearest race − 10 (race − 13 to − 9)
    1: wk(null, null),
  },
  half: {
    8: wk("hmp-progressive-long", "hmp-repeats"),
    7: wk("hmp-fast-finish-long", "hmp-alternations"),
    6: wk("hmp-progressive-long", "hmp-repeats"),
    5: wk(null, { id: "hmp-repeats", held: 0.7 }), // lighter
    4: wk("hmp-fast-finish-long", "hmp-alternations"), // deep
    3: wk("hmp-progressive-long", "hmp-repeats"), // deep
    2: wk(null, { id: "hmp-repeats", held: 0.6 }), // taper
    1: wk(null, null),
  },
};

/* ---------- Compiling ---------- */

export interface CompileCtx {
  /** The long run's total km (long slot). */
  longKm?: number;
  weekKm: number;
  /** The most km the day may hold; null when unbounded. */
  maxKm: number | null;
  paces: RacePaces;
  /** Run days in the week, for `requires.minRunDays`; not checked when missing. */
  runDays?: number;
}

/** Longest easy lead of a long run's work, shortest allowed, and the shortest work of a scaled-down quality session. */
const MIN_EASY_KM = 3, MIN_QUALITY_WORK_KM = 3;
/** What a jog of a given length covers, for a session's size only (the runner jogs by feel). */
const JOG_KM_PER_MIN = 0.15;
/** Without a pace source MP trains by feel in zone 3 and HMP in zone 4 (steady and fast-MP stay with MP). */
const FALLBACK_ZONE: Record<PaceKey, number> = { mp: 3, hmp: 4, steady: 3, mpFast: 3 };

const r05 = (x: number) => Math.floor(x * 2 + 1e-9) / 2;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** The step to enter the progression at: the high entry for a runner who tolerates `RACE_PHASE.highKm` or more. */
export const entryStep = (bp: Blueprint, toleratedKm: number): number => (toleratedKm >= RACE_PHASE.highKm ? bp.entryHigh : 0);

export function meetsRequires(bp: Blueprint, c: CompileCtx): boolean {
  const r = bp.requires;
  if (r.minWeekKm != null && c.weekKm < r.minWeekKm) return false;
  if (r.minLongKm != null && !(c.longKm != null && c.longKm >= r.minLongKm)) return false;
  if (r.minRunDays != null && c.runDays != null && c.runDays < r.minRunDays) return false;
  return true;
}

/** Km at the session's paces (the reps' on part, or the block or finish). */
const workKm = (s: BpStep): number =>
  s.kind === "block" ? s.km : s.kind === "reps" ? s.times * s.onKm : s.segs.reduce((a, g) => a + g.km, 0);
/** Km of the whole work part, off parts between reps included. */
const partKm = (s: BpStep): number =>
  s.kind === "reps" ? s.times * s.onKm + (s.times - 1) * (s.offKm ?? (s.offMin ?? 0) * JOG_KM_PER_MIN) : workKm(s);

/** A step with every size scaled by `f` and rounded down to the half kilometre (at least half a kilometre). */
function scaled(s: BpStep, f: number): BpStep {
  const k = (x: number) => Math.max(0.5, r05(x * f));
  if (s.kind === "block") return { ...s, km: k(s.km) };
  if (s.kind === "reps") return { ...s, onKm: k(s.onKm), ...(s.offKm != null ? { offKm: k(s.offKm) } : {}) };
  return { ...s, segs: s.segs.map((g) => ({ ...g, km: k(g.km) })) };
}

function targetFor(pace: PaceKey, p: RacePaces): StepTarget {
  const base = pace === "hmp" ? p.hmp : p.mp;
  if (base == null) return { kind: "zone", zone: FALLBACK_ZONE[pace] };
  const off = pace === "steady" ? 15 : pace === "mpFast" ? -10 : 0;
  return { kind: "pace", secPerKm: Math.round(base + off) };
}

const OFF_TARGET: Record<Off, StepTarget> = { z2: { kind: "zone", zone: 2 }, jog: { kind: "jog" }, easy: { kind: "easy" } };
const easyStep = (km: number): StepItem => ({ kind: "step", step: { km: r3(km), target: { kind: "easy" } } });

function workItems(s: BpStep, p: RacePaces): StepItem[] {
  if (s.kind === "block") return [{ kind: "step", step: { km: s.km, target: targetFor(s.pace, p) } }];
  if (s.kind === "finish") return s.segs.map((g) => ({ kind: "step", step: { km: g.km, target: targetFor(g.pace, p) } }));
  const rest: StepDef = s.offKm != null ? { km: s.offKm, target: OFF_TARGET[s.off] } : { min: s.offMin ?? 1, target: OFF_TARGET[s.off] };
  return [{ kind: "repeat", times: s.times, work: { km: s.onKm, target: targetFor(s.pace, p) }, rest }];
}

/**
 * A blueprint's step as the workout's steps, scaled to the runner's week, or null when its `requires` fail (the
 * caller then plans `bp.fallback`) or nothing sensible fits. `step` is clamped to the progression; the step
 * returned is the one actually planned.
 *
 * Long slot: the total km is `longKm`, so the long-run ceiling and spike rule stay with the caller. The work is the
 * step's size, at most `workOfLong` of the run, rounded down to the half kilometre, and leaves at least 3 km easy.
 * Quality slot: warm-up, work and cool-down; a step that breaks `sessionOfWeek`, `workOfWeek` or `maxKm` is replaced
 * by the highest lower one that fits, else step 0 scaled down (never under 3 km of work).
 */
export function compileBlueprint(bp: Blueprint, step: number, c: CompileCtx): { steps: WorkoutSteps; step: number } | null {
  if (!meetsRequires(bp, c)) return null;
  const want = Math.max(0, Math.min(bp.steps.length - 1, Math.floor(step)));
  const wrap = (items: StepItem[]): WorkoutSteps => ({ v: 1, items });

  if (bp.slot === "long") {
    if (c.longKm == null) return null;
    const cool = bp.layout === "middle" ? (bp.coolKm ?? 2) : 0;
    const s = bp.steps[want];
    const allowed = r05(Math.min(workKm(s), (bp.caps.workOfLong ?? 1) * c.longKm, c.longKm - MIN_EASY_KM - cool));
    if (allowed <= 0) return null;
    const used = allowed < workKm(s) ? scaled(s, allowed / workKm(s)) : s;
    const lead = c.longKm - workKm(used) - cool;
    const items = [easyStep(lead), ...workItems(used, c.paces), ...(cool > 0 ? [easyStep(cool)] : [])];
    return { steps: wrap(items), step: want };
  }

  const warm = bp.warmKm ?? 2, cool = bp.coolKm ?? 1;
  const fits = (s: BpStep) =>
    (bp.caps.workOfWeek == null || workKm(s) <= bp.caps.workOfWeek * c.weekKm + 1e-9)
    && (bp.caps.sessionOfWeek == null || partKm(s) + warm + cool <= bp.caps.sessionOfWeek * c.weekKm + 1e-9)
    && (c.maxKm == null || partKm(s) + warm + cool <= c.maxKm + 1e-9);
  let at = want;
  while (at >= 0 && !fits(bp.steps[at])) at--;
  let used: BpStep | null = at >= 0 ? bp.steps[at] : null;
  if (!used) {
    at = 0;
    for (let f = 0.95; f >= 0.3 && !used; f -= 0.05) {
      const t = scaled(bp.steps[0], f);
      if (workKm(t) < MIN_QUALITY_WORK_KM) break;
      if (fits(t)) used = t;
    }
    if (!used) return null;
  }
  return { steps: wrap([easyStep(warm), ...workItems(used, c.paces), easyStep(cool)]), step: at };
}
