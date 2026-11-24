import { describe, expect, it } from "vitest";
import { addDays, weekday } from "./dates";
import type { BlockSeed } from "./blockplan";
import { clipWeeks, diffPlans, planRange, rangeWeeks, workoutWeeks } from "./planrange";
import type { StepRefs } from "./steps";
import type { Workout } from "./types";

const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const MONDAY = "2026-11-16";

function seed(over: Partial<BlockSeed> = {}): BlockSeed {
  return {
    startWeek: MONDAY, weeks: 3, ctl: 30, atl: 36, kmBefore: [20, 24, 28], past: [],
    tolerance: { km: 31, peakKm: 31, peakWeek: "2026-10-05", weeksAgo: 6 },
    runDays: [2, 5, 0], longRunDay: 0,
    threshold: { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 }, refs: REFS,
    crossMin: 0, lighterLast: true, goalKm: null, buildWeeksDone: 0, hardBefore: false,
    longestKm: 12, rung: 0, tempoPace: 275, ...over,
  };
}

let id = 0;
const wo = (date: string, type: Workout["type"], km: number, over: Partial<Workout> = {}): Workout =>
  ({ id: ++id, date, type, distanceKm: km, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null, manualActivityId: null, manualUnlinked: false, steps: null, blueprint: null, ...over });

describe("rangeWeeks", () => {
  it("covers any range with whole weeks from the week it starts in", () => {
    expect(rangeWeeks({ from: "2026-11-16", to: "2026-11-22" })).toEqual({ startWeek: "2026-11-16", weeks: 1 });
    expect(rangeWeeks({ from: "2026-11-18", to: "2026-12-06" })).toEqual({ startWeek: "2026-11-16", weeks: 3 });
    expect(rangeWeeks({ from: "2026-11-18", to: "2026-11-18" })).toEqual({ startWeek: "2026-11-16", weeks: 1 });
    expect(rangeWeeks({ from: "2026-11-22", to: "2026-11-23" }, "sunday")).toEqual({ startWeek: "2026-11-22", weeks: 1 });
  });
});

describe("planRange", () => {
  it("plans the weeks that cover the range and drops the days outside it", () => {
    const { startWeek, weeks } = rangeWeeks({ from: "2026-11-18", to: "2026-12-04" });
    const s = seed({ startWeek, weeks });
    const p = planRange(s, { from: "2026-11-18", to: "2026-12-04" });
    expect(p.suggestion.weeks).toHaveLength(3);
    expect(p.items.flat().every((it) => it.date >= "2026-11-18" && it.date <= "2026-12-04")).toBe(true);
    // The day before the range and the days after it are in the engine's weeks, not in the plan.
    expect(p.suggestion.weeks.flatMap((w) => w.items).length).toBeGreaterThan(p.items.flat().length);
  });

  it("is the same engine for a week, a block and a month: a longer range starts with the same first week", () => {
    const one = planRange(seed({ weeks: 1 }), { from: MONDAY, to: addDays(MONDAY, 6) });
    const four = planRange(seed({ weeks: 4 }), { from: MONDAY, to: addDays(MONDAY, 27) });
    expect(four.items[0].map((it) => [it.date, it.type, it.km])).toEqual(one.items[0].map((it) => [it.date, it.type, it.km]));
  });

  it("builds a lighter first week when asked", () => {
    const normal = planRange(seed({ weeks: 2 }), { from: MONDAY, to: addDays(MONDAY, 13) });
    const light = planRange(seed({ weeks: 2, lighterFirst: true }), { from: MONDAY, to: addDays(MONDAY, 13), light: true });
    expect(light.eval.weeks[0].km).toBeLessThan(normal.eval.weeks[0].km);
  });
});

describe("workoutWeeks", () => {
  it("groups planned sessions by week and leaves out what is not planned running", () => {
    const w = workoutWeeks([
      wo("2026-11-17", "easy", 8), wo("2026-11-22", "long", 14), wo("2026-11-24", "threshold", 9), wo("2026-11-18", "rest", 0),
      wo("2026-11-19", "easy", 6, { status: "dropped" }), wo("2026-11-20", "race", 10), wo("2026-11-21", "cross", 0, { durationMin: 45 }), wo("2026-12-30", "easy", 5),
    ], MONDAY, 2);
    expect(w.map((x) => x.map((it) => it.type))).toEqual([["easy", "cross", "long"], ["threshold"]]);
    expect(w[0][1]).toMatchObject({ type: "cross", durationMin: 45 });
  });
});

describe("diffPlans", () => {
  const before = (km: number[]) => km.map((k, i) => [{ date: addDays(MONDAY, i * 7 + 1), type: "easy" as const, km: k, durationMin: null, steps: null }]);
  const s = seed();

  it("lists the days that change and sums the weeks", () => {
    const b = before([8, 8, 8]);
    const a = before([8, 10, 8]);
    a[2] = [];
    a[0].push({ date: addDays(MONDAY, 4), type: "easy", km: 5, durationMin: null, steps: null });
    const d = diffPlans(s, b, a);
    expect(d.weeks[0]).toMatchObject({ kmBefore: 8, kmAfter: 13 });
    expect(d.weeks[0].changes.map((c) => c.kind)).toEqual(["added"]);
    expect(d.weeks[1].changes).toEqual([expect.objectContaining({ kind: "changed" })]);
    expect(d.weeks[2].changes.map((c) => c.kind)).toEqual(["removed"]);
  });

  it("compares km, the biggest week, the deepest form and where the plan ends, also when it grows by a week", () => {
    const b = workoutWeeks([wo("2026-11-17", "long", 12), wo("2026-11-24", "long", 13), wo("2026-12-01", "long", 14)], MONDAY, 3);
    const a = planRange(seed({ weeks: 4 }), { from: MONDAY, to: addDays(MONDAY, 27) }).items;
    const d = diffPlans(seed({ weeks: 4 }), b, a);
    expect(d.before).not.toBeNull();
    expect(d.before!.endsOn).toBe(addDays(MONDAY, 20));
    expect(d.after.endsOn).toBe(addDays(MONDAY, 27));
    expect(d.after.km).toBeGreaterThan(d.before!.km);
    expect(d.after.peak!.km).toBeGreaterThan(0);
    expect(d.weeks).toHaveLength(4);
  });

  it("has no 'before' when nothing was planned", () => {
    expect(diffPlans(s, [[], [], []], before([8, 8, 8])).before).toBeNull();
  });
});

describe("clipWeeks", () => {
  it("keeps only the days in the range", () => {
    const items = [[{ date: "2026-11-16", type: "easy" as const, km: 5, durationMin: null, steps: null }, { date: "2026-11-19", type: "easy" as const, km: 5, durationMin: null, steps: null }]];
    expect(clipWeeks(items, "2026-11-18", "2026-11-22")[0].map((it) => weekday(it.date))).toEqual([4]);
  });
});
