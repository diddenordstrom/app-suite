/** /t/:tid/plan, days, stops, todos, packing list and quick entry. Any traveller on the trip may edit. */
import { Hono, type Context } from "hono";
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import { days, packItems, stopLinks, stops, todos, trips } from "../db/schema";
import type { EventBus } from "../events";
import { badRequest, httpUrl, idParam, int, notFound, oneOf, optBool, optDate, optLatLon, optMonth, optText, readBody, str, type Body } from "../http";
import type { AppEnv } from "../viewer";
import {
  applyQuick, countDays, createDay, createLink, createPackItems, createStop, createTodo, dayOf, linkOf, loadPlan, moveDay, moveStop, packOf,
  setStopDay, stopOf, todoOf,
} from "../planStore";
import { PACK_GROUPS, STARTER_PACK } from "../../shared/packing";
import { CATEGORIES, SLEEP_TYPES, START_MODES, STOP_KINDS } from "../../shared/plan";
import { parseQuick, parseTodo, summarize } from "../../shared/quick";
import type { QuickResponse } from "../../shared/api";
import type { PhotoStore } from "../photos";


/** "fika Bakeriet, se kyrkan" → todos, as in quick entry. */
const todoList = (b: Body) => (optText(b, "todos", 2000) ?? "").split(",").map((x) => x.trim()).filter(Boolean).slice(0, 50).map(parseTodo);

const dir = (b: Body): -1 | 1 => {
  if (b.dir !== -1 && b.dir !== 1) throw badRequest("dir must be -1 or 1");
  return b.dir;
};

