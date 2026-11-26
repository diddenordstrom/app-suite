/** /h/:hid/trips — shopping trips (D7) and per-owner checkout (D4). */
import { Hono, type Context } from "hono";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "../db";
import { items, lists, memberships, tripAllocations, tripLists, trips } from "../db/schema";
import type { EventBus } from "../events";
import { arr, badRequest, conflict, forbidden, idParam, int, notFound, oneOf, optStr, readBody, type Body } from "../http";
import type { AppEnv } from "../viewer";
import { closedTrips, loadTrips } from "../views";
import { removeIfDone } from "../listStore";

const OP_STATUSES = ["open", "checked", "skipped"] as const;

function parseAllocations(b: Body, allowed: Set<number>): { ownerId: number; amount: number }[] {
  const allocations = arr(b.allocations, "allocations", 100).map((a) => {
    const x = (a ?? {}) as Body;
    const ownerId = int(x.ownerId, "ownerId", 1);
    if (!allowed.has(ownerId)) throw badRequest("ownerId must be an active member of the household");
    return { ownerId, amount: int(x.amount, "amount", 0) };
  });
  if (new Set(allocations.map((a) => a.ownerId)).size !== allocations.length) throw badRequest("duplicate ownerId");
  return allocations;
}

export function tripRoutes(db: Db, bus: EventBus) {
  const app = new Hono<AppEnv>();

  const loadTrip = (c: Context<AppEnv>) => {
    const t = db.select().from(trips).where(and(eq(trips.id, idParam(c, "id")), eq(trips.householdId, c.get("hid")))).get();
    if (!t) throw notFound("trip not found");
    return t;
  };
  /** Active trip the viewer may close: the shopper, or an admin (for abandoned trips). */
  const closableTrip = (c: Context<AppEnv>) => {
    const t = loadTrip(c);
    const me = c.get("member");
    if (t.shopperId !== me.id && me.role !== "admin") throw forbidden("only the shopper can finish this trip");
    if (t.status !== "active") throw conflict("trip is not active");
    return t;
  };
  const listIdsOf = (tripId: number) =>
    db.select({ id: tripLists.listId }).from(tripLists).where(eq(tripLists.tripId, tripId)).all().map((r) => r.id);

  app.get("/trips", (c) => {
    const hid = c.get("hid");
    const active = db.select().from(trips).where(and(eq(trips.householdId, hid), eq(trips.status, "active")))
      .orderBy(desc(trips.startedAt)).all();
    return c.json([...loadTrips(db, active), ...closedTrips(db, hid, 30)]);
  });

  app.get("/trips/:id", (c) => c.json(loadTrips(db, [loadTrip(c)])[0]));

  app.post("/trips", async (c) => {
    const hid = c.get("hid");
    const b = await readBody(c);
    const listIds = [...new Set(arr(b.listIds, "listIds", 50).map((v) => int(v, "listIds", 1)))];
    if (listIds.length === 0) throw badRequest("pick at least one list");
    const store = optStr(b, "store", 50) ?? null;
    const found = db.select({ id: lists.id }).from(lists).where(and(inArray(lists.id, listIds), eq(lists.householdId, hid), isNull(lists.archivedAt))).all();
    if (found.length !== listIds.length) throw notFound("list not found");
    const busy = db.select({ id: tripLists.listId }).from(tripLists).innerJoin(trips, eq(trips.id, tripLists.tripId))
      .where(and(inArray(tripLists.listId, listIds), eq(trips.status, "active"))).all();
    if (busy.length) throw conflict("a list is already in an active trip");
    const trip = db.transaction((tx) => {
      const t = tx.insert(trips).values({ householdId: hid, shopperId: c.get("member").id, store, startedAt: Date.now() }).returning().get();
      tx.insert(tripLists).values(listIds.map((listId) => ({ tripId: t.id, listId }))).run();
      return t;
    });
    bus.emit(hid, "trips");
    return c.json(loadTrips(db, [trip])[0]);
  });

  // Idempotent so the offline queue can replay: unknown, foreign or bought items are skipped.
  app.post("/trips/:id/ops", async (c) => {
    const t = loadTrip(c);
    if (t.status !== "active") throw conflict("trip is not active");
    const ops = arr((await readBody(c)).ops, "ops", 1000).map((o) => {
      const op = (o ?? {}) as Body;
      return { itemId: int(op.itemId, "itemId", 1), status: oneOf(op.status, "status", OP_STATUSES) };
    });
    const listIds = listIdsOf(t.id);
    const now = Date.now();
    db.transaction((tx) => {
      for (const op of ops) {
        tx.update(items)
          .set({ status: op.status, tripId: op.status === "open" ? null : t.id, updatedAt: now })
          .where(and(eq(items.id, op.itemId), inArray(items.listId, listIds), ne(items.status, "bought"))).run();
      }
    });
    bus.emit(c.get("hid"), "lists", "trips");
    return c.json({ ok: true });
  });

  app.post("/trips/:id/checkout", async (c) => {
    const t = loadTrip(c);
    if (t.shopperId !== c.get("member").id) throw forbidden("only the shopper can check out");
    if (t.status !== "active") throw conflict("trip is not active");
    // The shopper may split the bill on any active member, not only the owners of the trip's lists.
    const members = new Set(db.select({ id: memberships.id }).from(memberships)
      .where(and(eq(memberships.householdId, c.get("hid")), isNull(memberships.removedAt))).all().map((r) => r.id));
    const allocations = parseAllocations(await readBody(c), members);
    const now = Date.now();
    db.transaction((tx) => {
      tx.update(items).set({ status: "bought", updatedAt: now }).where(and(eq(items.tripId, t.id), eq(items.status, "checked"))).run();
      tx.update(items).set({ status: "open", tripId: null, updatedAt: now }).where(and(eq(items.tripId, t.id), ne(items.status, "bought"))).run();
      if (allocations.length) tx.insert(tripAllocations).values(allocations.map((a) => ({ tripId: t.id, ...a }))).run();
      tx.update(trips).set({ status: "closed", closedAt: now }).where(eq(trips.id, t.id)).run();
      // Lists where everything got bought are done: they leave the lists page, and stay in this trip's history.
      for (const listId of listIdsOf(t.id)) removeIfDone(tx, listId, now);
    });
    bus.emit(c.get("hid"), "lists", "trips", "balances");
    return c.json(loadTrips(db, [{ ...t, status: "closed", closedAt: now }])[0]);
  });

  /** Redo the split of a closed trip: the shopper or an admin, until a payment covers it (`locked`). */
  app.patch("/trips/:id", async (c) => {
    const t = loadTrip(c);
    const me = c.get("member");
    if (t.shopperId !== me.id && me.role !== "admin") throw forbidden("only the shopper or an admin can change this trip");
    if (t.status !== "closed") throw conflict("trip is not closed");
    if (loadTrips(db, [t])[0]!.locked) throw conflict("a payment has been registered since, so the split can no longer change");
    const members = new Set(db.select({ id: memberships.id }).from(memberships)
      .where(and(eq(memberships.householdId, c.get("hid")), isNull(memberships.removedAt))).all().map((r) => r.id));
    // Someone who has since left may stay on the trip they were already part of.
    for (const a of db.select().from(tripAllocations).where(eq(tripAllocations.tripId, t.id)).all()) members.add(a.ownerId);
    const allocations = parseAllocations(await readBody(c), members);
    db.transaction((tx) => {
      tx.delete(tripAllocations).where(eq(tripAllocations.tripId, t.id)).run();
      if (allocations.length) tx.insert(tripAllocations).values(allocations.map((a) => ({ tripId: t.id, ...a }))).run();
    });
    bus.emit(c.get("hid"), "trips", "balances");
    return c.json(loadTrips(db, [t])[0]);
  });

  app.post("/trips/:id/cancel", (c) => {
    const t = closableTrip(c);
    const now = Date.now();
    db.transaction((tx) => {
      tx.update(items).set({ status: "open", tripId: null, updatedAt: now }).where(and(eq(items.tripId, t.id), ne(items.status, "bought"))).run();
      tx.update(trips).set({ status: "cancelled", closedAt: now }).where(eq(trips.id, t.id)).run();
    });
    bus.emit(c.get("hid"), "lists", "trips");
    return c.json({ ok: true });
  });

  return app;
}
