import { describe, expect, it } from "vitest";
import {
  flattenSteps, parseSteps, plannedFromSteps, readSteps, resolveTarget, stepsSummary, stepsText, stepTotals, withJudge,
  type StepRefs, type WorkoutSteps,
} from "./steps";

const refs: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 130, easyHigh: 148, zones: [130, 148, 160, 172], easyPace: 350 };
const ok = (text: string, units: "metric" | "imperial" = "metric") => {
  const p = parseSteps(text, units);
  expect(p.errors).toEqual([]);
  return p.steps!;
};

describe("step text", () => {
  it("reads the example from the mocks", () => {
    const s = ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    expect(s.items).toEqual([
      { kind: "step", step: { km: 2, target: { kind: "easy" } } },
      { kind: "repeat", times: 3, work: { min: 8, target: { kind: "threshold" } }, rest: { min: 2, target: { kind: "jog" } } },
      { kind: "step", step: { km: 1.5, target: { kind: "easy" } } },
    ]);
  });

  it("reads Swedish and English the same and writes the user's language", () => {
    const sv = ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1,5 km lugnt");
    const en = ok("2 km easy, 3×8 min @threshold / 2 min jog, 1.5 km easy");
    expect(en).toEqual(sv);
    expect(stepsText(sv, "sv", "metric")).toBe("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    expect(stepsText(sv, "en", "metric")).toBe("2 km easy, 3x8 min @threshold / 2 min jog, 1.5 km easy");
  });

  it("round-trips metres, seconds, absolute and relative targets and judge overrides", () => {
    for (const text of ["6x400 m @3:50 / 90 s jogg", "20 min @z2", "5 km @165", "4x1 km @92% / 400 m jogg", "3x10 min @tröskel:puls / 2 min jogg", "30 min lugnt:tempo"]) {
      expect(stepsText(ok(text), "sv", "metric")).toBe(text);
    }
  });

  it("uses the user's unit for bare numbers and paces", () => {
    const s = ok("2 easy, 3 @7:00", "imperial");
    const [a, b] = s.items as { kind: "step"; step: { km: number; target: { kind: string; secPerKm?: number } } }[];
    expect(a.step.km).toBeCloseTo(3.219, 3);
    expect(b.step.target.secPerKm).toBe(261);
    expect(stepsText(s, "en", "imperial")).toBe("2 mi easy, 3 mi @7:00");
  });

  it("explains what it can't read, with a suggestion for a typo", () => {
    expect(parseSteps("2 km lugnt, 3x8 min @trsökel / 2 min jogg", "metric", "sv").errors)
      .toEqual([{ key: "steps.unknownTargetSuggest", params: { text: "trsökel", suggestion: "tröskel", item: 2 } }]);
    expect(parseSteps("lugnt", "metric").errors[0].key).toBe("steps.cantRead");
    expect(parseSteps("0 km", "metric").errors[0].key).toBe("steps.badAmount");
    expect(parseSteps("3x1 km @20", "metric").errors[0].key).toBe("steps.badTarget");
    expect(parseSteps("2 km @tröskel:snabbt", "metric").errors[0].key).toBe("steps.unknownJudge");
    expect(parseSteps("   ", "metric")).toEqual({ steps: null, errors: [] });
  });

  it("summarises the first repeat for a week chip", () => {
    expect(stepsSummary(ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg"), "sv", "metric")).toBe("3×8 min tröskel");
    expect(stepsSummary(ok("10 km lugnt"), "sv", "metric")).toBeNull();
  });
});

describe("steps in order", () => {
  it("expands repeats with rest between reps and names the roles", () => {
    const flat = flattenSteps(ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt"));
    expect(flat.map((f) => `${f.role}${f.rep ?? ""}`)).toEqual(["warmup", "work1", "recovery1", "work2", "recovery2", "work3", "cooldown"]);
    expect(flattenSteps(ok("10 km lugnt")).map((f) => f.role)).toEqual(["run"]);
    expect(flattenSteps(ok("15 min lugnt, 20 min @tröskel")).map((f) => f.role)).toEqual(["warmup", "work"]);
  });
});

describe("targets", () => {
  const step = (text: string) => flattenSteps(ok(text))[0].def;
  it("resolves against the numbers Fartlek has and judges hard efforts on pace, easy on HR", () => {
    expect(resolveTarget(step("2 km lugnt"), refs)).toEqual({ pace: null, hr: [130, 148], hrRef: null, judge: "hr" });
    expect(resolveTarget(step("8 min @tröskel"), refs)).toEqual({ pace: [240, 275], hr: [164, 174], hrRef: 169, judge: "pace" });
    expect(resolveTarget(step("8 min @tröskel:puls"), refs).judge).toBe("hr");
    expect(resolveTarget(step("20 min @z2"), refs).hr).toEqual([131, 148]);
    expect(resolveTarget(step("2 min jogg"), refs).judge).toBeNull();
  });

  it("falls back to what can be judged when the chosen target is unknown", () => {
    const none = { ...refs, thresholdPace: null };
    expect(resolveTarget(step("8 min @tröskel"), none)).toMatchObject({ pace: null, judge: "hr" });
    expect(resolveTarget(step("2 km lugnt"), { ...refs, easyLow: null, easyHigh: null, zones: null }).judge).toBeNull();
  });

  it("toggles the judged target, writing an override only when it differs from the default", () => {
    const s = ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg");
    const hr = withJudge(s, 1, "work", "hr");
    expect(stepsText(hr, "sv", "metric")).toBe("2 km lugnt, 3x8 min @tröskel:puls / 2 min jogg");
    expect(stepsText(withJudge(hr, 1, "work", "pace"), "sv", "metric")).toBe("2 km lugnt, 3x8 min @tröskel / 2 min jogg");
  });
});

describe("planned amount", () => {
  it("adds up distance, estimating time steps from their target pace", () => {
    const s = ok("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    const tot = stepTotals(s, refs);
    // 3 × 8 min at the window's middle (257.5 s/km) + 2 × 2 min jog at easy + 20 s/km
    expect(tot.km).toBeCloseTo(3.5 + (3 * 480) / 257.5 + (2 * 120) / 370, 2);
    expect(plannedFromSteps(s, refs)).toEqual({ distanceKm: 9.7, durationMin: null });
  });

  it("plans minutes when every step is timed", () => {
    expect(plannedFromSteps(ok("15 min lugnt, 4x5 min @z4 / 2 min jogg, 10 min lugnt"), refs)).toEqual({ distanceKm: null, durationMin: 51 });
  });

  it("reads stored steps defensively", () => {
    const s: WorkoutSteps = ok("10 km lugnt");
    expect(readSteps(JSON.stringify(s))).toEqual(s);
    expect(readSteps("{oops")).toBeNull();
    expect(readSteps(JSON.stringify({ v: 2, items: [] }))).toBeNull();
    expect(readSteps(null)).toBeNull();
  });
});
