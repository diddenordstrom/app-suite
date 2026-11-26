/** Row → API shape mappers and loaders shared by several route files. */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "./db";
import { expenses, expenseShares, items, memberships, settlements, tripAllocations, tripLists, trips } from "./db/schema";
import type { Expense, Item, Settlement, Trip } from "../shared/api";
import type { CarCalc } from "../shared/car";

/** The stored car calculation; anything unreadable counts as none (the amount is what the ledger uses). */
export function parseCar(raw: string | null): CarCalc | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as CarCalc; } catch { return null; }
}

type ItemRow = typeof items.$inferSelect;
type TripRow = typeof trips.$inferSelect;
type ExpenseRow = typeof expenses.$inferSelect;
type SettlementRow = typeof settlements.$inferSelect;

export const toItem = (r: ItemRow): Item => ({
  id: r.id, listId: r.listId, text: r.text, quantity: r.quantity, note: r.note, price: r.price,
  status: r.status, tripId: r.tripId, position: r.position, updatedAt: r.updatedAt,
});

export const toSettlement = (r: SettlementRow): Settlement => ({
  id: r.id, fromId: r.fromId, toId: r.toId, amount: r.amount, note: r.note, createdAt: r.createdAt,
});

/**
 * Closed trips whose split is locked: a payment between the shopper's wallet and the wallet of someone the trip
 * is split on was registered after the trip closed. There is no "paid" flag per trip (balances are netted), so a
 * later payment between the pair is the signal that the amount has been settled.
 */
function lockedTripIds(db: Db, rows: TripRow[], allocs: { tripId: number; ownerId: number }[]): Set<number> {
  const closed = rows.filter((t) => t.status === "closed" && t.closedAt != null);
  const out = new Set<number>();
  if (closed.length === 0) return out;
  const hids = [...new Set(closed.map((t) => t.householdId))];
  const ms = db.select({ id: memberships.id, walletId: memberships.walletId }).from(memberships).where(inArray(memberships.householdId, hids)).all();
  const lead = (id: number) => ms.find((m) => m.id === id)?.walletId ?? id;
  const sets = db.select().from(settlements).where(inArray(settlements.householdId, hids)).all();
  for (const t of closed) {
    const shopper = lead(t.shopperId);
    const debtors = new Set(allocs.filter((a) => a.tripId === t.id && lead(a.ownerId) !== shopper).map((a) => lead(a.ownerId)));
    if (sets.some((s) => s.householdId === t.householdId && s.createdAt >= t.closedAt! && ((lead(s.fromId) === shopper && debtors.has(lead(s.toId))) || (lead(s.toId) === shopper && debtors.has(lead(s.fromId)))))) out.add(t.id);
  }
  return out;
}

export function loadTrips(db: Db, rows: TripRow[]): Trip[] {
  if (rows.length === 0) return [];
  const ids = rows.map((t) => t.id);
  const tl = db.select().from(tripLists).where(inArray(tripLists.tripId, ids)).all();
  const allocs = db.select().from(tripAllocations).where(inArray(tripAllocations.tripId, ids)).orderBy(tripAllocations.id).all();
  const bought = db.select().from(items)
    .where(and(inArray(items.tripId, ids), eq(items.status, "bought"))).orderBy(items.listId, items.position, items.id).all();
  const locked = lockedTripIds(db, rows, allocs);
  return rows.map((t) => ({
    id: t.id, shopperId: t.shopperId, store: t.store, status: t.status, startedAt: t.startedAt, closedAt: t.closedAt,
    listIds: tl.filter((x) => x.tripId === t.id).map((x) => x.listId).sort((a, b) => a - b),
    allocations: allocs.filter((a) => a.tripId === t.id).map((a) => ({ ownerId: a.ownerId, amount: a.amount })),
    boughtItems: t.status === "closed" ? bought.filter((i) => i.tripId === t.id).map(toItem) : [],
    guests: t.guests, guestAmount: t.guestAmount,
    locked: locked.has(t.id),
  }));
}

export function loadExpenses(db: Db, rows: ExpenseRow[]): Expense[] {
  if (rows.length === 0) return [];
  const shares = db.select().from(expenseShares)
    .where(inArray(expenseShares.expenseId, rows.map((e) => e.id))).orderBy(expenseShares.memberId).all();
  return rows.map((e) => ({
    id: e.id, createdById: e.createdById, payerId: e.payerId, title: e.title, amount: e.amount,
    splitMode: e.splitMode, date: e.date, category: e.category, note: e.note, createdAt: e.createdAt,
    gift: e.gift, guests: e.guests, guestAmount: e.guestAmount, car: parseCar(e.car),
    shares: shares.filter((s) => s.expenseId === e.id).map((s) => ({ memberId: s.memberId, weight: s.weight, amount: s.amount })),
  }));
}

/** All expenses in a household, newest first (by date, then creation). */
export const householdExpenses = (db: Db, hid: number) =>
  loadExpenses(db, db.select().from(expenses).where(eq(expenses.householdId, hid))
    .orderBy(desc(expenses.date), desc(expenses.createdAt), desc(expenses.id)).all());

export const householdSettlements = (db: Db, hid: number) =>
  db.select().from(settlements).where(eq(settlements.householdId, hid))
    .orderBy(desc(settlements.createdAt), desc(settlements.id)).all().map(toSettlement);

export const closedTrips = (db: Db, hid: number, limit?: number) => {
  const q = db.select().from(trips).where(and(eq(trips.householdId, hid), eq(trips.status, "closed")))
    .orderBy(desc(trips.closedAt), desc(trips.id));
  return loadTrips(db, limit ? q.limit(limit).all() : q.all());
};
