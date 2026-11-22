import { describe, expect, it } from "vitest";
import { expenseDebts, formatAmount, mergeWallets, memberTotals, netBalances, parseAmount, settlementDebt, settlementPlan, simplifyDebts, splitAmount, splitWithGuests, tripDebts, type PairBalance } from "./balances";

describe("splitAmount", () => {
  it("splits equally and gives the remainder to the lowest ids, regardless of input order", () => {
    const a = splitAmount(100, "equal", [{ memberId: 3, weight: 1 }, { memberId: 1, weight: 1 }, { memberId: 2, weight: 1 }]);
    expect(a).toEqual([{ memberId: 1, amount: 34 }, { memberId: 2, amount: 33 }, { memberId: 3, amount: 33 }]);
    const b = splitAmount(101, "equal", [{ memberId: 2, weight: 9 }, { memberId: 1, weight: 0 }, { memberId: 3, weight: 5 }]);
    expect(b.map((x) => x.amount)).toEqual([34, 34, 33]); // weights ignored in equal mode
  });
  it("splits by shares and always sums to the total", () => {
    expect(splitAmount(1000, "shares", [{ memberId: 1, weight: 1 }, { memberId: 2, weight: 3 }]))
      .toEqual([{ memberId: 1, amount: 250 }, { memberId: 2, amount: 750 }]);
    const r = splitAmount(100, "shares", [{ memberId: 1, weight: 1 }, { memberId: 2, weight: 1 }, { memberId: 3, weight: 1 }]);
    expect(r.reduce((s, x) => s + x.amount, 0)).toBe(100);
  });
  it("never assigns remainder to zero-share participants", () => {
    const r = splitAmount(101, "shares", [{ memberId: 1, weight: 0 }, { memberId: 2, weight: 2 }, { memberId: 3, weight: 2 }]);
    expect(r).toEqual([{ memberId: 1, amount: 0 }, { memberId: 2, amount: 51 }, { memberId: 3, amount: 50 }]);
  });
  it("accepts exact amounts that match the total and rejects mismatches", () => {
    expect(splitAmount(500, "exact", [{ memberId: 1, weight: 200 }, { memberId: 2, weight: 300 }]))
      .toEqual([{ memberId: 1, amount: 200 }, { memberId: 2, amount: 300 }]);
    expect(() => splitAmount(500, "exact", [{ memberId: 1, weight: 200 }, { memberId: 2, weight: 200 }])).toThrow(/expected 500/);
  });
  it("rejects invalid input", () => {
    expect(() => splitAmount(0, "equal", [{ memberId: 1, weight: 1 }])).toThrow();
    expect(() => splitAmount(10.5, "equal", [{ memberId: 1, weight: 1 }])).toThrow();
    expect(() => splitAmount(10, "equal", [])).toThrow();
    expect(() => splitAmount(10, "equal", [{ memberId: 1, weight: 1 }, { memberId: 1, weight: 1 }])).toThrow(/duplicate/);
    expect(() => splitAmount(10, "shares", [{ memberId: 1, weight: 0 }])).toThrow();
    expect(() => splitAmount(10, "shares", [{ memberId: 1, weight: -1 }, { memberId: 2, weight: 2 }])).toThrow();
  });
});

describe("ledger", () => {
  it("nets opposing debts to a single pair", () => {
    // A=1 owes B=2 500, B owes A 400 → A owes B 100
    expect(netBalances([{ debtor: 1, creditor: 2, amount: 500 }, { debtor: 2, creditor: 1, amount: 400 }]))
      .toEqual([{ from: 1, to: 2, amount: 100 }]);
    expect(netBalances([{ debtor: 2, creditor: 1, amount: 500 }, { debtor: 1, creditor: 2, amount: 400 }]))
      .toEqual([{ from: 2, to: 1, amount: 100 }]);
  });
  it("drops zero balances and self debts", () => {
    expect(netBalances([{ debtor: 1, creditor: 2, amount: 300 }, { debtor: 2, creditor: 1, amount: 300 }, { debtor: 3, creditor: 3, amount: 9 }])).toEqual([]);
  });
  it("settlements cancel debt", () => {
    const debts = [{ debtor: 1, creditor: 2, amount: 500 }];
    expect(netBalances([...debts, settlementDebt(1, 2, 200)])).toEqual([{ from: 1, to: 2, amount: 300 }]);
    expect(netBalances([...debts, settlementDebt(1, 2, 500)])).toEqual([]);
  });
  it("derives debts from trips and expenses, skipping the shopper/payer", () => {
    expect(tripDebts(1, [{ ownerId: 1, amount: 100 }, { ownerId: 2, amount: 250 }, { ownerId: 3, amount: 0 }]))
      .toEqual([{ debtor: 2, creditor: 1, amount: 250 }]);
    expect(expenseDebts(2, [{ memberId: 1, amount: 50 }, { memberId: 2, amount: 50 }]))
      .toEqual([{ debtor: 1, creditor: 2, amount: 50 }]);
  });
  it("memberTotals sums positions", () => {
    const t = memberTotals([{ from: 1, to: 2, amount: 100 }, { from: 3, to: 2, amount: 50 }]);
    expect(Object.fromEntries(t)).toEqual({ 1: -100, 2: 150, 3: -50 });
  });
});

