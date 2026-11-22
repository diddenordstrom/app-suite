import { describe, expect, it } from "vitest";
import { compareWithThreshold, csZones, fitCriticalSpeed, fromThreeMinute, parseClock } from "./criticalspeed";

describe("fitCriticalSpeed", () => {
  it("solves two efforts exactly", () => {
    // 900 m in 3:00 and 3000 m in 12:00 → CS 3.889 m/s (4:17/km), D′ 200 m.
    const cs = fitCriticalSpeed([{ distanceM: 900, durationS: 180 }, { distanceM: 3000, durationS: 720 }])!;
    expect(cs.csMps).toBeCloseTo(3.889, 3);
    expect(cs.dPrimeM).toBe(200);
    expect(cs.paceSecPerKm).toBe(257);
    expect(cs.r2).toBeNull();
  });
  it("fits three efforts and reports r²", () => {
    const e = [{ distanceM: 900, durationS: 180 }, { distanceM: 1700, durationS: 390 }, { distanceM: 3000, durationS: 720 }];
    const cs = fitCriticalSpeed(e)!;
    expect(cs.csMps).toBeGreaterThan(3.7);
    expect(cs.csMps).toBeLessThan(4.1);
    expect(cs.r2).toBeGreaterThan(0.99);
  });
  it("rejects too few, too similar, out-of-range or inconsistent efforts", () => {
    expect(fitCriticalSpeed([{ distanceM: 900, durationS: 180 }])).toBeNull();
    expect(fitCriticalSpeed([{ distanceM: 900, durationS: 180 }, { distanceM: 1000, durationS: 200 }])).toBeNull();
    expect(fitCriticalSpeed([{ distanceM: 900, durationS: 60 }, { distanceM: 3000, durationS: 720 }])).toBeNull();
    // The longer effort was slower per metre than a steady CS allows: negative D′.
    expect(fitCriticalSpeed([{ distanceM: 600, durationS: 180 }, { distanceM: 3000, durationS: 720 }])).toBeNull();
  });
});

describe("fromThreeMinute", () => {
  it("takes CS from the last 30 s and D′ from the rest", () => {
    // Last 30 s: 115 m → 3.833 m/s. 3 min total 900 m → D′ = 900 − 3.833 × 180 = 210 m.
    const cs = fromThreeMinute(900, 115)!;
    expect(cs.csMps).toBeCloseTo(3.833, 3);
    expect(cs.dPrimeM).toBe(210);
  });
  it("rejects values that give a negative D′", () => {
    expect(fromThreeMinute(600, 115)).toBeNull();
    expect(fromThreeMinute(0, 115)).toBeNull();
  });
});

describe("csZones and comparison", () => {
  const cs = fitCriticalSpeed([{ distanceM: 900, durationS: 180 }, { distanceM: 3000, durationS: 720 }])!;
  it("puts the first threshold at about 82 % of CS", () => {
    const z = csZones(cs);
    expect(z.cs).toBe(257);
    expect(z.firstThreshold.pace).toBe(312); // 1000 / (3.889 × 0.823) ≈ 5:12/km
    expect(z.firstThreshold.paceFast).toBeLessThan(z.firstThreshold.pace);
    expect(z.firstThreshold.paceSlow).toBeGreaterThan(z.firstThreshold.pace);
  });
  it("flags a threshold faster than CS", () => {
    expect(compareWithThreshold(257, 270)).toEqual({ gapSecPerKm: 13, status: "consistent" });
    expect(compareWithThreshold(257, 255)).toEqual({ gapSecPerKm: -2, status: "consistent" });
    expect(compareWithThreshold(257, 240)).toEqual({ gapSecPerKm: -17, status: "above_cs" });
  });
});

describe("parseClock", () => {
  it("reads m:ss and h:mm:ss", () => {
    expect(parseClock("12:05")).toBe(725);
    expect(parseClock("3:00")).toBe(180);
    expect(parseClock("1:02:05")).toBe(3725);
    expect(parseClock("12")).toBeNull();
    expect(parseClock("3:75")).toBeNull();
  });
});
