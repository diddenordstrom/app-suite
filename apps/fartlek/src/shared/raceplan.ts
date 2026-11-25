import { addDays, daysBetween, type ISODate } from "./dates";
import { projectVolumes, raceChunks, RECOVERY, recoveryRoles, recoveryRow, withRecovery, type BlockSeed, type RecoveryRace, type Tolerance, type WeekRole } from "./blockplan";
import { longFor, longRun, NEXT } from "./nextweek";
import { TAPER_WEEKS } from "./blocks";
import { RACE_PHASE, wipOf } from "./racephase";
import { HALF_M, MARATHON_M } from "./racemodels";
import type { BlockKind } from "./types";
import type { StepRefs } from "./steps";

/*
 * The race plan (docs/decisions/fartlek-race-plan-skeleton.md): for an A marathon or half, a skeleton of typed weeks with a km
 * target each, from the next block to the end of the race's recovery. A cheap projection: `volumes()` per chunk and the long-run
 * ladder per week, never `suggestBlock`, `weeksFor`, `evaluateBlock` or `fitWeeks`. Sessions are still made one block at a time.
 */

export type RaceKind = "marathon" | "half";
export type PlanPhase = "base" | "build" | "specific" | "taper" | "race" | "recovery";
export const PLAN_PHASES: readonly PlanPhase[] = ["base", "build", "specific", "taper", "race", "recovery"];

/** The race plan. Not in TUNE: the window and minimums are structure, the long-run hold an injury guard. */
export const RACE_PLAN = {
  /** An A race of this kind this many weeks away (race week included) or closer gets a plan. */
  windowWeeks: { marathon: 30, half: 20 } as Record<RaceKind, number>,
  /** The taper week and the race week. */
  taperWeeks: TAPER_WEEKS,
  phases: {
    marathon: { anchor: 20, specific: [4, 6], build: [6, 8], baseMin: 2, minWeeks: 12, ideal: [16, 18] },
    half: { anchor: 8, specific: [2, 4], build: [3, 5], baseMin: 1, minWeeks: 8, ideal: [10, 12] },
  } as Record<RaceKind, { anchor: number; specific: [number, number]; build: [number, number]; baseMin: number; minWeeks: number; ideal: [number, number] }>,
  /** The long run reaches its peak by `by` weeks to the race (wip) and is held, not raised, in build weeks from `holdFrom` to `holdTo`. */
  longPeak: { marathon: { by: 6, holdFrom: 5, holdTo: 3 }, half: { by: 4, holdFrom: 3, holdTo: 3 } } as Record<RaceKind, { by: number; holdFrom: number; holdTo: number }>,
  /** Days in a row without a run: up to `absorbDays` nothing changes; more makes the first week back at most `share` of the plan. */
  back: { absorbDays: 7, share: 0.7 },
} as const;

/** Marathon or half within 1 km; null for any other distance. */
export const raceKindOf = (km: number): RaceKind | null =>
  Math.abs(km - MARATHON_M / 1000) <= 1 ? "marathon" : Math.abs(km - HALF_M / 1000) <= 1 ? "half" : null;

/** Weeks to the race from `weekStart`, the race week being 1 (as `racePlanFor` and the race phase count). After the race: 0, −1, … */
export { wipOf };

const floorHalf = (n: number) => Math.floor(n * 2) / 2 + 0;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

export interface PhaseLengths { base: number; build: number; specific: number; taper: number }

function lengthsAt(n: number, p: (typeof RACE_PLAN.phases)[RaceKind]): PhaseLengths {
  const T = RACE_PLAN.taperWeeks, step = Math.floor((n - p.anchor) / 4);
  const specific = clamp(p.specific[0] + step, p.specific[0], p.specific[1]);
  const build = Math.min(clamp(p.build[0] + step, p.build[0], p.build[1]), n - T - specific - p.baseMin);
  return { base: n - T - specific - build, build, specific, taper: T };
}

/** Phase lengths for `n` weeks to the race (race week included): extra time into base; too little takes base, then build. */
export function phaseLengths(n: number, kind: RaceKind): PhaseLengths {
  const p = RACE_PLAN.phases[kind];
  if (n >= p.minWeeks) return lengthsAt(n, p);
  const r = lengthsAt(p.minWeeks, p);
  let cut = p.minWeeks - n;
  for (const k of ["base", "build", "specific"] as const) { const c = Math.min(cut, r[k]); r[k] -= c; cut -= c; }
  r.taper -= cut; // only when n is 1
  return r;
}

