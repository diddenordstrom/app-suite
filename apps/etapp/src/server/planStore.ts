/** Reading and writing a trip's plan rows. Routes validate input; this file knows the tables and the ordering. */
import { and, asc, eq, isNull, max } from "drizzle-orm";
import type { Db } from "./db";
import { days, packItems, stopLinks, stops, todos, trips } from "./db/schema";
import type { PackItem, PlanDay, PlanResponse } from "../shared/api";
import type { PackGroup } from "../shared/packing";
import type { Category, Stop, StopKind } from "../shared/plan";
import type { QuickCommand } from "../shared/quick";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type DbOrTx = Db | Tx;

export type DayRow = typeof days.$inferSelect;
export type StopRow = typeof stops.$inferSelect;

export const photoUrl = (tripId: number, file: string | null) => (file ? `/api/t/${tripId}/photos/${file}` : null);

export function loadPlan(db: Db, tripId: number): PlanResponse {
  const t = db.select().from(trips).where(eq(trips.id, tripId)).get()!;
  const ds = db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position), asc(days.id)).all();
  const ss = db.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position), asc(stops.id)).all();
  const ts = db.select().from(todos).where(eq(todos.tripId, tripId)).orderBy(asc(todos.position), asc(todos.id)).all();
  const ls = db.select().from(stopLinks).where(eq(stopLinks.tripId, tripId)).orderBy(asc(stopLinks.position), asc(stopLinks.id)).all();
  const ps = db.select().from(packItems).where(eq(packItems.tripId, tripId)).orderBy(asc(packItems.position), asc(packItems.id)).all();
  const toStop = (s: StopRow): Stop => ({
    id: s.id, kind: s.kind, name: s.name, lat: s.lat, lon: s.lon, note: s.note, openFrom: s.openFrom, openTo: s.openTo,
    photoUrl: photoUrl(tripId, s.photo),
    todos: ts.filter((x) => x.stopId === s.id).map((x) => ({ id: x.id, text: x.text, category: x.category, done: x.done })),
    links: ls.filter((x) => x.stopId === s.id).map((x) => ({ id: x.id, url: x.url, note: x.note })),
  });
  const planDays: PlanDay[] = ds.map((d) => ({
    id: d.id, title: d.title, photoUrl: photoUrl(tripId, d.photo), driveMinutes: d.driveMinutes,
    sleep: { type: d.sleepType, name: d.sleepName, lat: d.sleepLat, lon: d.sleepLon, note: d.sleepNote },
    stops: ss.filter((s) => s.dayId === d.id).map(toStop),
  }));
  const ideas = ss.filter((s) => s.dayId === null).map(toStop);
  const pack: PackItem[] = ps.map((p) => ({ id: p.id, group: p.grp, text: p.text, done: p.done }));
  return { area: t.area, startMode: t.startMode, startText: t.startText, startDate: t.startDate, days: planDays, ideas, pack };
}

/** Next position at the end of a list. */
const after = (v: number | null | undefined) => (v ?? 0) + 1;

export function createDay(db: DbOrTx, tripId: number, title = ""): DayRow {
  const last = db.select({ m: max(days.position) }).from(days).where(eq(days.tripId, tripId)).get()?.m;
  return db.insert(days).values({ tripId, position: after(last), title, createdAt: Date.now() }).returning().get();
}

/** Last position in a day, or in the trip's idea bank when dayId is null. */
function lastPosition(db: DbOrTx, tripId: number, dayId: number | null) {
  const where = dayId === null ? and(eq(stops.tripId, tripId), isNull(stops.dayId)) : eq(stops.dayId, dayId);
  return db.select({ m: max(stops.position) }).from(stops).where(where).get()?.m;
}

/** A stop at the end of a day, or an idea (dayId null). */
export function createStop(
  db: DbOrTx, tripId: number, dayId: number | null,
  s: { name: string; kind?: StopKind; lat?: number | null; lon?: number | null; note?: string; openFrom?: number | null; openTo?: number | null },
  items: { text: string; category: Category; done?: boolean }[] = [],
): StopRow {
  const last = lastPosition(db, tripId, dayId);
  const now = Date.now();
  const row = db.insert(stops).values({
    tripId, dayId, position: after(last), kind: s.kind ?? "stop", name: s.name, lat: s.lat ?? null, lon: s.lon ?? null,
    note: s.note ?? "", openFrom: s.openFrom ?? null, openTo: s.openTo ?? null, createdAt: now,
  }).returning().get();
  items.forEach((x, i) => {
    db.insert(todos).values({ tripId, stopId: row.id, position: i + 1, text: x.text, category: x.category, done: x.done ?? false, createdAt: now }).run();
  });
  return row;
}

export function createTodo(db: DbOrTx, tripId: number, stopId: number, text: string, category: Category) {
  const last = db.select({ m: max(todos.position) }).from(todos).where(eq(todos.stopId, stopId)).get()?.m;
  return db.insert(todos).values({ tripId, stopId, position: after(last), text, category, createdAt: Date.now() }).returning().get();
}

export function createLink(db: DbOrTx, tripId: number, stopId: number, url: string, note = "") {
  const last = db.select({ m: max(stopLinks.position) }).from(stopLinks).where(eq(stopLinks.stopId, stopId)).get()?.m;
  return db.insert(stopLinks).values({ tripId, stopId, position: after(last), url, note, createdAt: Date.now() }).returning().get();
}

