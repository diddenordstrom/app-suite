import type { Lap, Stream } from "./types";
import { flattenSteps, resolveTarget, type FlatStep, type StepRefs, type WorkoutSteps } from "./steps";
import { matchSteps, type StepMatch, type StepMatchResult } from "./stepmatch";

/*
 * Structured workouts, phase 2: find the steps' boundaries in the stream when the laps don't fit
 * (docs/decisions/fartlek-stream-steps.md). The plan is known, so this only places the K−1 boundaries
 * between K known steps; it never guesses what was run.
 *
 * 1. The stream goes on the timer's clock (pauses dropped) and gets a grade-adjusted speed: Garmin's
 *    own when the file has it, else one from the altitude with the same shape. Uphill reps look as
 *    hard as they were, and the jog down as easy.
 * 2. Dynamic programming over a 2 s grid picks the boundaries that keep speed even within each step,
 *    with each step's length near the plan. Standing still costs nothing, so a standing rest never
 *    pulls a boundary.
 * 3. Each boundary is moved to the sharpest change within REFINE_S at full resolution.
 * 4. Only a clear answer is returned: every boundary is between a hard and an easy step, every rep is
 *    clearly faster than the steps around it all the way through, and its length is near the plan.
 *    Otherwise null: no suggestion is better than a confident wrong one (fartlek, progressive runs).
 */

/** A gap in the stream longer than this is a pause (auto-pause or the timer stopped). */
const PAUSE_GAP_S = 10;
/** The grid the boundaries are chosen on. */
const GRID_S = 2;
/** Rolling median that the step cost works on, and the finer one boundaries are refined on. */
const SMOOTH_S = 15;
const FINE_S = 5;
/** Below this (m/s) the runner is standing or walking to a stop. */
const STILL_MS = 1.0;
/** Cost of a standing grid cell inside a rep, in units of the noise. */
const STILL_IN_REP = 4;
/** How far (s) a boundary may move when refined at full resolution. */
const REFINE_S = 12;
/** Weight of a step's length against the plan in the cost, and the relative miss that costs one weight. */
const W_LENGTH = 30;
const TOL = { hard: 0.2, easy: 0.5 };
/** A step's length (time) as a share of its expected length, outside which it is never placed. */
const BOUNDS = { hard: [0.4, 2.2], easy: [0.25, 4] } as const;
/** Grade-adjusted speed a rep must beat the steps around it by, at its edges and on average. */
export const MIN_JUMP = 0.1;
/** Share of a rep's moving seconds allowed below the midpoint between it and its neighbours. */
const MAX_SLOW_SHARE = 0.2;
/** A stretch at rep effort in an easy step longer than this share of the shortest rep (strides are fine). */
const HARD_OUTSIDE = 0.6;
/** A rep's distance or time must be this close to the plan. */
const AMOUNT_TOL = 0.25;

export interface StepCuts {
  /** Activity seconds where each step after the first starts. */
  cuts: number[];
}

/** Grade-adjusted speed factor from a grade, shaped like Garmin's (≈ +3 % per 1 % up, a floor near −9 % down). */
export function gradeFactor(grade: number): number {
  const g = Math.max(-0.3, Math.min(0.3, grade));
  return g >= 0 ? 1 + 3 * g : Math.max(0.91, 1 + 1.6 * g);
}

const isHard = (f: FlatStep) => f.role === "work";

