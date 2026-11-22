import { describe, expect, it } from "vitest";
import {
  addItem, amountOf, choiceOf, duplicateItem, moveItem, profile, qualityMin, readPace, removeItem, targetFor, TEMPLATES, withAmount, withTarget,
} from "./stepedit";
import { parseSteps, stepsSummary, stepsText, withStrides, type StepRefs } from "./steps";

const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: [130, 148, 160, 172], easyPace: 330 };

describe("session builder edits", () => {
  it("shows amounts the way a runner types them", () => {
    expect(amountOf({ min: 8 }, "metric")).toEqual({ value: 8, unit: "min" });
    expect(amountOf({ min: 0.333 }, "metric")).toEqual({ value: 20, unit: "s" });
    expect(amountOf({ km: 0.4 }, "metric")).toEqual({ value: 400, unit: "m" });
    expect(amountOf({ km: 1.5 }, "metric")).toEqual({ value: 1.5, unit: "dist" });
    expect(withAmount({ km: 2, target: null }, { value: 90, unit: "s" }, "metric")).toEqual({ min: 1.5, target: null });
    expect((withAmount({ min: 2, target: null } as { km?: number; min?: number; target: null }, { value: 3, unit: "dist" }, "imperial")).km).toBeCloseTo(4.828, 2);
  });

  it("maps intensity choices to targets and back", () => {
    for (const c of ["easy", "jog", "threshold", "strides", "z3", "pct", "pace", "hr", "none"] as const) expect(choiceOf(targetFor(c))).toBe(c);
    expect(targetFor("pace", 280)).toEqual({ kind: "pace", secPerKm: 280 });
    expect(withTarget({ min: 8, target: { kind: "threshold" }, judge: "hr" }, "strides")).toEqual({ min: 8, target: { kind: "strides" } });
    expect(readPace("4:40", "metric")).toBe(280);
    expect(readPace("4:4", "metric")).toBeNull();
  });

  it("adds, moves, duplicates and removes rows", () => {
    let s = addItem(null, "step");
    s = addItem(s, "repeat");
    s = addItem(s, "strides");
    expect(s.items.map((x) => x.kind)).toEqual(["step", "repeat", "repeat"]);
    expect(moveItem(s, 0, 1).items[0].kind).toBe("repeat");
    expect(moveItem(s, 0, -1)).toBe(s);
    expect(duplicateItem(s, 0).items).toHaveLength(4);
    expect(removeItem({ v: 1, items: [s.items[0]] }, 0)).toBeNull();
  });

  it("every template survives the text round trip", () => {
    for (const tpl of TEMPLATES) {
      for (const lang of ["sv", "en"] as const) {
        const p = parseSteps(stepsText(tpl.steps, lang, "metric"), "metric");
        expect(p.errors).toEqual([]);
        expect(p.steps).toEqual(tpl.steps);
      }
    }
  });

  it("draws the profile and counts quality without strides", () => {
    const thr = TEMPLATES.find((x) => x.id === "threshold")!.steps;
    const segs = profile(thr, REFS);
    expect(segs).toHaveLength(1 + 3 + 2 + 1);
    expect(qualityMin(segs)).toBeCloseTo(24, 0);
    expect(qualityMin(profile(withStrides({ km: 8 }), REFS))).toBe(0);
    expect(stepsSummary(withStrides({ km: 8 }), "sv", "metric")).toBe("+ 6 strides");
  });
});
