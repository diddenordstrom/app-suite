import { describe, expect, it } from "vitest";
import { topSuggestions } from "./Dashboard";

const bed = (locationId: number, type: "empty" | "succession", recentlyHarvested: boolean, crops: string[]) => ({
  locationId, locationName: `Bed ${locationId}`, type, bedFreesUp: null, recentlyHarvested,
  candidates: crops.map((cropName, i) => ({ suggestionId: locationId * 10 + i, cropId: i, cropName, daysToMaturity: 30 })),
});

describe("topSuggestions", () => {
  it("puts empty, just-harvested beds first and takes one crop per bed in turn", () => {
    const list = topSuggestions([
      bed(1, "succession", false, ["a", "b", "c"]),
      bed(2, "empty", true, ["d", "e"]),
      bed(3, "empty", false, ["f"]),
    ]);
    expect(list.map((s) => s.cropName)).toEqual(["d", "f", "a", "e", "b"]);
  });

  it("stops at five and copes with no beds", () => {
    expect(topSuggestions([bed(1, "empty", false, ["a", "b", "c", "d", "e", "f"])])).toHaveLength(5);
    expect(topSuggestions([])).toEqual([]);
  });
});
