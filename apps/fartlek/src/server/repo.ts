import zlib from "node:zlib";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import {
  DEFAULT_SETTINGS, type Activity, type Checkin, type Lap, type LapTrigger, type PainEntry, type Block, type BlockKind, type Race,
  type Settings, type Stream, type Threshold, type Wellness, type Workout, type WorkoutStatus, type WorkoutType, type ZoneBounds,
} from "../shared/types";
import type { WeekTarget } from "../shared/compliance";
import type { ISODate } from "../shared/dates";
import { EMPTY_LOG, type ActivityLog } from "../shared/activitylog";
import { readSteps } from "../shared/steps";
import { parseTuning, withTuning, type TuningOverrides } from "../shared/tuning";

/* Row ↔ shared type mapping and small queries, all scoped by user. */

export function getSettings(db: Db, userId: number): Settings {
  const r = db.select().from(t.userSettings).where(eq(t.userSettings.userId, userId)).get();
  if (!r) return DEFAULT_SETTINGS;
  return {
    units: r.units as Settings["units"],
    weekStart: r.weekStart as Settings["weekStart"],
    timezone: r.timezone,
    runDays: r.runDays ? r.runDays.split(",").map(Number) : [],
    longRunDay: r.longRunDay,
    gymDays: r.gymDays ? r.gymDays.split(",").map(Number) : [],
    crossDays: r.crossDays ? r.crossDays.split(",").map((x) => { const [day, min] = x.split(":").map(Number); return { day, min }; }) : [],
    doubles: r.doubles === "gym" || r.doubles === "all" ? r.doubles : "off",
    maxHr: r.maxHr,
    zones: r.zones ? (JSON.parse(r.zones) as ZoneBounds) : null,
    easyLow: r.easyLow,
    easyHigh: r.easyHigh,
  };
}

export function saveSettings(db: Db, userId: number, s: Settings) {
  const row = { ...s, runDays: s.runDays.join(","), gymDays: s.gymDays.join(","), crossDays: s.crossDays.map((c) => `${c.day}:${c.min}`).join(","), zones: s.zones ? JSON.stringify(s.zones) : null };
  db.insert(t.userSettings).values({ userId, ...row }).onConflictDoUpdate({ target: t.userSettings.userId, set: row }).run();
}

/** The runner's engine overrides, or null for the defaults (a stored value that no longer validates counts as none). */
export function getTuning(db: Db, userId: number): TuningOverrides | null {
  const r = db.select({ v: t.engineTuning.overrides }).from(t.engineTuning).where(eq(t.engineTuning.userId, userId)).get();
  if (!r) return null;
  try { return parseTuning(JSON.parse(r.v)); } catch { return null; }
}

export function saveTuning(db: Db, userId: number, values: TuningOverrides) {
  const row = { overrides: JSON.stringify(values), updatedAt: Date.now() };
  db.insert(t.engineTuning).values({ userId, ...row }).onConflictDoUpdate({ target: t.engineTuning.userId, set: row }).run();
}

export function clearTuning(db: Db, userId: number) {
  db.delete(t.engineTuning).where(eq(t.engineTuning.userId, userId)).run();
}

/** Plans made inside `fn` (synchronously) use this runner's tuning. */
export const tuned = <T>(db: Db, userId: number, fn: () => T): T => withTuning(getTuning(db, userId), fn);

type ActivityRow = typeof t.activities.$inferSelect;
export function toActivity(r: ActivityRow): Activity {
  const z = [r.zone1, r.zone2, r.zone3, r.zone4, r.zone5];
  return {
    id: r.id, name: r.name, typeKey: r.typeKey, startTimeLocal: r.startTimeLocal, date: r.date,
    distanceM: r.distanceM, durationS: r.durationS, avgHr: r.avgHr, maxHr: r.maxHr, elevationGain: r.elevationGain,
    zoneSecs: z.every((v) => v == null) ? null : (z.map((v) => v ?? 0) as Activity["zoneSecs"]),
    isRun: r.isRun, thresholdFlag: r.thresholdFlag, hasDetail: r.detailStatus === "done",
  };
}

