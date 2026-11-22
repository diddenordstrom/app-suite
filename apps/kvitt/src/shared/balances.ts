/**
 * Pure money logic. All amounts are integer minor units (öre/cents).
 * A ledger entry means "debtor owes creditor amount".
 */

export type SplitMode = "equal" | "shares" | "exact";

export interface Debt { debtor: number; creditor: number; amount: number }

export interface PairBalance { from: number; to: number; amount: number }

/**
 * Split `total` across participants. weights: shares (shares mode) or exact amounts (exact mode);
 * ignored for equal. Remainders go one unit at a time to participants in ascending id order,
 * so results are deterministic. Throws on invalid input.
 */
export function splitAmount(total: number, mode: SplitMode, parts: { memberId: number; weight: number }[]): { memberId: number; amount: number }[] {
  if (!Number.isInteger(total) || total <= 0) throw new Error("total must be a positive integer");
  if (parts.length === 0) throw new Error("at least one participant required");
  if (new Set(parts.map((p) => p.memberId)).size !== parts.length) throw new Error("duplicate participant");
  const sorted = [...parts].sort((a, b) => a.memberId - b.memberId);

  if (mode === "exact") {
    if (sorted.some((p) => !Number.isInteger(p.weight) || p.weight < 0)) throw new Error("exact amounts must be non-negative integers");
    const sum = sorted.reduce((s, p) => s + p.weight, 0);
    if (sum !== total) throw new Error(`exact amounts sum to ${sum}, expected ${total}`);
    return sorted.map((p) => ({ memberId: p.memberId, amount: p.weight }));
  }

  const weights = sorted.map((p) => (mode === "equal" ? 1 : p.weight));
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) throw new Error("shares must be non-negative integers");
  const wsum = weights.reduce((s, w) => s + w, 0);
  if (wsum <= 0) throw new Error("shares must sum to more than zero");

  const base = weights.map((w) => Math.floor((total * w) / wsum));
  let rest = total - base.reduce((s, a) => s + a, 0);
  for (let i = 0; rest > 0; i = (i + 1) % sorted.length) {
    if (weights[i] > 0) { base[i]++; rest--; }
  }
  return sorted.map((p, i) => ({ memberId: p.memberId, amount: base[i] }));
}

/** Debts from an expense: every participant except the payer owes the payer their share. */
export function expenseDebts(payerId: number, shares: { memberId: number; amount: number }[]): Debt[] {
  return shares.filter((s) => s.memberId !== payerId && s.amount > 0)
    .map((s) => ({ debtor: s.memberId, creditor: payerId, amount: s.amount }));
}

/** Debts from a trip checkout: each list owner owes the shopper what was paid for them. */
export function tripDebts(shopperId: number, allocations: { ownerId: number; amount: number }[]): Debt[] {
  return allocations.filter((a) => a.ownerId !== shopperId && a.amount > 0)
    .map((a) => ({ debtor: a.ownerId, creditor: shopperId, amount: a.amount }));
}

/** A settlement (from paid to) cancels debt from→to, i.e. it acts as to owing from. */
export function settlementDebt(fromId: number, toId: number, amount: number): Debt {
  return { debtor: toId, creditor: fromId, amount };
}

/**
 * Wallets (plånböcker): members who share their money with a lead member, e.g. a couple with joint finances.
 * Every debt is moved onto the wallet's lead, and debts inside a wallet disappear, so balances and the
 * settlement only ever show the lead. Expenses and stats stay per person. `walletOf` maps a member id to its
 * lead's id; members not in a wallet map to themselves (missing from the map = own wallet).
 */
export function mergeWallets(debts: Debt[], walletOf: Map<number, number>): Debt[] {
  const lead = (id: number) => walletOf.get(id) ?? id;
  return debts.map((d) => ({ debtor: lead(d.debtor), creditor: lead(d.creditor), amount: d.amount }))
    .filter((d) => d.debtor !== d.creditor);
}

/** Net all debts per pair. Returns one entry per pair with non-zero balance, `from` owes `to`. */
export function netBalances(debts: Debt[]): PairBalance[] {
  const net = new Map<string, number>(); // key "lo:hi" → positive means lo owes hi
  for (const d of debts) {
    if (d.debtor === d.creditor || d.amount === 0) continue;
    const [lo, hi] = d.debtor < d.creditor ? [d.debtor, d.creditor] : [d.creditor, d.debtor];
    const key = `${lo}:${hi}`;
    net.set(key, (net.get(key) ?? 0) + (d.debtor === lo ? d.amount : -d.amount));
  }
  const out: PairBalance[] = [];
  for (const [key, v] of net) {
    if (v === 0) continue;
    const [lo, hi] = key.split(":").map(Number);
    out.push(v > 0 ? { from: lo, to: hi, amount: v } : { from: hi, to: lo, amount: -v });
  }
  return out.sort((a, b) => b.amount - a.amount || a.from - b.from || a.to - b.to);
}

/** Net position per member: positive = is owed money, negative = owes. */
export function memberTotals(pairs: PairBalance[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of pairs) {
    m.set(p.from, (m.get(p.from) ?? 0) - p.amount);
    m.set(p.to, (m.get(p.to) ?? 0) + p.amount);
  }
  return m;
}

/**
 * Minimise the payments needed to settle everyone (D41). Keeps each member's net position,
 * so settling the suggestions settles all pairs. Exact debtor/creditor matches go first
 * (one payment clears two people); the rest is greedy largest-to-largest. Ties break on id,
 * so the result is deterministic. Uses at most n-1 payments for n people with a balance.
 */
