import { describe, expect, it } from "vitest";
import { formatNumber, parseNumber } from "./format";

describe("parseNumber", () => {
  it("reads draft 4's money shorthands", () => {
    expect(parseNumber("3M", "money")).toBe(3_000_000);
    expect(parseNumber("500k", "money")).toBe(500_000);
    expect(parseNumber("1,5M", "money")).toBe(1_500_000);
    expect(parseNumber("1.5m", "money")).toBe(1_500_000);
    expect(parseNumber("2 500 000", "money")).toBe(2_500_000);
    expect(parseNumber("2\u00a0500\u00a0000", "money")).toBe(2_500_000);
  });

  it("reads grouped money from either locale", () => {
    expect(parseNumber("1,500,000", "money")).toBe(1_500_000);
    expect(parseNumber("1.500.000", "money")).toBe(1_500_000);
    expect(parseNumber("25,000", "money")).toBe(25_000);
  });

  it("reads decimals with comma or point", () => {
    expect(parseNumber("3,05", "percent")).toBe(3.05);
    expect(parseNumber("3.05", "percent")).toBe(3.05);
    expect(parseNumber("18,5 %", "percent")).toBe(18.5);
    expect(parseNumber("-1", "percent")).toBe(-1);
  });

  it("rejects text", () => {
    expect(parseNumber("", "money")).toBeNaN();
    expect(parseNumber("abc", "money")).toBeNaN();
    expect(parseNumber("5k", "years")).toBeNaN();
  });
});

describe("formatNumber", () => {
  it("groups money and keeps two decimals otherwise", () => {
    expect(formatNumber(1_234_567.4, "money", "en-GB")).toBe("1,234,567");
    expect(formatNumber(3.456, "percent", "en-GB")).toBe("3.46");
    expect(formatNumber(NaN, "money", "en-GB")).toBe("");
  });
});
