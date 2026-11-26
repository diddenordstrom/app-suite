import { describe, expect, it } from "vitest";
import { bandSecs, easyShareOf, paceBand, sumBands, targetRace } from "./bands";
import type { Race, Stream, ZoneBounds } from "./types";

/** A stream of 5 s samples, one entry per [seconds, pace s/km, hr]. */
function stream(parts: [number, number, number][], gapPaces?: (number | null)[]): Stream {
  const s: Stream = { t: [], hr: [], speed: [], alt: [] };
  let t = 0;
  for (const [secs, pace, hr] of parts) {
    for (let x = 0; x < secs; x += 5) { s.t.push(t); s.hr.push(hr); s.speed.push(1000 / pace); s.alt.push(0); t += 5; }
  }
  if (gapPaces) s.gap = s.t.map((_, i) => (gapPaces[i % gapPaces.length] == null ? null : 1000 / gapPaces[i % gapPaces.length]!));
  return s;
}

const ZONES: ZoneBounds = [120, 140, 155, 170];
const run = { zoneSecs: [60, 60, 60, 60, 60] as [number, number, number, number, number], durationS: 300 };

describe("bandSecs", () => {
  it("splits time below, at and over the threshold band and at the target band", () => {
    // 600 s easy (350), 600 s at threshold (290), 300 s fast (260); threshold 290, target 300 (±3.5 %: 289.5–310.5).
    const s = stream([[600, 350, 135], [600, 290, 165], [300, 260, 175]]);
    const b = bandSecs(run, s, { zones: ZONES }, { thresholdPace: 290, targetPace: 300 });
    expect(b.totalS).toBe(1500);
    expect(b.belowS).toBe(600);
    expect(b.atS).toBe(600);
    expect(b.overS).toBe(300);
    expect(b.targetS).toBe(600);
    // The runner's zones on the stream (the last sample counts 5 s).
    expect(b.zones).toEqual([0, 600, 0, 600, 300]);
    expect(b.gap).toBe(false);
  });

  it("uses Garmin's zones without the runner's own", () => {
    const b = bandSecs(run, stream([[100, 300, 150]]), { zones: null }, { thresholdPace: null, targetPace: null });
    expect(b.zones).toEqual([60, 60, 60, 60, 60]);
  });

  it("judges on grade-adjusted pace when at least half the samples have it, raw pace otherwise", () => {
    // Uphill: raw 320 s/km (below), GAP 290 (at).
    const withGap = bandSecs(run, stream([[600, 320, 160]], [290]), { zones: ZONES }, { thresholdPace: 290, targetPace: null });
    expect(withGap).toMatchObject({ gap: true, atS: 600, belowS: 0 });
    // GAP on fewer than half: raw speed for all.
    const sparse = bandSecs(run, stream([[600, 320, 160]], [290, null, null]), { zones: ZONES }, { thresholdPace: 290, targetPace: null });
    expect(sparse).toMatchObject({ gap: false, atS: 0, belowS: 600 });
    // A sample without GAP in a GAP stream falls back to its raw speed.
    const holes = bandSecs(run, stream([[600, 320, 160]], [290, null]), { zones: ZONES }, { thresholdPace: 290, targetPace: null });
    expect(holes).toMatchObject({ gap: true, atS: 300, belowS: 300 });
  });

  it("caps pauses and leaves standing still out", () => {
    const s = stream([[300, 290, 165]]);
    // A ten-minute pause between two samples counts 30 s, like the zones.
    s.t = s.t.map((t, i) => (i >= 30 ? t + 600 : t));
    const b = bandSecs(run, s, { zones: ZONES }, { thresholdPace: 290, targetPace: null });
    expect(b.atS).toBe(300 - 5 + 30);
    // Standing (under 1 m/s) is no moving time and no band.
    const still = stream([[100, 290, 165], [100, 2000, 120]]);
    const b2 = bandSecs(run, still, { zones: ZONES }, { thresholdPace: 290, targetPace: null });
    expect(b2.totalS).toBe(100);
    expect(b2.atS + b2.belowS + b2.overS).toBe(100);
  });

  it("zeros without a threshold or a target, and only zones without a stream", () => {
    const b = bandSecs(run, stream([[600, 290, 165]]), { zones: ZONES }, { thresholdPace: null, targetPace: null });
    expect(b).toMatchObject({ totalS: 600, belowS: 0, atS: 0, overS: 0, targetS: 0 });
    const none = bandSecs(run, null, { zones: ZONES }, { thresholdPace: 290, targetPace: 300 });
    expect(none).toMatchObject({ totalS: 300, zones: [60, 60, 60, 60, 60], belowS: 0, atS: 0, overS: 0, targetS: 0 });
  });
});

describe("helpers", () => {
  it("paceBand: low is the fast end", () => {
    expect(paceBand(300)).toEqual({ pace: 300, low: 289.5, high: 310.5 });
  });

  it("targetRace: the next A race with a goal, else its race pace", () => {
    const race = (p: Partial<Race>): Race => ({ id: 1, name: "R", date: "2026-12-01", distanceKm: 42.195, goalSeconds: null, priority: "A", resultSeconds: null, activityId: null, mpSec: null, hmpSec: null, paceSource: null, paceLockedOn: null, peakKm: null, ...p });
    const today = "2026-11-26";
    expect(targetRace([race({ date: "2026-11-01", goalSeconds: 10800 })], today)).toBeNull();
    expect(targetRace([race({ priority: "B", goalSeconds: 10800 })], today)).toBeNull();
    expect(targetRace([race({ goalSeconds: 12660 })], today)?.pace).toBe(300.04);
    expect(targetRace([race({ mpSec: 295 })], today)?.pace).toBe(295);
    expect(targetRace([race({ distanceKm: 21.0975, mpSec: 300, hmpSec: 280 })], today)?.pace).toBe(280);
    // A race without either is passed over for the next one.
    expect(targetRace([race({ id: 2, date: "2027-04-01", goalSeconds: 12000 }), race({})], today)?.race.id).toBe(2);
  });

  it("sums runs and the easy share", () => {
    const s = sumBands([
      { totalS: 100, zones: [10, 20, 30, 0, 0], belowS: 1, atS: 2, overS: 3, targetS: 4 },
      { totalS: 50, zones: [0, 30, 0, 10, 0], belowS: 1, atS: 1, overS: 1, targetS: 1 },
    ]);
    expect(s).toEqual({ totalS: 150, zones: [10, 50, 30, 10, 0], belowS: 2, atS: 3, overS: 4, targetS: 5 });
    expect(easyShareOf(s)).toBe(0.6);
    expect(easyShareOf(sumBands([]))).toBeNull();
  });
});
