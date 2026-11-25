import { and, eq, gte } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { stepRefs, type Ctx } from "./analysis";
import { breakBefore, longestRun, weeksBefore } from "./routes/blocks";
import { perfData, racePrediction } from "./performance";
import { addDays, daysBetween, weekStartOf, type ISODate } from "../shared/dates";
import { BLOCK, tolerance, withRecovery, recoveryRoles, recoveryRow, RECOVERY, type WeekRole } from "../shared/blockplan";
import { NEXT } from "../shared/nextweek";
import { RACE_PHASE } from "../shared/racephase";
import {
  bandsOf, otherRacesIn, phaseLengths, phaseOfWeeks, projectSkeleton, RACE_PLAN, raceKindOf, racePaceFromOf, suggestedCap, wipOf,
  type OtherRace, type PlanPhase, type RaceKind, type RaceRoad, type RoadWeek, type Skeleton, type SkeletonInput,
} from "../shared/raceplan";
import type { Race } from "../shared/types";

/*
 * The race plan's server side (docs/decisions/fartlek-race-plan-skeleton.md): which race has a plan, the projection's inputs from
 * actual training only, the road the dialog shows, and the stored rows (`race_plan_weeks`). Skeleton rows are never workouts or
 * week targets, so `kmByDay`, `weeksBefore`, `longestRun` and the tolerance never see them.
 */

export type PlanRace = { race: Race; kind: RaceKind; weeksToRace: number };
/** A week of the block just generated (or shown), as the projection and the road read it. */
export interface BlockWeek { weekStart: ISODate; km: number; role: WeekRole; longKm: number | null }

/** The next A race on or after `startWeek` that is a marathon or a half. */
function nextPlanRace(ctx: Ctx, startWeek: ISODate): (PlanRace & { window: number }) | null {
  for (const race of repo.listRaces(ctx.db, ctx.userId)) {
    if (race.priority !== "A" || race.date < startWeek) continue;
    const kind = raceKindOf(race.distanceKm);
    if (!kind) continue;
    return { race, kind, weeksToRace: wipOf(startWeek, race.date), window: RACE_PLAN.windowWeeks[kind] };
  }
  return null;
}

/** The next A race that is a marathon or half, inside its window from `startWeek`; with its kind and weeks to go. */
export function planRaceFor(ctx: Ctx, startWeek: ISODate): PlanRace | null {
  const p = nextPlanRace(ctx, startWeek);
  return p && p.weeksToRace <= p.window ? { race: p.race, kind: p.kind, weeksToRace: p.weeksToRace } : null;
}

/** The same race beyond the window: when its plan starts. */
export function farRaceFor(ctx: Ctx, startWeek: ISODate): (PlanRace & { planFrom: ISODate }) | null {
  const p = nextPlanRace(ctx, startWeek);
  if (!p || p.weeksToRace <= p.window) return null;
  const raceWeek = weekStartOf(p.race.date, ctx.settings.weekStart);
  return { race: p.race, kind: p.kind, weeksToRace: p.weeksToRace, planFrom: addDays(raceWeek, -(p.window - 1) * 7) };
}

/** Stored rows of the plan for a race, oldest first. */
export const storedPlan = (ctx: Ctx, raceId: number) => repo.planWeeksOf(ctx.db, ctx.userId, raceId);

/** Other races the plan honours: any race on the list except C, other than the plan race, from `from` to the race. */
function othersOf(ctx: Ctx, pr: { race: Race }, from: ISODate): OtherRace[] {
  return repo.listRaces(ctx.db, ctx.userId)
    .filter((r) => r.id !== pr.race.id && r.priority !== "C" && r.date >= addDays(from, -RECOVERY.lookbackDays) && r.date < pr.race.date)
    .map((r) => ({ date: r.date, distanceKm: r.distanceKm, name: r.name }));
}

/** The plan's first week: the first stored row, else the first block week, else `firstWeek`. */
export function planStartOf(ctx: Ctx, pr: { race: Race }, fallback: ISODate): ISODate {
  return storedPlan(ctx, pr.race.id)[0]?.weekStart ?? fallback;
}