/** Put a stop at the end of another day, or in the idea bank (null). */
export function setStopDay(db: DbOrTx, tripId: number, stopId: number, dayId: number | null) {
  db.update(stops).set({ dayId, position: after(lastPosition(db, tripId, dayId)) }).where(eq(stops.id, stopId)).run();
}

export function createPackItems(db: DbOrTx, tripId: number, items: { group: PackGroup; text: string }[]) {
  let last = db.select({ m: max(packItems.position) }).from(packItems).where(eq(packItems.tripId, tripId)).get()?.m ?? 0;
  const now = Date.now();
  return items.map((x) => db.insert(packItems).values({ tripId, grp: x.group, position: ++last, text: x.text, createdAt: now }).returning().get());
}

/** Swap a day with its neighbour. False at the ends. */
export function moveDay(db: Db, tripId: number, dayId: number, dir: -1 | 1): boolean {
  const ds = db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position), asc(days.id)).all();
  const i = ds.findIndex((d) => d.id === dayId), j = i + dir;
  if (i < 0 || j < 0 || j >= ds.length) return false;
  db.transaction((tx) => {
    // Renumber so equal positions can never make the swap a no-op.
    ds.forEach((d, k) => {
      const pos = k === i ? j + 1 : k === j ? i + 1 : k + 1;
      tx.update(days).set({ position: pos }).where(eq(days.id, d.id)).run();
    });
  });
  return true;
}

/**
 * Move a stop one step. Inside a day it swaps with its neighbour; at the first/last place it moves to the end of the
 * previous day or the start of the next one, like the artifact. False when there is nowhere to go.
 */
export function moveStop(db: Db, tripId: number, stopId: number, dir: -1 | 1): boolean {
  const ds = db.select().from(days).where(eq(days.tripId, tripId)).orderBy(asc(days.position), asc(days.id)).all();
  const all = db.select().from(stops).where(eq(stops.tripId, tripId)).orderBy(asc(stops.position), asc(stops.id)).all();
  const s = all.find((x) => x.id === stopId);
  if (!s || s.dayId === null) return false;
  const dayId = s.dayId;
  const di = ds.findIndex((d) => d.id === s.dayId);
  const inDay = (dayId: number) => all.filter((x) => x.dayId === dayId);
  const list = inDay(dayId);
  const si = list.indexOf(s);
  const sj = si + dir;
  db.transaction((tx) => {
    const renumber = (rows: StopRow[], dayId: number) =>
      rows.forEach((r, k) => tx.update(stops).set({ dayId, position: k + 1 }).where(eq(stops.id, r.id)).run());
    if (sj >= 0 && sj < list.length) {
      const next = [...list];
      [next[si], next[sj]] = [next[sj], next[si]];
      renumber(next, dayId);
      return;
    }
    const target = ds[di + dir];
    if (!target) return;
    const moved = inDay(target.id);
    renumber(list.filter((x) => x.id !== s.id), dayId);
    renumber(dir < 0 ? [...moved, s] : [s, ...moved], target.id);
  });
  return (sj >= 0 && sj < list.length) || !!ds[di + dir];
}

/**
 * Apply parsed quick-entry commands, starting on `dayId`. Returns the day later lines landed on.
 * A paste that starts with "dag Title" on an empty day names that day instead of leaving it empty behind a new one.
 */
export function applyQuick(db: Db, tripId: number, dayId: number, commands: QuickCommand[]): number {
  return db.transaction((tx) => {
    let current = dayId;
    const d = tx.select().from(days).where(eq(days.id, dayId)).get();
    let reuse = !!d && !d.title && !d.sleepName && d.sleepLat === null && !tx.select({ id: stops.id }).from(stops).where(eq(stops.dayId, dayId)).get();
    for (const c of commands) {
      if (c.kind === "day" && reuse) tx.update(days).set({ title: c.title }).where(eq(days.id, current)).run();
      else if (c.kind === "day") current = createDay(tx, tripId, c.title).id;
      else if (c.kind === "night") {
        const set: Partial<DayRow> = {};
        if (c.sleepType) set.sleepType = c.sleepType;
        if (c.name) set.sleepName = c.name;
        if (c.lat !== null && c.lon !== null) { set.sleepLat = c.lat; set.sleepLon = c.lon; }
        if (Object.keys(set).length) tx.update(days).set(set).where(eq(days.id, current)).run();
      } else createStop(tx, tripId, current, { name: c.name, kind: c.stopKind, lat: c.lat, lon: c.lon }, c.todos);
      reuse = false;
    }
    return current;
  });
}

/** Rows that belong to the trip, else undefined (so routes can 404). */
export const dayOf = (db: Db, tripId: number, id: number) =>
  db.select().from(days).where(and(eq(days.id, id), eq(days.tripId, tripId))).get();
export const stopOf = (db: Db, tripId: number, id: number) =>
  db.select().from(stops).where(and(eq(stops.id, id), eq(stops.tripId, tripId))).get();
export const todoOf = (db: Db, tripId: number, id: number) =>
  db.select().from(todos).where(and(eq(todos.id, id), eq(todos.tripId, tripId))).get();
export const linkOf = (db: Db, tripId: number, id: number) =>
  db.select().from(stopLinks).where(and(eq(stopLinks.id, id), eq(stopLinks.tripId, tripId))).get();
export const packOf = (db: Db, tripId: number, id: number) =>
  db.select().from(packItems).where(and(eq(packItems.id, id), eq(packItems.tripId, tripId))).get();

export const countDays = (db: Db, tripId: number) => db.select({ id: days.id }).from(days).where(eq(days.tripId, tripId)).all().length;
