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
  windowWeeks: { marathon: 40, half: 20 } as Record<RaceKind, number>,
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
  /**
   * In a marathon plan's build and race-phase weeks the long run may take this share of the week (instead of `longShareAt`'s
   * about 34 % at 80 km), so 30 km comes at about 75 km a week (docs/decisions/fartlek-long-run-ceiling.md).
   */
  marathonLongShare: 0.4,
  /** Suggested peak-week cap: this many times the proven peak week (a marathon needs room for its long runs), rounded to `capRoundKm`. */
  capSuggest: { marathon: 1.75, half: 1.5 } as Record<RaceKind, number>, capRoundKm: 5,
  /**
   * The marathon's long-run track (docs/decisions/fartlek-marathon-long-run-plan.md), planned back from the race (`wip`: weeks to the
   * race, the race week being 1): the long runs that get a target of their own (`min`: under it the target counts as missed). A target with `stretch` may be `stretchKm` when
   * the week carries it at `share`. `share`: the most of a week a track week's long run may take. `chainFloorKm`: the rungs before a
   * target are counted back (the growth rule of `longRun`) down to this; under it the base's own ladder serves. `bNear`/`bNearKm`: no
   * 30 km+ run within `bNear` weeks of a B race, so a target there is `bNearKm` at most. `carryGrowth`: how fast a week is planned
   * to grow toward the km that carry a later run (a little under the +10 % a careful week may grow, for a lighter week on the way).
   */
  track: {
    targets: [
      { wip: 12, km: 27, min: 26, stretch: false }, { wip: 10, km: 30, min: 30, stretch: false }, { wip: 6, km: 30, min: 30, stretch: true },
      { wip: 4, km: 30, min: 30, stretch: true }, { wip: 3, km: 27, min: 26, stretch: false },
    ] as readonly { wip: number; km: number; min: number; stretch: boolean }[],
    share: 0.5, stretchKm: 32, chainFloorKm: 20, windowWeeks: 4, bNear: 2, bNearKm: 28, carryGrowth: 1.035,
  },
} as const;

/** The suggested cap on a build week: `capSuggest` × the proven peak week, rounded down to `capRoundKm` (a cap errs low); null without a proven week. */
export const suggestedCap = (provenKm: number, kind: RaceKind = "marathon") =>
  provenKm > 0 ? Math.floor((provenKm * RACE_PLAN.capSuggest[kind]) / RACE_PLAN.capRoundKm + 1e-9) * RACE_PLAN.capRoundKm : null;

/** Marathon or half within 1 km; null for any other distance. */
export const raceKindOf = (km: number): RaceKind | null =>
  Math.abs(km - MARATHON_M / 1000) <= 1 ? "marathon" : Math.abs(km - HALF_M / 1000) <= 1 ? "half" : null;

/** Weeks to the race from `weekStart`, the race week being 1 (as `racePlanFor` and the race phase count). After the race: 0, −1, … */
export { wipOf };

const floorHalf = (n: number) => Math.floor(n * 2) / 2 + 0;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/* ---------- The marathon's long-run track (docs/decisions/fartlek-marathon-long-run-plan.md) ---------- */

export interface TrackWeek {
  /** The target run of the week. */
  km: number;
  /** Under this the target counts as missed. */
  minKm: number;
  /** The most the run may be when the week carries it at `RACE_PLAN.track.share`; null = `km` is the most. */
  stretchKm: number | null;
}
/** Another race on the road and how far it is (a B race counts as a run of that distance). */
export interface OtherRun { date: ISODate; distanceKm: number }
export interface LongTrack {
  /** The week's target by weeks to the race (the race week is 1); null when the week has none. */
  at(wip: number): TrackWeek | null;
  /**
   * The run the week must reach to keep the next target within the growth rule: the rung counted back from it, 0 when no step is
   * needed (a lighter week, a week under the rungs' floor, or none after it). Not needed when the longest of 30 days already is that far.
   */
  stepNeed(wip: number): number;
  /** Km a week should have to carry the track's runs from it on (its own at `share`, the later ones grown back); 0 = none. */
  carryKm(wip: number): number;
  /** The earliest target's week: from it to the taper a build week off a target has no hold on the longest run. */
  spanFrom: number;
}

/** A marathon plan's lighter week by weeks to the race: every fourth from the fifth. */
export const lighterWip = (w: number) => w >= 5 && w % 4 === 1;

/**
 * The long-run track of a marathon, from the week the race is in (`raceWeek`) and the other races on the road: the targets of
 * `RACE_PLAN.track`, and before each the rungs counted back with the long run's growth rule (+8 %, at least 1 km, never 10 %
 * over the longest of 30 days), skipping lighter weeks and the weeks of a B race and its recovery, down to `chainFloorKm`.
 * No 30 km+ run within `bNear` weeks of a B race (a B race counts as a run of its distance, which `longestKm` carries).
 * Pure and cheap: the engine asks for it per block and per skeleton.
 */