/** Everything `projectSkeleton` needs for weeks from `firstWeek`, after `blockWeeks` (the block just generated, or none). */
export function skeletonInputs(ctx: Ctx, pr: { race: Race; kind: RaceKind }, firstWeek: ISODate, blockWeeks: BlockWeek[]): SkeletonInput {
  const planStart = planStartOf(ctx, pr, blockWeeks[0]?.weekStart ?? firstWeek);
  const blockKm = new Map(blockWeeks.map((w) => [w.weekStart, w.km]));
  const window = weeksBefore(ctx, firstWeek, 3).map((w) => blockKm.get(w.weekStart) ?? w.km);
  const nextWeek = weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart);
  const tol = tolerance(weeksBefore(ctx, nextWeek, BLOCK.tolerance.lookbackWeeks, { planned: false }));
  const builds = blockWeeks.filter((w) => w.role === "build").map((w) => w.km);
  const sinceStart = planStart < nextWeek ? weeksBefore(ctx, nextWeek, Math.max(0, Math.round(daysBetween(planStart, nextWeek) / 7)), { planned: false }).map((w) => w.km) : [];
  const longestKm = Math.max(
    longestRun(ctx, addDays(firstWeek, -NEXT.spikeDays), addDays(ctx.today, -1), [], { planned: false }),
    ...blockWeeks.map((w) => w.longKm ?? 0),
  );
  const { honoured } = otherRacesIn(othersOf(ctx, pr, planStart), pr.race.date, [planStart]);
  return {
    kind: pr.kind, race: { date: pr.race.date, distanceKm: pr.race.distanceKm }, planStart, firstWeek, window, tolerance: tol,
    anchorKm: builds.length ? Math.max(...builds) : tol.km,
    peakKm: Math.max(0, ...builds, ...sinceStart),
    longestKm, easyPace: stepRefs(ctx, ctx.today).easyPace, others: honoured,
    backDays: breakBefore(ctx, blockWeeks[0]?.weekStart ?? firstWeek),
    capKm: pr.race.peakKm,
  };
}

/** The first week of a marathon plan's build phase (RACE_PLAN.marathonLongShare applies from it); null for a half. */
export function buildPhaseFrom(ctx: Ctx, pr: { race: Race; kind: RaceKind }, fallback: ISODate): ISODate | null {
  if (pr.kind !== "marathon") return null;
  const planStart = planStartOf(ctx, pr, fallback);
  return addDays(planStart, phaseLengths(Math.max(1, wipOf(planStart, pr.race.date)), pr.kind).base * 7);
}

/**
 * The stored skeleton after the race's last block week, projected again (the cap changed): the block weeks stay, their targets
 * are the block's. Nothing to do without stored rows or with no skeleton week left.
 */
export function refreshSkeleton(ctx: Ctx, raceId: number): void {
  const race = repo.listRaces(ctx.db, ctx.userId).find((r) => r.id === raceId);
  const kind = race?.priority === "A" ? raceKindOf(race.distanceKm) : null;
  const rows = storedPlan(ctx, raceId);
  if (!race || !kind || !rows.length) return;
  const pr = { race, kind };
  const nextWeek = weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart);
  const blockRows = rows.filter((r) => r.km == null);
  const after = blockRows.length ? addDays(blockRows.at(-1)!.weekStart, 7) : rows[0].weekStart;
  const firstWeek = after > nextWeek ? after : nextWeek;
  if (firstWeek > rows.at(-1)!.weekStart) return;
  const targets = repo.getTargets(ctx.db, ctx.userId, rows[0].weekStart, rows.at(-1)!.weekStart);
  const blockWeeks: BlockWeek[] = blockRows.map((r) => ({ weekStart: r.weekStart, km: targets.get(r.weekStart)?.km ?? 0, role: r.role as WeekRole, longKm: null }));
  const sk = projectSkeleton(skeletonInputs(ctx, pr, firstWeek, blockWeeks));
  ctx.db.transaction((tx) => writePlan(tx, ctx.userId, firstWeek,
    sk.weeks.map((w) => ({ weekStart: w.weekStart, raceId, phase: w.phase, role: w.role, km: w.km, longKm: w.longKm })), ctx.today));
}

/** The phases of the plan from its start, so a week's phase can be looked up by date. */
export function phaseAtFor(planStart: ISODate, race: { date: ISODate }, kind: RaceKind) {
  const phases = phaseOfWeeks(phaseLengths(Math.max(1, wipOf(planStart, race.date)), kind));
  return (ws: ISODate): PlanPhase => {
    const i = Math.floor(daysBetween(planStart, ws) / 7);
    return i < 0 ? phases[0] ?? "base" : phases[i] ?? "recovery";
  };
}