describe("amounts", () => {
  it("parses user input into minor units", () => {
    expect(parseAmount("123")).toBe(12300);
    expect(parseAmount("123,5")).toBe(12350);
    expect(parseAmount("1 234.50")).toBe(123450);
    expect(parseAmount("1 234,05")).toBe(123405);
    expect(parseAmount("12.345")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-5")).toBeNull();
    expect(parseAmount("")).toBeNull();
  });
  it("formats minor units", () => {
    const norm = (s: string) => s.replace(/\s/g, " ");
    expect(norm(formatAmount(12300, "SEK"))).toBe("123 kr");
    expect(norm(formatAmount(12350, "SEK"))).toBe("123,50 kr");
    expect(formatAmount(1050, "USD", "en-US")).toBe("$10.50");
  });
});

describe("simplifyDebts", () => {
  const net = (ps: PairBalance[]) => [...memberTotals(ps)].filter(([, v]) => v !== 0).sort((a, b) => a[0] - b[0]);

  it("collapses a chain into one payment", () => {
    // 1 owes 2 100, 2 owes 3 100 → 1 pays 3 directly
    expect(simplifyDebts([{ from: 1, to: 2, amount: 100 }, { from: 2, to: 3, amount: 100 }])).toEqual([{ from: 1, to: 3, amount: 100 }]);
  });
  it("keeps every member's net position", () => {
    const pairs: PairBalance[] = [
      { from: 1, to: 2, amount: 300 }, { from: 1, to: 3, amount: 200 }, { from: 2, to: 3, amount: 150 },
      { from: 4, to: 1, amount: 50 }, { from: 4, to: 2, amount: 75 }, { from: 3, to: 5, amount: 10 },
    ];
    const s = simplifyDebts(pairs);
    expect(net(s)).toEqual(net(pairs));
    expect(s.length).toBeLessThan(pairs.length);
    expect(s.every((p) => p.amount > 0 && p.from !== p.to)).toBe(true);
  });
  it("prefers exact matches so one payment clears two people", () => {
    // nets: 1:-500, 2:-300, 3:+300, 4:+500 → 1→4 and 2→3, not three payments
    const s = simplifyDebts([{ from: 1, to: 3, amount: 300 }, { from: 1, to: 4, amount: 200 }, { from: 2, to: 4, amount: 300 }]);
    expect(s).toEqual([{ from: 1, to: 4, amount: 500 }, { from: 2, to: 3, amount: 300 }]);
  });
  it("uses at most n-1 payments and handles the empty and two-person cases", () => {
    expect(simplifyDebts([])).toEqual([]);
    expect(simplifyDebts([{ from: 2, to: 1, amount: 42 }])).toEqual([{ from: 2, to: 1, amount: 42 }]);
    const pairs: PairBalance[] = [];
    for (let a = 1; a <= 6; a++) for (let b = a + 1; b <= 6; b++) pairs.push({ from: a, to: b, amount: a * 7 + b * 13 });
    const s = simplifyDebts(netBalances(pairs.map((p) => ({ debtor: p.from, creditor: p.to, amount: p.amount }))));
    expect(s.length).toBeLessThanOrEqual(5);
    expect(net(s)).toEqual(net(pairs));
  });
});

describe("splitWithGuests", () => {
  it("splits 500 kr over 4 members and 1 guest and keeps the guest share out of the member shares", () => {
    const r = splitWithGuests(50000, [1, 2, 3, 4], 1);
    expect(r.shares).toEqual([1, 2, 3, 4].map((memberId) => ({ memberId, amount: 10000 })));
    expect(r.guestAmount).toBe(10000);
  });
  it("gives rounding remainders to members before guests", () => {
    const r = splitWithGuests(1000, [1, 2, 3], 1); // 250 each, no remainder
    expect(r.guestAmount).toBe(250);
    const q = splitWithGuests(1001, [1, 2], 2); // 250 base, one remainder öre goes to member 1
    expect(q.shares).toEqual([{ memberId: 1, amount: 251 }, { memberId: 2, amount: 250 }]);
    expect(q.guestAmount).toBe(500);
  });
  it("shares plus guest amount always sum to the total, and guests never create debts", () => {
    const r = splitWithGuests(9999, [1, 2, 3, 4], 3);
    expect(r.shares.reduce((s, x) => s + x.amount, 0) + r.guestAmount).toBe(9999);
    // payer 1 is owed only by members 2..4, never by the guests
    expect(expenseDebts(1, r.shares).every((d) => [2, 3, 4].includes(d.debtor))).toBe(true);
  });
  it("works with zero guests and rejects bad counts", () => {
    expect(splitWithGuests(300, [1, 2, 3], 0).guestAmount).toBe(0);
    expect(() => splitWithGuests(300, [1], -1)).toThrow();
    expect(() => splitWithGuests(300, [1], 1.5)).toThrow();
  });
});

describe("settlementPlan (green zone)", () => {
  const totals = (o: Record<number, number>) => new Map(Object.entries(o).map(([k, v]) => [Number(k), v]));
  const kr = (n: number) => n * 100;

  it("says kvitt when everyone is within the zone, and nothing is lost", () => {
    // Didde(2) owes 99 kr: inside ±100. Balances are not reset.
    const t = totals({ 1: kr(40), 2: -kr(99), 3: kr(59), 4: 0 });
    const plan = settlementPlan(t, 100);
    expect(plan.inside).toBe(true);
    expect(plan.outside).toEqual([]);
    expect(plan.payments.every((p) => p.optional)).toBe(true);
    expect(plan.payments.reduce((s, p) => s + p.amount, 0)).toBe(kr(99));
  });
  it("keeps the exact debt: 99 kr plus 50 kr is 149 kr, now outside the zone", () => {
    const t = totals({ 1: kr(149), 2: -kr(149) });
    const plan = settlementPlan(t, 100);
    expect(plan.inside).toBe(false);
    expect(plan.outside).toEqual([1, 2]);
    expect(plan.payments).toEqual([{ from: 2, to: 1, amount: kr(149), optional: false }]);
  });
  it("is inclusive at the boundary", () => {
    expect(settlementPlan(totals({ 1: kr(100), 2: -kr(100) }), 100).inside).toBe(true);
    expect(settlementPlan(totals({ 1: kr(100) + 1, 2: -kr(100) - 1 }), 100).inside).toBe(false);
  });
  it("marks a payment as kan vänta only when everyone still ends up inside the zone without it", () => {
    // Didde(2) -320, Alex(1) +200, Robin(3) +60, Sam(4) +60. Paying Alex 200 alone leaves Didde at -120 (outside).
    const plan = settlementPlan(totals({ 1: kr(200), 2: -kr(320), 3: kr(60), 4: kr(60) }), 100);
    expect(plan.inside).toBe(false);
    expect(plan.outside).toEqual([1, 2]);
    const by = (to: number) => plan.payments.find((p) => p.to === to)!;
    expect(by(1)).toMatchObject({ from: 2, amount: kr(200), optional: false });
    // one of the two 60 kr payments must be made, the other can wait; ties go to the lower creditor id
    expect(by(3).optional).toBe(true);
    expect(by(4).optional).toBe(false);
  });
  it("with a zone of 0 nothing can wait", () => {
    const plan = settlementPlan(totals({ 1: kr(10), 2: -kr(10) }), 0);
    expect(plan.payments.every((p) => !p.optional)).toBe(true);
  });
  it("a whole settlement of someone far outside still needs every payment that moves them into the zone", () => {
    const plan = settlementPlan(totals({ 1: kr(150), 2: -kr(150) }), 100);
    expect(plan.payments).toEqual([{ from: 2, to: 1, amount: kr(150), optional: false }]);
  });
});

describe("mergeWallets (plånbok)", () => {
  // Didde(1) and Sambon(2) share a wallet led by Didde; Jonna(3) and Erik(4) are on their own.
  const walletOf = new Map([[2, 1]]);
  it("moves debts onto the lead and drops debts inside the wallet", () => {
    const debts = [
      { debtor: 2, creditor: 1, amount: 500 }, // Sambon owes Didde: internal, gone
      { debtor: 2, creditor: 3, amount: 519 }, // Sambon owes Jonna: becomes Didde
      { debtor: 1, creditor: 3, amount: 520 },
      { debtor: 4, creditor: 2, amount: 300 }, // Erik owes Sambon: becomes Didde
    ];
    expect(mergeWallets(debts, walletOf)).toEqual([
      { debtor: 1, creditor: 3, amount: 519 },
      { debtor: 1, creditor: 3, amount: 520 },
      { debtor: 4, creditor: 1, amount: 300 },
    ]);
    const pairs = netBalances(mergeWallets(debts, walletOf));
    expect(pairs).toEqual([{ from: 1, to: 3, amount: 1039 }, { from: 4, to: 1, amount: 300 }]);
    expect(memberTotals(pairs).has(2)).toBe(false);
  });
  it("leaves everything as it is without wallets", () => {
    const debts = [{ debtor: 2, creditor: 1, amount: 100 }];
    expect(mergeWallets(debts, new Map())).toEqual(debts);
  });
});