export function listActivities(db: Db, userId: number, opts: { from?: string; to?: string; limit?: number } = {}): Activity[] {
  const conds = [eq(t.activities.userId, userId)];
  if (opts.from) conds.push(gte(t.activities.date, opts.from));
  if (opts.to) conds.push(lte(t.activities.date, opts.to));
  let q = db.select().from(t.activities).where(and(...conds)).orderBy(desc(t.activities.startTimeLocal)).$dynamic();
  if (opts.limit) q = q.limit(opts.limit);
  return q.all().map(toActivity);
}

/** The first activity's date, for "is there enough history" checks; null before any sync. */
export function firstActivityDate(db: Db, userId: number): string | null {
  return db.select({ date: t.activities.date }).from(t.activities).where(eq(t.activities.userId, userId)).orderBy(asc(t.activities.date)).limit(1).get()?.date ?? null;
}

export function getActivity(db: Db, userId: number, id: string): Activity | null {
  const r = db.select().from(t.activities).where(and(eq(t.activities.userId, userId), eq(t.activities.id, id))).get();
  return r ? toActivity(r) : null;
}

type LapRow = typeof t.laps.$inferSelect;
function toLap(l: LapRow): Lap {
  return {
    index: l.idx, distanceM: l.distanceM, durationS: l.durationS, avgHr: l.avgHr,
    startS: l.startS, trigger: l.trigger as LapTrigger | null, maxHr: l.maxHr, cadence: l.cadence, elevGain: l.elevGain, elevLoss: l.elevLoss,
  };
}

export function getLaps(db: Db, userId: number, activityId: string): Lap[] {
  return db.select().from(t.laps).where(and(eq(t.laps.userId, userId), eq(t.laps.activityId, activityId))).orderBy(asc(t.laps.idx)).all().map(toLap);
}

export function lapsByActivity(db: Db, userId: number): Map<string, Lap[]> {
  const m = new Map<string, Lap[]>();
  for (const l of db.select().from(t.laps).where(eq(t.laps.userId, userId)).orderBy(asc(t.laps.idx)).all()) {
    const arr = m.get(l.activityId) ?? [];
    arr.push(toLap(l));
    m.set(l.activityId, arr);
  }
  return m;
}

export function encodeStream(s: Stream): Buffer {
  return zlib.gzipSync(JSON.stringify(s));
}

export function getStream(db: Db, userId: number, activityId: string): Stream | null {
  const r = db.select().from(t.streams).where(and(eq(t.streams.userId, userId), eq(t.streams.activityId, activityId))).get();
  return r ? (JSON.parse(zlib.gunzipSync(r.data).toString("utf8")) as Stream) : null;
}

/**
 * Replace an activity's laps and stream (and its kept FIT file, when given) in one transaction.
 * Only Garmin-derived rows are touched: the activity row itself, its threshold flag, log, pain
 * entries and workout links are keyed by the activity id and stay as they are.
 */
export function saveDetail(
  db: Db, userId: number, activityId: string,
  detail: { laps: Lap[]; stream: Stream | null; fit?: Uint8Array }, version: number,
) {
  db.transaction((tx) => {
    tx.delete(t.laps).where(and(eq(t.laps.userId, userId), eq(t.laps.activityId, activityId))).run();
    for (const l of detail.laps) {
      tx.insert(t.laps).values({
        userId, activityId, idx: l.index, distanceM: l.distanceM, durationS: l.durationS, avgHr: l.avgHr,
        startS: l.startS ?? null, trigger: l.trigger ?? null, maxHr: l.maxHr ?? null, cadence: l.cadence ?? null, elevGain: l.elevGain ?? null, elevLoss: l.elevLoss ?? null,
      }).run();
    }
    tx.delete(t.streams).where(and(eq(t.streams.userId, userId), eq(t.streams.activityId, activityId))).run();
    if (detail.stream) tx.insert(t.streams).values({ userId, activityId, data: encodeStream(detail.stream) }).run();
    if (detail.fit) {
      const data = zlib.gzipSync(detail.fit);
      tx.insert(t.activityFiles).values({ userId, activityId, data, fetchedAt: Date.now() })
        .onConflictDoUpdate({ target: [t.activityFiles.userId, t.activityFiles.activityId], set: { data, fetchedAt: Date.now() } }).run();
    }
    tx.update(t.activities).set({ detailStatus: "done", detailError: null, detailVersion: version, effortsVersion: 0 })
      .where(and(eq(t.activities.userId, userId), eq(t.activities.id, activityId))).run();
  });
}

