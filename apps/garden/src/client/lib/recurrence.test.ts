import { describe, expect, it } from "vitest";
import { RECURRENCE_PRESETS, presetToRRule, rruleToPreset } from "./recurrence";

describe("recurrence presets", () => {
  it("round-trips every preset through its RRULE", () => {
    for (const preset of RECURRENCE_PRESETS) {
      const rule = presetToRRule(preset, 3);
      expect(rruleToPreset(rule)).toMatchObject({ preset });
    }
  });

  it("defaults every-N-days to two days when no interval above one is given", () => {
    expect(presetToRRule("every_n_days")).toBe("FREQ=DAILY;INTERVAL=2");
    expect(presetToRRule("every_n_days", 1)).toBe("FREQ=DAILY;INTERVAL=2");
    expect(rruleToPreset("FREQ=DAILY;INTERVAL=5")).toEqual({ preset: "every_n_days", intervalDays: 5 });
  });

  it("treats a rule it doesn't know as custom, so it survives an edit", () => {
    expect(rruleToPreset("FREQ=YEARLY;BYMONTH=5")).toEqual({ preset: "custom" });
    expect(presetToRRule("custom")).toBeNull();
  });
});
