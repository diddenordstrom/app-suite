import { daysBetween } from "./dates";
import { isStrengthType, type Activity, type Workout } from "./types";

/**
 * Auto-match runs to planned workouts within one week, with manual overrides (D10, D11).
 * 1. Manual links win; manually unlinked workouts are left alone.
 * 2. Threshold-like runs (flagged, or named so) take threshold/interval workouts, longest first.
 * 3. Remaining runs take remaining run workouts by smallest distance gap (date only breaks ties).
 * 4. Gym activities fill strength workouts; other non-run activities fill cross-train workouts, never a gym one.
 * No long-run floor: closest gap wins (D10).
 */
export type MatchedBy = "manual" | "threshold" | "closest" | "cross";
export interface Match { workoutId: number; activityId: string; matchedBy: MatchedBy }

const THRESHOLD_WORDS = /(threshold|tröskel|troskel|tempo|interval|interv)/i;

export function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function looksLikeThreshold(a: Pick<Activity, "name" | "thresholdFlag">): boolean {
  return a.thresholdFlag || THRESHOLD_WORDS.test(stripDiacritics(a.name));
}

/** Distance (or duration) gap; durations convert at ~6 min/km so both scales compare. */
function gap(w: Workout, a: Activity): number {
  if (w.distanceKm != null) return Math.abs(a.distanceM / 1000 - w.distanceKm);
  if (w.durationMin != null) return Math.abs(a.durationS / 60 - w.durationMin) / 6;
  return 0;
}

const planSize = (w: Workout) => w.distanceKm ?? (w.durationMin != null ? w.durationMin / 6 : 0);

export function matchWeek(workouts: Workout[], activities: Activity[]): Match[] {
  const matches: Match[] = [];
  const usedA = new Set<string>();
  const usedW = new Set<number>();
  const byId = new Map(activities.map((a) => [a.id, a]));

  for (const w of workouts) {
    if (w.manualActivityId && byId.has(w.manualActivityId) && !usedA.has(w.manualActivityId)) {
      matches.push({ workoutId: w.id, activityId: w.manualActivityId, matchedBy: "manual" });
      usedA.add(w.manualActivityId);
      usedW.add(w.id);
    }
  }
  const open = workouts.filter((w) => !usedW.has(w.id) && !w.manualUnlinked && !w.manualActivityId && w.status !== "dropped" && w.type !== "rest");
  const runs = activities.filter((a) => a.isRun && !usedA.has(a.id));

  const thrWorkouts = open.filter((w) => w.type === "threshold" || w.type === "intervals").sort((a, b) => planSize(b) - planSize(a));
  for (const w of thrWorkouts) {
    const cands = runs.filter((a) => !usedA.has(a.id) && looksLikeThreshold(a));
    if (!cands.length) break;
    cands.sort((x, y) => gap(w, x) - gap(w, y) || Math.abs(daysBetween(w.date, x.date)) - Math.abs(daysBetween(w.date, y.date)));
    matches.push({ workoutId: w.id, activityId: cands[0].id, matchedBy: "threshold" });
    usedA.add(cands[0].id);
    usedW.add(w.id);
  }

  const runW = open.filter((w) => !usedW.has(w.id) && w.type !== "cross" && w.type !== "strength");
  const pairs: { w: Workout; a: Activity; g: number; d: number }[] = [];
  for (const w of runW) for (const a of runs) if (!usedA.has(a.id)) pairs.push({ w, a, g: gap(w, a), d: Math.abs(daysBetween(w.date, a.date)) });
  pairs.sort((x, y) => x.g - y.g || x.d - y.d);
  for (const p of pairs) {
    if (usedW.has(p.w.id) || usedA.has(p.a.id)) continue;
    matches.push({ workoutId: p.w.id, activityId: p.a.id, matchedBy: "closest" });
    usedW.add(p.w.id);
    usedA.add(p.a.id);
  }

  const gyms = activities.filter((a) => isStrengthType(a.typeKey) && !usedA.has(a.id));
  for (const w of open.filter((w) => w.type === "strength" && !usedW.has(w.id))) {
    const cands = gyms.filter((g) => !usedA.has(g.id));
    if (!cands.length) break;
    cands.sort((x, y) => Math.abs(daysBetween(w.date, x.date)) - Math.abs(daysBetween(w.date, y.date)));
    matches.push({ workoutId: w.id, activityId: cands[0].id, matchedBy: "cross" });
    usedA.add(cands[0].id);
    usedW.add(w.id);
  }

  const others = activities.filter((a) => !a.isRun && !isStrengthType(a.typeKey) && !usedA.has(a.id));
  for (const w of open.filter((w) => w.type === "cross" && !usedW.has(w.id))) {
    const a = others.find((o) => !usedA.has(o.id));
    if (!a) break;
    matches.push({ workoutId: w.id, activityId: a.id, matchedBy: "cross" });
    usedA.add(a.id);
    usedW.add(w.id);
  }
  return matches;
}

