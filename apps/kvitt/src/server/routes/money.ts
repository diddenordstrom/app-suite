/** /h/:hid — expenses (D9), settlements, balances and activity (D10). */
import { Hono, type Context } from "hono";
import { and, eq } from "drizzle-orm";
import type { Db } from "../db";
import { expenses, expenseShares, households, memberships, settlements, tripAllocations, trips } from "../db/schema";
import type { EventBus } from "../events";
import { arr, badRequest, forbidden, idParam, int, notFound, oneOf, optStr, readBody, str, type Body } from "../http";
import type { AppEnv } from "../viewer";
import { closedTrips, householdExpenses, householdSettlements, loadExpenses, toSettlement } from "../views";
import { expenseDebts, memberTotals, mergeWallets, netBalances, settlementDebt, settlementPlan, simplifyDebts, splitAmount, splitWithGuests, tripDebts, type Debt, type SplitMode } from "../../shared/balances";
import { hintDue, lastGiftByMember, MAX_GUESTS } from "../../shared/gifts";
import { CAR_LIMITS, looksLikeFuel, type CarCalc } from "../../shared/car";
import type { Activity, BalancesResponse, CarHelpResponse, GiftsResponse, StatsEntry } from "../../shared/api";

const SPLIT_MODES: SplitMode[] = ["equal", "shares", "exact"];