/** The other races inside a block's weeks: each one's week a race week (unless a taper or race week), recovery after a 10 km+ one. */
export function otherRacesInBlock(ctx: Ctx, pr: { race: Race }, startWeek: ISODate, weeks: number, roles: WeekRole[] | null) {
  const end = addDays(startWeek, weeks * 7 - 1);
  const inside = othersOf(ctx, pr, startWeek).filter((o) => o.date >= startWeek && o.date <= end);
  if (!inside.length) return { roles, otherRaces: [] as { date: ISODate }[], recovery: null };
  const out: WeekRole[] = roles ? [...roles] : Array<WeekRole>(weeks).fill("build");
  for (const o of inside) {
    const i = Math.floor(daysBetween(startWeek, o.date) / 7);
    if (out[i] !== "taper" && out[i] !== "race") out[i] = "race";
  }
  // Recovery after the longest of them, never over a taper or race week.
  const longest = [...inside].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  const rec = recoveryRow({ distanceKm: longest.distanceKm, priority: "B" })
    ? { date: longest.date, distanceKm: longest.distanceKm, priority: "B" as const, peakKm: null } : null;
  const rr = rec ? recoveryRoles(rec, startWeek, weeks).map((r, i) => (r && out[i] !== "taper" && out[i] !== "race" ? r : null)) : [];
  return { roles: withRecovery(out, rr) ?? out, otherRaces: inside.map((o) => ({ date: o.date })), recovery: rec };
}

