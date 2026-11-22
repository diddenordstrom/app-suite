import { describe, expect, it } from "vitest";
import { flattenSteps, parseSteps, type StepRefs } from "./steps";
import { matchSteps, type StepMatch } from "./stepmatch";
import { detect, detectSteps, edgeNear, gradeFactor, lapsFit, suggestFromStream } from "./streamsteps";
import type { Lap, Stream } from "./types";
import hillReps from "./fixtures/hill-reps.json";
import tempoHill from "./fixtures/tempo-hill.json";

/*
 * Two real runs (docs/decisions/fartlek-stream-steps.md) are the reference: their manual laps say
 * where the steps changed, so detection runs with the laps hidden and must land on them. The rest are
 * synthetic streams for the hard cases the real runs don't cover.
 */

const refs: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 130, easyHigh: 148, zones: [140, 155, 165, 175], easyPace: 350 };
const flat = (text: string) => flattenSteps(parseSteps(text, "metric", "sv").steps!);
const steps = (text: string) => parseSteps(text, "metric", "sv").steps!;
const hill = { laps: hillReps.laps as Lap[], stream: hillReps.stream as Stream };
const tempo = { laps: tempoHill.laps as Lap[], stream: tempoHill.stream as Stream };
const noGap = (s: Stream): Stream => ({ ...s, gap: undefined });
const HILL_PLAN = "2.4 km lugnt, 3x430 m @z5 / 3 min jogg, 0.8 km lugnt";
/** Where the runner pressed lap at each step change (activity seconds). */
const HILL_PRESSES = [779, 886, 1074, 1185, 1417, 1518];

/** Every cut within `tol` s after (or a little before) the lap press: the runner stands a few seconds after pressing. */
function near(cuts: number[] | undefined, presses: number[], tol = 10) {
  expect(cuts).toHaveLength(presses.length);
  cuts!.forEach((c, k) => expect(Math.abs(c - presses[k]), `cut ${k + 1}: ${c} vs ${presses[k]}`).toBeLessThanOrEqual(tol));
}

/** A 1 s stream from [seconds, m/s, grade] pieces; speed 0 stands still, null pauses the timer. Noise is seeded. */
function synth(pieces: [number, number | null, number?][], opts: { alt?: boolean; noise?: number } = {}): Stream {
  let seed = 7;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31 - 0.5) * 2;
  const s: Stream = { t: [], hr: [], speed: [], alt: [], cad: [] };
  let t = 0, alt = 100;
  for (const [secs, v, grade = 0] of pieces) {
    for (let i = 0; i < secs; i++, t++) {
      if (v == null) continue;
      const sp = v === 0 ? 0 : Math.max(0, v + rnd() * (opts.noise ?? 0.12));
      alt += sp * grade;
      s.t.push(t); s.speed.push(Math.round(sp * 100) / 100); s.hr.push(150); s.alt.push(opts.alt === false ? null : Math.round(alt * 10) / 10); s.cad!.push(sp ? 170 : null);
    }
  }
  return s;
}
const starts = (pieces: [number, number | null, number?][]) => pieces.reduce<number[]>((acc, [secs]) => [...acc, (acc.at(-1) ?? 0) + secs], []).slice(0, -1);

describe("grade-adjusted speed", () => {
  it("follows Garmin's shape: about +3 % per 1 % uphill, a gentle floor downhill", () => {
    expect(gradeFactor(0)).toBe(1);
    expect(gradeFactor(0.06)).toBeCloseTo(1.18, 2);
    expect(gradeFactor(-0.04)).toBeCloseTo(0.936, 3);
    expect(gradeFactor(-0.2)).toBe(0.91);
  });
});

