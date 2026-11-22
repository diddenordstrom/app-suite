import { describe, expect, it } from "vitest";
import { estimatedYieldKg } from "./plantings";

const crop = { yieldKgPerM2: 3, yieldKgPerPlant: 0.5 };
const area = { plantingMode: "area" as const, areaM2: 1.5, quantity: null, yieldKgPerPlantOverride: null };
const count = { plantingMode: "count" as const, areaM2: 0, quantity: 4, yieldKgPerPlantOverride: null };

describe("estimatedYieldKg", () => {
  it("multiplies area by the crop's yield per m²", () => expect(estimatedYieldKg(area, crop)).toBe(4.5));
  it("multiplies plants by the planting's own yield per plant before the crop's", () => {
    expect(estimatedYieldKg(count, crop)).toBe(2);
    expect(estimatedYieldKg({ ...count, yieldKgPerPlantOverride: 1.25 }, crop)).toBe(5);
  });
  it("is null without a crop or without the numbers for count mode", () => {
    expect(estimatedYieldKg(area, undefined)).toBeNull();
    expect(estimatedYieldKg(count, { ...crop, yieldKgPerPlant: null })).toBeNull();
    expect(estimatedYieldKg({ ...count, quantity: null }, crop)).toBeNull();
  });
});