/** One phase per week, front to race: base…, build…, specific…, then "taper" × (taper − 1) and "race". */
export function phaseOfWeeks(l: PhaseLengths): PlanPhase[] {
  return [
    ...Array<PlanPhase>(l.base).fill("base"), ...Array<PlanPhase>(l.build).fill("build"), ...Array<PlanPhase>(l.specific).fill("specific"),
    ...Array<PlanPhase>(Math.max(0, l.taper - 1)).fill("taper"), ...(l.taper > 0 ? ["race" as const] : []),
  ];
}

const KIND_RANK: Record<"base" | "build" | "specific" | "recovery", number> = { base: 0, build: 1, specific: 2, recovery: 3 };
/** The block kind of a chunk: the phase most of its weeks have, a tie to the later one; taper and race count as specific. */
export function chunkKind(phases: PlanPhase[]): BlockKind {
  const count = { base: 0, build: 0, specific: 0, recovery: 0 };
  for (const p of phases) count[p === "taper" || p === "race" ? "specific" : p]++;
  return (Object.keys(count) as (keyof typeof count)[]).reduce((a, b) => (count[b] > count[a] || (count[b] === count[a] && KIND_RANK[b] > KIND_RANK[a]) ? b : a), "base");
}

/* ---------- Other races inside the plan ---------- */

export interface OtherRace { date: ISODate; distanceKm: number; name: string }

/**
 * Every other race the runner entered between the plan start and the plan race is honoured; the engine never drops one.
 * `close` lists those inside the plan race's peak block or taper (wip <= 4 of the plan race): still planned as races,
 * but the UI warns (`rp.otherClose`). `chunkStarts` is kept for callers that place them; every race is honoured whatever chunk it is in.
 */
export function otherRacesIn(others: OtherRace[], raceDate: ISODate, chunkStarts: ISODate[]): { honoured: OtherRace[]; close: OtherRace[] } {
  const from = chunkStarts[0] ?? null;
  const honoured = others.filter((o) => o.date < raceDate && (from == null || o.date >= addDays(from, -RECOVERY.lookbackDays))).sort((a, b) => a.date.localeCompare(b.date));
  // The plan race's peak block is its last 4 weeks (raceChunks), the taper inside it.
  const close = honoured.filter((o) => wipOf(o.date, raceDate) <= 4 && o.date >= addDays(raceDate, -27));
  return { honoured, close };
}

/* ---------- The projection ---------- */

export interface SkeletonInput {
  kind: RaceKind;
  race: { date: ISODate; distanceKm: number };
  /** The plan's first week (stored, or the first week projected when there is no plan yet): fixes the phase lengths. */
  planStart: ISODate;
  /** The first week to project: the week after the block just generated, or the next open week. Always >= planStart. */
  firstWeek: ISODate;
  /** Run km of the 3 weeks before `firstWeek`, oldest first: actual where past, the block's planned km where ahead. */
  window: number[];
  /** Proven tolerance from actual run km only. */
  tolerance: Tolerance;
  /** The top build week before `firstWeek` (the block just generated), else tolerance.km: where the next chunk's ramp starts. */
  anchorKm: number;
  /** The biggest build week planned or run since planStart (the taper and recovery reference); 0 = none yet. */
  peakKm: number;
  /** The longest run of the 30 days before `firstWeek` (actual, and the generated block's planned runs): the long-run ladder's start. */
  longestKm: number;
  easyPace: number | null;
  /** Honoured other races (from `otherRacesIn`). */
  others: OtherRace[];
  /** Days off before the block; > RACE_PLAN.back.absorbDays caps the first projected build week. */
  backDays?: number;
}
export interface SkeletonWeek { weekStart: ISODate; wip: number; phase: PlanPhase; role: WeekRole; km: number; longKm: number | null; chunk: number }
export interface Skeleton { lengths: PhaseLengths; weeks: SkeletonWeek[]; peakKm: number; longPeak: { weekStart: ISODate; km: number; wip: number } | null }

/** A seed with only what `volumes()` reads; the rest zero or default. */
function chunkSeed(o: Pick<BlockSeed, "startWeek" | "weeks" | "kmBefore" | "tolerance" | "roles" | "anchorKm" | "race" | "recovery" | "backKm" | "otherRaces" | "longestKm">): BlockSeed {
  return {
    ...o, ctl: 0, atl: 0, past: [], runDays: [], longRunDay: 0, threshold: null, refs: {} as StepRefs, crossMin: 0,
    lighterLast: false, goalKm: null, buildWeeksDone: 0, hardBefore: false, rung: 0, tempoPace: null, firstWeekMax: null,
  };
}

