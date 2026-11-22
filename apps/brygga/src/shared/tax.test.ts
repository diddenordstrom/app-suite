import { describe, expect, it } from "vitest";
import { DEFAULT_TAX, grundavdrag, incomeTax, incomeTaxReal, iskRate, iskTax, netMonthlySalary } from "./tax";

describe("grundavdrag 2026", () => {
  it("matches Skatteverket's published levels", () => {
    expect(grundavdrag(40_000, 40)).toBe(25_100);
    expect(grundavdrag(170_000, 40)).toBe(45_600);
    expect(grundavdrag(600_000, 40)).toBe(17_400);
  });

  it("adds the higher allowance from 66", () => {
    expect(grundavdrag(50_000, 66)).toBe(50_000); // never above the income
    expect(grundavdrag(60_000, 66)).toBeLessThanOrEqual(65_800);
    expect(grundavdrag(550_000, 70)).toBe(179_100);
    expect(grundavdrag(1_000_000, 70)).toBe(117_500);
  });
});

describe("income tax", () => {
  it("gives a plausible net salary", () => {
    // 50 000 kr/month at the average municipal rate: about 38 700 after tax.
    expect(netMonthlySalary(600_000, 35, DEFAULT_TAX)).toBeCloseTo(38_672, 0);
  });

  it("takes state tax above the threshold", () => {
    expect(incomeTaxReal(600_000, 0, 35, DEFAULT_TAX).state).toBe(0);
    expect(incomeTaxReal(900_000, 0, 35, DEFAULT_TAX).state).toBeGreaterThan(0);
  });

  it("taxes pension lower from 66 and gives no job deduction on pension", () => {
    const at65 = incomeTaxReal(0, 240_000, 65, DEFAULT_TAX);
    const at66 = incomeTaxReal(0, 240_000, 66, DEFAULT_TAX);
    expect(at66.total).toBeLessThan(at65.total);
    expect(at65.jobDeduction).toBe(0);
  });

  it("indexes thresholds with the price level", () => {
    const today = incomeTaxReal(0, 240_000, 70, DEFAULT_TAX).total;
    expect(incomeTax(0, 480_000, 70, DEFAULT_TAX, 2)).toBeCloseTo(today * 2, 6);
  });

  it("is zero without income", () => {
    expect(incomeTaxReal(0, 0, 40, DEFAULT_TAX).total).toBe(0);
  });
});

describe("ISK", () => {
  it("taxes the base above the allowance at (statslåneränta + 1) × 30 %", () => {
    expect(iskTax(1_000_000, DEFAULT_TAX)).toBeCloseTo(700_000 * 0.0355 * 0.3, 6);
    expect(iskTax(250_000, DEFAULT_TAX)).toBe(0);
  });

  it("never goes below the 1.25 % floor", () => {
    expect(iskRate({ ...DEFAULT_TAX, govRate: -1 })).toBeCloseTo(0.0125 * 0.3, 10);
  });

  it("indexes the allowance", () => {
    expect(iskTax(600_000, DEFAULT_TAX, 2)).toBe(0);
  });
});
