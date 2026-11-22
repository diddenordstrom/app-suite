import { describe, expect, it } from "vitest";
import { carbsPerHour, durability, fuelAdvice, giScore, srpeLoad } from "./activitylog";
import type { Stream } from "./types";

describe("sRPE and carbs", () => {
  it("multiplies RPE by minutes", () => {
    expect(srpeLoad(5, 3600)).toBe(300);
    expect(srpeLoad(null, 3600)).toBeNull();
    expect(srpeLoad(5, 0)).toBeNull();
  });
  it("converts total carbs to g/h and ignores very short sessions", () => {
    expect(carbsPerHour(150, 2 * 3600)).toBe(75);
    expect(carbsPerHour(30, 15 * 60)).toBeNull();
    expect(carbsPerHour(null, 3600)).toBeNull();
  });
  it("takes the worst symptom", () => {
    expect(giScore({ nausea: 2, bloating: 5, cramps: null })).toBe(5);
    expect(giScore({ nausea: null, bloating: null, cramps: null })).toBeNull();
  });
});

describe("fuelAdvice", () => {
  it("starts at 60 g/h without history", () => {
    expect(fuelAdvice([])).toMatchObject({ gPerH: 60, action: "start" });
  });
  it("holds until symptoms are rated", () => {
    expect(fuelAdvice([{ date: "2026-11-01", gPerH: 60, gi: null }])).toMatchObject({ gPerH: 60, action: "hold" });
  });
  it("holds on a clean first session, then raises after two weeks", () => {
    expect(fuelAdvice([{ date: "2026-11-01", gPerH: 60, gi: 1 }])).toMatchObject({ gPerH: 60, action: "hold" });
    expect(fuelAdvice([
      { date: "2026-11-01", gPerH: 60, gi: 1 },
      { date: "2026-11-15", gPerH: 62, gi: 2 },
    ])).toMatchObject({ gPerH: 72, action: "raise" });
  });
  it("holds on moderate symptoms and lowers on bad ones", () => {
    expect(fuelAdvice([{ date: "2026-11-01", gPerH: 80, gi: 4 }])).toMatchObject({ gPerH: 80, action: "hold" });
    expect(fuelAdvice([{ date: "2026-11-01", gPerH: 80, gi: 7 }])).toMatchObject({ gPerH: 70, action: "lower" });
  });
  it("does not drop below 45 or rise above 120", () => {
    expect(fuelAdvice([{ date: "2026-11-01", gPerH: 50, gi: 8 }]).gPerH).toBe(45);
    expect(fuelAdvice([
      { date: "2026-10-01", gPerH: 120, gi: 0 },
      { date: "2026-11-01", gPerH: 120, gi: 0 },
    ])).toMatchObject({ gPerH: 120, action: "hold" });
  });
  it("starts the clean clock over after a rough session", () => {
    expect(fuelAdvice([
      { date: "2026-10-01", gPerH: 70, gi: 1 },
      { date: "2026-10-10", gPerH: 70, gi: 5 },
      { date: "2026-11-01", gPerH: 70, gi: 1 },
    ])).toMatchObject({ gPerH: 70, action: "hold" });
  });
});

/** A run of `minutes` minutes with one sample every 5 s; speed and HR per minute given by the callbacks. */
const stream = (minutes: number, speed: (min: number) => number, hr: (min: number) => number): Stream => {
  const t: number[] = [], s: number[] = [], h: number[] = [];
  for (let sec = 0; sec <= minutes * 60; sec += 5) { t.push(sec); s.push(speed(sec / 60)); h.push(hr(sec / 60)); }
  return { t, speed: s, hr: h, alt: t.map(() => null) };
};

describe("durability", () => {
  it("is null for short runs and missing streams", () => {
    expect(durability(null)).toBeNull();
    expect(durability(stream(60, () => 3, () => 140))).toBeNull();
  });
  it("is about zero for a steady run", () => {
    const d = durability(stream(100, () => 3, () => 140))!;
    expect(Math.abs(d.driftPct)).toBeLessThan(0.1);
  });
  it("shows fading when heart rate climbs at the same speed", () => {
    const d = durability(stream(100, () => 3, (m) => 140 + (m / 100) * 14))!;
    expect(d.driftPct).toBeGreaterThan(4);
    expect(d.thirds[2].hr).toBeGreaterThan(d.thirds[0].hr);
  });
  it("ignores the warm-up", () => {
    const d = durability(stream(100, (m) => (m < 5 ? 1 : 3), (m) => (m < 5 ? 100 : 140)))!;
    expect(Math.abs(d.driftPct)).toBeLessThan(0.1);
  });
});
