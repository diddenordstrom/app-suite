import { describe, expect, it } from "vitest";
import { missOf, raceReason, standardDistance } from "./racecheck";

describe("recognising a race", () => {
  it("matches standard distances, allowing GPS to read a little long", () => {
    expect(standardDistance(21180)).toBe(21.0975);
    expect(standardDistance(42900)).toBe(42.195);
    expect(standardDistance(5010)).toBe(5);
    expect(standardDistance(9800)).toBeNull();
    expect(standardDistance(12000)).toBeNull();
  });

  it("asks when Garmin marked it, or a standard distance was run hard for its length", () => {
    expect(raceReason({ distanceM: 15000, avgHr: 140, eventType: "race" }, 170)).toBe("garmin");
    expect(raceReason({ distanceM: 21150, avgHr: 160, eventType: null }, 170)).toBe("effort");
    expect(raceReason({ distanceM: 21150, avgHr: 150, eventType: null }, 170)).toBeNull();
    expect(raceReason({ distanceM: 42400, avgHr: 148, eventType: null }, 170)).toBe("effort");
    expect(raceReason({ distanceM: 10020, avgHr: 160, eventType: null }, 170)).toBeNull();
    expect(raceReason({ distanceM: 10020, avgHr: 170, eventType: null }, null)).toBeNull();
  });

  it("measures a miss as + when the prediction was slower", () => {
    expect(missOf(6065, 5892)).toEqual({ seconds: 173, share: 6065 / 5892 - 1 });
  });
});
