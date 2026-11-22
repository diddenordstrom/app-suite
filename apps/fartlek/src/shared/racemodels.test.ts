import { describe, expect, it } from "vitest";
import { csMarathon, decouplingGroup, interpolateTime, longRunDecoupling, median, tandaMarathon, trendPerStep, vickersMarathon } from "./racemodels";
import { predictRace, trainingContext } from "./bestefforts";
import type { Stream } from "./types";

describe("vickersMarathon", () => {
  it("reproduces the published 30 mi/week example within two minutes", () => {
    // Riegel 3:59:46 from a 25:00 5 km; the calculator built on Model 1 gives 4:13:38 at 30 mi/week.
    const s = vickersMarathon(3 * 3600 + 59 * 60 + 46, 30 * 1.609344);
    expect(Math.abs(s - (4 * 3600 + 13 * 60 + 38))).toBeLessThan(120);
  });
  it("slows less with more volume", () => {
    expect(vickersMarathon(12000, 80)).toBeLessThan(vickersMarathon(12000, 30));
  });
});

describe("tandaMarathon", () => {
  it("follows the formula", () => {
    // K = 60 km/week, P = 300 s/km: Pm = 17.1 + 140·e^(−0.318) + 165 = 284.0 s/km
    expect(tandaMarathon(60, 300)).toBeCloseTo(42.195 * (17.1 + 140 * Math.exp(-0.318) + 165), 3);
    expect(tandaMarathon(60, 300) / 42.195).toBeCloseTo(284, 0);
  });
});

describe("durability model", () => {
  it("groups decoupling as Smyth 2022 and runs a share of CS", () => {
    expect([1.05, 1.1, 1.19, 1.2].map(decouplingGroup)).toEqual(["low", "moderate", "moderate", "high"]);
    expect(csMarathon(4, "low")).toBeCloseTo(42195 / (4 * 0.88), 3);
    expect(csMarathon(4, "high")).toBeGreaterThan(csMarathon(4, "low"));
  });
});

/** A steady run at 3 m/s for `mins` minutes with heart rate going from 140 to `endHr`. */
function steady(mins: number, endHr: number, speed: (f: number) => number = () => 3): Stream {
  const t: number[] = [], hr: number[] = [], sp: number[] = [];
  const n = mins * 12;
  for (let i = 0; i <= n; i++) { t.push(i * 5); hr.push(140 + ((endHr - 140) * i) / n); sp.push(speed(i / n)); }
  return { t, hr, speed: sp, alt: t.map(() => null) };
}

describe("longRunDecoupling", () => {
  it("is late HR/speed over early HR/speed", () => {
    const r = longRunDecoupling(steady(100, 154))!;
    expect(r).toBeGreaterThan(1.05);
    expect(r).toBeLessThan(1.1);
  });
  it("ignores short and unsteady runs", () => {
    expect(longRunDecoupling(steady(60, 160))).toBeNull();
    expect(longRunDecoupling(steady(100, 150, (f) => (f > 0.8 ? 2 : 3)))).toBeNull();
  });
});

describe("helpers", () => {
  it("median, power-law interpolation and trend", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(interpolateTime(21097.5, [21097.5, 6000], [42195, 12600])).toBeCloseTo(6000);
    expect(trendPerStep([null, 500, 490, 480, 470])).toBeCloseTo(-10);
    expect(trendPerStep([500, 480])).toBeNull();
  });
});

describe("predictRace for the marathon", () => {
  const cs = { csMps: 4, dPrimeM: 200, paceSecPerKm: 250, r2: null };
  const curve = [{ durationS: 3600, distanceM: 13740, paceSecPerKm: 262, activityId: "a", date: "2026-11-02" }];
  it("takes the median of the estimates it has inputs for", () => {
    const ctx = { weeklyKm: 50, meanPaceSecPerKm: 320, decoupling: 1.08, longRuns: 3 };
    const p = predictRace(42.195, cs, curve, ctx)!;
    expect(p.model).toBe("marathon");
    expect(p.estimates!.map((e) => e.model)).toEqual(["vickers", "durability", "tanda"]);
    expect(p.seconds).toBe(median(p.estimates!.map((e) => e.seconds)));
  });
  it("falls back to Riegel without training data, and keeps Riegel for the half", () => {
    expect(predictRace(42.195, cs, curve, null)!.model).toBe("riegel");
    expect(predictRace(21.1, cs, curve, { weeklyKm: 50, meanPaceSecPerKm: 320, decoupling: 1.3, longRuns: 2 })!.model).toBe("riegel");
  });
  it("puts 30 km between the half and the marathon", () => {
    const ctx = { weeklyKm: 50, meanPaceSecPerKm: 320, decoupling: 1.08, longRuns: 3 };
    const half = predictRace(21.0975, cs, curve, ctx)!.seconds, full = predictRace(42.195, cs, curve, ctx)!.seconds;
    const p = predictRace(30, cs, curve, ctx)!;
    expect(p.model).toBe("between");
    expect(p.seconds).toBeGreaterThan(half);
    expect(p.seconds).toBeLessThan(full);
  });
});

describe("trainingContext", () => {
  it("averages 8 weeks of runs and takes the median decoupling", () => {
    const runs = [
      { date: "2026-09-01", distanceM: 99000, durationS: 1, decoupling: 1.5 },
      { date: "2026-10-01", distanceM: 20000, durationS: 6000, decoupling: 1.04 },
      { date: "2026-11-01", distanceM: 20000, durationS: 6800, decoupling: 1.1 },
      { date: "2026-11-05", distanceM: 8000, durationS: 2400, decoupling: null },
    ];
    expect(trainingContext(runs, "2026-11-12")).toEqual({ weeklyKm: 6, meanPaceSecPerKm: 317, decoupling: 1.07, longRuns: 2 });
  });
});
