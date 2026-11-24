import type { Lap, Stream } from "./types";
import { flattenSteps, resolveTarget, type FlatStep, type Judge, type ResolvedTarget, type StepRefs, type WorkoutSteps } from "./steps";

/*
 * Planned vs actual per step, phase 1: laps (docs/decisions/fartlek-structured-workouts.md).
 *
 * 1. The runner's lap splits (a lap cut in two where a lap press was forgotten) are applied. A full set
 *    of splits, one per step change, is the stream's boundaries taken as a whole (shared/streamsteps.ts):
 *    then the splits alone mark the steps and the laps only give their numbers.
 * 2. Laps become segments: auto-laps (distance, time, position) inside one step are merged; a manual
 *    lap or the end of the activity closes a segment. Laps fetched before triggers were stored count
 *    as manual, so old activities behave as before.
 * 3. Segments are paired with the steps in order. A segment that covers two steps (a forgotten lap
 *    press) is flagged with where to split it; the step after it has no lap.
 * 4. Each step is judged on its judged target: in target, near (within NEAR_PACE s/km or NEAR_HR
 *    bpm) or off. Easy HR is a ceiling: below the band is in target. HR on reps leaves out the first HR_SKIP_S seconds, while HR is still climbing.
 */

export const NEAR_PACE = 5;
export const NEAR_HR = 5;
export const HR_SKIP_S = 90;
/** A segment covers a step and the next when it is clearly longer than the step and fits both better than one. */
const MERGED_OVER = 1.15;
const MERGED_FIT = 0.3;
/** A lap end this close (s) to a split counts as on it. */
const EDGE_S = 5;
/** A closing lap shorter than this (seconds) is the activity ending, not a step. */
const TINY_END_S = 10;

/** Pace change between laps that marks a step change even across an auto-lap. */
const PACE_SHIFT = 0.12;

export type StepStatus = "in" | "near" | "off" | "unjudged" | "missing";

export interface StepResult {
  flat: FlatStep;
  /** 1-based lap numbers (after splits) this step was matched to; empty when it has none. */
  laps: number[];
  /** Activity seconds where the step's laps start and end (the stream's clock); null for old laps. */
  startS: number | null;
  endS: number | null;
  durationS: number | null;
  distanceM: number | null;
  pace: number | null;
  hr: number | null;
  /** True when `hr` leaves out the first HR_SKIP_S seconds of the step. */
  hrTrimmed: boolean;
  cadence: number | null;
  target: ResolvedTarget;
  judge: Judge | null;
  status: StepStatus;
  /** Distance outside the judged target: s/km (+ slower) or bpm (+ higher); 0 inside. */
  delta: number | null;
  /** The matched lap seems to cover this step and the next: split it at `at` (activity seconds). */
  merged: { lap: number; at: number } | null;
}

export interface StepMatch {
  ok: true;
  steps: StepResult[];
  /** Reps (work steps) judged, and how many of them were in target. */
  workJudged: number;
  workIn: number;
  workTotal: number;
  /** HR of the last rep minus the first (trimmed HR), when two or more reps have HR. */
  hrDrift: number | null;
  lapCount: number;
  /** Auto-laps merged into a step's segment. */
  autoMerged: number;
  /** Laps after the last step (a walk home), not judged. */
  extraLaps: number;
  splits: number[];
}
export type StepMatchResult = StepMatch | { ok: false; reason: "noLaps" | "noManualLaps" };

const AUTO = new Set(["distance", "time", "position"]);

interface Seg { laps: number[]; startS: number | null; endS: number | null; durationS: number; distanceM: number; hrWeighted: number; hrSecs: number; cadWeighted: number; cadSecs: number }

const lapEnd = (laps: Lap[], i: number) => {
  const l = laps[i];
  if (l.startS == null) return null;
  return laps[i + 1]?.startS ?? l.startS + l.durationS;
};

