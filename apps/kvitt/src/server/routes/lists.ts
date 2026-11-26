/** /h/:hid/lists and items. Only the list owner edits (D6). */
import { Hono, type Context } from "hono";
import { and, asc, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";
import type { Db } from "../db";
import { items, lists } from "../db/schema";
import type { EventBus } from "../events";
import { badRequest, forbidden, idParam, int, notFound, oneOf, optStr, readBody, str, type Body } from "../http";
import type { AppEnv } from "../viewer";
import { toItem } from "../views";
import { removeIfDone } from "../listStore";
import { LIST_COLORS, type ItemSuggestion, type List, type ListColor } from "../../shared/api";

type ListRow = typeof lists.$inferSelect;

const toList = (l: ListRow, its: List["items"]): List => ({
  id: l.id, ownerId: l.ownerId, title: l.title, store: l.store, color: l.color as ListColor, updatedAt: l.updatedAt, items: its,
});

function itemFields(b: Body, partial: boolean) {
  const set: Partial<typeof items.$inferInsert> = {};
  if (!partial || b.text !== undefined) set.text = str(b, "text", 200);
  const quantity = optStr(b, "quantity", 50);
  if (quantity !== undefined) set.quantity = quantity;
  const note = optStr(b, "note", 300);
  if (note !== undefined) set.note = note;
  if (b.price !== undefined) set.price = b.price === null ? null : int(b.price, "price");
  return set;
}

export function listRoutes(db: Db, bus: EventBus) {
  const app = new Hono<AppEnv>();

  const loadList = (hid: number, id: number) => {
    const l = db.select().from(lists).where(and(eq(lists.id, id), eq(lists.householdId, hid), isNull(lists.archivedAt))).get();
    if (!l) throw notFound("list not found");
    return l;
  };
  /** List in this household owned by the viewer. */
  const ownList = (c: Context<AppEnv>, id: number) => {
    const l = loadList(c.get("hid"), id);
    if (l.ownerId !== c.get("member").id) throw forbidden("only the list owner can edit it");
    return l;
  };
  const ownItem = (c: Context<AppEnv>) => {
    const row = db.select({ item: items, list: lists }).from(items).innerJoin(lists, eq(lists.id, items.listId))
      .where(and(eq(items.id, idParam(c, "id")), eq(lists.householdId, c.get("hid")))).get();
    if (!row) throw notFound("item not found");
    if (row.list.ownerId !== c.get("member").id) throw forbidden("only the list owner can edit it");
    return row.item;
  };
  const touch = (listId: number, hid: number) => {
    db.update(lists).set({ updatedAt: Date.now() }).where(eq(lists.id, listId)).run();
    bus.emit(hid, "lists");
  };
  const fullList = (l: ListRow) => toList(l, db.select().from(items)
    .where(and(eq(items.listId, l.id), ne(items.status, "bought"))).orderBy(asc(items.position), asc(items.id)).all().map(toItem));

  app.get("/lists", (c) => {
    const ls = db.select().from(lists).where(and(eq(lists.householdId, c.get("hid")), isNull(lists.archivedAt))).orderBy(lists.id).all();
    const its = ls.length ? db.select().from(items)
      .where(and(inArray(items.listId, ls.map((l) => l.id)), ne(items.status, "bought")))
      .orderBy(asc(items.position), asc(items.id)).all() : [];
    return c.json(ls.map((l) => toList(l, its.filter((i) => i.listId === l.id).map(toItem))));
  });

  /**
   * Item history for add-item suggestions: one row per lower(trim(text)) across every list and status
   * (incl. bought), most used first. SQLite takes bare columns from the row matching max(), so text and
   * quantity are the most recent usage's. The client filters this locally while typing.
   */
  app.get("/items/suggestions", (c) => {
    // Grouped in JS, not SQL: SQLite's lower() only folds ASCII, and "Mjölk"/"MJÖLK" must merge.
    const rows = db.select({ text: items.text, quantity: items.quantity, updatedAt: items.updatedAt })
      .from(items).innerJoin(lists, eq(lists.id, items.listId))
      .where(eq(lists.householdId, c.get("hid")))
      .orderBy(desc(items.updatedAt)).all();
    const groups = new Map<string, ItemSuggestion>();
    for (const r of rows) { // newest first, so the first row per key sets text/quantity/lastUsed
      const text = r.text.trim();
      if (!text) continue;
      const key = text.toLocaleLowerCase("sv");
      const g = groups.get(key);
      if (g) g.count++;
      else groups.set(key, { text, quantity: r.quantity, count: 1, lastUsed: r.updatedAt });
    }
    const out = [...groups.values()].sort((a, b) => b.count - a.count || b.lastUsed - a.lastUsed).slice(0, 200);
    return c.json(out);
  });

  app.post("/lists", async (c) => {
    const b = await readBody(c);
    const now = Date.now();
    const l = db.insert(lists).values({
      householdId: c.get("hid"), ownerId: c.get("member").id, title: str(b, "title", 100),
      store: optStr(b, "store", 50) ?? null, color: b.color === undefined ? "default" : oneOf(b.color, "color", LIST_COLORS),
      createdAt: now, updatedAt: now,
    }).returning().get();
    bus.emit(c.get("hid"), "lists");
    return c.json(toList(l, []));
  });

  app.patch("/lists/:id", async (c) => {
    const l = ownList(c, idParam(c, "id"));
    const b = await readBody(c);
    const set: Partial<typeof lists.$inferInsert> = { updatedAt: Date.now() };
    if (b.title !== undefined) set.title = str(b, "title", 100);
    const store = optStr(b, "store", 50);
    if (store !== undefined) set.store = store;
    if (b.color !== undefined) set.color = oneOf(b.color, "color", LIST_COLORS);
    const updated = db.update(lists).set(set).where(eq(lists.id, l.id)).returning().get();
    bus.emit(c.get("hid"), "lists");
    return c.json(fullList(updated));
  });

  app.delete("/lists/:id", (c) => {
    const l = ownList(c, idParam(c, "id"));
    db.delete(lists).where(eq(lists.id, l.id)).run();
    bus.emit(c.get("hid"), "lists", "trips");
    return c.json({ ok: true });
  });

  app.post("/lists/:id/items", async (c) => {
    const l = ownList(c, idParam(c, "id"));
    const fields = itemFields(await readBody(c), false);
    const top = db.select({ p: max(items.position) }).from(items).where(eq(items.listId, l.id)).get()?.p ?? 0;
    const now = Date.now();
    const item = db.insert(items).values({
      listId: l.id, text: fields.text!, quantity: fields.quantity ?? null, note: fields.note ?? null, price: fields.price ?? null,
      position: top + 1, createdAt: now, updatedAt: now,
    }).returning().get();
    touch(l.id, c.get("hid"));
    return c.json(toItem(item));
  });

  app.patch("/items/:id", async (c) => {
    const item = ownItem(c);
    const b = await readBody(c);
    const set = { ...itemFields(b, true), updatedAt: Date.now() };
    if (b.position !== undefined) {
      if (typeof b.position !== "number" || !Number.isFinite(b.position)) throw badRequest("position must be a number");
      set.position = b.position;
    }
    const updated = db.update(items).set(set).where(eq(items.id, item.id)).returning().get();
    touch(item.listId, c.get("hid"));
    return c.json(toItem(updated));
  });

  app.delete("/items/:id", (c) => {
    const item = ownItem(c);
    // Removing the last thing to buy removes the list too.
    db.transaction((tx) => {
      tx.delete(items).where(eq(items.id, item.id)).run();
      removeIfDone(tx, item.listId);
    });
    touch(item.listId, c.get("hid"));
    return c.json({ ok: true });
  });

  return app;
}