describe("step changes from the stream: real runs", () => {
  it("finds the uphill reps where the laps were pressed, with Garmin's grade-adjusted speed or our own", () => {
    near(detectSteps(flat(HILL_PLAN), hill.stream, refs)?.cuts, HILL_PRESSES);
    near(detectSteps(flat(HILL_PLAN), noGap(hill.stream), refs)?.cuts, HILL_PRESSES);
    // Planned by time instead of distance: the reps were 1:41–1:51 against 2 min.
    near(detectSteps(flat("2 km lugnt, 3x2 min @z5 / 3 min jogg, 1 km lugnt"), hill.stream, refs)?.cuts, HILL_PRESSES);
  });

  it("finds a tempo block whose end climbs, and doesn't take the climb for a step change", () => {
    // The watch's time laps were at 599 and 1560; the runner sped up and eased off a few seconds later.
    near(detectSteps(flat("10 min lugnt, 16 min @tröskel, 10 min lugnt"), tempo.stream, refs)?.cuts, [599, 1560], 16);
    near(detectSteps(flat("2 km lugnt, 3 km @tröskel, 1.5 km lugnt"), noGap(tempo.stream), refs)?.cuts, [599, 1560], 16);
  });

  it("says nothing when the plan doesn't fit what was run", () => {
    expect(detect(flat("2.4 km lugnt, 5x430 m @z5 / 3 min jogg, 0.8 km lugnt"), hill.stream, refs)).toHaveProperty("fail");
    expect(detect(flat("2.4 km lugnt, 3x1 km @z5 / 3 min jogg, 0.8 km lugnt"), hill.stream, refs)).toHaveProperty("fail");
    // Two reps planned, three run: the first would hide in the warm-up.
    expect(detect(flat("2.4 km lugnt, 2x430 m @z5 / 3 min jogg, 0.8 km lugnt"), hill.stream, refs)).toEqual({ fail: "hardOutside", step: 0 });
    expect(detect(flat("10 min lugnt, 3x5 min @tröskel / 1 min jogg, 10 min lugnt"), tempo.stream, refs)).toHaveProperty("fail");
    expect(detect(flat("10 min lugnt, 8 min @tröskel, 10 min lugnt"), tempo.stream, refs)).toHaveProperty("fail");
  });

  it("never places a boundary between two easy steps by the clock alone", () => {
    expect(detect(flat("2 km lugnt, 2 km lugnt, 3x430 m @z5 / 3 min jogg, 0.8 km lugnt"), hill.stream, refs)).toEqual({ fail: "plan" });
    expect(detect(flat("5 km lugnt"), hill.stream, refs)).toEqual({ fail: "plan" });
  });
});

describe("step changes from the stream: synthetic hard cases", () => {
  it("short reps with a standing rest, and a pause in the warm-up", () => {
    const pieces: [number, number | null, number?][] = [[480, 2.9], [20, null], [120, 2.9]];
    const expected: number[] = [];
    let t = 620;
    for (let r = 0; r < 8; r++) {
      expected.push(t); pieces.push([40, 5.0]); t += 40;
      expected.push(t);
      if (r < 7) { pieces.push([75, 0], [45, 2.4]); t += 120; }
    }
    pieces.push([360, 2.8]);
    // Each rep starts when running starts; each rest when the rep ends (the stop belongs to the rest).
    const r = detect(flat("2 km lugnt, 8x200 m @z5 / 2 min jogg, 1 km lugnt"), synth(pieces), refs);
    expect(r).toHaveProperty("cuts");
    near((r as { cuts: number[] }).cuts, expected, 4);
  });

  it("a treadmill run: footpod speed, no altitude", () => {
    const pieces: [number, number][] = [[600, 2.8], [240, 4.2], [90, 2.5], [240, 4.2], [90, 2.5], [240, 4.2], [480, 2.8]];
    const cuts = detectSteps(flat("10 min lugnt, 3x1 km @tröskel / 90 s jogg, 8 min lugnt"), synth(pieces, { alt: false }), refs)?.cuts;
    starts(pieces).forEach((x, k) => expect(Math.abs(cuts![k] - x)).toBeLessThanOrEqual(4));
  });

  it("uphill reps that are slower than the flat warm-up still read as reps", () => {
    // 3:50/km up an 8 % hill feels harder than 5:30 on the flat, though it is barely faster.
    const pieces: [number, number, number?][] = [[600, 3.0], [90, 3.6, 0.08], [150, 2.6, -0.08], [90, 3.6, 0.08], [150, 2.6, -0.08], [90, 3.6, 0.08], [400, 3.0]];
    const cuts = detectSteps(flat("10 min lugnt, 3x90 s @z5 / 150 s jogg, 6 min lugnt"), synth(pieces), refs)?.cuts;
    starts(pieces).forEach((x, k) => expect(Math.abs(cuts![k] - x)).toBeLessThanOrEqual(5));
  });

  it("a red light in the middle of a tempo block doesn't move its ends", () => {
    const pieces: [number, number][] = [[600, 2.9], [400, 3.9], [15, 0], [545, 3.9], [600, 2.9]];
    const cuts = detectSteps(flat("10 min lugnt, 16 min @tröskel, 10 min lugnt"), synth(pieces), refs)?.cuts;
    expect(Math.abs(cuts![0] - 600)).toBeLessThanOrEqual(4);
    expect(Math.abs(cuts![1] - 1560)).toBeLessThanOrEqual(4);
  });

  it("a progressive run gives no confident boundaries", () => {
    const pieces: [number, number][] = Array.from({ length: 40 }, (_, i) => [60, 2.7 + i * 0.03] as [number, number]);
    expect(detectSteps(flat("2 km lugnt, 5 km @tröskel, 1 km lugnt"), synth(pieces), refs)).toBeNull();
    expect(detectSteps(flat("10 min lugnt, 3x6 min @tröskel / 2 min jogg, 6 min lugnt"), synth(pieces), refs)).toBeNull();
  });

  it("an unstructured fartlek isn't read as the planned reps", () => {
    // Surges of 20–70 s with uneven easy running between them, against a plan of 3 × 3 min.
    const pieces: [number, number][] = [[600, 2.8], [40, 4.3], [100, 2.8], [70, 4.4], [50, 2.7], [20, 4.6], [150, 2.9], [60, 4.2], [80, 2.8], [30, 4.5], [120, 2.8], [50, 4.3], [400, 2.8]];
    expect(detectSteps(flat("10 min lugnt, 3x3 min @z4 / 2 min jogg, 6 min lugnt"), synth(pieces), refs)).toBeNull();
  });
});