function rollingMedian(xs: number[], n: number): number[] {
  const h = Math.max(0, Math.floor(n / 2));
  return xs.map((_, i) => {
    const w = xs.slice(Math.max(0, i - h), i + h + 1).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

interface Prepared {
  /** Native samples: activity seconds, timer seconds, seconds each sample stands for. */
  t: number[]; timer: number[]; dur: number[];
  speed: number[];
  /** Grade-adjusted speed, finely smoothed. */
  fine: number[];
  moving: boolean[];
  /** Grid on the timer's clock. */
  grid: { g: number[]; moving: boolean[]; dist: number[]; at: number[]; dt: number };
  /** Noise of the smoothed grade-adjusted speed within a steady stretch (m/s). */
  sigma: number;
}

/** The stream on the timer's clock with grade-adjusted speed, at full resolution and on the grid. */
export function prepare(stream: Stream): Prepared | null {
  const n = stream.t.length;
  if (n < 20) return null;
  const dts = stream.t.slice(1).map((x, i) => x - stream.t[i]).filter((d) => d > 0).sort((a, b) => a - b);
  const step = dts[Math.floor(dts.length / 2)] ?? 1;
  const dur = stream.t.map((x, i) => {
    const d = (stream.t[i + 1] ?? x + step) - x;
    return d > PAUSE_GAP_S ? step : d;
  });
  const timer: number[] = [];
  dur.reduce((acc, d, i) => { timer[i] = acc; return acc + d; }, 0);
  const speed = stream.speed.map((v) => v ?? 0);

  // Grade over ±10 s of running, only where it covers enough ground to trust the altitude.
  const dist: number[] = [];
  speed.reduce((acc, v, i) => { dist[i] = acc; return acc + v * dur[i]; }, 0);
  const gap = speed.map((v, i) => {
    const own = stream.gap?.[i];
    if (own != null) return own;
    let a = i, b = i;
    while (a > 0 && timer[i] - timer[a - 1] <= 10) a--;
    while (b < n - 1 && timer[b + 1] - timer[i] <= 10) b++;
    const alt0 = stream.alt[a], alt1 = stream.alt[b], run = dist[b] - dist[a];
    const grade = alt0 != null && alt1 != null && run >= 10 ? (alt1 - alt0) / run : 0;
    return v * gradeFactor(grade);
  });
  const fineN = Math.max(1, Math.round(FINE_S / step) | 1);
  const fine = rollingMedian(gap, fineN);
  const moving = rollingMedian(speed, fineN).map((v) => v >= STILL_MS);

  // Grid: average each GRID_S of timer time.
  const dt = Math.max(GRID_S, step);
  const cells = Math.max(1, Math.ceil((timer[n - 1] + dur[n - 1]) / dt));
  const sumG = new Array<number>(cells).fill(0), sumV = new Array<number>(cells).fill(0), w = new Array<number>(cells).fill(0), at = new Array<number>(cells).fill(-1);
  for (let i = 0; i < n; i++) {
    const c = Math.min(cells - 1, Math.floor(timer[i] / dt));
    sumG[c] += gap[i] * dur[i]; sumV[c] += speed[i] * dur[i]; w[c] += dur[i];
    if (at[c] < 0) at[c] = stream.t[i];
  }
  for (let c = 0; c < cells; c++) {
    if (!w[c]) { sumG[c] = c ? sumG[c - 1] : 0; sumV[c] = c ? sumV[c - 1] : 0; w[c] = 1; at[c] = c ? at[c - 1] + dt : 0; }
  }
  const smoothN = Math.max(1, Math.round(SMOOTH_S / dt) | 1);
  const g = rollingMedian(sumG.map((s, c) => s / w[c]), smoothN);
  const v = rollingMedian(sumV.map((s, c) => s / w[c]), smoothN);
  const gmoving = v.map((x) => x >= STILL_MS);
  const gdist: number[] = [0];
  for (let c = 0; c < cells; c++) gdist.push(gdist[c] + (sumV[c] / w[c]) * dt);

  // Noise: the typical spread over half a minute, where the runner holds a pace.
  const half = Math.max(2, Math.round(15 / dt));
  const spreads: number[] = [];
  for (let c = half; c < cells - half; c += half) {
    const win = g.slice(c - half, c + half).filter((_, k) => gmoving[c - half + k]);
    if (win.length < half) continue;
    const m = win.reduce((a, x) => a + x, 0) / win.length;
    spreads.push(win.reduce((a, x) => a + (x - m) ** 2, 0) / win.length);
  }
  spreads.sort((a, b) => a - b);
  const sigma = Math.max(0.08, Math.sqrt(spreads[Math.floor(spreads.length / 2)] ?? 0.01));

  return { t: stream.t, timer, dur, speed, fine, moving, grid: { g, moving: gmoving, dist: gdist, at, dt }, sigma };
}

interface Plan { hard: boolean; byDistance: boolean; amount: number; expS: number }

function planOf(flat: FlatStep[], refs: StepRefs): Plan[] {
  return flat.map((f) => {
    const r = resolveTarget(f.def, refs);
    const easy = refs.easyPace ?? (refs.thresholdPace ? refs.thresholdPace * 1.25 : 360);
    const pace = r.pace ? (r.pace[0] + r.pace[1]) / 2 : f.def.target?.kind === "jog" ? easy + 20 : easy;
    const byDistance = f.def.min == null;
    const amount = byDistance ? (f.def.km ?? 0) * 1000 : f.def.min! * 60;
    return { hard: isHard(f), byDistance, amount, expS: byDistance ? (f.def.km ?? 0) * pace : amount };
  });
}

/**
 * Grade-adjusted mean over [from, to) activity seconds; null when there are few samples. Standing still
 * counts as zero with `still`, else it is left out.
 */
function meanIn(p: Prepared, from: number, to: number, still = false): number | null {
  let s = 0, w = 0;
  for (let i = 0; i < p.t.length; i++) {
    if (p.t[i] < from || p.t[i] >= to || (!still && !p.moving[i])) continue;
    s += (p.moving[i] ? p.fine[i] : 0) * p.dur[i]; w += p.dur[i];
  }
  return w >= 4 ? s / w : null;
}

/** The sharpest change of grade-adjusted speed in the given direction within `radius` of `at`. */
function sharpest(p: Prepared, at: number, radius: number, w: number, rising: boolean | null): { at: number; jump: number } | null {
  let best: { at: number; jump: number } | null = null;
  for (let i = 0; i < p.t.length; i++) {
    if (Math.abs(p.t[i] - at) > radius) continue;
    const before = meanIn(p, p.t[i] - w, p.t[i], true), after = meanIn(p, p.t[i], p.t[i] + w, true);
    if (before == null || after == null || Math.max(before, after) < STILL_MS) continue;
    const d = rising == null ? Math.abs(after - before) : rising ? after - before : before - after;
    const jump = d / Math.max(before, after);
    if (!best || jump > best.jump) best = { at: p.t[i], jump };
  }
  return best;
}

/**
 * Where the pace clearly changes near `at` (activity seconds), for the split box's default; null when
 * nothing within `radius` is a clear change.
 */
export function edgeNear(stream: Stream | null, at: number, radius: number): number | null {
  const p = stream ? prepare(stream) : null;
  if (!p) return null;
  const e = sharpest(p, at, radius, 20, null);
  return e && e.jump >= MIN_JUMP ? e.at : null;
}

/** The boundaries between the steps as run, or null when they aren't clear. */
export function detectSteps(flat: FlatStep[], stream: Stream | null, refs: StepRefs): StepCuts | null {
  const r = detect(flat, stream, refs);
  return "cuts" in r ? r : null;
}

/** Why no boundaries were offered; for tests and tuning. */
export type NoCuts = { fail: "plan" | "stream" | "fit" | "edge" | "notFaster" | "sags" | "length" | "hardOutside"; step?: number };

export function detect(flat: FlatStep[], stream: Stream | null, refs: StepRefs): StepCuts | NoCuts {
  const K = flat.length;
  if (K < 2 || !flat.some(isHard)) return { fail: "plan" };
  // A boundary between two easy (or two hard) steps can only be placed by the clock: that is a guess.
  for (let k = 1; k < K; k++) if (isHard(flat[k]) === isHard(flat[k - 1])) return { fail: "plan" };
  const p = stream ? prepare(stream) : null;
  if (!p) return { fail: "stream" };
  const plan = planOf(flat, refs);
  const { g, moving, dist, at, dt } = p.grid;
  const N = g.length;

  // Prefix sums over moving cells for the within-step spread. Standing still is free in an easy step
  // (a standing rest) and costs a little in a rep: enough that a rep isn't stretched over the stop
  // after it, not so much that a red light in a tempo run moves its boundary.
  const cnt = [0], sum = [0], sq = [0], still = [0];
  for (let c = 0; c < N; c++) {
    const m = moving[c] ? 1 : 0;
    cnt.push(cnt[c] + m); sum.push(sum[c] + m * g[c]); sq.push(sq[c] + m * g[c] * g[c]); still.push(still[c] + 1 - m);
  }
  const s2 = p.sigma * p.sigma;
  const cost = (k: number, a: number, b: number) => {
    const n = cnt[b] - cnt[a];
    const spread = (n ? (sq[b] - sq[a] - (sum[b] - sum[a]) ** 2 / n) / s2 : 0) + (plan[k].hard ? STILL_IN_REP * (still[b] - still[a]) : 0);
    const pl = plan[k];
    const done = pl.byDistance ? dist[b] - dist[a] : (b - a) * dt;
    const dev = pl.amount ? (done - pl.amount) / ((pl.hard ? TOL.hard : TOL.easy) * pl.amount) : 0;
    return spread + W_LENGTH * (pl.hard ? 1 : 0.3) * dev * dev;
  };

  // best[k][b]: the cheapest way to end step k at cell b.
  const INF = Number.POSITIVE_INFINITY;
  let prev = new Float64Array(N + 1).fill(INF);
  prev[0] = 0;
  const from: Int32Array[] = [];
  for (let k = 0; k < K; k++) {
    const pl = plan[k];
    const [lo, hi] = pl.hard ? BOUNDS.hard : BOUNDS.easy;
    // The first and last steps take whatever the run started and ended with (a walk home), so no upper bound there.
    const minC = Math.max(1, Math.floor((pl.expS * lo) / dt));
    const maxC = k === 0 || k === K - 1 ? N : Math.ceil((pl.expS * hi) / dt);
    const cur = new Float64Array(N + 1).fill(INF);
    const arg = new Int32Array(N + 1).fill(-1);
    for (let b = 1; b <= N; b++) {
      if (k === K - 1 && b !== N) continue;
      for (let a = Math.max(0, b - maxC); a <= b - minC; a++) {
        if (prev[a] === INF) continue;
        const c = prev[a] + cost(k, a, b);
        if (c < cur[b]) { cur[b] = c; arg[b] = a; }
      }
    }
    from.push(arg);
    prev = cur;
  }
  if (prev[N] === INF) return { fail: "fit" };
  const cells: number[] = [];
  for (let k = K - 1, b = N; k > 0; k--) { b = from[k][b]; cells.unshift(b); }

  // Refine each boundary at full resolution, in the direction the plan says the pace goes.
  const coarse = cells.map((c) => at[c]);
  const cuts: number[] = [];
  for (let k = 0; k < coarse.length; k++) {
    const prevEnd = k ? cuts[k - 1] : p.t[0];
    const nextEnd = coarse[k + 1] ?? p.t.at(-1)!;
    const w = Math.max(6, Math.min(20, 0.4 * Math.min(coarse[k] - prevEnd, nextEnd - coarse[k])));
    const e = sharpest(p, coarse[k], REFINE_S, w, isHard(flat[k + 1]));
    if (!e || e.jump < MIN_JUMP) return { fail: "edge", step: k + 1 };
    cuts.push(e.at);
  }

  // Confidence: every rep clearly faster than its neighbours, all the way through, and the planned length.
  const bounds = [p.t[0], ...cuts, p.t.at(-1)! + 1];
  const spanOf = (k: number) => {
    // The ends of a long warm-up or cool-down say nothing about the rep next to them; use the part beside it.
    let a = bounds[k], b = bounds[k + 1];
    if (!plan[k].hard && k === 0) a = Math.max(a, b - 120);
    if (!plan[k].hard && k === K - 1) b = Math.min(b, a + 120);
    return [a, b] as const;
  };
  const repMeans: number[] = [], easyMeans: number[] = [], repLengths: number[] = [];
  for (let k = 0; k < K; k++) {
    if (!plan[k].hard) continue;
    const [a, b] = [bounds[k], bounds[k + 1]];
    const mine = meanIn(p, a + 3, b - 3);
    const around = [k - 1, k + 1].filter((x) => x >= 0 && x < K).map((x) => meanIn(p, ...spanOf(x))).filter((x): x is number => x != null);
    if (mine == null || !around.length) return { fail: "notFaster", step: k };
    const easy = Math.max(...around);
    if (mine < easy * (1 + MIN_JUMP)) return { fail: "notFaster", step: k };
    // A fartlek or a progressive run makes a "rep" that sags back to easy pace part of the way.
    const mid = (mine + easy) / 2;
    let slow = 0, all = 0;
    for (let i = 0; i < p.t.length; i++) {
      if (p.t[i] < a + 5 || p.t[i] >= b - 5) continue;
      all += p.dur[i];
      if (!p.moving[i] || p.fine[i] < mid) slow += p.dur[i];
    }
    if (!all || slow / all > MAX_SLOW_SHARE) return { fail: "sags", step: k };
    const done = plan[k].byDistance ? distBetween(p, a, b) : timerBetween(p, a, b);
    if (Math.abs(done - plan[k].amount) > AMOUNT_TOL * plan[k].amount) return { fail: "length", step: k };
    repMeans.push(mine); easyMeans.push(easy); repLengths.push(timerBetween(p, a, b));
  }
  // Nothing as hard as a rep may hide in an easy step: then the plan has fewer reps than were run.
  const mid = (Math.min(...repMeans) + Math.max(...easyMeans)) / 2;
  const longest = Math.min(...repLengths) * HARD_OUTSIDE;
  for (let k = 0; k < K; k++) {
    if (plan[k].hard) continue;
    let run = 0;
    for (let i = 0; i < p.t.length; i++) {
      if (p.t[i] < bounds[k] || p.t[i] >= bounds[k + 1]) continue;
      run = p.moving[i] && p.fine[i] >= mid ? run + p.dur[i] : 0;
      if (run > longest) return { fail: "hardOutside", step: k };
    }
  }
  return { cuts };
}

function distBetween(p: Prepared, a: number, b: number) {
  let d = 0;
  for (let i = 0; i < p.t.length; i++) if (p.t[i] >= a && p.t[i] < b) d += p.speed[i] * p.dur[i];
  return d;
}
function timerBetween(p: Prepared, a: number, b: number) {
  let d = 0;
  for (let i = 0; i < p.t.length; i++) if (p.t[i] >= a && p.t[i] < b) d += p.dur[i];
  return d;
}

/** Each step must start within this (s) of where the stream says, once the splits are applied. */
const AGREE_S = 15;
/** A rep whose lap is this far from its planned amount isn't the rep: the laps don't fit. */
const LAP_OFF = 0.3;

/**
 * The laps give one segment per step, none covering two, and no rep's lap is far from the plan (a lap
 * pressed inside the warm-up shifts every step after it).
 */
export function lapsFit(m: StepMatchResult): boolean {
  if (!m.ok || !m.steps.every((r) => r.laps.length > 0 && !r.merged)) return false;
  return m.steps.every((r) => {
    if (r.flat.role !== "work") return true;
    const plan = r.flat.def.min != null ? r.flat.def.min * 60 : (r.flat.def.km ?? 0) * 1000;
    const done = r.flat.def.min != null ? r.durationS : r.distanceM;
    return !plan || done == null || Math.abs(done - plan) <= LAP_OFF * plan;
  });
}

/** What the card offers: every step change found in the stream, and how the steps would be judged with them. */
export interface StreamSuggestion { splits: number[]; preview: StepMatch }

/**
 * When the laps don't fit the steps, the step changes read from the stream, stored (when accepted) as a
 * full set of lap splits that replaces any earlier ones. `fine` is a finer stream for detection (1 s,
 * parsed on demand from the kept FIT file); `stream` is the stored one that judging uses. Null unless
 * the stream is clear.
 */
export function suggestFromStream(steps: WorkoutSteps, laps: Lap[], stream: Stream | null, fine: Stream | null, refs: StepRefs, splits: number[] = []): StreamSuggestion | null {
  const now = matchSteps(steps, laps, stream, refs, splits);
  if (!laps.length || laps.some((l) => l.startS == null) || lapsFit(now)) return null;
  const found = detectSteps(flattenSteps(steps), fine ?? stream, refs);
  if (!found) return null;
  // The stream agrees with the laps (a rep just ran short of the plan): nothing to offer.
  if (now.ok && found.cuts.every((c, k) => now.steps[k + 1]?.startS != null && Math.abs(now.steps[k + 1].startS! - c) <= AGREE_S)) return null;
  const preview = matchSteps(steps, laps, stream, refs, found.cuts);
  if (!preview.ok || !lapsFit(preview) || preview.steps.slice(1).some((r, k) => r.startS == null || Math.abs(r.startS - found.cuts[k]) > AGREE_S)) return null;
  return { splits: found.cuts, preview };
}

/** The split box's default (a forgotten lap press): where the pace changes near the plan's point, when it clearly does. */
export function refineMerged(m: StepMatchResult, fine: Stream | null): StepMatchResult {
  if (!m.ok || !fine) return m;
  return {
    ...m,
    steps: m.steps.map((r) => {
      if (!r.merged || r.startS == null) return r;
      const plannedS = r.merged.at - r.startS;
      const at = edgeNear(fine, r.merged.at, Math.max(20, plannedS * 0.25));
      return at != null && at > r.startS + 10 ? { ...r, merged: { ...r.merged, at } } : r;
    }),
  };
}
