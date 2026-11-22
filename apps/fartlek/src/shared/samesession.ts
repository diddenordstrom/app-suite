import type { ISODate } from "./dates";
import { gradeFactor } from "./streamsteps";
import type { StepMatch, StepResult } from "./stepmatch";
import type { StepDef, StepItem, StepTarget, WorkoutSteps } from "./steps";
import type { Stream } from "./types";

/*
 * The same session over time (docs/decisions/fartlek-same-session.md). Two sessions are the same when
 * their quality work has the same fingerprint: as many reps, each as long, at the same kind of target
 * (3 × 8 min @threshold). Warm-up, cool-down, easy running, strides and the rest between reps don't
 * count, so it works backwards on every structured session, wherever its steps came from. Reps are
 * compared on grade-adjusted pace and on HR (the step match already leaves out a rep's first 90 s).
 */

export const SAME = {
  /** Times an outline has been run before the cards compare anything. */
  minTimes: 3,
  /** How far back sessions are looked for, and how many are shown per outline. */
  lookbackDays: 365,
  maxPoints: 20,
  /** Share of the reps that must have been matched to a lap for a session to count. */
  minMatched: 0.5,
  /** Distance either side (m) over which the grade of a sample is taken. */
  gradeWindowM: 25,
} as const;

/** Targets that make a step quality work; easy, jog, strides and none don't. */
function quality(t: StepTarget | null): string | null {
  switch (t?.kind) {
    case "threshold": return "thr";
    case "pct": return "pct";
    case "pace": return "pace";
    case "hr": return "hr";
    case "zone": return t.zone >= 3 ? `z${t.zone}` : null;
    default: return null;
  }
}

const amountKey = (d: Pick<StepDef, "km" | "min">) => (d.min != null ? `${Math.round(d.min * 60)}s` : `${Math.round((d.km ?? 0) * 1000)}m`);

/** The quality work of a session as steps (rest dropped), or null when it has none. */
export function workOf(s: WorkoutSteps | null): WorkoutSteps | null {
  if (!s) return null;
  const items: StepItem[] = [];
  for (const it of s.items) {
    if (it.kind === "repeat" && quality(it.work.target)) items.push({ kind: "repeat", times: it.times, work: { ...it.work, judge: undefined }, rest: null });
    else if (it.kind === "step" && quality(it.step.target)) items.push({ kind: "step", step: { ...it.step, judge: undefined } });
  }
  return items.length ? { v: 1, items } : null;
}

/** The fingerprint: `3x480s@thr`, items joined with `+`. Null without quality work. */
export function signature(s: WorkoutSteps | null): string | null {
  const w = workOf(s);
  if (!w) return null;
  return w.items.map((it) => (it.kind === "repeat"
    ? `${it.times}x${amountKey(it.work)}@${quality(it.work.target)}`
    : `1x${amountKey(it.step)}@${quality(it.step.target)}`)).join("+");
}

/* ---------- One session's numbers ---------- */

export interface RepNumbers { pace: number | null; gap: number | null; hr: number | null }
export interface SessionNumbers {
  /** Seconds per km over all quality reps, raw and grade-adjusted. */
  pace: number;
  gap: number;
  /** Duration-weighted HR over the reps (each without its first 90 s). */
  hr: number | null;
  /** Grade-adjusted metres per heartbeat. */
  eff: number | null;
  reps: RepNumbers[];
}

const isQualityRep = (r: StepResult) => r.flat.role === "work" && !!quality(r.flat.def.target);

/** Grade-adjusted metres run between two activity seconds, from the stream's speed and altitude. */
export function gapMetres(stream: Stream, from: number, to: number): number | null {
  const { t, speed, alt } = stream;
  if (!t.length || !alt.some((x) => x != null)) return null;
  // Distance along the stream, to take each sample's grade over a fixed distance rather than a fixed time.
  const d: number[] = new Array(t.length).fill(0);
  for (let i = 1; i < t.length; i++) d[i] = d[i - 1] + (speed[i] ?? 0) * Math.max(0, t[i] - t[i - 1]);
  let lo = 0, hi = 0, out = 0, any = false;
  for (let i = 1; i < t.length; i++) {
    if (t[i] <= from || t[i - 1] >= to) continue;
    const dt = Math.min(t[i], to) - Math.max(t[i - 1], from);
    const v = speed[i];
    if (v == null || dt <= 0) continue;
    while (lo < i && d[i] - d[lo] > SAME.gradeWindowM) lo++;
    if (hi < i) hi = i;
    while (hi < t.length - 1 && d[hi] - d[i] < SAME.gradeWindowM) hi++;
    const a0 = alt[lo], a1 = alt[hi], run = d[hi] - d[lo];
    const grade = a0 != null && a1 != null && run > 5 ? (a1 - a0) / run : 0;
    out += v * dt * gradeFactor(grade);
    any = true;
  }
  return any ? out : null;
}

/** The numbers of one run of an outline from its step match, or null when too few reps were matched. */
export function sessionNumbers(m: StepMatch, stream: Stream | null): SessionNumbers | null {
  const reps = m.steps.filter(isQualityRep);
  const done = reps.filter((r) => r.durationS && r.distanceM);
  if (!reps.length || done.length / reps.length < SAME.minMatched) return null;
  let dur = 0, dist = 0, gapDist = 0, hrSum = 0, hrDur = 0;
  const out: RepNumbers[] = reps.map((r) => {
    if (!r.durationS || !r.distanceM) return { pace: null, gap: null, hr: r.hr };
    const g = stream && r.startS != null && r.endS != null ? gapMetres(stream, r.startS, r.endS) : null;
    const gd = g ?? r.distanceM;
    dur += r.durationS; dist += r.distanceM; gapDist += gd;
    if (r.hr != null) { hrSum += r.hr * r.durationS; hrDur += r.durationS; }
    return { pace: r.durationS / (r.distanceM / 1000), gap: r.durationS / (gd / 1000), hr: r.hr };
  });
  const hr = hrDur ? hrSum / hrDur : null;
  return { pace: dur / (dist / 1000), gap: dur / (gapDist / 1000), hr, eff: hr ? (gapDist / dur) / (hr / 60) : null, reps: out };
}

/* ---------- Comparing ---------- */

export interface SessionPoint extends SessionNumbers {
  activityId: string;
  date: ISODate;
  /** Form (TSB) that day and the run's elevation gain, so a slow day can be read. */
  tsb: number | null;
  elevGain: number | null;
}

export interface Comparison {
  /** Against the run before: s/km (− faster), bpm, and the efficiency change as a share. */
  prev: { gap: number; hr: number | null; reps: (number | null)[] } | null;
  /** Against the first run of the outline in the window. */
  first: { gap: number; hr: number | null; eff: number | null; date: ISODate } | null;
}

const share = (a: number | null, b: number | null) => (a != null && b ? a / b - 1 : null);

/** How point `i` of an outline's runs (oldest first) compares; nothing until it has been run SAME.minTimes times. */
export function compare(points: SessionPoint[], i: number): Comparison {
  if (i + 1 < SAME.minTimes || i < 1) return { prev: null, first: null };
  const p = points[i], b = points[i - 1], f = points[0];
  return {
    prev: {
      gap: p.gap - b.gap, hr: p.hr != null && b.hr != null ? p.hr - b.hr : null,
      reps: p.reps.map((r, k) => (r.gap != null && b.reps[k]?.gap != null ? r.gap - b.reps[k].gap! : null)),
    },
    first: { gap: p.gap - f.gap, hr: p.hr != null && f.hr != null ? p.hr - f.hr : null, eff: share(p.eff, f.eff), date: f.date },
  };
}