export function moneyRoutes(db: Db, bus: EventBus) {
  const app = new Hono<AppEnv>();

  const activeMemberIds = (hid: number) => new Set(db.select({ id: memberships.id, removedAt: memberships.removedAt })
    .from(memberships).where(eq(memberships.householdId, hid)).all().filter((m) => m.removedAt === null).map((m) => m.id));

  /** Validate an ExpenseBody. `allowed` = member ids that may appear (active members, plus existing ones on edit). */
  const parseExpense = (b: Body, allowed: Set<number>) => {
    if (b.gift !== undefined && typeof b.gift !== "boolean") throw badRequest("gift must be a boolean");
    const gift = b.gift === true;
    // A gift (bjudning) may be unpriced; everything else needs a positive amount.
    const amount = gift ? int(b.amount ?? 0, "amount", 0) : int(b.amount, "amount", 1);
    const guests = b.guests === undefined ? 0 : int(b.guests, "guests", 0);
    if (guests > MAX_GUESTS) throw badRequest(`guests can be at most ${MAX_GUESTS}`);
    const payerId = int(b.payerId, "payerId", 1);
    if (!allowed.has(payerId)) throw badRequest("payer must be a member of this household");
    const splitMode = gift ? "equal" : oneOf(b.splitMode, "splitMode", SPLIT_MODES);
    if (!gift && guests > 0 && splitMode !== "equal") throw badRequest("guests need an equal split");
    const date = str(b, "date", 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw badRequest("date must be YYYY-MM-DD");
    const parts = arr(b.participants, "participants", 100).map((p) => {
      const x = (p ?? {}) as Body;
      const memberId = int(x.memberId, "memberId", 1);
      if (!allowed.has(memberId)) throw badRequest("participants must be members of this household");
      return { memberId, weight: splitMode === "equal" ? 1 : int(x.weight, "weight", 0) };
    });
    let shares: { memberId: number; amount: number }[];
    let guestAmount = 0;
    try {
      if (gift) {
        // Nobody owes anything: the shares only record who was there.
        if (new Set(parts.map((p) => p.memberId)).size !== parts.length) throw new Error("duplicate participant");
        shares = parts.map((p) => ({ memberId: p.memberId, amount: 0 }));
      } else if (guests > 0) {
        if (parts.length === 0) throw new Error("at least one participant required");
        ({ shares, guestAmount } = splitWithGuests(amount, parts.map((p) => p.memberId), guests));
      } else {
        shares = splitAmount(amount, splitMode, parts);
      }
    } catch (e) {
      throw badRequest((e as Error).message);
    }
    const weights = new Map(parts.map((p) => [p.memberId, p.weight]));
    const car = gift ? null : parseCarBody(b.car);
    return {
      row: {
        title: str(b, "title", 100), amount, payerId, splitMode, date, gift, guests, guestAmount, car: car && JSON.stringify(car),
        category: optStr(b, "category", 50) ?? null, note: optStr(b, "note", 500) ?? null,
      },
      shares: shares.map((s) => ({ ...s, weight: weights.get(s.memberId)! })),
    };
  };

  /** Validate a CarCalc. The amount stays the client's (it is what the ledger uses); this only keeps the record sane. */
  const parseCarBody = (v: unknown): CarCalc | null => {
    if (v === undefined || v === null) return null;
    if (typeof v !== "object" || Array.isArray(v)) throw badRequest("car must be an object");
    const x = v as Body;
    const num = (key: keyof typeof CAR_LIMITS, required: boolean): number | null => {
      const n = x[key];
      if (n === null || n === undefined) { if (required) throw badRequest(`car.${key} is required`); return null; }
      if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > CAR_LIMITS[key]) throw badRequest(`car.${key} is out of range`);
      return n;
    };
    const mode = oneOf(x.mode, "car.mode", ["fuel", "rate"] as const);
    if (typeof x.roundTrip !== "boolean") throw badRequest("car.roundTrip must be a boolean");
    const deductIds = [...new Set(arr(x.deductIds ?? [], "car.deductIds", 20).map((id) => int(id, "car.deductIds", 1)))];
    return {
      mode, roundTrip: x.roundTrip, distanceMil: num("distanceMil", true)!,
      consumption: num("consumption", mode === "fuel"), fuelPrice: num("fuelPrice", mode === "fuel"), rate: num("rate", mode === "rate"),
      deductIds, deducted: deductIds.length ? int(x.deducted, "car.deducted", 0) : 0,
    };
  };

  const ownExpense = (c: Context<AppEnv>) => {
    const e = db.select().from(expenses).where(and(eq(expenses.id, idParam(c, "id")), eq(expenses.householdId, c.get("hid")))).get();
    if (!e) throw notFound("expense not found");
    if (e.createdById !== c.get("member").id) throw forbidden("only the creator can change this expense");
    return e;
  };

  const emitMoney = (hid: number) => bus.emit(hid, "expenses", "balances");

  app.get("/expenses", (c) => c.json(householdExpenses(db, c.get("hid"))));

  /** Prefill for the car calculator: the driver's last calculation and their recent tankningar not yet deducted elsewhere. */
  app.get("/car/:driverId", (c) => {
    const hid = c.get("hid");
    const driverId = idParam(c, "driverId");
    const exclude = Number(c.req.query("exclude")) || null;
    const all = householdExpenses(db, hid).filter((e) => e.id !== exclude && !e.gift);
    const deducted = new Set(all.flatMap((e) => e.car?.deductIds ?? []));
    const since = new Date(Date.now() - 60 * 86400_000).toISOString().slice(0, 10);
    const body: CarHelpResponse = {
      last: all.find((e) => e.payerId === driverId && e.car)?.car ?? null,
      fuel: all.filter((e) => e.payerId === driverId && !e.car && !deducted.has(e.id) && e.date >= since && looksLikeFuel(e.title))
        .slice(0, 10).map((e) => ({ id: e.id, title: e.title, amount: e.amount, date: e.date })),
    };
    return c.json(body);
  });

  app.post("/expenses", async (c) => {
    const hid = c.get("hid");
    const { row, shares } = parseExpense(await readBody(c), activeMemberIds(hid));
    const now = Date.now();
    const e = db.transaction((tx) => {
      const e = tx.insert(expenses).values({ ...row, householdId: hid, createdById: c.get("member").id, createdAt: now, updatedAt: now }).returning().get();
      // A gift without attendees has no share rows (drizzle rejects an empty insert).
      if (shares.length) tx.insert(expenseShares).values(shares.map((s) => ({ expenseId: e.id, ...s }))).run();
      return e;
    });
    emitMoney(hid);
    return c.json(loadExpenses(db, [e])[0]);
  });

  /** Full replace: the body is a complete ExpenseBody. */
  app.patch("/expenses/:id", async (c) => {
    const hid = c.get("hid");
    const old = ownExpense(c);
    const allowed = activeMemberIds(hid);
    allowed.add(old.payerId);
    for (const s of db.select().from(expenseShares).where(eq(expenseShares.expenseId, old.id)).all()) allowed.add(s.memberId);
    const { row, shares } = parseExpense(await readBody(c), allowed);
    const e = db.transaction((tx) => {
      const e = tx.update(expenses).set({ ...row, updatedAt: Date.now() }).where(eq(expenses.id, old.id)).returning().get();
      tx.delete(expenseShares).where(eq(expenseShares.expenseId, old.id)).run();
      if (shares.length) tx.insert(expenseShares).values(shares.map((s) => ({ expenseId: old.id, ...s }))).run();
      return e;
    });
    emitMoney(hid);
    return c.json(loadExpenses(db, [e])[0]);
  });

  app.delete("/expenses/:id", (c) => {
    const e = ownExpense(c);
    db.delete(expenses).where(eq(expenses.id, e.id)).run();
    emitMoney(c.get("hid"));
    return c.json({ ok: true });
  });

  app.post("/settlements", async (c) => {
    const hid = c.get("hid");
    const b = await readBody(c);
    const active = activeMemberIds(hid);
    const fromId = int(b.fromId, "fromId", 1);
    const toId = int(b.toId, "toId", 1);
    if (!active.has(fromId) || !active.has(toId)) throw badRequest("fromId and toId must be members of this household");
    if (fromId === toId) throw badRequest("fromId and toId must differ");
    const s = db.insert(settlements).values({
      householdId: hid, fromId, toId, amount: int(b.amount, "amount", 1), note: optStr(b, "note", 200) ?? null,
      createdById: c.get("member").id, createdAt: Date.now(),
    }).returning().get();
    emitMoney(hid);
    return c.json(toSettlement(s));
  });

  app.delete("/settlements/:id", (c) => {
    const hid = c.get("hid");
    const s = db.select().from(settlements).where(and(eq(settlements.id, idParam(c, "id")), eq(settlements.householdId, hid))).get();
    if (!s) throw notFound("settlement not found");
    const me = c.get("member").id;
    if (![s.createdById, s.fromId, s.toId].includes(me)) throw forbidden("only the payer or recipient can delete this settlement");
    db.delete(settlements).where(eq(settlements.id, s.id)).run();
    emitMoney(hid);
    return c.json({ ok: true });
  });

  app.get("/balances", (c) => {
    const hid = c.get("hid");
    const allocs = db.select({ shopperId: trips.shopperId, ownerId: tripAllocations.ownerId, amount: tripAllocations.amount })
      .from(tripAllocations).innerJoin(trips, eq(trips.id, tripAllocations.tripId))
      .where(and(eq(trips.householdId, hid), eq(trips.status, "closed"))).all();
    const sets = householdSettlements(db, hid);
    const debts: Debt[] = [
      ...allocs.flatMap((a) => tripDebts(a.shopperId, [a])),
      // A bjudning never creates a debt, and a guest's share is not in `shares`.
      ...householdExpenses(db, hid).filter((e) => !e.gift).flatMap((e) => expenseDebts(e.payerId, e.shares)),
      ...sets.map((s) => settlementDebt(s.fromId, s.toId, s.amount)),
    ];
    // Plånböcker: a wallet's debts sit on its lead, and debts inside a wallet vanish.
    const members = db.select({ id: memberships.id, walletId: memberships.walletId, removedAt: memberships.removedAt })
      .from(memberships).where(eq(memberships.householdId, hid)).all();
    const walletOf = new Map(members.filter((m) => m.walletId !== null).map((m) => [m.id, m.walletId!]));
    const pairs = netBalances(mergeWallets(debts, walletOf));
    const zoneKr = db.select({ z: households.zoneKr }).from(households).where(eq(households.id, hid)).get()?.z ?? 100;
    // Everyone active shows up, also at 0; removed members only while they still have a balance.
    const totals = memberTotals(pairs);
    for (const m of members) if (m.removedAt === null && !walletOf.has(m.id) && !totals.has(m.id)) totals.set(m.id, 0);
    const body: BalancesResponse = {
      pairs, simplified: simplifyDebts(pairs), settlements: sets,
      totals: [...totals].map(([memberId, net]) => ({ memberId, net })).sort((a, b) => a.memberId - b.memberId),
      zoneKr, plan: settlementPlan(totals, zoneKr),
    };
    return c.json(body);
  });

  app.get("/gifts", (c) => {
    const hid = c.get("hid");
    const gifts = householdExpenses(db, hid).filter((e) => e.gift);
    const h = db.select().from(households).where(eq(households.id, hid)).get();
    const last = lastGiftByMember(gifts);
    const latest = gifts.reduce<string | null>((m, g) => (m === null || g.date > m ? g.date : m), null);
    const body: GiftsResponse = {
      gifts,
      lastByMember: [...last].map(([memberId, date]) => ({ memberId, date })).sort((a, b) => a.memberId - b.memberId),
      hint: !!h?.hintEnabled && hintDue(latest, localDay(), h.hintMonths),
    };
    return c.json(body);
  });

  app.get("/stats", (c) => {
    const hid = c.get("hid");
    const allocs = db.select({ tripId: trips.id, store: trips.store, closedAt: trips.closedAt, ownerId: tripAllocations.ownerId, amount: tripAllocations.amount })
      .from(tripAllocations).innerJoin(trips, eq(trips.id, tripAllocations.tripId))
      .where(and(eq(trips.householdId, hid), eq(trips.status, "closed"))).all();
    const byTrip = new Map<number, StatsEntry>();
    for (const a of allocs) {
      if (a.amount <= 0) continue;
      const e = byTrip.get(a.tripId) ?? { kind: "trip", date: null, at: a.closedAt ?? 0, label: a.store, total: 0, shares: [] };
      e.total += a.amount;
      e.shares.push({ memberId: a.ownerId, amount: a.amount });
      byTrip.set(a.tripId, e);
    }
    const entries: StatsEntry[] = [
      ...byTrip.values(),
      ...householdExpenses(db, hid).filter((e) => !e.gift).map((e): StatsEntry => ({
        kind: "expense", date: e.date, at: e.createdAt, label: e.category, total: e.amount,
        shares: e.shares.filter((s) => s.amount > 0).map((s) => ({ memberId: s.memberId, amount: s.amount })),
      })),
    ];
    return c.json(entries);
  });

  app.get("/activity", (c) => {
    const hid = c.get("hid");
    const LIMIT = 100;
    const feed: Activity[] = [
      ...closedTrips(db, hid, LIMIT).map((trip): Activity => ({ kind: "trip", at: trip.closedAt!, trip })),
      ...householdExpenses(db, hid).map((expense): Activity => ({ kind: "expense", at: expenseAt(expense), expense })),
      ...householdSettlements(db, hid).map((settlement): Activity => ({ kind: "settlement", at: settlement.createdAt, settlement })),
    ];
    return c.json(feed.sort((a, b) => b.at - a.at).slice(0, LIMIT));
  });

  return app;
}

/** Today as YYYY-MM-DD in the server's local time, like expense dates. */
function localDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Expenses sit on their own date in the timeline (a ticket bought last week shows last week); same-day entries keep their creation time. */
function expenseAt(e: { date: string; createdAt: number }): number {
  const created = new Date(e.createdAt);
  const createdDay = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, "0")}-${String(created.getDate()).padStart(2, "0")}`;
  return createdDay === e.date ? e.createdAt : new Date(`${e.date}T12:00:00`).getTime();
}