/** Recovery week's long run (as in `weeksFor`). */
const recoveryLong = (km: number) => Math.max(NEXT.easyMinKm, Math.min(RECOVERY.longMaxKm, floorHalf(km * RECOVERY.longShare)));

export function projectSkeleton(input: SkeletonInput): Skeleton {
  const { kind, race } = input;
  const n0 = wipOf(input.planStart, race.date);
  const lengths = phaseLengths(Math.max(1, n0), kind);
  const phases = phaseOfWeeks(lengths);
  const phaseAt = (ws: ISODate): PlanPhase => phases[Math.floor(daysBetween(input.planStart, ws) / 7)] ?? phases.at(-1) ?? "base";
  const raceWeek = addDays(input.firstWeek, (wipOf(input.firstWeek, race.date) - 1) * 7);
  const win = [...input.window];
  let anchor = input.anchorKm, peak = input.peakKm, longest = input.longestKm;
  const weeks: SkeletonWeek[] = [];
  const hold = RACE_PLAN.longPeak[kind];

  const longOf = (role: WeekRole, km: number, wip: number): number | null => {
    if (role === "race") return null;
    if (role === "recovery") return recoveryLong(km);
    const lighter = role !== "build";
    const lp = longRun(longest, lighter, input.easyPace);
    let long = lp ? longFor(lp.km, km, longest, lighter) : floorHalf(km * NEXT.longShare);
    if (role === "build" && wip >= hold.holdTo && wip <= hold.holdFrom && longest > 0) long = Math.min(long, longest);
    return long;
  };

  const n = wipOf(input.firstWeek, race.date);
  if (n >= 1) {
    const chunks = raceChunks(n);
    let cs = input.firstWeek;
    chunks.forEach((c, ci) => {
      const end = addDays(cs, c.weeks * 7 - 1);
      let roles: WeekRole[] = [...c.roles];
      const planRole = (i: number) => c.roles[i];
      // An other race's week is a race week, unless it is a plan-race taper or race week (then only its day is the race).
      const inChunk = input.others.filter((o) => o.date >= cs && o.date <= end);
      for (const o of inChunk) {
        const i = Math.floor(daysBetween(cs, o.date) / 7);
        if (planRole(i) !== "taper" && planRole(i) !== "race") roles[i] = "race";
      }
      // Recovery after an other race (in this chunk or before it), never over the plan race's taper or race weeks. Of several,
      // the one whose recovery reaches furthest (the seed holds one recovery race).
      const recs = input.others.filter((o) => o.date <= end && recoveryRow({ distanceKm: o.distanceKm, priority: "B" }))
        .map((o) => ({ o, rr: recoveryRoles({ date: o.date, distanceKm: o.distanceKm, priority: "B" }, cs, c.weeks) }))
        .filter((x) => x.rr.some(Boolean));
      const rec = recs.reduce<(typeof recs)[number] | null>((a, b) => (!a || b.rr.filter(Boolean).length + b.rr.lastIndexOf("recovery") > a.rr.filter(Boolean).length + a.rr.lastIndexOf("recovery") ? b : a), null);
      if (rec) {
        const rr = rec.rr.map((r, i) => (r && planRole(i) !== "taper" && planRole(i) !== "race" && roles[i] !== "race" ? r : null));
        roles = withRecovery(roles, rr) ?? roles;
      }
      const holdsPlanRace = race.date >= cs && race.date <= end;
      const recovery: RecoveryRace | null = rec ? { date: rec.o.date, distanceKm: rec.o.distanceKm, priority: "B", peakKm: peak > 0 ? peak : null } : null;
      const seed = chunkSeed({
        startWeek: cs, weeks: c.weeks, kmBefore: win.slice(-3), tolerance: input.tolerance, roles, anchorKm: anchor, longestKm: longest,
        race: holdsPlanRace ? { date: race.date, priority: "A" } : null, recovery,
        backKm: ci === 0 && (input.backDays ?? 0) > RACE_PLAN.back.absorbDays ? floorHalf(RACE_PLAN.back.share * anchor) : null,
        otherRaces: inChunk.map((o) => ({ date: o.date })),
      });
      const vols = projectVolumes(seed);
      vols.forEach((v, i) => {
        const ws = addDays(cs, i * 7);
        const wip = wipOf(ws, race.date);
        const longKm = longOf(v.role, v.km, wip);
        if (longKm != null && v.role !== "recovery") longest = Math.max(longest, longKm);
        weeks.push({ weekStart: ws, wip, phase: phaseAt(ws), role: v.role, km: v.km, longKm, chunk: ci });
        win.push(v.km);
      });
      const builds = vols.filter((v) => v.role === "build").map((v) => v.km);
      anchor = Math.max(anchor, ...builds);
      peak = Math.max(peak, ...builds);
      cs = addDays(end, 1);
    });
  }

  // Recovery after the plan race: one more chunk of recovery weeks, as `volumes()` sizes them.
  const row = recoveryRow({ distanceKm: race.distanceKm, priority: "A" });
  if (row) {
    const recStart = addDays(raceWeek, 7);
    const seed = chunkSeed({
      startWeek: recStart, weeks: row.weeks, kmBefore: win.slice(-3), tolerance: input.tolerance, roles: Array<WeekRole>(row.weeks).fill("recovery"),
      anchorKm: anchor, longestKm: longest, race: null, recovery: { date: race.date, distanceKm: race.distanceKm, priority: "A", peakKm: peak > 0 ? peak : null }, backKm: null,
    });
    projectVolumes(seed).forEach((v, k) => {
      const ws = addDays(recStart, k * 7);
      if (ws < input.firstWeek) return;
      weeks.push({ weekStart: ws, wip: wipOf(ws, race.date), phase: "recovery", role: "recovery", km: v.km, longKm: recoveryLong(v.km), chunk: -1 });
    });
  }

  const longs = weeks.filter((w) => w.wip >= 2 && w.longKm != null);
  const top = Math.max(0, ...longs.map((w) => w.longKm!));
  const lp = longs.find((w) => w.longKm === top);
  return { lengths, weeks, peakKm: peak, longPeak: lp && top > 0 ? { weekStart: lp.weekStart, km: top, wip: lp.wip } : null };
}

