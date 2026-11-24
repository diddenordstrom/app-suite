import { describe, expect, it } from "vitest";
import { racePace, type RacePaceInput } from "./racephase";

// CS 4.0 m/s = 250 s/km; 94 % of that is 265.96 s/km, so a predicted MP faster than 266 is capped.
const base: RacePaceInput = { distanceKm: 42.195, predMp: 290, predHmp: 275, csMps: 4, goalSeconds: null, thresholdPace: 260, choice: null };

describe("racePace", () => {
  it("uses the prediction for both paces", () => {
    expect(racePace(base)).toEqual({ mp: 290, hmp: 275, source: "prediction", ask: false, overCap: false });
  });

  it("holds a predicted MP to 94 % of CS, and not HMP", () => {
    const r = racePace({ ...base, predMp: 250, predHmp: 240 });
    expect(r).toMatchObject({ mp: 266, hmp: 240, source: "capped", ask: false });
  });

  it("does not cap without CS", () => {
    expect(racePace({ ...base, predMp: 250, csMps: null })).toMatchObject({ mp: 250, source: "prediction" });
  });

  it("lets a goal the runner chose win over the cap and warns", () => {
    const goal = 42.195 * 255; // 255 s/km, faster than the 266 cap
    const r = racePace({ ...base, predMp: 270, goalSeconds: goal, choice: "goal" });
    expect(r).toMatchObject({ mp: 255, source: "goal", ask: false, overCap: true });
    expect(racePace({ ...base, goalSeconds: 42.195 * 300, choice: "goal" }).overCap).toBe(false);
  });

  it("asks when goal and prediction differ by more than 3 %, and not at 3 % or less", () => {
    expect(racePace({ ...base, goalSeconds: 42.195 * 280 })).toMatchObject({ ask: true, source: "prediction", mp: 290 }); // 3.4 %
    expect(racePace({ ...base, goalSeconds: 42.195 * 282 }).ask).toBe(false); // 2.8 %
    expect(racePace({ ...base, goalSeconds: 42.195 * 280, choice: "prediction" })).toMatchObject({ ask: false, source: "prediction" });
  });

  it("asks against the race's own distance for a half", () => {
    const half = { ...base, distanceKm: 21.0975, goalSeconds: 21.0975 * 250 };
    expect(racePace(half)).toMatchObject({ ask: true, hmp: 275 });
    expect(racePace({ ...half, choice: "goal" })).toMatchObject({ hmp: 250, source: "goal" });
  });

  it("falls back to the goal, with the other distance from Riegel", () => {
    const r = racePace({ ...base, predMp: null, predHmp: null, goalSeconds: 42.195 * 300 });
    expect(r.source).toBe("goal");
    expect(r.mp).toBe(300);
    expect(r.hmp).toBeLessThan(300);
    expect(r.ask).toBe(false);
  });

  it("falls back to threshold, then to none", () => {
    const none = { ...base, predMp: null, predHmp: null };
    expect(racePace(none)).toEqual({ mp: Math.round(260 / 0.9), hmp: Math.round(260 / 0.96), source: "threshold", ask: false, overCap: false });
    expect(racePace({ ...none, thresholdPace: null })).toEqual({ mp: null, hmp: null, source: "none", ask: false, overCap: false });
  });

  it("derives the other distance from the one prediction there is", () => {
    const r = racePace({ ...base, predHmp: null });
    expect(r.hmp).toBeLessThan(290);
    expect(r.source).toBe("prediction");
  });
});
