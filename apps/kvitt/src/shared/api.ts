/**
 * API contract shared by server and client. Amounts are integer minor units.
 * All household routes live under /api/h/:hid and require the viewer to be an active member.
 * Timestamps are epoch ms; expense `date` is "YYYY-MM-DD".
 */
import type { PairBalance, SettlementPlan, SplitMode } from "./balances";
import type { CarCalc } from "./car";

export type Role = "admin" | "member";
export type ListColor = "default" | "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";
export const LIST_COLORS: ListColor[] = ["default", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"];
export type ItemStatus = "open" | "checked" | "skipped" | "bought";

export interface Member {
  id: number; name: string; role: Role; swishNumber: string | null; removed: boolean;
  /** Plånbok: the lead member whose wallet this one shares (balances and settling move onto the lead); null = own wallet. */
  walletId: number | null;
  /** Added by an admin for someone outside the app; never signs in unless given a recovery link. */
  managed: boolean;
}

/** GET /api/me — who am I across households. user is set for OIDC admins only. */
export interface MeResponse {
  user: { id: number; name: string | null; email: string | null } | null;
  authMode: "dev" | "oidc" | "demo";
  households: { id: number; name: string; currency: string; memberId: number; role: Role }[];
}

/** GET /api/h/:hid */
export interface HouseholdDetail {
  id: number; name: string; currency: string;
  me: Member;
  members: Member[]; // includes removed members (for history), flagged
  inviteCode: string | null; // only for admins
  /** Green zone (whole kronor), bjudningar and hint settings; see docs/decisions/kvitt-bjudningar.md. */
  settings: HouseholdSettings;
}

export interface HouseholdSettings {
  zoneKr: number;
  /** Category keys that default to "bjudet" in the expense form. */
  giftCategories: string[];
  /** The household's own names for the five category slots, by key; a missing key uses the translated default. */
  categoryLabels: Record<string, string>;
  hintEnabled: boolean;
  /** Calendar months without a bjudning before the hint shows; at least 1. */
  hintMonths: number;
}

export interface Item {
  id: number; listId: number; text: string; quantity: string | null; note: string | null;
  /** Optional price per piece in minor units; the total is price × the quantity's leading number (src/shared/items.ts). */
  price: number | null;
  status: ItemStatus; tripId: number | null; position: number; updatedAt: number;
}

export interface List {
  id: number; ownerId: number; title: string; store: string | null; color: ListColor;
  updatedAt: number;
  items: Item[]; // non-bought items only, ordered by position
}

export interface Trip {
  id: number; shopperId: number; store: string | null; status: "active" | "closed" | "cancelled";
  startedAt: number; closedAt: number | null;
  listIds: number[];
  allocations: { ownerId: number; amount: number }[]; // empty while active
  /** Anonymous guests the bill was split on, and their combined share (not in `allocations`, never a debt: "ask them to Swish you"). */
  guests: number; guestAmount: number;
  boughtItems: Item[]; // populated for closed trips
  /** A closed trip whose split can no longer change: someone it is split on has settled up with the shopper since. */
  locked: boolean;
}

export interface Expense {
  id: number; createdById: number; payerId: number; title: string; amount: number;
  splitMode: SplitMode; date: string; category: string | null; note: string | null;
  /** Gifts (bjudningar) never create debts. `amount` is 0 when unpriced; `shares` then list who was there (amount 0). */
  gift: boolean;
  /** Anonymous guests on an equal split; `guestAmount` is their combined share, never part of the ledger. */
  guests: number;
  guestAmount: number;
  /** Bilutgift: the calculation behind `amount`, null for other expenses. */
  car: CarCalc | null;
  shares: { memberId: number; weight: number; amount: number }[];
  createdAt: number;
}

export interface Settlement { id: number; fromId: number; toId: number; amount: number; note: string | null; createdAt: number }

/** GET /api/h/:hid/balances */
/** `pairs` = netted per pair; `simplified` = fewest payments that settle everyone (D41). */
export interface BalancesResponse {
  pairs: PairBalance[]; simplified: PairBalance[]; settlements: Settlement[];
  /** Net position per active or indebted member (minor units, positive = is owed); balances are never reset. */
  totals: { memberId: number; net: number }[];
  zoneKr: number;
  /** The green-zone view of the settlement: who is outside, and which payments can wait. */
  plan: SettlementPlan;
}

/** GET /api/h/:hid/gifts: bjudningar newest first, when each host last treated, and whether to show the hint. */
export interface GiftsResponse {
  gifts: Expense[];
  lastByMember: { memberId: number; date: string }[];
  hint: boolean;
}

/** GET /api/h/:hid/stats: every closed trip and expense as a spending entry (settlements are not spending).
 * `date` is the expense date (YYYY-MM-DD) or null for trips, which use `at` (closedAt) in local time.
 * Trips are labelled by store, expenses by category; null when unset. */
export interface StatsEntry {
  kind: "trip" | "expense"; date: string | null; at: number; label: string | null; total: number;
  shares: { memberId: number; amount: number }[];
}

/** One activity feed entry, newest first: GET /api/h/:hid/activity */
export type Activity =
  | { kind: "trip"; at: number; trip: Trip }
  | { kind: "expense"; at: number; expense: Expense }
  | { kind: "settlement"; at: number; settlement: Settlement };

// ---- request bodies ----
export interface CreateHouseholdBody { name: string; currency?: string; adminName?: string }
export interface UpdateHouseholdBody { name?: string; currency?: string; zoneKr?: number; giftCategories?: string[]; categoryLabels?: Record<string, string>; hintEnabled?: boolean; hintMonths?: number }
export interface JoinBody { name: string }
export interface UpdateMeBody { name?: string; swishNumber?: string | null }
export interface ListBody { title: string; store?: string | null; color?: ListColor }
export interface ItemBody { text: string; quantity?: string | null; note?: string | null; price?: number | null }
export interface StartTripBody { listIds: number[]; store?: string | null }
/** Batched check-off ops; the client queues these offline and replays them. */
export interface TripOpsBody { ops: { itemId: number; status: "open" | "checked" | "skipped" }[] }
export interface CheckoutBody { allocations: { ownerId: number; amount: number }[]; guests?: number; guestAmount?: number }
/** PATCH /trips/:id on a closed trip: redo the split. Shopper or admin, until a payment covers it. */
export type EditTripBody = CheckoutBody
export interface ExpenseBody {
  title: string; amount: number; payerId: number; splitMode: SplitMode; date: string;
  category?: string | null; note?: string | null;
  /** weight: 1 for equal, shares, or exact minor units. For a gift: who was there (weight 1). */
  participants: { memberId: number; weight: number }[];
  /** A bjudning: no debts, `amount` may be 0, `payerId` is the host. */
  gift?: boolean;
  /** Anonymous guests, 0–20. Needs an equal split (or a gift). */
  guests?: number;
  /** Bilutgift: the calculation behind `amount`; omit or null for other expenses. */
  car?: CarCalc | null;
}
/** PATCH /api/h/:hid/members/:mid/wallet: join `walletId`'s wallet, or null to leave. Admins for anyone, members for themselves. */
export interface WalletBody { walletId: number | null }
/** GET /api/h/:hid/car/:driverId?exclude=<expenseId>: the driver's last car calculation (to prefill) and
 * recent tankningar they paid that no other car expense has deducted yet. */
export interface CarHelpResponse {
  last: CarCalc | null;
  fuel: { id: number; title: string; amount: number; date: string }[];
}
export interface SettlementBody { fromId: number; toId: number; amount: number; note?: string | null }

/** Server-sent event on GET /api/h/:hid/events: `data` is this JSON. Clients refetch the named scopes. */
export interface ChangeEvent { scope: ("household" | "lists" | "trips" | "expenses" | "balances")[] }

/** GET /api/h/:hid/items/suggestions: household item history, one row per case-insensitive trimmed text,
 * most used first (then most recent); text/quantity are from the latest usage. Top 200. */
export interface ItemSuggestion { text: string; quantity: string | null; count: number; lastUsed: number }