export function getSplits(db: Db, userId: number, activityId: string): number[] {
  return db.select({ at: t.activitySplits.atS }).from(t.activitySplits)
    .where(and(eq(t.activitySplits.userId, userId), eq(t.activitySplits.activityId, activityId))).all().map((r) => r.at).sort((a, b) => a - b);
}
export function addSplit(db: Db, userId: number, activityId: string, atS: number) {
  db.insert(t.activitySplits).values({ userId, activityId, atS }).onConflictDoNothing().run();
}
export function replaceSplits(db: Db, userId: number, activityId: string, atS: number[]) {
  db.transaction((tx) => {
    tx.delete(t.activitySplits).where(and(eq(t.activitySplits.userId, userId), eq(t.activitySplits.activityId, activityId))).run();
    for (const at of new Set(atS)) tx.insert(t.activitySplits).values({ userId, activityId, atS: at }).onConflictDoNothing().run();
  });
}
export function clearSplits(db: Db, userId: number, activityId: string) {
  db.delete(t.activitySplits).where(and(eq(t.activitySplits.userId, userId), eq(t.activitySplits.activityId, activityId))).run();
}

/** The kept FIT file, or null when the activity was fetched before files were kept. */
export function getFit(db: Db, userId: number, activityId: string): Uint8Array | null {
  const r = db.select({ data: t.activityFiles.data }).from(t.activityFiles)
    .where(and(eq(t.activityFiles.userId, userId), eq(t.activityFiles.activityId, activityId))).get();
  return r ? new Uint8Array(zlib.gunzipSync(r.data)) : null;
}

type WorkoutRow = typeof t.workouts.$inferSelect;
export function toWorkout(r: WorkoutRow): Workout {
  return {
    id: r.id, date: r.date, type: r.type as WorkoutType, distanceKm: r.distanceKm, durationMin: r.durationMin, zone2: r.zone2,
    notes: r.notes, status: r.status as WorkoutStatus, skipReason: r.skipReason, manualActivityId: r.manualActivityId, manualUnlinked: r.manualUnlinked,
    steps: readSteps(r.steps), blueprint: r.blueprint,
  };
}

export function listWorkouts(db: Db, userId: number, from: string, to: string): Workout[] {
  return db.select().from(t.workouts).where(and(eq(t.workouts.userId, userId), gte(t.workouts.date, from), lte(t.workouts.date, to)))
    .orderBy(asc(t.workouts.date), asc(t.workouts.id)).all().map(toWorkout);
}

export function getTargets(db: Db, userId: number, from: string, to: string): Map<string, WeekTarget> {
  const rows = db.select().from(t.weekTargets).where(and(eq(t.weekTargets.userId, userId), gte(t.weekTargets.weekStart, from), lte(t.weekTargets.weekStart, to))).all();
  return new Map(rows.map((r) => [r.weekStart, { km: r.km, minutes: r.minutes, note: r.note }]));
}

export function listThresholds(db: Db, userId: number): Threshold[] {
  return db.select().from(t.thresholds).where(eq(t.thresholds.userId, userId)).orderBy(asc(t.thresholds.effectiveDate)).all()
    .map((r) => ({ id: r.id, effectiveDate: r.effectiveDate, paceSecPerKm: r.paceSecPerKm, hr: r.hr }));
}

