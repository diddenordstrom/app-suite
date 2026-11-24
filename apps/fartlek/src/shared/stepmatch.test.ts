import { describe, expect, it } from "vitest";
import { parseSteps, type StepRefs } from "./steps";
import { applySplits, matchSteps, type StepMatch } from "./stepmatch";
import type { Lap, LapTrigger, Stream } from "./types";

const refs: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 130, easyHigh: 148, zones: null, easyPace: 350 };
const steps = parseSteps("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt", "metric").steps!;

/** [durationS, distanceM, avgHr, trigger] in running order; start offsets follow. */
function laps(rows: [number, number, number, LapTrigger][]): Lap[] {
  let t = 0;
  return rows.map(([durationS, distanceM, avgHr, trigger], index) => {
    const l: Lap = { index, durationS, distanceM, avgHr, trigger, startS: t, maxHr: null, cadence: 175, elevGain: null, elevLoss: null };
    t += durationS;
    return l;
  });
}

const session: [number, number, number, LapTrigger][] = [
  [353, 1000, 135, "distance"], [353, 1000, 141, "manual"],
  [482, 1890, 166, "manual"], [120, 320, 141, "manual"],
  [480, 1912, 169, "manual"], [124, 330, 146, "manual"],
  [478, 1720, 172, "manual"],
  [365, 1000, 150, "distance"], [182, 500, 152, "end"],
];
const status = (m: StepMatch) => m.steps.map((s) => `${s.flat.role}${s.flat.rep ?? ""}:${s.status}${s.delta ? `${s.delta > 0 ? "+" : ""}${s.delta}` : ""}`);

