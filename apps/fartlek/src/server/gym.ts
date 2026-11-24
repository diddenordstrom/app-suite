import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { addDays, weekStartOf, type ISODate } from "../shared/dates";
import { chooseTemplate, latestByExercise, volume, workSetCount, type GymDay, type GymEntry, type GymSessionFull, type GymSessionInput, type GymSummary, type JointFeel, type LastTime, type LayoutEntry, type SetKind, type TemplateLayout } from "../shared/gymplan";
import type { Pattern, TemplateId } from "../shared/gym";
import type { ImportedSession } from "../shared/boltcsv";

/*
 * Storage for the gym module (docs/decisions/fartlek-gym-module.md): sessions and their sets, the latest
 * sets per exercise for "last time", and the day's suggested template from the run week.
 */

type SessionRow = typeof t.gymSessions.$inferSelect;
type SetRowDb = typeof t.gymSets.$inferSelect;

function entriesOf(sets: SetRowDb[]): GymEntry[] {
  const byPos = new Map<number, GymEntry>();
  for (const x of [...sets].sort((a, b) => a.position - b.position || a.setIndex - b.setIndex)) {
    let e = byPos.get(x.position);
    if (!e) { e = { exercise: x.exercise, slot: (x.slot as Pattern | null) ?? null, sets: [] }; byPos.set(x.position, e); }
    if (x.note) e.note = x.note;
    e.sets.push({ kind: x.kind as SetKind, kg: x.kg, reps: x.reps, seconds: x.seconds });
  }
  return [...byPos.values()];
}

const summary = (s: SessionRow, entries: GymEntry[]): GymSummary => ({
  id: s.id, date: s.date, template: (s.template as TemplateId | null) ?? null, name: s.name, source: s.source,
  exercises: entries.map((e) => e.exercise), sets: workSetCount(entries), volume: Math.round(volume(entries)),
});

function setsFor(db: Db, userId: number, sessionIds: number[]): SetRowDb[] {
  if (!sessionIds.length) return [];
  return db.select().from(t.gymSets).where(and(eq(t.gymSets.userId, userId), inArray(t.gymSets.sessionId, sessionIds))).all();
}

/** Latest work sets per exercise, from every session (optionally leaving one out). */
export function lastTimes(db: Db, userId: number, exceptSessionId?: number): Record<string, LastTime> {
  const rows = db.select({
    sessionId: t.gymSets.sessionId, exercise: t.gymSets.exercise, kind: t.gymSets.kind, kg: t.gymSets.kg, reps: t.gymSets.reps, seconds: t.gymSets.seconds, note: t.gymSets.note,
    date: t.gymSessions.date, startedAt: t.gymSessions.startedAt, position: t.gymSets.position, setIndex: t.gymSets.setIndex,
  }).from(t.gymSets).innerJoin(t.gymSessions, eq(t.gymSets.sessionId, t.gymSessions.id))
    .where(eq(t.gymSets.userId, userId)).all()
    .filter((r) => r.sessionId !== exceptSessionId)
    .sort((a, b) => a.sessionId - b.sessionId || a.position - b.position || a.setIndex - b.setIndex);
  return latestByExercise(rows);
}

export function gymDay(db: Db, userId: number, date: ISODate): GymDay {
  const workouts = repo.listWorkouts(db, userId, addDays(date, -27), addDays(date, 7));
  const planned = workouts.find((w) => w.date === date && w.type === "strength" && w.status === "planned") ?? null;
  const sessions = db.select().from(t.gymSessions).where(and(eq(t.gymSessions.userId, userId), lte(t.gymSessions.date, date))).orderBy(desc(t.gymSessions.date), desc(t.gymSessions.id)).limit(60).all();
  const previous = sessions.find((s) => s.date < date && s.template);
  const todays = sessions.filter((s) => s.date === date);
  const sets = setsFor(db, userId, todays.map((s) => s.id));
  const from = addDays(date, -27);
  const doneDays = new Set(sessions.filter((s) => s.date >= from).map((s) => s.date));
  const plannedDays = new Set(workouts.filter((w) => w.type === "strength" && w.date >= from && w.date <= date && w.status !== "dropped").map((w) => w.date));
  const weekFrom = weekStartOf(date, repo.getSettings(db, userId).weekStart);
  const perWeek = workouts.filter((w) => w.type === "strength" && w.status !== "dropped" && w.date >= weekFrom && w.date <= addDays(weekFrom, 6)).length;
  const layouts: Partial<Record<TemplateId, TemplateLayout>> = {};
  for (const s of sessions) {
    const id = s.template as TemplateId | null;
    if (!id || layouts[id] || !s.layout) continue;
    const entries = parseLayout(s.layout);
    if (entries.length) layouts[id] = { date: s.date, entries };
  }
  return {
    date, planned, layouts,
    suggested: chooseTemplate(date, workouts.filter((w) => w.date > date), (previous?.template as TemplateId | undefined) ?? null, perWeek),
    last: lastTimes(db, userId),
    logged: todays.map((s) => summary(s, entriesOf(sets.filter((x) => x.sessionId === s.id)))),
    recent: { done: doneDays.size, planned: Math.max(plannedDays.size, doneDays.size) },
  };
}