/** Samples of the stream within [from, to). */
function within(stream: Stream | null, from: number, to: number) {
  const idx: number[] = [];
  if (!stream) return idx;
  stream.t.forEach((t, i) => { if (t >= from && t < to) idx.push(i); });
  return idx;
}
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Cut laps at the runner's split points (activity seconds). Each part gets its time, its share of
 * the distance (by the stream's speed, else by time) and the stream's HR and cadence for it.
 */
export function applySplits(laps: Lap[], splits: number[], stream: Stream | null): Lap[] {
  let out = laps;
  for (const at of [...splits].sort((a, b) => a - b)) {
    const i = out.findIndex((l, k) => l.startS != null && at > l.startS + 5 && at < (lapEnd(out, k) ?? 0) - 5);
    if (i < 0) {
      // A split on (or right by) an auto-lap's end makes that lap end a step, as a lap press would.
      const k = out.findIndex((l, j) => j < out.length - 1 && lapEnd(out, j) != null && Math.abs(lapEnd(out, j)! - at) <= EDGE_S);
      if (k >= 0 && out[k].trigger && AUTO.has(out[k].trigger!)) out = out.map((l, j) => (j === k ? { ...l, trigger: "manual" } : l));
      continue;
    }
    const l = out[i];
    const end = lapEnd(out, i)!;
    const elapsed = end - l.startS!;
    const first = within(stream, l.startS!, at), second = within(stream, at, end);
    const speed = (ix: number[]) => ix.reduce((a, k) => a + (stream!.speed[k] ?? 0), 0);
    const share = stream && speed(first) + speed(second) > 0 ? speed(first) / (speed(first) + speed(second)) : (at - l.startS!) / elapsed;
    const durA = Math.round(l.durationS * ((at - l.startS!) / elapsed));
    const avg = (ix: number[], key: "hr" | "cad") => {
      const m = mean(ix.map((k) => stream?.[key]?.[k]).filter((v): v is number => v != null));
      return m == null ? null : Math.round(m);
    };
    const a: Lap = { ...l, durationS: durA, distanceM: Math.round(l.distanceM * share), avgHr: avg(first, "hr") ?? l.avgHr, cadence: avg(first, "cad") ?? l.cadence, trigger: "manual", maxHr: null, elevGain: null, elevLoss: null };
    const b: Lap = { ...l, startS: at, durationS: l.durationS - durA, distanceM: l.distanceM - a.distanceM, avgHr: avg(second, "hr") ?? l.avgHr, cadence: avg(second, "cad") ?? l.cadence, maxHr: null, elevGain: null, elevLoss: null };
    out = [...out.slice(0, i), a, b, ...out.slice(i + 1)].map((x, k) => ({ ...x, index: k }));
  }
  return out;
}

/**
 * Laps become segments. With `edges` (a full set of step boundaries the runner accepted from the
 * stream), a lap ends a segment only where it ends on an edge; otherwise auto-laps are merged.
 */
function segments(laps: Lap[], edges: number[] | null = null): { segs: Seg[]; autoMerged: number } {
  const segs: Seg[] = [];
  let cur: Seg | null = null;
  let autoMerged = 0;
  laps.forEach((l, i) => {
    if (!cur) cur = { laps: [], startS: l.startS ?? null, endS: null, durationS: 0, distanceM: 0, hrWeighted: 0, hrSecs: 0, cadWeighted: 0, cadSecs: 0 };
    cur.laps.push(i + 1);
    cur.durationS += l.durationS;
    cur.distanceM += l.distanceM;
    if (l.avgHr != null) { cur.hrWeighted += l.avgHr * l.durationS; cur.hrSecs += l.durationS; }
    if (l.cadence != null) { cur.cadWeighted += l.cadence * l.durationS; cur.cadSecs += l.durationS; }
    cur.endS = lapEnd(laps, i);
    // An auto-lap that ends exactly where a step changes (warm-up over at 2.00 km) is followed by a
    // lap at a clearly different pace: that is a step change too, not more of the same step.
    const next = laps[i + 1];
    const pace = (x: { durationS: number; distanceM: number }) => (x.distanceM > 0 ? x.durationS / x.distanceM : null);
    const pNow = pace(cur), pNext = next ? pace(next) : null;
    const shift = pNow != null && pNext != null && Math.abs(pNext - pNow) / pNow > PACE_SHIFT;
    const end = lapEnd(laps, i);
    const auto = edges
      ? i < laps.length - 1 && !edges.some((e) => end != null && Math.abs(end - e) <= EDGE_S)
      : !!l.trigger && AUTO.has(l.trigger) && i < laps.length - 1 && !shift;
    if (auto) autoMerged++;
    else { segs.push(cur); cur = null; }
  });
  if (cur) segs.push(cur);
  // The few-second lap that closes the activity (`session_end`) is no step: it belongs to the segment before it.
  const tail = segs[segs.length - 1], prev = segs[segs.length - 2];
  const last = laps[laps.length - 1];
  if (prev && tail.laps.length === 1 && last.trigger === "end" && last.durationS < TINY_END_S) {
    prev.laps.push(...tail.laps);
    prev.durationS += tail.durationS;
    prev.distanceM += tail.distanceM;
    prev.hrWeighted += tail.hrWeighted; prev.hrSecs += tail.hrSecs;
    prev.cadWeighted += tail.cadWeighted; prev.cadSecs += tail.cadSecs;
    prev.endS = tail.endS;
    segs.pop();
  }
  return { segs, autoMerged };
}

/** Expected seconds for a step: its time, or its distance at its target (else easy) pace. */
function expectedS(f: FlatStep, refs: StepRefs): number {
  if (f.def.min != null) return f.def.min * 60;
  const r = resolveTarget(f.def, refs);
  const pace = r.pace ? (r.pace[0] + r.pace[1]) / 2 : refs.easyPace ?? (refs.thresholdPace ? refs.thresholdPace * 1.25 : 360);
  return (f.def.km ?? 0) * pace;
}

/** Where a step ends inside a segment that covers it and the next: its time, or where its distance is reached. */
function splitPoint(seg: Seg, f: FlatStep, stream: Stream | null, refs: StepRefs): number | null {
  if (seg.startS == null) return null;
  if (f.def.min != null) return Math.round(seg.startS + f.def.min * 60);
  const km = f.def.km ?? 0;
  if (stream && seg.endS != null) {
    let dist = 0;
    const ix = within(stream, seg.startS, seg.endS);
    for (let k = 0; k < ix.length; k++) {
      const dt = (stream.t[ix[k + 1]] ?? seg.endS) - stream.t[ix[k]];
      dist += (stream.speed[ix[k]] ?? 0) * dt;
      if (dist >= km * 1000) return stream.t[ix[k]] + dt;
    }
  }
  return Math.round(seg.startS + expectedS(f, refs));
}

/** `ceiling`: only the top of the range counts, so below it is in target (easy HR). */
function judge(value: number | null, range: [number, number] | null, near: number, ceiling = false): { status: StepStatus; delta: number | null } {
  if (value == null || !range) return { status: "unjudged", delta: null };
  const delta = value < range[0] && !ceiling ? value - range[0] : value > range[1] ? value - range[1] : 0;
  return { status: delta === 0 ? "in" : Math.abs(delta) <= near ? "near" : "off", delta: Math.round(delta) };
}

export function matchSteps(steps: WorkoutSteps, rawLaps: Lap[], stream: Stream | null, refs: StepRefs, splits: number[] = []): StepMatchResult {
  const flat = flattenSteps(steps);
  if (!rawLaps.length) return { ok: false, reason: "noLaps" };
  const laps = applySplits(rawLaps, splits, stream);
  // As many splits as step changes: the runner took the stream's boundaries, so they alone mark the steps.
  const full = splits.length > 0 && splits.length === flat.length - 1 && laps.every((l) => l.startS != null);
  const { segs, autoMerged } = segments(laps, full ? splits : null);
  if (segs.length === 1 && flat.length > 1) return { ok: false, reason: "noManualLaps" };

  const pairs: { seg: Seg | null; merged: { lap: number; at: number } | null }[] = flat.map(() => ({ seg: null, merged: null }));
  let i = 0, j = 0;
  while (i < flat.length && j < segs.length) {
    const seg = segs[j];
    const exp = expectedS(flat[i], refs);
    if (i + 1 < flat.length && seg.durationS > exp * MERGED_OVER) {
      const both = exp + expectedS(flat[i + 1], refs);
      const fits = Math.abs(seg.durationS - both) / both < MERGED_FIT && Math.abs(seg.durationS - both) < Math.abs(seg.durationS - exp);
      // Fewer segments left than steps is what a forgotten lap press looks like.
      if (fits && segs.length - j < flat.length - i) {
        const at = splitPoint(seg, flat[i], stream, refs);
        pairs[i] = { seg, merged: at != null ? { lap: seg.laps[seg.laps.length - 1], at } : null };
        i += 2; j++;
        continue;
      }
    }
    pairs[i] = { seg, merged: null };
    i++; j++;
  }

  const results: StepResult[] = flat.map((f, k) => {
    const { seg, merged } = pairs[k];
    const target = resolveTarget(f.def, refs);
    if (!seg) return { flat: f, laps: [], startS: null, endS: null, durationS: null, distanceM: null, pace: null, hr: null, hrTrimmed: false, cadence: null, target, judge: target.judge, status: "missing", delta: null, merged: null };
    let hr = seg.hrSecs ? seg.hrWeighted / seg.hrSecs : null;
    let hrTrimmed = false;
    if (f.role === "work" && seg.startS != null && seg.endS != null && seg.endS - seg.startS > HR_SKIP_S * 2) {
      const tail = within(stream, seg.startS + HR_SKIP_S, seg.endS).map((x) => stream!.hr[x]).filter((v): v is number => v != null);
      if (tail.length >= 6) { hr = mean(tail); hrTrimmed = true; }
    }
    const pace = seg.distanceM > 0 ? seg.durationS / (seg.distanceM / 1000) : null;
    const judged = f.role === "recovery" || merged ? null : target.judge;
    const j2 = judged === "pace" ? judge(pace, target.pace, NEAR_PACE) : judged === "hr" ? judge(hr, target.hr, NEAR_HR, target.hrCeiling) : { status: "unjudged" as const, delta: null };
    return {
      flat: f, laps: seg.laps, startS: seg.startS, endS: seg.endS, durationS: seg.durationS, distanceM: seg.distanceM, pace, hr: hr == null ? null : Math.round(hr), hrTrimmed,
      cadence: seg.cadSecs ? Math.round(seg.cadWeighted / seg.cadSecs) : null, target, judge: target.judge, status: j2.status, delta: j2.delta, merged,
    };
  });

  // Reps with no target (strides) are not counted: "0 of 3 in target" for strides said nothing.
  const work = results.filter((r) => r.flat.role === "work" && r.target.judge != null);
  const judgedWork = work.filter((r) => r.status === "in" || r.status === "near" || r.status === "off");
  const withHr = work.filter((r) => r.hr != null);
  const used = pairs.filter((p) => p.seg).length;
  return {
    ok: true,
    steps: results,
    workTotal: work.length,
    workJudged: judgedWork.length,
    workIn: judgedWork.filter((r) => r.status === "in").length,
    hrDrift: withHr.length >= 2 ? withHr.at(-1)!.hr! - withHr[0].hr! : null,
    lapCount: laps.length,
    autoMerged,
    extraLaps: Math.max(0, segs.length - used),
    splits: [...splits].sort((a, b) => a - b),
  };
}

/** The short result for a week chip: reps in target out of reps planned. */
export interface StepSummary { workIn: number; workTotal: number; workJudged: number }
export function stepSummary(m: StepMatchResult): StepSummary | null {
  return m.ok && m.workTotal ? { workIn: m.workIn, workTotal: m.workTotal, workJudged: m.workJudged } : null;
}