export function simplifyDebts(pairs: PairBalance[]): PairBalance[] {
  return simplifyTotals(memberTotals(pairs));
}

/** Same as `simplifyDebts`, starting from each member's net position (positive = is owed). */
export function simplifyTotals(totals: Map<number, number>): PairBalance[] {
  const debtors = [...totals].filter(([, v]) => v < 0).map(([id, v]) => ({ id, amount: -v }));
  const creditors = [...totals].filter(([, v]) => v > 0).map(([id, amount]) => ({ id, amount }));
  const out: PairBalance[] = [];
  const pay = (d: { id: number; amount: number }, c: { id: number; amount: number }, amount: number) => {
    out.push({ from: d.id, to: c.id, amount });
    d.amount -= amount; c.amount -= amount;
  };
  const byId = (a: { id: number }, b: { id: number }) => a.id - b.id;
  for (const d of debtors.sort(byId)) {
    const c = creditors.sort(byId).find((x) => x.amount === d.amount);
    if (c) pay(d, c, d.amount);
  }
  const live = (xs: { id: number; amount: number }[]) => xs.filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount || a.id - b.id);
  for (let ds = live(debtors), cs = live(creditors); ds.length && cs.length; ds = live(debtors), cs = live(creditors)) {
    pay(ds[0], cs[0], Math.min(ds[0].amount, cs[0].amount));
  }
  return out.sort((a, b) => b.amount - a.amount || a.from - b.from || a.to - b.to);
}

export interface PlannedPayment extends PairBalance {
  /** Skipping this payment still leaves every member inside the zone ("kan vänta"). */
  optional: boolean;
}

export interface SettlementPlan {
  /** Everyone's net is within ±zone: "Ni är kvitt". */
  inside: boolean;
  /** Members whose net is outside the zone, by id. */
  outside: number[];
  /** The simplified settlement, each payment flagged `optional` when it can wait. */
  payments: PlannedPayment[];
}

/**
 * The green zone is a display rule on net totals: balances are never reset. Takes each member's
 * net position (minor units, positive = is owed) and the zone in whole kronor. Payments come from
 * `simplifyTotals`; a payment is optional if, with it skipped, everyone still ends up inside the
 * zone. Candidates are tried smallest first (ties: lower creditor id, then lower debtor id), each
 * skip counting for the next, so the result is deterministic. Greedy, which is fine for a few people.
 */
export function settlementPlan(totals: Map<number, number>, zoneKr: number): SettlementPlan {
  const zone = Math.max(0, Math.floor(zoneKr)) * 100;
  const outside = [...totals].filter(([, v]) => Math.abs(v) > zone).map(([id]) => id).sort((a, b) => a - b);
  const payments = simplifyTotals(totals);
  // Nets after settling every payment are zero; un-apply a payment to test skipping it.
  const after = new Map<number, number>([...totals.keys()].map((id) => [id, 0]));
  const optional = new Set<PairBalance>();
  const order = [...payments].sort((a, b) => a.amount - b.amount || a.to - b.to || a.from - b.from);
  for (const p of order) {
    after.set(p.from, (after.get(p.from) ?? 0) - p.amount);
    after.set(p.to, (after.get(p.to) ?? 0) + p.amount);
    if ([...after.values()].every((v) => Math.abs(v) <= zone)) optional.add(p);
    else {
      after.set(p.from, (after.get(p.from) ?? 0) + p.amount);
      after.set(p.to, (after.get(p.to) ?? 0) - p.amount);
    }
  }
  return { inside: outside.length === 0, outside, payments: payments.map((p) => ({ ...p, optional: optional.has(p) })) };
}

/** Guests are anonymous heads on an equal split. Their ids sit above any real member id, so rounding remainders land on members first. */
const GUEST_ID_BASE = Number.MAX_SAFE_INTEGER - 1000;

/**
 * Split `total` equally over the members plus `guests` unnamed guests. Returns the members' shares and the
 * guests' combined share, which is shown to the payer ("be hen swisha") but never enters the ledger.
 */
export function splitWithGuests(total: number, memberIds: number[], guests: number): { shares: { memberId: number; amount: number }[]; guestAmount: number } {
  if (!Number.isInteger(guests) || guests < 0) throw new Error("guests must be a non-negative integer");
  const parts = [
    ...memberIds.map((memberId) => ({ memberId, weight: 1 })),
    ...Array.from({ length: guests }, (_, i) => ({ memberId: GUEST_ID_BASE + i, weight: 1 })),
  ];
  const all = splitAmount(total, "equal", parts);
  return {
    shares: all.filter((s) => s.memberId < GUEST_ID_BASE),
    guestAmount: all.filter((s) => s.memberId >= GUEST_ID_BASE).reduce((sum, s) => sum + s.amount, 0),
  };
}

/** Parse a user-entered amount like "123", "123,5" or "1 234.50" into minor units. Returns null if invalid. */
export function parseAmount(input: string): number | null {
  const s = input.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

export function formatAmount(minor: number, currency: string, locale = "sv-SE"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: minor % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(minor / 100);
}

/**
 * Swish deep link with amount and recipient prefilled. Uses the documented
 * `swish://payment?data=` JSON payload (Swish "Create payment link" format).
 */
export function swishLink(phone: string, amountMinor: number, message: string): string {
  const payee = phone.replace(/[^\d+]/g, "").replace(/^\+46/, "0");
  const data = { version: 1, payee: { value: payee }, amount: { value: amountMinor / 100 }, message: { value: message.slice(0, 50) } };
  return `swish://payment?data=${encodeURIComponent(JSON.stringify(data))}`;
}
