import { describe, expect, it } from "vitest";
import { carGross, carTotal, looksLikeFuel, parseDecimal, type CarCalc } from "./car";

const base: CarCalc = { mode: "fuel", distanceMil: 41, roundTrip: true, consumption: 0.65, fuelPrice: 19.5, rate: null, deductIds: [], deducted: 0 };

describe("car calculator", () => {
  it("fuel: mil × l/mil × kr/l, doubled for a round trip", () => {
    // 82 mil × 0,65 l × 19,50 kr = 1 039,35 kr, rounded to whole kronor
    expect(carGross(base)).toBe(103900);
    expect(carGross({ ...base, roundTrip: false })).toBe(52000); // 519,675 → 520
  });
  it("rate: mil × kr/mil", () => {
    expect(carGross({ ...base, mode: "rate", rate: 20 })).toBe(164000);
  });
  it("needs every value for its mode", () => {
    expect(carGross({ ...base, fuelPrice: null })).toBeNull();
    expect(carGross({ ...base, distanceMil: 0 })).toBeNull();
    expect(carGross({ ...base, mode: "rate", rate: null })).toBeNull();
  });
  it("subtracts already logged tankningar, never below zero", () => {
    expect(carTotal({ ...base, deducted: 64000, deductIds: [7] })).toBe(39900);
    expect(carTotal({ ...base, deducted: 200000, deductIds: [7] })).toBe(0);
  });
  it("parses Swedish decimals", () => {
    expect(parseDecimal("0,65")).toBe(0.65);
    expect(parseDecimal("19.50")).toBe(19.5);
    expect(parseDecimal("1 234")).toBe(1234);
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("abc")).toBeNull();
  });
  it("spots tankningar by title", () => {
    for (const t of ["Tankning Mora", "Bensin", "Diesel Circle K", "Soppa", "Bränsle", "Laddning Ionity", "Fuel"]) expect(looksLikeFuel(t)).toBe(true);
    for (const t of ["Matkasse", "Liftkort", "Gasell-glass"]) expect(looksLikeFuel(t)).toBe(false);
  });
});