/** The road shown in the dialog and the plan view. */
export function roadFor(ctx: Ctx, pr: { race: Race; kind: RaceKind }, o: { planStart: ISODate; skeleton: Skeleton | null; blockWeeks?: BlockWeek[]; stored: boolean; others: OtherRace[] }): RaceRoad {
  const running = weekStartOf(ctx.today, ctx.settings.weekStart);
  const phaseAt = phaseAtFor(o.planStart, pr.race, pr.kind);
  const byWeek = new Map<ISODate, RoadWeek>();
  const rows = storedPlan(ctx, pr.race.id);
  const lastRow = rows.at(-1)?.weekStart ?? o.planStart;
  const targets = repo.getTargets(ctx.db, ctx.userId, o.planStart, lastRow);
  const actual = new Map(running > o.planStart ? weeksBefore(ctx, running, Math.round(daysBetween(o.planStart, running) / 7), { planned: false }).map((w) => [w.weekStart, w.km]) : []);
  for (const r of rows) {
    const done = r.weekStart < running;
    byWeek.set(r.weekStart, {
      weekStart: r.weekStart, wip: wipOf(r.weekStart, pr.race.date), phase: r.phase as PlanPhase, role: r.role as WeekRole,
      source: done ? "done" : r.km == null ? "block" : "skeleton",
      km: done ? actual.get(r.weekStart) ?? 0 : r.km ?? targets.get(r.weekStart)?.km ?? null, longKm: r.longKm,
    });
  }
  for (const w of o.blockWeeks ?? []) {
    byWeek.set(w.weekStart, { weekStart: w.weekStart, wip: wipOf(w.weekStart, pr.race.date), phase: phaseAt(w.weekStart), role: w.role, source: "now", km: w.km, longKm: w.longKm });
  }
  for (const w of o.skeleton?.weeks ?? []) {
    byWeek.set(w.weekStart, { weekStart: w.weekStart, wip: w.wip, phase: w.phase, role: w.role, source: "skeleton", km: w.km, longKm: w.longKm });
  }
  const weeks = [...byWeek.values()].filter((w) => w.weekStart >= o.planStart).sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const lengths = phaseLengths(Math.max(1, wipOf(o.planStart, pr.race.date)), pr.kind);
  const longs = weeks.filter((w) => w.wip >= 2 && w.longKm != null);
  const top = Math.max(0, ...longs.map((w) => w.longKm!));
  const lp = longs.find((w) => w.longKm === top);
  const longPeak = lp && top > 0 ? { weekStart: lp.weekStart, km: top, wip: lp.wip } : null;
  const minWeeks = RACE_PLAN.phases[pr.kind].minWeeks;
  let short: RaceRoad["short"] = null;
  if (wipOf(o.planStart, pr.race.date) < minWeeks) {
    const pred = racePrediction(ctx, pr.race, perfData(ctx)).current?.seconds ?? null;
    const up = pred != null ? Math.ceil(pred / 60) * 60 : null;
    short = { minWeeks, goalSeconds: pr.race.goalSeconds, suggestedSeconds: up != null && (pr.race.goalSeconds == null || up > pr.race.goalSeconds) ? up : null };
  }
  const { close } = otherRacesIn(o.others, pr.race.date, [o.planStart]);
  const provenKm = tolerance(weeksBefore(ctx, addDays(running, 7), BLOCK.tolerance.lookbackWeeks, { planned: false })).peakKm;
  const computed = rows.map((r) => r.computedOn).sort().at(-1) ?? null;
  return {
    race: { id: pr.race.id, name: pr.race.name, date: pr.race.date, distanceKm: pr.race.distanceKm, kind: pr.kind, goalSeconds: pr.race.goalSeconds },
    planStart: o.planStart, weeksToRace: wipOf(running, pr.race.date), lengths, weeks, bands: bandsOf(weeks),
    racePaceFrom: racePaceFromOf(weeks), longPeak, short,
    warnings: pr.kind === "marathon" && longPeak && longPeak.km < RACE_PHASE.warn.longKm ? ["longShort"] : [],
    others: o.others.map((x) => ({ name: x.name, date: x.date, close: close.includes(x) })),
    cap: { km: pr.race.peakKm, suggestedKm: suggestedCap(provenKm), provenKm },
    stored: o.stored, computedOn: o.stored ? computed : null,
  };
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type PlanRowIn = { weekStart: ISODate; raceId: number; phase: string; role: string; km: number | null; longKm: number | null };

/** Replace the plan's rows from `fromWeek` on (all races), in a transaction the caller holds. */
export function writePlan(tx: Tx, userId: number, fromWeek: ISODate, rows: PlanRowIn[], computedOn: ISODate): void {
  tx.delete(t.racePlanWeeks).where(and(eq(t.racePlanWeeks.userId, userId), gte(t.racePlanWeeks.weekStart, fromWeek))).run();
  for (const r of rows) if (r.weekStart >= fromWeek) tx.insert(t.racePlanWeeks).values({ userId, ...r, computedOn }).run();
}

/** The rows to store: the block's weeks (km null: their target is the block's) and every skeleton week after them. */
export function planRows(pr: { race: Race; kind: RaceKind }, planStart: ISODate, blockWeeks: BlockWeek[], sk: Skeleton): PlanRowIn[] {
  const phaseAt = phaseAtFor(planStart, pr.race, pr.kind);
  return [
    ...blockWeeks.map((w) => ({ weekStart: w.weekStart, raceId: pr.race.id, phase: phaseAt(w.weekStart), role: w.role, km: null, longKm: null })),
    ...sk.weeks.map((w) => ({ weekStart: w.weekStart, raceId: pr.race.id, phase: w.phase, role: w.role, km: w.km, longKm: w.longKm })),
  ];
}

/** The earliest A marathon or half whose recovery has not ended by the running week. */
export function activePlanRace(ctx: Ctx): PlanRace | null {
  const running = weekStartOf(ctx.today, ctx.settings.weekStart);
  for (const race of repo.listRaces(ctx.db, ctx.userId)) {
    const kind = race.priority === "A" ? raceKindOf(race.distanceKm) : null;
    if (!kind) continue;
    const raceWeek = weekStartOf(race.date, ctx.settings.weekStart);
    const rec = recoveryRow({ distanceKm: race.distanceKm, priority: "A" })?.weeks ?? 0;
    if (addDays(raceWeek, rec * 7) >= running) return { race, kind, weeksToRace: wipOf(running, race.date) };
  }
  return null;
}

/** Other races a road shows: those inside the plan (one before it only gives recovery weeks, which the road shows as such). */
export const roadOthers = (ctx: Ctx, pr: { race: Race }, planStart: ISODate) =>
  otherRacesIn(othersOf(ctx, pr, planStart), pr.race.date, [planStart]).honoured.filter((o) => o.date >= planStart);

