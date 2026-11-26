import { index, integer, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { authTables } from "@homelab/server-kit";

/** OIDC users (admins) and their sessions; same tables in every app (server-kit authTables). Members are not users; they only exist as memberships. */
export const { users, sessions } = authTables();

export const households = sqliteTable("households", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  currency: text("currency").notNull().default("SEK"),
  /** Current invite code; rotating replaces it, invalidating old links. */
  inviteCode: text("invite_code").notNull().unique(),
  /** Green zone in whole kronor: a net balance within ±zone counts as "kvitt" (display rule, balances are never reset). */
  zoneKr: integer("zone_kr").notNull().default(100),
  /**
   * JSON array of category keys that default to "bjudet" (a gift) in the expense form. The column default is the
   * pre-0003 value (changing a SQLite default means a table rebuild); new households get DEFAULT_GIFT_CATEGORIES from code.
   */
  giftCategories: text("gift_categories").notNull().default('["homecooked","houseparty","round","fika"]'),
  /** JSON map of category key → the household's own name for that slot (empty = the translated default). */
  categoryLabels: text("category_labels").notNull().default("{}"),
  /** Show a quiet "time to host" hint once nobody has treated for `hintMonths` calendar months (min 1). */
  hintEnabled: integer("hint_enabled", { mode: "boolean" }).notNull().default(true),
  hintMonths: integer("hint_months").notNull().default(1),
  createdAt: integer("created_at").notNull(),
});

/**
 * A person inside a household. Admins link to an OIDC user; members have userId null
 * and authenticate with `token` (stored in a signed cookie, also the recovery link).
 * Removed memberships keep their row (removedAt set) so ledger history stays intact.
 */
export const memberships = sqliteTable("memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  token: text("token").notNull().unique(),
  swishNumber: text("swish_number"),
  /**
   * Plånbok: the lead member this one shares money with (e.g. a couple with joint finances). Balances and
   * settlements move onto the lead; null = own wallet. A lead is never itself in another wallet.
   */
  walletId: integer("wallet_id").references((): AnySQLiteColumn => memberships.id),
  createdAt: integer("created_at").notNull(),
  removedAt: integer("removed_at"),
}, (t) => [index("memberships_household_idx").on(t.householdId), uniqueIndex("memberships_user_household_idx").on(t.userId, t.householdId)]);

export const lists = sqliteTable("lists", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => memberships.id),
  title: text("title").notNull(),
  store: text("store"),
  color: text("color").notNull().default("default"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  /**
   * Set when nothing is left to buy but the list has bought items: hidden from the lists page, kept so trip
   * history still shows what was bought. A list with nothing left and no history is deleted instead.
   */
  archivedAt: integer("archived_at"),
}, (t) => [index("lists_household_idx").on(t.householdId)]);

/**
 * status: open (on list), checked/skipped (during an active trip), bought (archived on a closed trip).
 * tripId is set while an active trip has touched the item, and kept when bought.
 */
export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  listId: integer("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
  text: text("text").notNull(),
  quantity: text("quantity"),
  note: text("note"),
  status: text("status", { enum: ["open", "checked", "skipped", "bought"] }).notNull().default("open"),
  tripId: integer("trip_id").references(() => trips.id, { onDelete: "set null" }),
  /** Optional price per piece in minor units (total = price × the quantity's leading number), e.g. what a gift cost. */
  price: integer("price"),
  position: real("position").notNull().default(0),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("items_list_idx").on(t.listId), index("items_trip_idx").on(t.tripId)]);

export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  shopperId: integer("shopper_id").notNull().references(() => memberships.id),
  store: text("store"),
  status: text("status", { enum: ["active", "closed", "cancelled"] }).notNull().default("active"),
  startedAt: integer("started_at").notNull(),
  closedAt: integer("closed_at"),
  /** Anonymous guests the bill was also split on; their combined share is `guestAmount` and never enters the ledger. */
  guests: integer("guests").notNull().default(0),
  guestAmount: integer("guest_amount").notNull().default(0),
}, (t) => [index("trips_household_idx").on(t.householdId)]);

export const tripLists = sqliteTable("trip_lists", {
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  listId: integer("list_id").notNull().references(() => lists.id, { onDelete: "cascade" }),
}, (t) => [uniqueIndex("trip_lists_pk").on(t.tripId, t.listId)]);

/** Amount (minor units) the shopper paid on behalf of each list owner at checkout (D4). */
export const tripAllocations = sqliteTable("trip_allocations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  ownerId: integer("owner_id").notNull().references(() => memberships.id),
  amount: integer("amount").notNull(),
});

export const expenses = sqliteTable("expenses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  createdById: integer("created_by_id").notNull().references(() => memberships.id),
  payerId: integer("payer_id").notNull().references(() => memberships.id),
  title: text("title").notNull(),
  /** Minor units; 0 for an unpriced gift. */
  amount: integer("amount").notNull(),
  /** A bjudning: never creates debts and stays out of stats. `shares` then only list who was there (amount 0). */
  gift: integer("gift", { mode: "boolean" }).notNull().default(false),
  /** Anonymous guests on an equal split; their combined share is `guestAmount` and never enters the ledger. */
  guests: integer("guests").notNull().default(0),
  guestAmount: integer("guest_amount").notNull().default(0),
  /** Bilutgift: the calculation behind the amount (JSON CarCalc, src/shared/car.ts), so it can be reopened; null for other expenses. */
  car: text("car"),
  splitMode: text("split_mode", { enum: ["equal", "shares", "exact"] }).notNull(),
  date: text("date").notNull(),
  category: text("category"),
  note: text("note"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [index("expenses_household_idx").on(t.householdId)]);

/** `weight` holds shares (shares mode) or exact minor units (exact mode); 1 for equal. `amount` is the computed owed share. */
export const expenseShares = sqliteTable("expense_shares", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  expenseId: integer("expense_id").notNull().references(() => expenses.id, { onDelete: "cascade" }),
  memberId: integer("member_id").notNull().references(() => memberships.id),
  weight: integer("weight").notNull(),
  amount: integer("amount").notNull(),
});

/** fromId paid toId `amount` outside the app (Swish, cash). */
export const settlements = sqliteTable("settlements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: integer("household_id").notNull().references(() => households.id, { onDelete: "cascade" }),
  fromId: integer("from_id").notNull().references(() => memberships.id),
  toId: integer("to_id").notNull().references(() => memberships.id),
  amount: integer("amount").notNull(),
  note: text("note"),
  createdById: integer("created_by_id").notNull().references(() => memberships.id),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("settlements_household_idx").on(t.householdId)]);
