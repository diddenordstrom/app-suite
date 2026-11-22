import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { loadSeries, type Ctx } from "./analysis";
import { perfData, type PerfData } from "./performance";
import { addDays, daysBetween, type ISODate } from "../shared/dates";
import { AUTO_WINDOW_DAYS, autoCriticalSpeed, bestCurve, chooseCs, trainingContext } from "../shared/bestefforts";
import { DIST_TOL, modelChecks, RACE_CHECK_VERSION, raceReason, standardDistance, type ModelCheck, type RaceReason } from "../shared/racecheck";
import { thresholdOn } from "../shared/threshold";
import type { Race } from "../shared/types";

/*
 * Races as the answer key for the predictions (docs/decisions/fartlek-race-results.md): results on
 * races, the "Was this a race?" question on runs, and the log of what each model said the day before.
 */

export interface RaceCheck {
  raceId: number; modelVersion: number; date: ISODate; distanceKm: number; resultSeconds: number;
  predictedSeconds: number | null; model: string | null; models: ModelCheck[];
  inputs: { csMps: number | null; dPrimeM: number | null; csSource: string | null; weeklyKm: number | null; meanPaceSecPerKm: number | null; decoupling: number | null; ctl: number | null };
}

/** A run that could be the race (same day, a distance close to the race's), for "Lägg in tid". */
export function activityForRace(db: Db, userId: number, race: Pick<Race, "date" | "distanceKm">) {
  const m = race.distanceKm * 1000;
  return db.select().from(t.activities)
    .where(and(eq(t.activities.userId, userId), eq(t.activities.date, race.date), eq(t.activities.isRun, true))).all()
    .filter((a) => a.distanceM >= m * (1 - DIST_TOL.short) && a.distanceM <= m * (1 + DIST_TOL.long))
    .sort((a, b) => Math.abs(a.distanceM - m) - Math.abs(b.distanceM - m))[0] ?? null;
}

/** What every model said the day before `race`, from what was stored then; written once per model version. */
export function recordCheck(ctx: Ctx, race: Race, d: PerfData = perfData(ctx)): void {
  if (race.resultSeconds == null || race.date > ctx.today) return;
  const day = addDays(race.date, -1);
  const chosen = chooseCs(autoCriticalSpeed(d.efforts, day), d.tests, day);
  const curve = bestCurve(d.efforts, addDays(day, -(AUTO_WINDOW_DAYS - 1)), day);
  const tc = trainingContext(d.runs, day);
  const { main, models } = modelChecks(race.distanceKm, chosen?.cs ?? null, curve, tc);
  const back = daysBetween(day, ctx.today) + 1;
  const ctl = back > 0 && back < 4000 ? loadSeries(ctx, back).find((p) => p.date === day)?.ctl ?? null : null;
  const inputs: RaceCheck["inputs"] = {
    csMps: chosen?.cs.csMps ?? null, dPrimeM: chosen?.cs.dPrimeM ?? null, csSource: chosen?.source ?? null,
    weeklyKm: tc.weeklyKm, meanPaceSecPerKm: tc.meanPaceSecPerKm, decoupling: tc.decoupling, ctl: ctl != null ? Math.round(ctl * 10) / 10 : null,
  };
  const row = {
    userId: ctx.userId, raceId: race.id, modelVersion: RACE_CHECK_VERSION, date: race.date, distanceKm: race.distanceKm,
    resultSeconds: race.resultSeconds, predictedSeconds: main?.seconds ?? null, model: main?.model ?? null,
    models: JSON.stringify(models), inputs: JSON.stringify(inputs), createdAt: Date.now(),
  };
  // The result or distance may be corrected: the prediction stays what it was, the answer follows.
  ctx.db.insert(t.raceChecks).values(row)
    .onConflictDoUpdate({ target: [t.raceChecks.userId, t.raceChecks.raceId, t.raceChecks.modelVersion], set: { date: row.date, distanceKm: row.distanceKm, resultSeconds: row.resultSeconds } })
    .run();
}