/* ---------- The road, as the UI shows it ---------- */

export interface PhaseBand { phase: PlanPhase; from: ISODate; weeks: number; km: number }
/** Consecutive weeks with the same phase as one band; km = the sum of the weeks' km (null km counts 0). */
export function bandsOf(weeks: { weekStart: ISODate; phase: PlanPhase; km: number | null }[]): PhaseBand[] {
  const out: PhaseBand[] = [];
  for (const w of weeks) {
    const last = out.at(-1);
    if (last && last.phase === w.phase) { last.weeks++; last.km = Math.round((last.km + (w.km ?? 0)) * 10) / 10; }
    else out.push({ phase: w.phase, from: w.weekStart, weeks: 1, km: w.km ?? 0 });
  }
  return out;
}

export interface RoadWeek {
  weekStart: ISODate; wip: number; phase: PlanPhase; role: WeekRole;
  /** done: actual run km; block: the week's target (week_targets, else planned sessions); now: the suggestion shown; skeleton: the projection. */
  source: "done" | "block" | "now" | "skeleton";
  km: number | null; longKm: number | null;
}
export interface RaceRoad {
  race: { id: number; name: string; date: ISODate; distanceKm: number; kind: RaceKind; goalSeconds: number | null };
  planStart: ISODate; weeksToRace: number; lengths: PhaseLengths;
  weeks: RoadWeek[]; bands: PhaseBand[];
  /** The first week inside RACE_PHASE.weeks: race-pace sessions from here. */
  racePaceFrom: ISODate | null;
  longPeak: { weekStart: ISODate; km: number; wip: number } | null;
  /** Under RACE_PLAN.phases[kind].minWeeks at the plan's start; `suggestedSeconds` = today's prediction, rounded up to the minute, when slower than the goal (or no goal). */
  short: { minWeeks: number; goalSeconds: number | null; suggestedSeconds: number | null } | null;
  warnings: "longShort"[];
  /** Every other race in the plan (all are honoured); `close` = inside the plan race's peak block or taper, shown with `rp.otherClose`. */
  others: { name: string; date: ISODate; close: boolean }[];
  stored: boolean; computedOn: ISODate | null;
}

/** The first week from which the race phase's sessions run (RACE_PHASE.weeks before the race, race week included). */
export const racePaceFromOf = (weeks: { weekStart: ISODate; wip: number }[]) => weeks.find((w) => w.wip >= 1 && w.wip <= RACE_PHASE.weeks)?.weekStart ?? null;
