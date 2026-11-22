import { describe, expect, it } from "vitest";
import { intervalsDoc } from "./intervalsdoc";
import { parseSteps, type StepRefs } from "./steps";

const refs: StepRefs = { thresholdPace: 250, thresholdHr: 170, easyLow: 130, easyHigh: 145, zones: [130, 145, 158, 170], easyPace: 330 };
const doc = (text: string, lthr: number | null = 170) => intervalsDoc(parseSteps(text, "metric", "sv").steps!, refs, lthr);

describe("intervals.icu workout text", () => {
  it("writes absolute pace, HR as % of LTHR, and keeps rest between reps only", () => {
    const d = doc("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    expect(d.text).toBe([
      "- 2km 76-85% LTHR intensity=warmup",
      "",
      "2x",
      "- 8m 3:55/km-4:30/km Pace intensity=active",
      "- 2m intensity=recovery",
      "",
      "- 8m 3:55/km-4:30/km Pace intensity=active",
      "- 1.5km 76-85% LTHR intensity=cooldown",
    ].join("\n"));
    expect(d.steps).toBe(7);
    expect(d.missing).toEqual([]);
  });

  it("repeats without rest, two reps, metres and seconds", () => {
    expect(doc("5x1 km @4:00").text).toBe("5x\n- 1km 3:55/km-4:05/km Pace intensity=active");
    expect(doc("2x400 m @4:00 / 90 s jogg").text).toBe([
      "- 400mtr 3:55/km-4:05/km Pace intensity=active",
      "- 1m30s intensity=recovery",
      "- 400mtr 3:55/km-4:05/km Pace intensity=active",
    ].join("\n"));
    expect(doc("45 s @4:00").text).toBe("- 45s 3:55/km-4:05/km Pace intensity=active");
  });

  it("an HR step goes without a target when intervals.icu has no LTHR", () => {
    const d = doc("40 min lugnt", null);
    expect(d.text).toBe("- 40m intensity=active");
    expect(d.missing).toEqual(["hr"]);
  });
});
