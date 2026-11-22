import { range, type ISODate } from "./dates";
import { plannedKmOf } from "./compliance";
import type { Activity, Threshold, Workout, WorkoutType } from "./types";
import type { ZoneSecs } from "./zones";
import { flattenSteps, type StepTarget, type WorkoutSteps } from "./steps";

/**
 * Load per activity, best available (D12): rTSS (pace vs threshold pace) for road runs,
 * else hrTSS (HR vs threshold HR), else a duration fallback. Labelled "Load" in the UI.
 */
export type LoadMethod = "rTSS" | "hrTSS" | "duration";
export interface ActivityLoad { load: number; method: LoadMethod }

const NO_PACE_TYPES = ["trail_running", "treadmill_running", "indoor_running", "virtual_run"];
const tss = (hours: number, intensity: number) => hours * Math.min(intensity, 1.2) ** 2 * 100;

export function activityLoad(a: Pick<Activity, "typeKey" | "isRun" | "distanceM" | "durationS" | "avgHr">, t: Threshold | null): ActivityLoad {
  const hours = a.durationS / 3600;
  if (a.isRun && !NO_PACE_TYPES.includes(a.typeKey) && a.distanceM > 0 && a.durationS > 0 && t?.paceSecPerKm) {
    const pace = a.durationS / (a.distanceM / 1000);
    return { load: Math.round(tss(hours, t.paceSecPerKm / pace)), method: "rTSS" };
  }
  if (a.avgHr && t?.hr) return { load: Math.round(tss(hours, a.avgHr / t.hr)), method: "hrTSS" };
  return { load: Math.round(hours * (a.isRun ? 55 : 40)), method: "duration" };
}

const PLAN_IF: Record<WorkoutType, number> = { easy: 0.72, long: 0.75, threshold: 0.9, intervals: 0.92, race: 1.0, cross: 0.6, strength: 0.55, rest: 0 };

/** Intensity of one step's target relative to threshold (1.0 = threshold), for planned load. */
export function stepIntensity(target: StepTarget | null, t: Threshold | null): number {
  switch (target?.kind) {
    case "jog": return 0.65;
    case "threshold": return 1.0;
    case "strides": return 1.1;
    case "zone": return [0.65, 0.75, 0.85, 0.95, 1.05][target.zone - 1] ?? 0.75;
    case "pct": return target.pct / 100;
    case "pace": return (t?.paceSecPerKm ?? 300) / target.secPerKm;
    case "hr": return t?.hr ? target.bpm / t.hr : 0.8;
    default: return PLAN_IF.easy;
  }
}

/** Load of a structured workout, step by step: warm-up and jog at their own intensity, reps at theirs. */
export function stepsLoad(s: WorkoutSteps, t: Threshold | null): number {
  const thrPace = t?.paceSecPerKm ?? 300;
  let load = 0;
  for (const f of flattenSteps(s)) {
    const intensity = stepIntensity(f.def.target, t);
    const min = f.def.min ?? ((f.def.km ?? 0) * (thrPace / intensity)) / 60;
    load += tss(min / 60, intensity);
  }
  return Math.round(load);
}

/** Expected load of a planned workout, for projecting fitness to race day. A workout with steps is loaded per step. */
export function plannedLoad(w: Pick<Workout, "type" | "status" | "distanceKm" | "durationMin" | "steps">, t: Threshold | null): number {
  if (w.type === "rest" || w.status === "dropped") return 0;
  if (w.steps) return stepsLoad(w.steps, t);
  const intensity = PLAN_IF[w.type];
  const thrPace = t?.paceSecPerKm ?? 300;
  const hours = w.durationMin != null ? w.durationMin / 60 : (plannedKmOf(w as Workout) * (thrPace / intensity)) / 3600;
  return Math.round(tss(hours, intensity));
}

/** `formPct`: form as a share of fitness (see `formPct`), the scale the form bands are judged on. */
export interface PmcPoint { date: ISODate; load: number; ctl: number; atl: number; tsb: number; formPct: number; projected?: boolean }

/** CTL (42 d) / ATL (7 d) / TSB = yesterday's CTL − ATL. Starts from 0 at the first load. */
export function pmc(loads: Map<ISODate, number>, from: ISODate, to: ISODate, future?: Map<ISODate, number>): PmcPoint[] {
  const dates = [...loads.keys()].sort();
  const start = dates[0] && dates[0] < from ? dates[0] : from;
  let ctl = 0, atl = 0;
  const out: PmcPoint[] = [];
  const end = future?.size ? [...future.keys()].sort().pop()! : to;
  for (const d of range(start, end > to ? end : to)) {
    const projected = d > to;
    const load = projected ? future?.get(d) ?? 0 : loads.get(d) ?? 0;
    const tsb = ctl - atl, pct = formPct(tsb, ctl);
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    if (d >= from) out.push({ date: d, load, ctl: round(ctl), atl: round(atl), tsb: round(tsb), formPct: round(pct), ...(projected ? { projected } : {}) });
  }
  return out;
}

const round = (n: number) => Math.round(n * 10) / 10;

/**
 * Form bands, in % of fitness (`formPct`): above `fresh` is rested, down to `building` is normal training,
 * below `heavy` is overload (docs/decisions/fartlek-form-relative.md). Judged on the share and not on
 * fitness − fatigue as such, because the absolute −10 to −30 (Joe Friel's TSB zones, from cyclists near a
 * fitness of 100) is a third of a club runner's fitness of 30: only reachable by load the safe-volume rules forbid.
 */
export const FORM = { fresh: 5, building: -10, heavy: -25, minFitness: 40 } as const;
export type FormState = "fresh" | "balanced" | "building" | "heavy";

/**
 * Form as a share of fitness: (fitness − fatigue) × 100 / fitness, the way intervals.icu shows it. Fitness
 * under `FORM.minFitness` (40) counts as 40: a pure share is too strict at low fitness (−7.6 on a fitness of
 * 23 would be −33 %, "too hard", for a normal week), so up to 40 the bands are those of a fitness of 40:
 * building −4 to −10, too hard under −12.
 */
export function formPct(tsb: number, ctl: number): number {
  return (tsb * 100) / Math.max(ctl, FORM.minFitness);
}

/** Form in words, from its share of fitness: positive is rested, a little negative is normal while training. */
export function formState(tsb: number, ctl: number): FormState {
  const p = formPct(tsb, ctl);
  return p > FORM.fresh ? "fresh" : p >= FORM.building ? "balanced" : p >= FORM.heavy ? "building" : "heavy";
}

/**
 * Edwards TRIMP: minutes in each heart-rate zone times the zone number (1–5). It needs only the
 * zone seconds every activity already has, no resting HR or sex factor. Zone edges are hard, so a run
 * sitting on a boundary can score quite differently from one just inside it.
 */
export function edwardsTrimp(zs: ZoneSecs | null): number | null {
  if (!zs || zs.reduce((a, b) => a + b, 0) <= 0) return null;
  return Math.round(zs.reduce((a, secs, i) => a + (secs / 60) * (i + 1), 0));
}
