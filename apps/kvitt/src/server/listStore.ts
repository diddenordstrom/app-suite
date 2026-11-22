import { and, eq, ne } from "drizzle-orm";
import type { Db } from "./db";
import { items, lists, tripLists, trips } from "./db/schema";

type Tx = Pick<Db, "select" | "update" | "delete">;

/**
 * A list with nothing left to buy goes away, so the lists page never shows an empty one. It is archived when it
 * has bought items (trip history shows them), deleted when it has none. A list in an active trip is left alone:
 * the shopper may still be working through it, and checkout calls this again. Returns whether the list went away.
 */
export function removeIfDone(db: Tx, listId: number, now = Date.now()): boolean {
  const left = db.select({ id: items.id }).from(items).where(and(eq(items.listId, listId), ne(items.status, "bought"))).limit(1).get();
  if (left) return false;
  const inTrip = db.select({ id: trips.id }).from(tripLists).innerJoin(trips, eq(trips.id, tripLists.tripId))
    .where(and(eq(tripLists.listId, listId), eq(trips.status, "active"))).limit(1).get();
  if (inTrip) return false;
  const bought = db.select({ id: items.id }).from(items).where(eq(items.listId, listId)).limit(1).get();
  if (bought) db.update(lists).set({ archivedAt: now, updatedAt: now }).where(eq(lists.id, listId)).run();
  else db.delete(lists).where(eq(lists.id, listId)).run();
  return true;
}