describe("matching laps to steps", () => {
  it("merges auto-laps within a step and judges each step on its target", () => {
    const m = matchSteps(steps, laps(session), null, refs) as StepMatch;
    expect(m.ok).toBe(true);
    expect(status(m)).toEqual(["warmup:in", "work1:in", "recovery1:unjudged", "work2:in", "recovery2:unjudged", "work3:near+3", "cooldown:near+3"]);
    expect(m.steps[0].laps).toEqual([1, 2]);
    expect(m.steps.at(-1)!.laps).toEqual([8, 9]);
    expect(m).toMatchObject({ workTotal: 3, workJudged: 3, workIn: 2, hrDrift: 6, lapCount: 9, autoMerged: 2, extraLaps: 0 });
  });

  it("counts easy HR below the band as in target, only above it as off", () => {
    const slow: [number, number, number, LapTrigger][] = [[353, 1000, 118, "distance"], [353, 1000, 122, "manual"], ...session.slice(2)];
    const m = matchSteps(steps, laps(slow), null, refs) as StepMatch;
    expect(status(m)[0]).toBe("warmup:in");
    expect(status(m).at(-1)).toBe("cooldown:near+3");
  });

  it("leaves strides out of the rep count and the HR drift", () => {
    const easyStrides = parseSteps("6 km lugnt, 3x20 s strides / 1 min jogg", "metric").steps!;
    const m = matchSteps(easyStrides, laps([
      [1765, 4340, 151, "manual"], [20, 90, 164, "manual"], [60, 140, 166, "manual"],
      [20, 70, 160, "manual"], [60, 150, 171, "manual"], [20, 90, 170, "manual"], [301, 650, 163, "end"],
    ]), null, refs) as StepMatch;
    expect(m).toMatchObject({ workTotal: 0, workJudged: 0, workIn: 0, hrDrift: null });
  });

  it("folds a few-second closing lap into the step before it", () => {
    const withTail: [number, number, number, LapTrigger][] = [...session.slice(0, 6), [478, 1720, 172, "manual"], [365, 1000, 150, "manual"], [2, 5, 150, "end"]];
    const m = matchSteps(steps, laps(withTail), null, refs) as StepMatch;
    expect(m.steps.at(-1)!.laps).toEqual([8, 9]);
    expect(m.extraLaps).toBe(0);
    expect(m.workJudged).toBe(3);
  });

  it("treats an auto-lap followed by a lap at a different pace as a step change", () => {
    const noPress: [number, number, number, LapTrigger][] = [[353, 1000, 135, "distance"], [353, 1000, 141, "distance"], ...session.slice(2)];
    const m = matchSteps(steps, laps(noPress), null, refs) as StepMatch;
    expect(m.steps[0].laps).toEqual([1, 2]);
    expect(m.steps[1].laps).toEqual([3]);
    expect(m.workJudged).toBe(3);
  });

  it("flags a lap that covers a rep and its jog, and the split fixes it", () => {
    const forgot = [...session.slice(0, 4), [604, 2242, 160, "manual"] as [number, number, number, LapTrigger], ...session.slice(6)];
    const m = matchSteps(steps, laps(forgot), null, refs) as StepMatch;
    expect(status(m)).toEqual(["warmup:in", "work1:in", "recovery1:unjudged", "work2:unjudged", "recovery2:missing", "work3:near+3", "cooldown:near+3"]);
    const at = m.steps[3].merged!;
    expect(at).toEqual({ lap: 5, at: 1308 + 480 });
    expect(m.workJudged).toBe(2);

    const fixed = matchSteps(steps, laps(forgot), null, refs, [at.at]) as StepMatch;
    expect(status(fixed)).toEqual(["warmup:in", "work1:in", "recovery1:unjudged", "work2:in", "recovery2:unjudged", "work3:near+3", "cooldown:near+3"]);
    expect(fixed.lapCount).toBe(9);
  });

  it("leaves out HR's climb at the start of a rep when the stream has it", () => {
    const ls = laps(session);
    const t: number[] = [], hr: number[] = [];
    for (let s = 0; s < 3100; s += 5) { t.push(s); hr.push(s >= 706 && s < 796 ? 140 : 168); }
    const stream: Stream = { t, hr, speed: t.map(() => 3.5), alt: t.map(() => null) };
    const m = matchSteps(steps, ls, stream, refs) as StepMatch;
    expect(m.steps[1]).toMatchObject({ hr: 168, hrTrimmed: true });
  });

  it("says so when there is nothing to match", () => {
    expect(matchSteps(steps, [], null, refs)).toEqual({ ok: false, reason: "noLaps" });
    const auto = laps(Array.from({ length: 10 }, () => [300, 1000, 150, "distance"] as [number, number, number, LapTrigger]));
    expect(matchSteps(steps, auto, null, refs)).toEqual({ ok: false, reason: "noManualLaps" });
  });

  it("splits a lap by the stream's speed", () => {
    const [l] = laps([[600, 2400, 160, "manual"]]);
    const t = Array.from({ length: 120 }, (_, k) => k * 5);
    const stream: Stream = { t, hr: t.map((s) => (s < 480 ? 170 : 140)), speed: t.map((s) => (s < 480 ? 4.5 : 2.5)), alt: t.map(() => null) };
    const [a, b] = applySplits([l], [480], stream);
    expect(a).toMatchObject({ startS: 0, durationS: 480, avgHr: 170, trigger: "manual" });
    expect(b).toMatchObject({ startS: 480, durationS: 120, avgHr: 140 });
    expect(a.distanceM + b.distanceM).toBe(2400);
    expect(a.distanceM).toBe(Math.round(2400 * (96 * 4.5) / (96 * 4.5 + 24 * 2.5)));
  });

  it("makes an auto-lap's end a step change when a split lands on it", () => {
    const auto = laps([[300, 1000, 150, "distance"], [300, 1000, 150, "distance"], [300, 1000, 150, "end"]]);
    expect(applySplits(auto, [302], null).map((l) => l.trigger)).toEqual(["manual", "distance", "end"]);
    expect(applySplits(auto, [450], null)).toHaveLength(4);
  });

  it("takes a full set of splits as the steps, whatever the laps say (the stream's step changes)", () => {
    // One lap press too many in the warm-up: the laps alone would shift every step after it.
    const extra = laps([[150, 400, 135, "manual"], ...session]);
    expect((matchSteps(steps, extra, null, refs) as StepMatch).steps[1].laps).toEqual([2, 3]);
    const edges = [706, 1188, 1308, 1788, 1912, 2390];
    const m = matchSteps(steps, extra, null, refs, edges.map((e) => e + 150)) as StepMatch;
    expect(m.steps.map((r) => r.startS)).toEqual([0, ...edges.map((e) => e + 150)]);
    expect(m.steps[0].laps).toEqual([1, 2, 3]);
    expect(m.extraLaps).toBe(0);
  });
});