function parseLayout(json: string): LayoutEntry[] {
  try {
    const v = JSON.parse(json) as unknown;
    return Array.isArray(v) ? v as LayoutEntry[] : [];
  } catch { return []; }
}

/** Saves a session once per client id; a resend of the same session returns the stored one. */
export function saveSession(db: Db, userId: number, s: GymSessionInput | (ImportedSession & { source: "bolt" })): { id: number; created: boolean } {
  const existing = db.select({ id: t.gymSessions.id }).from(t.gymSessions).where(and(eq(t.gymSessions.userId, userId), eq(t.gymSessions.clientId, s.clientId))).get();
  if (existing) return { id: existing.id, created: false };
  const imported = "source" in s;
  return db.transaction((tx) => {
    const row = tx.insert(t.gymSessions).values({
      userId, clientId: s.clientId, date: s.date, startedAt: s.startedAt,
      finishedAt: imported ? null : s.finishedAt, template: imported ? null : s.template, name: imported ? s.name || null : null,
      feel: imported ? null : s.feel, workoutId: imported ? null : s.workoutId, source: imported ? s.source : "fartlek",
      layout: !imported && s.template && s.layout?.length ? JSON.stringify(s.layout.map((e) => ({ exercise: e.exercise.trim(), slot: e.slot ?? null, scheme: { sets: e.scheme.sets, low: e.scheme.low, high: e.scheme.high } }))) : null,
    }).returning({ id: t.gymSessions.id }).get();
    const values = s.entries.flatMap((e, position) => e.sets.map((x, setIndex) => ({
      userId, sessionId: row.id, position, setIndex, exercise: e.exercise.trim(), slot: e.slot, kind: x.kind,
      kg: x.kg, reps: x.reps == null ? null : Math.round(x.reps), seconds: x.seconds == null ? null : Math.round(x.seconds),
      note: setIndex === 0 ? e.note?.trim() || null : null,
    })));
    for (let i = 0; i < values.length; i += 200) tx.insert(t.gymSets).values(values.slice(i, i + 200)).run();
    return { id: row.id, created: true };
  });
}

export function listSessions(db: Db, userId: number, opts: { limit?: number; from?: ISODate } = {}): GymSummary[] {
  const where = opts.from ? and(eq(t.gymSessions.userId, userId), gte(t.gymSessions.date, opts.from)) : eq(t.gymSessions.userId, userId);
  const rows = db.select().from(t.gymSessions).where(where).orderBy(desc(t.gymSessions.date), desc(t.gymSessions.id)).limit(opts.limit ?? 50).all();
  const sets = setsFor(db, userId, rows.map((r) => r.id));
  return rows.map((r) => summary(r, entriesOf(sets.filter((x) => x.sessionId === r.id))));
}

export function getSession(db: Db, userId: number, id: number): GymSessionFull | null {
  const s = db.select().from(t.gymSessions).where(and(eq(t.gymSessions.userId, userId), eq(t.gymSessions.id, id))).get();
  if (!s) return null;
  const entries = entriesOf(setsFor(db, userId, [id]));
  return { ...summary(s, entries), feel: (s.feel as JointFeel | null) ?? null, startedAt: s.startedAt, finishedAt: s.finishedAt, entries };
}

export function deleteSession(db: Db, userId: number, id: number): void {
  db.delete(t.gymSessions).where(and(eq(t.gymSessions.userId, userId), eq(t.gymSessions.id, id))).run();
}
