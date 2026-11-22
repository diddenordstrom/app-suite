import { describe, expect, it } from "vitest";
import { compare, gapMetres, SAME, sessionNumbers, signature, type SessionPoint } from "./samesession";
import type { StepMatch, StepResult } from "./stepmatch";
import { flattenSteps, parseSteps, withStrides } from "./steps";
import type { Stream } from "./types";

const steps = (text: string) => parseSteps(text, "metric").steps!;

describe("fingerprint", () => {
  it("is the quality work only: reps, their length and target kind", () => {
    const a = signature(steps("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt"));
    expect(a).toBe("3x480s@thr");
    // Rest, warm-up and cool-down don't matter.
    expect(signature(steps("3 km easy, 3x8 min @threshold / 90 s jog, 2 km easy"))).toBe(a);
    expect(signature(steps("2 km lugnt, 4x6 min @tröskel / 1 min jogg"))).not.toBe(a);
    expect(signature(steps("3 km lugnt, 3 km @z3, 3 km @tröskel"))).toBe("1x3000m@z3+1x3000m@thr");
    expect(signature(withStrides({ km: 8 }))).toBeNull();
    expect(signature(null)).toBeNull();
  });
});

const flatOf = (text: string) => flattenSteps(steps(text));
function result(flat: ReturnType<typeof flatOf>[number], s: { start: number; dur: number; dist: number; hr: number | null } | null): StepResult {
  return {
    flat, laps: s ? [1] : [], startS: s?.start ?? null, endS: s ? s.start + s.dur : null, durationS: s?.dur ?? null, distanceM: s?.dist ?? null,
    pace: s ? s.dur / (s.dist / 1000) : null, hr: s?.hr ?? null, hrTrimmed: true, cadence: null,
    target: { pace: null, hr: null, hrRef: null, judge: null }, judge: null, status: s ? "in" : "missing", delta: null, merged: null,
  };
}

describe("one run's numbers", () => {
  const flat = flatOf("2 km lugnt, 3x8 min @tröskel / 2 min jogg");
  const reps = [{ start: 600, hr: 160 }, { start: 1200, hr: 165 }, { start: 1800, hr: 170 }];
  const match = (gone = 0): StepMatch => ({
    ok: true, workJudged: 3, workIn: 3,
    steps: flat.map((f) => {
      if (f.role !== "work") return result(f, null);
      const k = f.rep! - 1;
      return result(f, k < 3 - gone ? { start: reps[k].start, dur: 480, dist: 1920, hr: reps[k].hr } : null);
    }),
  } as unknown as StepMatch);

  it("averages the reps by time, leaving the rest out", () => {
    const n = sessionNumbers(match(), null)!;
    expect(n.pace).toBeCloseTo(250, 5);
    expect(n.gap).toBeCloseTo(250, 5);
    expect(n.hr).toBeCloseTo(165, 5);
    expect(n.eff).toBeCloseTo(4 / (165 / 60), 5);
    expect(n.reps).toHaveLength(3);
  });

  it("needs most reps matched", () => {
    expect(sessionNumbers(match(2), null)).toBeNull();
  });

  it("adjusts for grade: the same speed uphill counts as faster", () => {
    const t = Array.from({ length: 101 }, (_, i) => i * 5);
    const flatStream: Stream = { t, hr: t.map(() => 150), speed: t.map(() => 4), alt: t.map(() => 10) };
    const up: Stream = { ...flatStream, alt: t.map((_, i) => 10 + i * 0.6) }; // 3 % up
    expect(gapMetres(flatStream, 0, 400)).toBeCloseTo(1600, 0);
    expect(gapMetres(up, 0, 400)!).toBeGreaterThan(1700);
    expect(gapMetres({ ...flatStream, alt: t.map(() => null) }, 0, 400)).toBeNull();
  });
});

describe("comparing runs", () => {
  const pt = (date: string, gap: number, hr: number): SessionPoint => ({
    activityId: date, date, gap, pace: gap, hr, eff: (1000 / gap) / (hr / 60), tsb: null, elevGain: null,
    reps: [{ pace: gap, gap, hr }, { pace: gap - 2, gap: gap - 2, hr: hr + 3 }],
  });
  const pts = [pt("2026-10-02", 259, 168), pt("2026-10-09", 257, 168), pt("2026-10-16", 253, 166)];

  it(`waits for ${SAME.minTimes} runs`, () => {
    expect(compare(pts, 1)).toEqual({ prev: null, first: null });
  });

  it("compares with the run before and the first", () => {
    const c = compare(pts, 2);
    expect(c.prev).toEqual({ gap: -4, hr: -2, reps: [-4, -4] });
    expect(c.first!.gap).toBe(-6);
    expect(c.first!.eff!).toBeGreaterThan(0);
  });
});