export function listRaces(db: Db, userId: number): Race[] {
  return db.select().from(t.races).where(eq(t.races.userId, userId)).orderBy(asc(t.races.date)).all()
    .map((r) => ({ id: r.id, name: r.name, date: r.date, distanceKm: r.distanceKm, goalSeconds: r.goalSeconds, priority: r.priority as Race["priority"], resultSeconds: r.resultSeconds, activityId: r.activityId,
      mpSec: r.mpSec, hmpSec: r.hmpSec, paceSource: r.paceSource, paceLockedOn: r.paceLockedOn, peakKm: r.peakKm }));
}

export function listBlocks(db: Db, userId: number): Block[] {
  return db.select().from(t.blocks).where(eq(t.blocks.userId, userId)).orderBy(asc(t.blocks.startWeek)).all()
    .map((r) => ({ id: r.id, kind: r.kind as BlockKind, name: r.name, startWeek: r.startWeek, weeks: r.weeks, note: r.note, crossMin: r.crossMin, goalKm: r.goalKm }));
}

/** Date of the last planned (not dropped) workout, or null. */
export function lastPlannedDate(db: Db, userId: number): string | null {
  return db.select({ d: sql<string | null>`max(${t.workouts.date})` }).from(t.workouts)
    .where(and(eq(t.workouts.userId, userId), sql`${t.workouts.status} != 'dropped'`, sql`${t.workouts.type} != 'rest'`)).get()?.d ?? null;
}

export function listPain(db: Db, userId: number, from?: string): PainEntry[] {
  const conds = [eq(t.painEntries.userId, userId)];
  if (from) conds.push(gte(t.painEntries.date, from));
  return db.select().from(t.painEntries).where(and(...conds)).orderBy(asc(t.painEntries.date)).all()
    .map((r) => ({ id: r.id, date: r.date, activityId: r.activityId, area: r.area, level: r.level, note: r.note }));
}

export function listCheckins(db: Db, userId: number, from: string): Checkin[] {
  return db.select().from(t.checkins).where(and(eq(t.checkins.userId, userId), gte(t.checkins.date, from))).orderBy(asc(t.checkins.date)).all()
    .map((r) => ({ date: r.date, soreness: r.soreness, feel: (r.feel as Checkin["feel"]) ?? null, note: r.note }));
}

export function listWellness(db: Db, userId: number, from: string): Wellness[] {
  return db.select().from(t.wellness).where(and(eq(t.wellness.userId, userId), gte(t.wellness.date, from))).orderBy(asc(t.wellness.date)).all()
    .map((r) => ({ date: r.date, hrvWeeklyAvg: r.hrvWeeklyAvg, hrvLastNight: r.hrvLastNight, hrvBaselineLow: r.hrvBaselineLow, restingHr: r.restingHr, bodyBatteryMax: r.bodyBatteryMax, sleepScore: r.sleepScore }));
}

export interface CsTestRow { id: number; date: string; kind: "trials" | "three_min"; inputs: unknown; csMps: number; dPrimeM: number; paceSecPerKm: number }

export function listCsTests(db: Db, userId: number): CsTestRow[] {
  return db.select().from(t.csTests).where(eq(t.csTests.userId, userId)).orderBy(asc(t.csTests.date), asc(t.csTests.id)).all()
    .map((r) => ({ id: r.id, date: r.date, kind: r.kind as CsTestRow["kind"], inputs: JSON.parse(r.inputs), csMps: r.csMps, dPrimeM: r.dPrimeM, paceSecPerKm: Math.round(1000 / r.csMps) }));
}

const toLog = (r: typeof t.activityLogs.$inferSelect): ActivityLog => ({
  note: r.note, rpe: r.rpe, carbsG: r.carbsG, nausea: r.nausea, bloating: r.bloating, cramps: r.cramps, feel: r.feel,
});

