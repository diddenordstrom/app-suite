import { createAuth, type DemoInstance } from "@homelab/server-kit";
import type { Config } from "./config";
import { createApp } from "./app";
import { createDb, type Db } from "./db";
import { expenses, expenseShares, households, items, lists, memberships, sessions, settlements, tripAllocations, tripLists, trips, users } from "./db/schema";
import { randomToken } from "./http";
import { splitAmount, splitWithGuests } from "../shared/balances";
import { DEFAULT_GIFT_CATEGORIES } from "../shared/gifts";

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * A shared flat for the demo: the visitor (admin) and two flatmates, two open lists, a finished shopping trip
 * split between list owners, a few expenses and a settlement, so lists, trip, balances and stats all have something.
 */
export function seedKvittDemo(db: Db, userId: number) {
  const now = Date.now();
  db.transaction((tx) => {
    const h = tx.insert(households).values({ name: "Kollektivet", currency: "SEK", giftCategories: JSON.stringify(DEFAULT_GIFT_CATEGORIES), inviteCode: randomToken(12), createdAt: now }).returning().get();
    const member = (name: string, role: "admin" | "member", userId: number | null = null) =>
      tx.insert(memberships).values({ householdId: h.id, userId, name, role, token: randomToken(), createdAt: now - 60 * DAY }).returning().get().id;
    const me = member("Alex", "admin", userId);
    const sara = member("Sara", "member");
    const jonas = member("Jonas", "member");

    const list = (ownerId: number, title: string, store: string | null, color: string, texts: string[], status: "open" | "bought" = "open", tripId: number | null = null) => {
      const l = tx.insert(lists).values({ householdId: h.id, ownerId, title, store, color, createdAt: now - 20 * DAY, updatedAt: now - DAY }).returning().get();
      tx.insert(items).values(texts.map((text, i) => ({ listId: l.id, text, status, tripId, position: i, createdAt: now - 2 * DAY, updatedAt: now - DAY }))).run();
      return l.id;
    };

    // A finished trip: Sara shopped for her own list and Jonas', and paid for both.
    const trip = tx.insert(trips).values({ householdId: h.id, shopperId: sara, store: "ICA", status: "closed", startedAt: now - 3 * DAY, closedAt: now - 3 * DAY + 3600_000 }).returning().get();
    const saraList = list(sara, "Saras veckohandling", "ICA", "green", ["Havremjölk", "Bananer", "Knäckebröd"], "bought", trip.id);
    const jonasList = list(jonas, "Jonas", "ICA", "blue", ["Kaffe", "Pasta", "Krossade tomater"], "bought", trip.id);
    tx.insert(tripLists).values([{ tripId: trip.id, listId: saraList }, { tripId: trip.id, listId: jonasList }]).run();
    tx.insert(tripAllocations).values([{ tripId: trip.id, ownerId: sara, amount: 18900 }, { tripId: trip.id, ownerId: jonas, amount: 24250 }]).run();
    // Things added since, so those lists aren't empty on the lists page.
    const more = (listId: number, texts: string[]) =>
      tx.insert(items).values(texts.map((text, i) => ({ listId, text, position: 10 + i, createdAt: now - DAY, updatedAt: now - DAY }))).run();
    more(saraList, ["Ägg", "Yoghurt"]);
    more(jonasList, ["Bröd"]);

    // Open lists for the next trip.
    list(me, "Helgmiddag", "Coop", "orange", ["Lax", "Potatis", "Dill", "Citron", "Gräddfil"]);
    list(sara, "Städ & hushåll", null, "purple", ["Diskmedel", "Toapapper", "Soppåsar"]);

    const everyone = [me, sara, jonas].map((memberId) => ({ memberId, weight: 1 }));
    const expense = (payerId: number, title: string, amount: number, daysAgo: number, category: string) => {
      const e = tx.insert(expenses).values({
        householdId: h.id, createdById: payerId, payerId, title, amount, splitMode: "equal", date: isoDay(now - daysAgo * DAY), category, note: null,
        createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY,
      }).returning().get();
      tx.insert(expenseShares).values(splitAmount(amount, "equal", everyone).map((s) => ({ expenseId: e.id, ...s, weight: 1 }))).run();
    };
    expense(me, "Bredband", 44900, 25, "Boende");
    expense(jonas, "El", 61200, 18, "Boende");
    expense(sara, "Pizza fredag", 38700, 6, "Mat");
    expense(me, "Bastuhyra", 30000, 2, "Nöje");

    // A pizza night with one anonymous guest (4 heads: 3 members + 1 guest), and a few treats that never create debts.
    const guestSplit = splitWithGuests(48000, [me, sara, jonas], 1);
    const pizza = tx.insert(expenses).values({
      householdId: h.id, createdById: me, payerId: me, title: "Dart och pizza", amount: 48000, splitMode: "equal", date: isoDay(now - DAY),
      category: "other", note: null, guests: 1, guestAmount: guestSplit.guestAmount, createdAt: now - DAY, updatedAt: now - DAY,
    }).returning().get();
    tx.insert(expenseShares).values(guestSplit.shares.map((s) => ({ expenseId: pizza.id, ...s, weight: 1 }))).run();
    const treat = (hostId: number, title: string, daysAgo: number, category: string, guests: number[]) => {
      const e = tx.insert(expenses).values({
        householdId: h.id, createdById: hostId, payerId: hostId, title, amount: 0, gift: true, splitMode: "equal", date: isoDay(now - daysAgo * DAY),
        category, note: null, createdAt: now - daysAgo * DAY, updatedAt: now - daysAgo * DAY,
      }).returning().get();
      tx.insert(expenseShares).values(guests.map((memberId) => ({ expenseId: e.id, memberId, weight: 1, amount: 0 }))).run();
    };
    treat(sara, "Middag hemma", 3, "home", [me, jonas]);
    treat(me, "Dryckesrunda", 9, "drinks", [sara, jonas]);
    treat(jonas, "Fika", 15, "other", [me, sara]);

    tx.insert(settlements).values({ householdId: h.id, fromId: jonas, toId: me, amount: 15000, note: "Swish", createdById: jonas, createdAt: now - 10 * DAY }).run();
  });
}

/** kvitt on one demo visitor's own database file (server-kit `createDemo` decides which). */
export function openDemo(file: string, fresh: boolean, config: Config): DemoInstance {
  const db = createDb(file);
  if (fresh) {
    seedKvittDemo(db, createAuth(db, config, { users, sessions }).demoUser().id);
    // Seeding writes a few MB of WAL; fold it into the file so an open demo stays small on disk.
    db.$client.pragma("wal_checkpoint(TRUNCATE)");
  }
  const app = createApp(db, { ...config, authMode: "demo" });
  return { fetch: app.fetch, close: () => db.$client.close() };
}