export function longTrack(raceWeek: ISODate, others: OtherRun[]): LongTrack {
  const T = RACE_PLAN.track;
  const wipOfDate = (d: ISODate) => (d >= raceWeek ? 1 : 1 + Math.ceil(daysBetween(d, raceWeek) / 7));
  const bs = others.map((o) => ({ wip: wipOfDate(o.date), rec: recoveryRow({ distanceKm: o.distanceKm, priority: "B" })?.weeks ?? 0 }));
  const skipped = (w: number) => w < 3 || lighterWip(w) || bs.some((b) => w <= b.wip && w >= b.wip - b.rec);
  const targets = new Map<number, TrackWeek>();
  for (const t of T.targets) {
    if (skipped(t.wip)) continue;
    const near = bs.some((b) => Math.abs(b.wip - t.wip) <= T.bNear);
    const km = near ? Math.min(t.km, T.bNearKm) : t.km;
    targets.set(t.wip, { km, minKm: Math.min(t.min, km), stretchKm: t.stretch && !near ? T.stretchKm : null });
  }
  // The smallest run that steps up to `k` on the ladder.
  const back = (k: number) => {
    let l = k;
    while (l - 0.5 >= NEXT.easyMinKm && (longRun(l - 0.5, false, null)?.km ?? 0) >= k) l -= 0.5;
    return l;
  };
  // From the race backwards: each build week's run (a target, or the rung before the next week's), and what the week before must reach.
  const rung = new Map<number, number>(), need = new Map<number, number>(), carry = new Map<number, number>();
  let next = 0, nextCarry = 0;
  for (let w = 3; w <= 80; w++) {
    if (skipped(w)) continue;
    const n = next > 0 ? back(next) : 0;
    need.set(w, n >= T.chainFloorKm ? n : 0);
    const own = Math.max(targets.get(w)?.km ?? 0, need.get(w)!);
    rung.set(w, own);
    next = own;
    nextCarry = Math.max(own / T.share, nextCarry / T.carryGrowth);
    carry.set(w, nextCarry);
  }
  return { at: (wip) => targets.get(wip) ?? null, stepNeed: (wip) => need.get(wip) ?? 0, carryKm: (wip) => carry.get(wip) ?? 0, spanFrom: Math.max(0, ...T.targets.map((t) => t.wip)) };
}

/**
 * The long run of a week at a target: what the ladder allows, but no more than the target (`stretchKm` when the week carries
 * it) and no more than `share` of the week. A week not big enough gets the share, and the target is not reached.
 */
export function trackLong(t: TrackWeek, ladderKm: number, weekKm: number): number {
  const carry = floorHalf(weekKm * RACE_PLAN.track.share);
  const goal = t.stretchKm != null && carry >= t.stretchKm ? t.stretchKm : t.km;
  return Math.max(NEXT.easyMinKm, Math.min(ladderKm, carry, goal));
}

/**
 * The long run of a marathon build week that is not at a target: its usual run (`baseKm`), but at least the rung the next target
 * needs of it when the longest of the last 30 days is not that far yet; the rung never takes more than `share` of the week and
 * never more than the ladder allows. A week inside the track's span has no hold on the longest run (see `offTrackBase`).
 */
export function railLong(baseKm: number, ladderKm: number, weekKm: number, longestKm: number, needKm: number): number {
  const required = needKm > 0 && longestKm < needKm ? Math.min(needKm, floorHalf(weekKm * RACE_PLAN.track.share)) : 0;
  return Math.min(ladderKm, Math.max(baseKm, required));
}

/** A marathon build week inside the track's span but not at a target: the usual share of the week, no hold on the longest run, never over `share`. */
export const offTrackBase = (ladderKm: number, weekKm: number, longestKm: number) =>
  Math.min(longFor(ladderKm, weekKm, longestKm, true, RACE_PLAN.marathonLongShare), floorHalf(weekKm * RACE_PLAN.track.share));

/** Whether a marathon plan's week is in the track's span: from the earliest target to the week before the taper. */
export const inTrackSpan = (track: LongTrack, wip: number) => wip >= 3 && wip <= track.spanFrom;

/** Targets the road's weeks fall short of: a build week, not done, at a target's place with a long run under its `minKm`. */
export function trackShortOf(weeks: { weekStart: ISODate; wip: number; role: string; source: string; longKm: number | null }[], others: OtherRun[]): { wip: number; target: number; reached: number }[] {
  const any = weeks.find((w) => w.wip >= 1);
  if (!any) return [];
  const track = longTrack(addDays(any.weekStart, (any.wip - 1) * 7), others);
  const out: { wip: number; target: number; reached: number }[] = [];
  for (const t of RACE_PLAN.track.targets) {
    const e = track.at(t.wip), w = weeks.find((x) => x.wip === t.wip);
    if (e && w && w.source !== "done" && w.role === "build" && w.longKm != null && w.longKm < e.minKm) out.push({ wip: t.wip, target: e.km, reached: w.longKm });
  }
  return out;
}

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
  /** The runner's cap on a build week's km for this race (`races.peak_km`); null = none. */
  capKm?: number | null;
}
export interface SkeletonWeek { weekStart: ISODate; wip: number; phase: PlanPhase; role: WeekRole; km: number; longKm: number | null; chunk: number }
export interface Skeleton { lengths: PhaseLengths; weeks: SkeletonWeek[]; peakKm: number; longPeak: { weekStart: ISODate; km: number; wip: number } | null }

