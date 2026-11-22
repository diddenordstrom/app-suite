import { addDays, daysBetween, weekStartOf, type ISODate, type WeekStart } from "./dates";
import { plannedKmOf } from "./compliance";
import { evaluateBlock, suggestBlock, weekKm, type BlockEval, type BlockSeed, type BlockSuggestion } from "./blockplan";
import type { SuggestItem } from "./nextweek";
import type { Workout } from "./types";

/*
 * One way in to the planning engine (docs/decisions/fartlek-adaptive-engine.md): ask for a date range with a few
 * inputs and get the plan for it, whatever the reason for asking. "Suggest a week", "suggest a block", "re-plan the
 * rest", the Monday check-in's pause and a lighter week are the same call with different input, not engines with
 * special cases. The engine itself (blockplan.ts, nextweek.ts) builds whole weeks; this layer turns a range into the
 * weeks that cover it, clips the plan to the range, and compares a plan with the one it would replace
 * (`diffPlans`) so the runner sees what changes and what it does to the block before anything is saved.
 * Pure: the server gathers the seed.
 *
 * A range that starts or ends mid-week is planned as whole weeks and clipped: the days outside it are dropped, and
 * the load of days already run in that week is not in the seed (a small inaccuracy, said so in the decision page).
 */

export interface PlanRequest {
  /** First and last day to plan, inclusive. */
  from: ISODate;
  to: ISODate;
  /** Km to aim for over the range; null = as much as is safe. */
  goalKm?: number | null;
  /** Build the first week lighter (after stress or tiredness). */
  light?: boolean;
}

/** The weeks that cover the range: where the first one starts and how many there are. */
export function rangeWeeks(req: Pick<PlanRequest, "from" | "to">, weekStart: WeekStart = "monday"): { startWeek: ISODate; weeks: number } {
  const startWeek = weekStartOf(req.from, weekStart);
  return { startWeek, weeks: Math.max(1, Math.floor(daysBetween(startWeek, req.to) / 7) + 1) };
}

export interface RangePlan {
  seed: BlockSeed;
  /** What the engine suggested, whole weeks. */
  suggestion: BlockSuggestion;
  /** The range's sessions per week, days outside the range dropped. */
  items: SuggestItem[][];
  /** The clipped plan judged in a chain from the seed. */
  eval: BlockEval;
}

/** Sessions per week from `startWeek`, days outside [from, to] dropped. */
export const clipWeeks = (weeks: SuggestItem[][], from: ISODate, to: ISODate): SuggestItem[][] =>
  weeks.map((items) => items.filter((it) => it.date >= from && it.date <= to));

/** The plan for the range. `seed` was built for `rangeWeeks(req)` (its start week and week count). */
export function planRange(seed: BlockSeed, req: PlanRequest): RangePlan {
  const suggestion = suggestBlock(seed);
  const items = clipWeeks(suggestion.weeks.map((w) => w.items), req.from, req.to);
  return { seed, suggestion, items, eval: evaluateBlock(seed, items) };
}

/* ---------- What a plan replaces ---------- */

/** Planned sessions as the engine's items, grouped by week from `startWeek` (weeks without sessions are empty). */
export function workoutWeeks(workouts: Workout[], startWeek: ISODate, weeks: number): SuggestItem[][] {
  const out: SuggestItem[][] = Array.from({ length: weeks }, () => []);
  for (const w of workouts) {
    if (w.status !== "planned" || w.type === "rest" || w.type === "race" || w.type === "strength") continue;
    const i = Math.floor(daysBetween(startWeek, w.date) / 7);
    if (i < 0 || i >= weeks) continue;
    const type = w.type === "cross" ? "cross" : w.type === "easy" || w.type === "long" ? w.type : "threshold";
    out[i].push({ date: w.date, type, km: type === "cross" ? 0 : plannedKmOf(w), durationMin: w.durationMin, steps: w.steps });
  }
  return out.map((items) => items.sort((a, b) => a.date.localeCompare(b.date)));
}

export interface DayChange { date: ISODate; kind: "added" | "removed" | "changed"; before: SuggestItem | null; after: SuggestItem | null }
export interface WeekDiff { weekStart: ISODate; kmBefore: number; kmAfter: number; changes: DayChange[] }
export interface PlanSnapshot {
  km: number;
  /** The biggest week. */
  peak: { weekStart: ISODate; km: number } | null;
  /** The deepest build week's lowest form, in points and as a share of fitness. */
  deepestForm: number | null;
  deepestPct: number | null;
  /** The last day of the plan. */
  endsOn: ISODate;
  /** Fitness at the end. */
  ctl: number;
}
export interface PlanDiff {
  weeks: WeekDiff[];
  /** The plan being replaced, judged the same way; null when nothing was planned there. */
  before: PlanSnapshot | null;
  after: PlanSnapshot;
}

const same = (a: SuggestItem, b: SuggestItem) => a.type === b.type && Math.abs(a.km - b.km) < 0.05 && (a.durationMin ?? 0) === (b.durationMin ?? 0);

function snapshot(seed: BlockSeed, weeks: SuggestItem[][]): PlanSnapshot {
  const e = evaluateBlock(seed, weeks);
  const peak = e.weeks.reduce<PlanSnapshot["peak"]>((m, w) => (!m || w.km > m.km ? { weekStart: w.weekStart, km: w.km } : m), null);
  return { km: e.km, peak, deepestForm: e.deepest?.form ?? null, deepestPct: e.deepest?.formPct ?? null, endsOn: addDays(seed.startWeek, weeks.length * 7 - 1), ctl: e.ctl };
}

/**
 * What `after` changes against `before`, week by week and for the whole plan: km, the biggest week, the form in the
 * deepest build week, and where the plan ends. Both are the sessions per week from `seed.startWeek`; they may differ in
 * length (a plan that grows by a week).
 */
export function diffPlans(seed: BlockSeed, before: SuggestItem[][], after: SuggestItem[][]): PlanDiff {
  const n = Math.max(before.length, after.length);
  const weeks: WeekDiff[] = Array.from({ length: n }, (_, i) => {
    const b = before[i] ?? [], a = after[i] ?? [];
    const changes: DayChange[] = [];
    for (const it of b) {
      const now = a.find((x) => x.date === it.date) ?? null;
      if (!now) changes.push({ date: it.date, kind: "removed", before: it, after: null });
      else if (!same(it, now)) changes.push({ date: it.date, kind: "changed", before: it, after: now });
    }
    for (const it of a) if (!b.some((x) => x.date === it.date)) changes.push({ date: it.date, kind: "added", before: null, after: it });
    return { weekStart: addDays(seed.startWeek, i * 7), kmBefore: weekKm(b), kmAfter: weekKm(a), changes: changes.sort((x, y) => x.date.localeCompare(y.date)) };
  });
  const had = before.some((w) => w.length);
  return { weeks, before: had ? snapshot(seed, before) : null, after: snapshot(seed, after) };
}