describe("pace changes for the split box", () => {
  it("finds the end of the rep near the plan's point, and nothing in steady running", () => {
    expect(Math.abs(edgeNear(hill.stream, 1180, 30)! - 1193)).toBeLessThanOrEqual(3);
    expect(edgeNear(tempo.stream, 1200, 30)).toBeNull();
  });
});

describe("suggesting splits", () => {
  const plan = steps(HILL_PLAN);
  const status = (m: StepMatch) => m.steps.map((s) => `${s.flat.role}${s.flat.rep ?? ""}@${s.startS}`);

  it("offers the stream's step changes for a run with one lap, and they give one segment per step", () => {
    const one: Lap[] = [{ index: 0, distanceM: 5520, durationS: 2068, avgHr: 170, startS: 0, trigger: "end" }];
    expect(matchSteps(plan, one, hill.stream, refs)).toEqual({ ok: false, reason: "noManualLaps" });
    const s = suggestFromStream(plan, one, hill.stream, hill.stream, refs)!;
    near(s.splits, HILL_PRESSES);
    expect(lapsFit(s.preview)).toBe(true);
    expect(status(s.preview).slice(1).map((x) => Number(x.split("@")[1]))).toEqual(s.splits);
    expect(s.preview).toMatchObject({ workTotal: 3, workJudged: 3 });
  });

  it("offers them for a forgotten lap press, and for a lap pressed inside the warm-up", () => {
    const l = hill.laps;
    const forgot = [...l.slice(0, 4), { ...l[4], durationS: l[4].durationS + l[5].durationS, distanceM: l[4].distanceM + l[5].distanceM }, ...l.slice(6)].map((x, i) => ({ ...x, index: i }));
    near(suggestFromStream(plan, forgot, hill.stream, hill.stream, refs)?.splits, HILL_PRESSES);
    // The real laps: an extra press at 3:41 in the warm-up shifts every step after it, so they don't fit.
    expect(lapsFit(matchSteps(plan, l, hill.stream, refs))).toBe(false);
    const real = suggestFromStream(plan, l, hill.stream, hill.stream, refs)!;
    near(real.splits, HILL_PRESSES);
    // Taken, the splits alone mark the steps, and nothing more is offered.
    const taken = matchSteps(plan, l, hill.stream, refs, real.splits) as StepMatch;
    expect(lapsFit(taken)).toBe(true);
    expect(taken.steps.filter((r) => r.flat.role === "work").map((r) => Math.round(r.distanceM!))).toEqual(expect.arrayContaining([expect.any(Number)]));
    expect(suggestFromStream(plan, l, hill.stream, hill.stream, refs, real.splits)).toBeNull();
  });

  it("offers nothing when the laps already fit", () => {
    expect(suggestFromStream(plan, hill.laps.slice(1).map((l, i) => ({ ...l, index: i })), hill.stream, hill.stream, refs)).toBeNull();
  });

  it("time laps from a watch workout count as auto-laps, so a tempo block run on them gets the stream's changes", () => {
    // The warm-up (5:28) and the tempo (4:56) differ by less than the auto-lap pace shift, so the laps merge.
    const plan2 = steps("10 min lugnt, 16 min @tröskel, 10 min lugnt");
    expect(lapsFit(matchSteps(plan2, tempo.laps, tempo.stream, refs))).toBe(false);
    near(suggestFromStream(plan2, tempo.laps, tempo.stream, tempo.stream, refs)?.splits, [599, 1560], 16);
  });
});