/** Checks of the current model version for every race with a result, writing any that are missing. */
export function raceChecks(ctx: Ctx): RaceCheck[] {
  const races = repo.listRaces(ctx.db, ctx.userId).filter((r) => r.resultSeconds != null && r.date <= ctx.today);
  const have = () => ctx.db.select().from(t.raceChecks).where(and(eq(t.raceChecks.userId, ctx.userId), eq(t.raceChecks.modelVersion, RACE_CHECK_VERSION))).all();
  let rows = have();
  const missing = races.filter((r) => !rows.some((x) => x.raceId === r.id));
  if (missing.length) {
    const d = perfData(ctx);
    for (const r of missing) recordCheck(ctx, r, d);
    rows = have();
  }
  const ids = new Set(races.map((r) => r.id));
  return rows.filter((x) => ids.has(x.raceId)).sort((a, b) => b.date.localeCompare(a.date)).map((x) => ({
    raceId: x.raceId, modelVersion: x.modelVersion, date: x.date, distanceKm: x.distanceKm, resultSeconds: x.resultSeconds,
    predictedSeconds: x.predictedSeconds, model: x.model, models: JSON.parse(x.models) as ModelCheck[], inputs: JSON.parse(x.inputs) as RaceCheck["inputs"],
  }));
}

/** Past races without a result that have a matching run: the run's time to suggest. */
export function resultSuggestions(ctx: Ctx): { raceId: number; activityId: string; seconds: number }[] {
  return repo.listRaces(ctx.db, ctx.userId).filter((r) => r.resultSeconds == null && r.date <= ctx.today).flatMap((r) => {
    const a = activityForRace(ctx.db, ctx.userId, r);
    return a ? [{ raceId: r.id, activityId: a.id, seconds: Math.round(a.durationS) }] : [];
  });
}

export interface RaceCandidate { reason: RaceReason; distanceKm: number; seconds: number; name: string }

/**
 * "Was this a race?" for a run: Garmin marked it, or a standard distance run hard. Not asked when the
 * run is already a race's result, when the runner said no, or when it is older than a year.
 */
export function raceCandidate(ctx: Ctx, id: string): { candidate: RaceCandidate | null; race: Race | null } {
  const a = ctx.db.select().from(t.activities).where(and(eq(t.activities.userId, ctx.userId), eq(t.activities.id, id))).get();
  if (!a || !a.isRun) return { candidate: null, race: null };
  const races = repo.listRaces(ctx.db, ctx.userId);
  const race = races.find((r) => r.activityId === id) ?? null;
  if (race || a.notRace || a.date < addDays(ctx.today, -365)) return { candidate: null, race };
  const thr = thresholdOn(ctx.thresholds, a.date);
  const reason = raceReason({ distanceM: a.distanceM, avgHr: a.avgHr, eventType: a.eventType }, thr?.hr ?? null);
  if (!reason) return { candidate: null, race: null };
  // A race planned that day keeps its name.
  const planned = races.find((r) => r.date === a.date && r.resultSeconds == null);
  const km = standardDistance(a.distanceM) ?? planned?.distanceKm ?? Math.round(a.distanceM / 100) / 10;
  return { candidate: { reason, distanceKm: km, seconds: Math.round(a.durationS), name: planned?.name ?? a.name }, race: null };
}

/** Save a race's result: link the run of that day when there is one, then log the check. */
export function afterResult(ctx: Ctx, raceId: number): void {
  const race = repo.listRaces(ctx.db, ctx.userId).find((r) => r.id === raceId);
  if (!race || race.resultSeconds == null) return;
  if (!race.activityId) {
    const a = activityForRace(ctx.db, ctx.userId, race);
    if (a) {
      ctx.db.update(t.races).set({ activityId: a.id }).where(and(eq(t.races.userId, ctx.userId), eq(t.races.id, raceId))).run();
      race.activityId = a.id;
    }
  }
  recordCheck(ctx, race);
}
