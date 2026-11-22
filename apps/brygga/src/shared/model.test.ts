import { describe, expect, it } from "vitest";
import { candidates, chosenPath, earliestStop, pvBridge, runPath, type Model, type Person } from "./engine";
import { draft4Model } from "./fixtures/draft4";
import { DEFAULT_TAX } from "./tax";

const withTax = (m: Model): Model => ({ ...m, tax: DEFAULT_TAX });
const nobody = (age: number, retAge: number): Person => ({
  age, retAge, salary: 0, salaryGrowth: 0, allmStart: 65, tjStart: 65,
  stocks: 0, stockSave: 0, priv: 0, privSave: 0, tjanst: 0, allm: 0,
});

describe("tax in the simulation", () => {
  const plain = draft4Model();
  const taxed = withTax(plain);

  it("pays ISK and income tax, and ends with less", () => {
    const a = chosenPath(plain), b = chosenPath(taxed);
    expect(a.iskTaxPaid).toBe(0);
    expect(a.incomeTaxPaid).toBe(0);
    expect(b.iskTaxPaid).toBeGreaterThan(0);
    expect(b.incomeTaxPaid).toBeGreaterThan(0);
    expect(b.pts.at(-1)!.nw).toBeLessThan(a.pts.at(-1)!.nw);
    expect(b.liqRealA).toBeLessThan(a.liqRealA);
  });

  it("nets pension payouts after tax", () => {
    const b = chosenPath(taxed);
    expect(b.pensionNet).toBeLessThan(b.pensionGross);
    expect(b.pensionNet / b.pensionGross).toBeGreaterThan(0.6);
  });

  it("can only push the earliest stop age later", () => {
    expect(earliestStop(taxed)!).toBeGreaterThanOrEqual(earliestStop(plain)!);
  });

  it("charges no ISK tax below the allowance", () => {
    const small = withTax(draft4Model({ stocks: 100_000, stockSave: 0, priv: 0, privSave: 0, stockRet: 0, inflation: 0, loan: 0, tjStart: 75, allmStart: 75, expensesAfter: 100_000 }));
    expect(runPath(small, [75]).iskTaxPaid).toBe(0);
  });
});

describe("duo", () => {
  it("with an empty partner equals single (no tax)", () => {
    const single = draft4Model();
    const p = single.people[0];
    const duo: Model = { ...single, people: [p, nobody(p.age, p.retAge)] };
    const a = chosenPath(single), b = chosenPath(duo);
    expect(b.ok).toBe(a.ok);
    expect(b.need).toBeCloseTo(a.need, 4);
    expect(b.liqRealA).toBeCloseTo(a.liqRealA, 4);
    b.pts.forEach((pt, j) => expect(pt.nw).toBeCloseTo(a.pts[j].nw, 4));
    expect(candidates(duo).map((c) => c.ok)).toEqual(candidates(single).map((c) => c.ok));
  });

  it("runs the bridge from the first stop to the last public pension", () => {
    const m = draft4Model();
    const you = { ...m.people[0], retAge: 58 };
    const partner = { ...m.people[0], age: 30, retAge: 60, allmStart: 66 };
    const r = runPath({ ...m, people: [you, partner] }, [58, 60]);
    expect(r.bridgeFrom).toBe(23); // you stop at 58, 23 years from now
    expect(r.bridgeTo).toBe(36); // partner's public pension at 66, 36 years from now
  });

  it("counts the partner's salary against the bridge need", () => {
    const m = draft4Model();
    const you = m.people[0];
    const working = { ...you, retAge: 70, salary: 500_000 };
    const idle = { ...working, salary: 0 };
    expect(pvBridge({ ...m, people: [you, working] }, [60, 70])).toBeLessThan(pvBridge({ ...m, people: [you, idle] }, [60, 70]));
  });

  it("finds each person's earliest stop with the other's age held", () => {
    const m = withTax(draft4Model());
    const duo: Model = { ...m, people: [m.people[0], { ...m.people[0], age: 33 }] };
    const early = earliestStop({ ...duo, people: [duo.people[0], { ...duo.people[1], retAge: 70 }] }, 0);
    const late = earliestStop({ ...duo, people: [duo.people[0], { ...duo.people[1], retAge: 45 }] }, 0);
    expect(early).not.toBeNull();
    expect(late === null || late >= early!).toBe(true);
  });
});
