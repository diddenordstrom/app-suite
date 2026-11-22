import { describe, expect, it } from "vitest";
import { build, daysFor, type Shape, type WeekSeed } from "./nextweek";
import { longShareAt, parseTuning, resolveTuning, TUNE, TUNE_FIELDS, TUNE_RANGE, tune, withTuning } from "./tuning";

type Range = { min: number; max: number; step: number };
type Tree = { [k: string]: number | Range | Tree };
const isRange = (r: unknown): r is Range => typeof r === "object" && r !== null && "min" in r && "max" in r && typeof (r as Range).min === "number";
/** Every number in `values` that has a range must lie inside it. */
function inside(values: Tree, range: Tree, path = ""): string[] {
  return Object.entries(range).flatMap(([k, r]) => {
    const v = values[k];
    if (isRange(r)) return typeof v === "number" && v >= r.min && v <= r.max ? [] : [`${path}${k} = ${String(v)} outside ${r.min}–${r.max}`];
    return inside(v as Tree, r as Tree, `${path}${k}.`);
  });
}

describe("tuning", () => {
  it("keeps every default inside its range", () => {
    expect(inside(TUNE as unknown as Tree, TUNE_RANGE as unknown as Tree)).toEqual([]);
  });

  it("ramps a block from the tolerated load to a little over it", () => {
    expect(TUNE.ramp.from).toBeLessThanOrEqual(1);
    expect(TUNE.ramp.to).toBeGreaterThan(1);
  });

  it("lets the long run's share fall as the week grows, to the floor", () => {
    expect(longShareAt(30)).toBeCloseTo(0.456, 2);
    expect(longShareAt(50)).toBeCloseTo(0.394, 2);
    expect(longShareAt(70)).toBeCloseTo(0.357, 2);
    expect(longShareAt(90)).toBeCloseTo(0.335, 2);
    for (let km = 10; km < 140; km += 10) expect(longShareAt(km + 10)).toBeLessThan(longShareAt(km));
    expect(longShareAt(400)).toBeGreaterThanOrEqual(TUNE.long.floorShare);
    expect(longShareAt(1)).toBeLessThanOrEqual(TUNE.long.maxShare);
  });

  it("lists every tweakable number once, with the range and default it was built from", () => {
    expect(TUNE_FIELDS.length).toBe(19);
    expect(new Set(TUNE_FIELDS.map((f) => f.path)).size).toBe(TUNE_FIELDS.length);
    for (const f of TUNE_FIELDS) {
      expect(f.def, f.path).toBeGreaterThanOrEqual(f.min);
      expect(f.def, f.path).toBeLessThanOrEqual(f.max);
    }
  });
});

describe("overrides", () => {
  it("accepts known numbers inside their ranges, and nothing else", () => {
    expect(parseTuning({})).toEqual({});
    expect(parseTuning({ ramp: { from: 0.9 }, long: { floorShare: 0.35 } })).toEqual({ ramp: { from: 0.9 }, long: { floorShare: 0.35 } });
    for (const bad of [null, [], "x", { nope: 1 }, { ramp: { from: 0.5 } }, { ramp: { from: "0.9" } }, { ramp: 1 }, { long: { floorShare: Infinity } }, { ramp: { from: 0.95, nope: 1 } }]) {
      expect(parseTuning(bad), JSON.stringify(bad)).toBeNull();
    }
  });

  it("refuses combinations that make no sense", () => {
    expect(parseTuning({ daysFromKm: { d4: 45 } })).toBeNull();
    expect(parseTuning({ daysFromKm: { d4: 30, d5: 45 } })).toEqual({ daysFromKm: { d4: 30, d5: 45 } });
  });

  it("merges over the defaults without touching them", () => {
    const t = resolveTuning({ ramp: { to: 1.12 } });
    expect(t.ramp).toEqual({ from: TUNE.ramp.from, to: 1.12 });
    expect(TUNE.ramp.to).toBe(1.1);
    expect(resolveTuning(null)).toEqual(resolveTuning({}));
  });

  it("is in force only while the plan is made, and restored after an error", () => {
    expect(tune().long.floorShare).toBe(0.3);
    withTuning({ long: { floorShare: 0.4 } }, () => {
      expect(tune().long.floorShare).toBe(0.4);
      expect(longShareAt(400)).toBeCloseTo(0.4, 2);
    });
    expect(() => withTuning({ ramp: { to: 1.12 } }, () => { throw new Error("x"); })).toThrow();
    expect(tune().ramp.to).toBe(1.1);
  });

  it("changes the plans the engine makes", () => {
    expect(daysFor(30)).toBe(4);
    expect(withTuning({ daysFromKm: { d4: 35 } }, () => daysFor(30))).toBe(3);
    const REFS = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
    const seed = { weekStart: "2026-11-16", runDays: [1, 2, 3, 4, 5, 6, 0], longRunDay: 0, refs: REFS } as unknown as WeekSeed;
    const shape = { km: 50, longKm: 15, tempo: null, thr: [{ reps: 3, min: 8, rest: 2 }], crossMin: 0 } as unknown as Shape;
    const easyRuns = () => build(seed, shape).filter((i) => i.type === "easy").length;
    expect(withTuning({ easy: { ofLong: 0.8 } }, easyRuns)).toBeLessThan(withTuning({ easy: { ofLong: 0.3 } }, easyRuns));
  });
});