export function getLog(db: Db, userId: number, activityId: string): ActivityLog {
  const r = db.select().from(t.activityLogs).where(and(eq(t.activityLogs.userId, userId), eq(t.activityLogs.activityId, activityId))).get();
  return r ? toLog(r) : { ...EMPTY_LOG };
}

/** Logs by activity id, for the given ids only. */
export function logsFor(db: Db, userId: number, activityIds: string[]): Map<string, ActivityLog> {
  const ids = new Set(activityIds);
  const out = new Map<string, ActivityLog>();
  for (const r of db.select().from(t.activityLogs).where(eq(t.activityLogs.userId, userId)).all()) {
    if (ids.has(r.activityId)) out.set(r.activityId, toLog(r));
  }
  return out;
}

/** An all-empty log is removed instead of stored. */
export function saveLog(db: Db, userId: number, activityId: string, log: ActivityLog) {
  const where = and(eq(t.activityLogs.userId, userId), eq(t.activityLogs.activityId, activityId));
  if (Object.values(log).every((v) => v == null)) {
    db.delete(t.activityLogs).where(where).run();
    return;
  }
  db.insert(t.activityLogs).values({ userId, activityId, ...log })
    .onConflictDoUpdate({ target: [t.activityLogs.userId, t.activityLogs.activityId], set: log }).run();
}

/** Every per-user table that holds training data (not the account, settings or Garmin connection). */
export const TRAINING_TABLES = [
  t.laps, t.streams, t.activityFiles, t.activitySplits, t.activityLogs, t.csTests, t.bestEfforts, t.vo2max, t.activities, t.workouts,
  t.weekTargets, t.races, t.blocks, t.thresholds, t.painEntries, t.checkins, t.wellness, t.sessionTemplates, t.raceChecks,
  t.gymSets, t.gymSessions, t.racePlanWeeks,
];

/** Deletes training data but keeps the account, settings and Garmin connection. */
export function deleteTrainingData(db: Db, userId: number) {
  db.transaction((tx) => {
    for (const tbl of TRAINING_TABLES) {
      tx.delete(tbl).where(eq(tbl.userId, userId)).run();
    }
  });
}

export function countActivities(db: Db, userId: number): number {
  return db.select({ n: sql<number>`count(*)` }).from(t.activities).where(eq(t.activities.userId, userId)).get()?.n ?? 0;
}

export function listVo2max(db: Db, userId: number, from: string): { date: string; value: number }[] {
  return db.select({ date: t.vo2max.date, value: t.vo2max.value }).from(t.vo2max).where(and(eq(t.vo2max.userId, userId), gte(t.vo2max.date, from))).orderBy(asc(t.vo2max.date)).all();
}

/** A stored race plan week (docs/decisions/fartlek-race-plan-skeleton.md). */
export interface PlanWeekRow { userId: number; weekStart: ISODate; raceId: number; phase: string; role: string; km: number | null; longKm: number | null; computedOn: ISODate }

/** The user's race plan weeks in [from, to], oldest first. */
export function listPlanWeeks(db: Db, userId: number, from: ISODate, to: ISODate): PlanWeekRow[] {
  return db.select().from(t.racePlanWeeks).where(and(eq(t.racePlanWeeks.userId, userId), gte(t.racePlanWeeks.weekStart, from), lte(t.racePlanWeeks.weekStart, to)))
    .orderBy(asc(t.racePlanWeeks.weekStart)).all();
}

/** Every stored week of the plan for one race, oldest first. */
export function planWeeksOf(db: Db, userId: number, raceId: number): PlanWeekRow[] {
  return db.select().from(t.racePlanWeeks).where(and(eq(t.racePlanWeeks.userId, userId), eq(t.racePlanWeeks.raceId, raceId)))
    .orderBy(asc(t.racePlanWeeks.weekStart)).all();
}
