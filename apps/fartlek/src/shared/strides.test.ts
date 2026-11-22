import { describe, expect, it } from "vitest";
import { sessionText } from "./blocktext";
import { plannedLoad } from "./load";
import { addStrides, NEXT, type SuggestItem, type WeekSeed } from "./nextweek";
import { suggestWeek } from "./blockplan";
import { parseWeekLine } from "./parser";
import { flattenSteps, hasStrides, parseSteps, resolveTarget, STRIDES, stepsText, stridesOf, withStrides, type StepRefs } from "./steps";
import { intervalsDoc } from "./intervalsdoc";

const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const THR = { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 };

describe("strides in step text", () => {
  it("reads strides in both languages and writes them back", () => {
    for (const text of ["7 km lugnt, 6x20 s strides / 1 min jogg", "7 km easy, 6x20 s stegringar / 1 min jog"]) {
      const p = parseSteps(text, "metric");
      expect(p.errors).toEqual([]);
      expect(p.steps).toEqual(withStrides({ km: 7 }));
    }
    expect(stepsText(withStrides({ km: 7 }), "sv", "metric")).toBe("7 km lugnt, 6x20 s strides / 1 min jogg");
  });

  it("never judges strides and keeps the run before them a run", () => {
    const s = withStrides({ km: 7 });
    const flat = flattenSteps(s);
    expect(flat[0].role).toBe("run");
    expect(resolveTarget({ min: 1 / 3, target: { kind: "strides" }, judge: "pace" }, REFS).judge).toBeNull();
    // intervals.icu gets the reps without a target.
    expect(intervalsDoc(s, REFS, null).text).not.toMatch(/Pace|LTHR/);
  });

  it("adds a little load, not a session's worth", () => {
    const plain = plannedLoad({ type: "easy", status: "planned", distanceKm: 7, durationMin: null, steps: null }, THR);
    const st = plannedLoad({ type: "easy", status: "planned", distanceKm: null, durationMin: null, steps: withStrides({ km: 7 }) }, THR);
    expect(st - plain).toBeGreaterThan(0);
    expect(st - plain).toBeLessThan(15);
  });

  it("knows the easy-run-plus-strides shape", () => {
    expect(stridesOf(withStrides({ km: 7 }, 8))).toEqual({ base: { km: 7, target: { kind: "easy" } }, reps: 8 });
    expect(stridesOf(parseSteps("7 km lugnt, 6x30 s strides / 1 min jogg", "metric").steps)).toBeNull();
    expect(hasStrides(parseSteps("7 km lugnt, 6x30 s strides / 1 min jogg", "metric").steps)).toBe(true);
  });
});

describe("`+ strides` in the block text", () => {
  it("turns into steps and back", () => {
    const w = parseWeekLine("8 lugnt + strides, 9 tröskel, 16 long + 8 strides");
    expect(w.errors).toEqual([]);
    expect(w.sessions[0]).toMatchObject({ type: "easy", distance: 8 });
    expect(parseSteps(w.sessions[0].stepsText!, "metric").steps).toEqual(withStrides({ km: 8 }));
    expect(parseSteps(w.sessions[2].stepsText!, "metric").steps).toEqual(withStrides({ km: 16 }, 8));
    expect(sessionText({ type: "easy", distanceKm: 9.3, durationMin: null, zone2: false, steps: withStrides({ km: 8 }) }, "metric", "sv")).toBe("8 lugnt + strides");
    expect(sessionText({ type: "easy", distanceKm: 9.3, durationMin: null, zone2: false, steps: withStrides({ km: 8 }, 8) }, "metric", "en")).toBe("8 easy + 8 strides");
    expect(parseWeekLine("45min easy + strides").sessions[0]).toMatchObject({ durationMin: 45 });
  });

  it("only goes on easy and long runs", () => {
    expect(parseWeekLine("9 tröskel + strides").errors[0]?.key).toBe("parse.stridesOnEasy");
    expect(parseWeekLine("8 easy + 30 strides").errors[0]?.key).toBe("parse.badStrides");
  });
});

describe("strides in the week suggestion", () => {
  const seed: WeekSeed = {
    weekStart: "2026-11-16", ctl: 40, atl: 44, kmBefore: [34, 36, 38], past: [], runDays: [1, 2, 4, 6, 0], longRunDay: 0,
    threshold: THR, refs: REFS, crossMin: 0, targetKm: null, backoff: false, longestKm: 12, rung: 0, tempoPace: 275,
  };

  it("ends two easy runs with strides and never the long run", () => {
    const s = suggestWeek(seed);
    const easy = s.items.filter((i) => i.type === "easy");
    expect(easy.filter((i) => hasStrides(i.steps)).length).toBe(Math.min(NEXT.stridesPerWeek, easy.length));
    expect(s.items.filter((i) => i.type !== "easy").some((i) => i.type !== "threshold" && hasStrides(i.steps))).toBe(false);
  });

  it("keeps the week's km and skips runs too short for them", () => {
    const items: SuggestItem[] = [
      { date: "2026-11-16", type: "easy", km: 3, durationMin: null, steps: null },
      { date: "2026-11-17", type: "easy", km: 8, durationMin: null, steps: null },
    ];
    addStrides(items, REFS);
    expect(items[0].steps).toBeNull();
    expect(stridesOf(items[1].steps)?.reps).toBe(STRIDES.reps);
    expect(items[1].km).toBeLessThanOrEqual(8);
    expect(items[1].km).toBeGreaterThan(7.8);
  });
});
