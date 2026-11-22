import { flattenSteps, resolveTarget, type StepDef, type StepRefs, type StepRole, type WorkoutSteps } from "./steps";

/*
 * Structured steps as intervals.icu workout text, so intervals.icu can send the workout on to
 * Garmin (docs/decisions/fartlek-watch-push.md). intervals.icu parses the event's description into
 * steps; only a parsed workout reaches the watch.
 *
 * - Targets resolve with Fartlek's refs on the workout's date, the window planned vs actual judges.
 * - Pace is written absolute (`4:20/km-4:40/km Pace`).
 * - The syntax has no absolute bpm, so HR is written as % of intervals.icu's own LTHR, which it turns
 *   back into the same bpm. Without an LTHR there, an HR step goes without a target.
 * - A repeat's rest only falls between reps (as in flattenSteps): `3x8 min / 2 min` is written as
 *   (rep, rest) × 2 plus a last rep, so the watch makes one lap per planned step.
 */

/** How far ahead planned workouts are sent (intervals.icu sends the next week on to Garmin; two weeks gives moves some room). */
export const PUSH_DAYS = 14;

const INTENSITY: Record<StepRole, string> = { warmup: "warmup", run: "active", work: "active", recovery: "recovery", cooldown: "cooldown" };

function mmss(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function amount(def: StepDef): string {
  if (def.min != null) {
    const total = Math.round(def.min * 60);
    const m = Math.floor(total / 60), s = total % 60;
    return m && s ? `${m}m${s}s` : m ? `${m}m` : `${s}s`;
  }
  const km = def.km ?? 0;
  return km < 1 ? `${Math.round(km * 1000)}mtr` : `${Math.round(km * 1000) / 1000}km`;
}

export interface IntervalsDoc {
  /** The event description. */
  text: string;
  /** Steps intervals.icu should parse out of it (repeats expanded), to check the push. */
  steps: number;
  /** Judged targets that couldn't be written, so the step went without one. */
  missing: ("pace" | "hr")[];
}

export function intervalsDoc(s: WorkoutSteps, refs: StepRefs, lthr: number | null): IntervalsDoc {
  const flat = flattenSteps(s);
  const roleOf = (item: number) => flat.find((f) => f.item === item)!.role;
  const missing = new Set<"pace" | "hr">();

  const line = (def: StepDef, role: StepRole) => {
    const r = resolveTarget(def, refs);
    let target = "";
    if (r.judge === "pace" && r.pace) target = ` ${mmss(r.pace[0])}/km-${mmss(r.pace[1])}/km Pace`;
    else if (r.judge === "hr" && r.hr) {
      if (lthr) target = ` ${Math.round((r.hr[0] / lthr) * 100)}-${Math.round((r.hr[1] / lthr) * 100)}% LTHR`;
      else missing.add("hr");
    }
    return `- ${amount(def)}${target} intensity=${INTENSITY[role]}`;
  };

  const blocks: string[] = [];
  let run: string[] = [];
  const flush = () => { if (run.length) blocks.push(run.join("\n")); run = []; };
  s.items.forEach((it, i) => {
    if (it.kind === "step") return run.push(line(it.step, roleOf(i)));
    const work = line(it.work, "work");
    if (!it.rest) {
      if (it.times === 1) return run.push(work);
      flush();
      blocks.push(`${it.times}x\n${work}`);
      return;
    }
    const rest = line(it.rest, "recovery");
    if (it.times === 1) return run.push(work);
    if (it.times === 2) { run.push(work, rest, work); return; }
    flush();
    blocks.push(`${it.times - 1}x\n${work}\n${rest}`);
    run.push(work);
  });
  flush();
  return { text: blocks.join("\n\n"), steps: flat.length, missing: [...missing] };
}