/** A seed with only what `volumes()` reads; the rest zero or default. */
function chunkSeed(o: Pick<BlockSeed, "startWeek" | "weeks" | "kmBefore" | "tolerance" | "roles" | "anchorKm" | "race" | "recovery" | "backKm" | "otherRaces" | "longestKm"> & { capKm?: number | null; track?: BlockSeed["track"] }): BlockSeed {
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
  const marathon = kind === "marathon";
  // A marathon's track (RACE_PLAN.track) and its 30-day window on the longest run: what was run (planned) falls out of the window.
  const track = marathon ? longTrack(raceWeek, input.others) : null;
  const trackSeed = marathon ? { raceDate: race.date, others: input.others.map((o) => ({ date: o.date, distanceKm: o.distanceKm })) } : undefined;
  const runs: { ws: ISODate; km: number }[] = [];
  const longestAt = (ws: ISODate) => {
    if (!marathon) return longest;
    const win30 = (from: ISODate, days: number) => daysBetween(from, ws) >= 0 && daysBetween(from, ws) <= days;
    return Math.max(win30(input.firstWeek, 21) ? input.longestKm : 0, ...runs.filter((r) => win30(r.ws, RACE_PLAN.track.windowWeeks * 7)).map((r) => r.km));
  };

  const longOf = (role: WeekRole, km: number, wip: number, phase: PlanPhase, ws: ISODate): number | null => {
    if (role === "race") return null;
    if (role === "recovery") return recoveryLong(km);
    const lighter = role !== "build";
    const longestNow = longestAt(ws);
    // A marathon's build and race-phase weeks may give the long run more of the week.
    const share = !lighter && marathon && (phase === "build" || phase === "specific") ? RACE_PLAN.marathonLongShare : 0;
    const lp = longRun(longestNow, lighter, input.easyPace, longestNow, marathon);
    const entry = !lighter && track ? track.at(wip) : null;
    let long: number;
    if (lp && entry) long = trackLong(entry, lp.km, km);
    else if (lp && !lighter && track) {
      const inSpan = inTrackSpan(track, wip) && (phase === "build" || phase === "specific");
      long = railLong(inSpan ? offTrackBase(lp.km, km, longestNow) : longFor(lp.km, km, longestNow, lighter, share), lp.km, km, longestNow, track.stepNeed(wip));
    } else long = lp ? longFor(lp.km, km, longestNow, lighter, share) : floorHalf(km * NEXT.longShare);
    if (role === "build" && wip >= hold.holdTo && wip <= hold.holdFrom && longestNow > 0) long = Math.min(long, longestNow);
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
        startWeek: cs, weeks: c.weeks, kmBefore: win.slice(-3), tolerance: input.tolerance, roles, anchorKm: anchor, longestKm: longest, capKm: input.capKm ?? null,
        race: holdsPlanRace ? { date: race.date, priority: "A" } : null, recovery,
        backKm: ci === 0 && (input.backDays ?? 0) > RACE_PLAN.back.absorbDays ? floorHalf(RACE_PLAN.back.share * anchor) : null,
        otherRaces: inChunk.map((o) => ({ date: o.date, distanceKm: o.distanceKm })), track: trackSeed,
      });
      const vols = projectVolumes(seed);
      vols.forEach((v, i) => {
        const ws = addDays(cs, i * 7);
        const wip = wipOf(ws, race.date);
        const longKm = longOf(v.role, v.km, wip, phaseAt(ws), ws);
        if (longKm != null && v.role !== "recovery") { longest = Math.max(longest, longKm); runs.push({ ws, km: longKm }); }
        // Another race of the week is a run of its distance: a half on the way counts as a long run done.
        if (marathon) for (const o of inChunk) if (o.date >= ws && o.date <= addDays(ws, 6)) { longest = Math.max(longest, o.distanceKm); runs.push({ ws, km: o.distanceKm }); }
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
  warnings: ("longShort" | "longTrackShort")[];
  /** A marathon's long-run track (RACE_PLAN.track): the targets the road's long runs fall short of, the biggest target first; empty when it reaches them. */
  trackShort: { wip: number; target: number; reached: number }[];
  /** The peak-week cap: the runner's (`races.peak_km`), the suggestion (RACE_PLAN.capSuggest[kind] × the proven peak week) and that peak. */
  cap: { km: number | null; suggestedKm: number | null; provenKm: number; factor: number };
  /** Every other race in the plan (all are honoured); `close` = inside the plan race's peak block or taper, shown with `rp.otherClose`. */
  others: { name: string; date: ISODate; close: boolean }[];
  stored: boolean; computedOn: ISODate | null;
}

/** The first week from which the race phase's sessions run (RACE_PHASE.weeks before the race, race week included). */
export const racePaceFromOf = (weeks: { weekStart: ISODate; wip: number }[]) => weeks.find((w) => w.wip >= 1 && w.wip <= RACE_PHASE.weeks)?.weekStart ?? null;
