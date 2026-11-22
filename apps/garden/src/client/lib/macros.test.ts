import { describe, expect, it } from "vitest";
import { annualCoveragePercent, emptyMacro, macroCoverage } from "./macros";

const target = { id: 1, dailyKcal: 2000, dailyProteinG: 100, dailyCarbsG: 250, dailyFatG: 70 };

describe("annualCoveragePercent", () => {
  it("is the share of a year's need, rounded", () => expect(annualCoveragePercent(365_000, 2000)).toBe(50));
  it("is 0 without a positive target", () => expect(annualCoveragePercent(1000, 0)).toBe(0));
});

describe("macroCoverage", () => {
  const growing = { kcal: 300_000, proteinG: 10_000, carbsG: 45_625, fatG: 0 };
  const onHand = { kcal: 30_000, proteinG: 8_250, carbsG: 0, fatG: 2_555 };

  it("adds growing and stored food and covers each macro against the target", () => {
    const c = macroCoverage(growing, onHand, target);
    expect(c.combined).toEqual({ kcal: 330_000, proteinG: 18_250, carbsG: 45_625, fatG: 2_555 });
    expect(c.proteinPercent).toBe(50);
    expect(c.carbsPercent).toBe(50);
    expect(c.fatPercent).toBe(10);
  });

  it("counts days of runway from stored kcal only", () => expect(macroCoverage(growing, onHand, target).daysOfRunway).toBe(15));

  it("has no runway and zero coverage without a target", () => {
    const c = macroCoverage(growing, onHand, null);
    expect(c.daysOfRunway).toBeNull();
    expect([c.coveragePercent, c.proteinPercent, c.carbsPercent, c.fatPercent]).toEqual([0, 0, 0, 0]);
    expect(macroCoverage(emptyMacro, emptyMacro, target).coveragePercent).toBe(0);
  });
});
