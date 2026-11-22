import { describe, expect, it } from "vitest";
import {
  autoCriticalSpeed, bestCurve, chooseCs, comparePeriods, extractEfforts, predictRace, predictionHistory, riegel, type DatedEffort,
} from "./bestefforts";
import type { Stream } from "./types";

/** A stream of `parts` [seconds, m/s], sampled every `step` s. */
function stream(parts: [number, number][], step = 5, gap?: number | null): Stream {
  const t: number[] = [], speed: number[] = [];
  let at = 0;
  for (const [secs, v] of parts) for (let s = 0; s < secs; s += step) { t.push(at); speed.push(v); at += step; }
  t.push(at); speed.push(0);
  const out: Stream = { t, hr: t.map(() => null), speed, alt: t.map(() => null) };
  if (gap !== undefined) out.gap = speed.map((v) => (gap == null ? null : v * gap));
  return out;
}

describe("extractEfforts", () => {
  it("finds the fastest window per duration", () => {
    const { efforts, gap } = extractEfforts(stream([[600, 3], [300, 5], [600, 3]]), [60, 300, 600]);
    expect(gap).toBe(false);
    expect(efforts.find((e) => e.durationS === 60)!.distanceM).toBeCloseTo(300, 0);
    expect(efforts.find((e) => e.durationS === 300)!.distanceM).toBeCloseTo(1500, 0);
    expect(efforts.find((e) => e.durationS === 300)!.startS).toBe(600);
    // 300 s at 5 m/s plus 300 s at 3 m/s
    expect(efforts.find((e) => e.durationS === 600)!.distanceM).toBeCloseTo(2400, 0);
  });

  it("skips durations longer than the run", () => {
    expect(extractEfforts(stream([[200, 4]]), [60, 300]).efforts.map((e) => e.durationS)).toEqual([60]);
  });

  it("does not count a pause as time", () => {
    const s = stream([[120, 5], [300, 3]]);
    // a 10-minute stop after the first minute (watch auto-paused): no samples in it
    s.t = s.t.map((x) => (x >= 60 ? x + 600 : x));
    const { efforts } = extractEfforts(s, [120]);
    expect(efforts[0].distanceM).toBeGreaterThan(560);
  });

  it("ignores GPS spikes", () => {
    const s = stream([[300, 4]]);
    s.speed[10] = 40;
    expect(extractEfforts(s, [60]).efforts[0].distanceM).toBeLessThan(260);
  });

  it("uses grade-adjusted speed when most samples have it", () => {
    expect(extractEfforts(stream([[300, 4]], 5, 1.1), [60])).toMatchObject({ gap: true, efforts: [{ distanceM: 264 }] });
    expect(extractEfforts(stream([[300, 4]], 5, null), [60]).gap).toBe(false);
  });
});

const effort = (date: string, durationS: number, distanceM: number, activityId = date): DatedEffort => ({ date, durationS, distanceM, startS: 0, activityId, gap: false });
/** Efforts that lie exactly on CS 4 m/s, D′ 200 m. */
const onModel = (date: string) => [180, 300, 600, 720].map((d) => effort(date, d, 4 * d + 200));

describe("bestCurve", () => {
  it("keeps the best effort per duration within the window", () => {
    const curve = bestCurve([effort("2026-10-01", 300, 1400, "a"), effort("2026-10-10", 300, 1450, "b"), effort("2026-09-01", 300, 1600, "c")], "2026-09-15", "2026-10-31");
    expect(curve).toEqual([{ durationS: 300, distanceM: 1450, paceSecPerKm: 207, activityId: "b", date: "2026-10-10" }]);
  });
});

describe("comparePeriods", () => {
  const blocks = [{ from: "2026-09-01", to: "2026-10-05", name: "Bas" }, { from: "2026-10-06", to: "2026-11-30", name: "Bygg" }];
  it("compares with the previous block when there is one", () => {
    expect(comparePeriods("2026-11-12", blocks)).toMatchObject({ kind: "block", current: { from: "2026-10-06", to: "2026-11-12" }, previous: { from: "2026-09-01", to: "2026-10-05" }, previousName: "Bas" });
  });
  it("falls back to 6 weeks against the 6 before", () => {
    expect(comparePeriods("2026-09-10", blocks)).toMatchObject({ kind: "rolling", current: { from: "2026-07-31", to: "2026-09-10" }, previous: { from: "2026-06-19", to: "2026-07-30" } });
    expect(comparePeriods("2026-12-10", blocks).kind).toBe("rolling");
  });
});

describe("autoCriticalSpeed and chooseCs", () => {
  it("fits CS and D′ from the window's 3–12 min efforts", () => {
    const cs = autoCriticalSpeed([...onModel("2026-11-01"), effort("2026-11-01", 60, 400)], "2026-11-12")!;
    expect(cs.csMps).toBeCloseTo(4, 3);
    expect(cs.dPrimeM).toBe(200);
    expect(cs.efforts).toHaveLength(4);
    expect(cs.newest).toBe("2026-11-01");
  });
  it("needs three durations inside the window", () => {
    expect(autoCriticalSpeed(onModel("2026-06-01"), "2026-11-12")).toBeNull();
    expect(autoCriticalSpeed([effort("2026-11-01", 180, 920), effort("2026-11-01", 300, 1400)], "2026-11-12")).toBeNull();
  });
  it("lets a test newer than the efforts win, and an older one not", () => {
    const auto = autoCriticalSpeed(onModel("2026-11-01"), "2026-11-12");
    expect(chooseCs(auto, [{ date: "2026-09-12", csMps: 3.9, dPrimeM: 150 }], "2026-11-12")!.source).toBe("auto");
    const newer = chooseCs(auto, [{ date: "2026-11-05", csMps: 3.9, dPrimeM: 150 }], "2026-11-12");
    expect(newer).toMatchObject({ source: "test", date: "2026-11-05", cs: { paceSecPerKm: 256 } });
    expect(chooseCs(null, [{ date: "2026-12-01", csMps: 3.9, dPrimeM: 150 }], "2026-11-12")).toBeNull();
  });
});

describe("predictRace", () => {
  const cs = { csMps: 4, dPrimeM: 200, paceSecPerKm: 250, r2: null };
  it("uses CS/D′ up to 10 km", () => {
    expect(predictRace(10, cs, [])).toEqual({ seconds: 2450, model: "cs" });
  });
  it("uses Riegel from the best long effort past 10 km", () => {
    const curve = [{ durationS: 3600, distanceM: 13740, paceSecPerKm: 262, activityId: "a", date: "2026-11-02" }];
    const p = predictRace(21.0975, cs, curve)!;
    expect(p.model).toBe("riegel");
    expect(p.seconds).toBe(Math.round(riegel(3600, 13740, 21097.5)));
    expect(p.seconds).toBeGreaterThan(5600);
    expect(p.seconds).toBeLessThan(5750);
  });
  it("ignores short efforts for long races and falls back to CS", () => {
    const curve = [{ durationS: 600, distanceM: 2600, paceSecPerKm: 231, activityId: "a", date: "2026-11-02" }];
    expect(predictRace(21.0975, cs, curve)!.model).toBe("cs");
    expect(predictRace(21.0975, null, curve)).toBeNull();
  });
});

describe("predictionHistory", () => {
  it("gives one point per week end, empty before there is data", () => {
    const h = predictionHistory(5, onModel("2026-11-01"), [], ["2026-10-25", "2026-11-01", "2026-11-08"]);
    expect(h.map((p) => p.seconds)).toEqual([null, 1200, 1200]);
  });
});
