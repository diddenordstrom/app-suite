import { describe, expect, it } from "vitest";
import { raceLabels } from "./seasonlabels";

describe("raceLabels", () => {
  it("hides a name that runs into a later label coming the other way", () => {
    // Half left of the flip point (label to the right), marathon at the end (label to the left).
    expect(raceLabels([{ pos: 68.6, name: "Demo Half" }, { pos: 100, name: "Demo Marathon" }], 550)).toEqual([false, true]);
  });

  it("keeps both names when there is room for both", () => {
    expect(raceLabels([{ pos: 68.6, name: "Demo Half" }, { pos: 100, name: "Demo Marathon" }], 1100)).toEqual([true, true]);
  });

  it("keeps a name that clears the next flag on the same side", () => {
    expect(raceLabels([{ pos: 10, name: "Spring 10K" }, { pos: 30, name: "Half" }], 600)).toEqual([true, true]);
  });

  it("hides a name that covers the next flag on the same side", () => {
    expect(raceLabels([{ pos: 10, name: "Spring 10K" }, { pos: 15, name: "Half" }], 600)).toEqual([false, true]);
    expect(raceLabels([{ pos: 80, name: "Half" }, { pos: 85, name: "Autumn marathon" }], 600)).toEqual([true, false]);
  });

  it("shows nothing before the strip is measured", () => {
    expect(raceLabels([{ pos: 50, name: "Half" }], 0)).toEqual([false]);
  });
});