export function planRoutes(db: Db, bus: EventBus, photos: PhotoStore) {
  const app = new Hono<AppEnv>();
  const changed = (c: Context<AppEnv>) => bus.emit(c.get("tid"), "plan");
  const ok = (c: Context<AppEnv>) => { changed(c); return c.json({ ok: true }); };

  const day = (c: Context<AppEnv>) => dayOf(db, c.get("tid"), idParam(c, "id")) ?? (() => { throw notFound("day not found"); })();
  const stop = (c: Context<AppEnv>) => stopOf(db, c.get("tid"), idParam(c, "id")) ?? (() => { throw notFound("stop not found"); })();

  app.get("/plan", (c) => c.json(loadPlan(db, c.get("tid"))));

  app.patch("/plan", async (c) => {
    const b = await readBody(c);
    const set: Partial<typeof trips.$inferInsert> = {};
    const area = optText(b, "area", 80);
    if (area !== undefined) set.area = area;
    if (b.startMode !== undefined) set.startMode = oneOf(b.startMode, "startMode", START_MODES);
    const startText = optText(b, "startText", 200);
    if (startText !== undefined) set.startText = startText;
    const startDate = optDate(b, "startDate");
    if (startDate !== undefined) set.startDate = startDate;
    if (Object.keys(set).length) db.update(trips).set(set).where(eq(trips.id, c.get("tid"))).run();
    return ok(c);
  });

  // ---- days ----
  app.post("/days", async (c) => {
    const b = await readBody(c);
    const row = createDay(db, c.get("tid"), optText(b, "title", 80) ?? "");
    changed(c);
    return c.json({ id: row.id });
  });

  app.patch("/days/:id", async (c) => {
    const d = day(c);
    const b = await readBody(c);
    const set: Partial<typeof days.$inferInsert> = {};
    const title = optText(b, "title", 80);
    if (title !== undefined) set.title = title;
    if (b.sleepType !== undefined) set.sleepType = oneOf(b.sleepType, "sleepType", SLEEP_TYPES);
    const name = optText(b, "sleepName", 120);
    if (name !== undefined) set.sleepName = name;
    const note = optText(b, "sleepNote", 300);
    if (note !== undefined) set.sleepNote = note;
    const pos = optLatLon(b, "sleepLat", "sleepLon");
    if (pos) { set.sleepLat = pos.lat; set.sleepLon = pos.lon; }
    if (b.driveMinutes !== undefined) set.driveMinutes = b.driveMinutes === null ? null : Math.min(int(b.driveMinutes, "driveMinutes"), 48 * 60);
    if (Object.keys(set).length) db.update(days).set(set).where(eq(days.id, d.id)).run();
    return ok(c);
  });

  app.post("/days/:id/move", async (c) => {
    const d = day(c);
    moveDay(db, c.get("tid"), d.id, dir(await readBody(c)));
    return ok(c);
  });

  /** Deleting the last day leaves a fresh empty one: a trip always has a day to add stops to. */
  app.delete("/days/:id", (c) => {
    const d = day(c);
    const tid = c.get("tid");
    const stopPhotos = db.select({ photo: stops.photo }).from(stops).where(eq(stops.dayId, d.id)).all();
    db.delete(days).where(eq(days.id, d.id)).run();
    photos.remove(d.photo);
    for (const s of stopPhotos) photos.remove(s.photo);
    if (countDays(db, tid) === 0) createDay(db, tid);
    return ok(c);
  });

  // ---- stops ----
  /** A new stop on a day or idea in the bank: name, kind, position, note, todos and a first link in one request. */
  const addStop = async (c: Context<AppEnv>, dayId: number | null) => {
    const b = await readBody(c);
    const pos = optLatLon(b) ?? { lat: null, lon: null };
    const kind = b.kind === undefined ? "stop" : oneOf(b.kind, "kind", STOP_KINDS);
    const url = b.url === undefined || b.url === "" ? null : httpUrl(b, "url");
    const tid = c.get("tid");
    const row = db.transaction((tx) => {
      const r = createStop(tx, tid, dayId, { name: str(b, "name", 120), kind, ...pos, note: optText(b, "note", 1000) ?? "" }, kind === "via" ? [] : todoList(b));
      if (url) createLink(tx, tid, r.id, url);
      return r;
    });
    changed(c);
    return c.json({ id: row.id });
  };

  app.post("/days/:id/stops", (c) => addStop(c, day(c).id));
  app.post("/ideas", (c) => addStop(c, null));

  app.patch("/stops/:id", async (c) => {
    const s = stop(c);
    const b = await readBody(c);
    const set: Partial<typeof stops.$inferInsert> = {};
    if (b.name !== undefined) set.name = str(b, "name", 120);
    const note = optText(b, "note", 1000);
    if (note !== undefined) set.note = note;
    const pos = optLatLon(b);
    if (pos) { set.lat = pos.lat; set.lon = pos.lon; }
    const from = optMonth(b, "openFrom"), to = optMonth(b, "openTo");
    if (from !== undefined) set.openFrom = from;
    if (to !== undefined) set.openTo = to;
    if (b.kind !== undefined) set.kind = oneOf(b.kind, "kind", STOP_KINDS);
    let target: number | null | undefined;
    if (b.dayId === null) target = null;
    else if (b.dayId !== undefined) {
      const d = typeof b.dayId === "number" ? dayOf(db, c.get("tid"), b.dayId) : undefined;
      if (!d) throw notFound("day not found");
      target = d.id;
    }
    db.transaction((tx) => {
      if (Object.keys(set).length) tx.update(stops).set(set).where(eq(stops.id, s.id)).run();
      if (target !== undefined && target !== s.dayId) setStopDay(tx, c.get("tid"), s.id, target);
    });
    return ok(c);
  });

  app.post("/stops/:id/move", async (c) => {
    const s = stop(c);
    moveStop(db, c.get("tid"), s.id, dir(await readBody(c)));
    return ok(c);
  });

  app.delete("/stops/:id", (c) => {
    const s = stop(c);
    db.delete(stops).where(eq(stops.id, s.id)).run();
    photos.remove(s.photo);
    return ok(c);
  });

  // ---- inspiration links ----
  app.post("/stops/:id/links", async (c) => {
    const s = stop(c);
    const b = await readBody(c);
    const row = createLink(db, c.get("tid"), s.id, httpUrl(b, "url"), optText(b, "note", 300) ?? "");
    changed(c);
    return c.json({ id: row.id });
  });

  app.patch("/links/:id", async (c) => {
    const l = linkOf(db, c.get("tid"), idParam(c, "id"));
    if (!l) throw notFound("link not found");
    const b = await readBody(c);
    const set: Partial<typeof stopLinks.$inferInsert> = {};
    if (b.url !== undefined) set.url = httpUrl(b, "url");
    const note = optText(b, "note", 300);
    if (note !== undefined) set.note = note;
    if (Object.keys(set).length) db.update(stopLinks).set(set).where(eq(stopLinks.id, l.id)).run();
    return ok(c);
  });

  app.delete("/links/:id", (c) => {
    const l = linkOf(db, c.get("tid"), idParam(c, "id"));
    if (!l) throw notFound("link not found");
    db.delete(stopLinks).where(eq(stopLinks.id, l.id)).run();
    return ok(c);
  });

  // ---- todos ----
  app.post("/stops/:id/todos", async (c) => {
    const s = stop(c);
    const b = await readBody(c);
    const category = b.category === undefined ? "se" : oneOf(b.category, "category", CATEGORIES);
    const row = createTodo(db, c.get("tid"), s.id, str(b, "text", 200), category);
    changed(c);
    return c.json({ id: row.id });
  });

  app.patch("/todos/:id", async (c) => {
    const x = todoOf(db, c.get("tid"), idParam(c, "id"));
    if (!x) throw notFound("todo not found");
    const b = await readBody(c);
    const set: Partial<typeof todos.$inferInsert> = {};
    if (b.text !== undefined) set.text = str(b, "text", 200);
    if (b.category !== undefined) set.category = oneOf(b.category, "category", CATEGORIES);
    const done = optBool(b, "done");
    if (done !== undefined) set.done = done;
    if (Object.keys(set).length) db.update(todos).set(set).where(eq(todos.id, x.id)).run();
    return ok(c);
  });

  app.delete("/todos/:id", (c) => {
    const x = todoOf(db, c.get("tid"), idParam(c, "id"));
    if (!x) throw notFound("todo not found");
    db.delete(todos).where(eq(todos.id, x.id)).run();
    return ok(c);
  });

  // ---- packing list ----
  app.post("/pack", async (c) => {
    const b = await readBody(c);
    const group = b.group === undefined ? "other" : oneOf(b.group, "group", PACK_GROUPS);
    const [row] = createPackItems(db, c.get("tid"), [{ group, text: str(b, "text", 200) }]);
    changed(c);
    return c.json({ id: row.id });
  });

  /** Adds the roof-tent starter list. */
  app.post("/pack/starter", (c) => {
    createPackItems(db, c.get("tid"), PACK_GROUPS.flatMap((group) => STARTER_PACK[group].map((text) => ({ group, text }))));
    return ok(c);
  });

  app.patch("/pack/:id", async (c) => {
    const p = packOf(db, c.get("tid"), idParam(c, "id"));
    if (!p) throw notFound("item not found");
    const b = await readBody(c);
    const set: Partial<typeof packItems.$inferInsert> = {};
    if (b.text !== undefined) set.text = str(b, "text", 200);
    if (b.group !== undefined) set.grp = oneOf(b.group, "group", PACK_GROUPS);
    const done = optBool(b, "done");
    if (done !== undefined) set.done = done;
    if (Object.keys(set).length) db.update(packItems).set(set).where(eq(packItems.id, p.id)).run();
    return ok(c);
  });

  app.delete("/pack/:id", (c) => {
    const p = packOf(db, c.get("tid"), idParam(c, "id"));
    if (!p) throw notFound("item not found");
    db.delete(packItems).where(eq(packItems.id, p.id)).run();
    return ok(c);
  });

  // ---- quick entry ----
  app.post("/quick", async (c) => {
    const b = await readBody(c);
    if (typeof b.dayId !== "number") throw badRequest("dayId is required");
    const d = dayOf(db, c.get("tid"), b.dayId);
    if (!d) throw notFound("day not found");
    const text = str(b, "text", 20_000);
    const parsed = parseQuick(text);
    const dayId = applyQuick(db, c.get("tid"), d.id, parsed.commands);
    if (parsed.commands.length) changed(c);
    const body: QuickResponse = { dayId, added: summarize(parsed), warnings: parsed.warnings };
    return c.json(body);
  });

  return app;
}
