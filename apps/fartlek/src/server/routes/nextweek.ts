import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { ctxFor, loadsWithToday, stepRefs, weekSummaries, type Ctx } from "../analysis";
import { crossHabit, kmByDay, longestRun, weeksBefore } from "./blocks";
import { BLOCK, tolerance } from "../../shared/blockplan";
import { addDays, weekStartOf, type ISODate } from "../../shared/dates";
import { blockOn } from "../../shared/blocks";
import { crossLoadPerDay } from "../../shared/coach";
import { plannedLoad, pmc } from "../../shared/load";
import { asWeekSuggestion, suggestWeek, weekAsBlock } from "../../shared/blockplan";
import { planRange } from "../../shared/planrange";
import { daysAdvice, formHeavy, NEXT, rungBefore, type BackoffWhy, type PastWeek, type SuggestItem, type SuggestType, type WeekSeed } from "../../shared/nextweek";
import { parseSteps, plannedFromSteps, stepsText, type WorkoutSteps } from "../../shared/steps";
import { goalPace } from "../../shared/recovery";
import { thresholdOn } from "../../shared/threshold";
import { WORKOUT_STATUSES, WORKOUT_TYPES, type Workout } from "../../shared/types";
import { body, date, num, oneOf, optNum, optStr, router, BadRequest } from "./util";

/*
 * "Suggest next week" (docs/decisions/fartlek-suggest-week.md). GET builds the seed and the engine's
 * suggestion for a week that hasn't started; the client edits it and evaluates the edits itself from the seed.
 * POST writes the sessions the runner kept, on the days they chose, replacing what was planned in the week
 * (only what the runner was shown); it returns the replaced sessions so undo can put them back as they were.
 * A week with a race is left alone.
 */

const PAST_WEEKS = 6;
const TYPES: readonly SuggestType[] = ["easy", "long", "threshold", "cross"];

/** What a suggestion replaces: every session planned in the week (it hasn't started, so none is done). */
/** The sessions a suggestion for the week replaces; in the running week only from today on, what is behind stays. */
const planned = (ctx: Ctx, weekStart: ISODate) => repo.listWorkouts(ctx.db, ctx.userId, weekStart > ctx.today ? weekStart : ctx.today, addDays(weekStart, 6));

/** A race in the week (on the race list or as a session) keeps the week out of suggestions. */
const hasRace = (ctx: Ctx, weekStart: ISODate, workouts: Workout[]) => {
  const end = addDays(weekStart, 6);
  return workouts.some((w) => w.type === "race") || repo.listRaces(ctx.db, ctx.userId).some((r) => r.date >= weekStart && r.date <= end);
};

function weekParam(ctx: Ctx, v: unknown): ISODate {
  const ws = v == null || v === "" ? weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart) : date(v, "weekStart");
  if (weekStartOf(ws, ctx.settings.weekStart) !== ws) throw new BadRequest("weekStart must be the first day of a week");
  // The running week too (Monday's check-in re-plans it from today on); weeks that are over stay as they were.
  if (ws < weekStartOf(ctx.today, ctx.settings.weekStart)) throw new BadRequest("weekStart must be this week or a later one");
  return ws;
}

/**
 * The seed for a week. `formOverTarget`: heavy form makes the week lighter even when the week has a target (Skapa block
 * does: a target a block or a copy left behind isn't the runner deciding the week); only a target noted "backoff" counts as asked.
 */
export function seedFor(ctx: Ctx, weekStart: ISODate, o: { formOverTarget?: boolean } = {}): WeekSeed {
  const thr = thresholdOn(ctx.thresholds, ctx.today);
  const block = blockOn(weekStart, repo.listBlocks(ctx.db, ctx.userId));
  const habit = crossHabit(ctx);
  const crossMin = block?.crossMin ?? habit;
  const dayBefore = addDays(weekStart, -1);

  // Planned load (and the other-sports habit) from tomorrow up to the week, like the block coach projects it.
  const future = new Map<ISODate, number>();
  for (let d = addDays(ctx.today, 1); d <= dayBefore; d = addDays(d, 1)) future.set(d, crossLoadPerDay(crossMin));
  for (const w of repo.listWorkouts(ctx.db, ctx.userId, addDays(ctx.today, 1), dayBefore)) {
    if (future.has(w.date)) future.set(w.date, future.get(w.date)! + plannedLoad(w, thr));
  }
  const from = addDays(weekStart, -7 * PAST_WEEKS);
  const points = new Map(pmc(loadsWithToday(ctx), from < ctx.today ? from : ctx.today, ctx.today, future).map((p) => [p.date, p]));
  const at = (d: ISODate) => points.get(d) ?? { ctl: 0, atl: 0 };

  const km = kmByDay(ctx, from, dayBefore);
  const past: PastWeek[] = Array.from({ length: PAST_WEEKS }, (_, i) => {
    const ws = addDays(from, i * 7);
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += km.get(addDays(ws, d)) ?? 0;
    const end = at(addDays(ws, 6));
    return { weekStart: ws, km: Math.round(sum * 10) / 10, ctl: end.ctl, atl: end.atl };
  });
  const target = repo.getTargets(ctx.db, ctx.userId, weekStart, weekStart).get(weekStart) ?? null;
  const seed = at(dayBefore);
  const hardBefore = hardOn(ctx, dayBefore);
  const asked = /backoff/i.test(target?.note ?? "");
  // Lighter when form is heavy (said as tired, also when asked: it is the truer reason), or when asked for. Being fresh
  // after weeks of building says to build on, not to rest. A target the runner set decides the week for the week dialog
  // (no automatic form rule there); a block ignores it (`formOverTarget`).
  const heavy = formHeavy(seed.ctl, seed.atl) && (target == null || !!o.formOverTarget || asked);
  const backoffWhy: BackoffWhy | null = heavy ? "form" : asked ? "asked" : null;
  const toleranceKm = tolerance(weeksBefore(ctx, weekStart, BLOCK.tolerance.lookbackWeeks)).km;
  return {
    weekStart, ctl: seed.ctl, atl: seed.atl, kmBefore: past.slice(-3).map((w) => w.km), past,
    runDays: ctx.settings.runDays, longRunDay: ctx.settings.longRunDay,
    threshold: thr, refs: stepRefs(ctx, ctx.today), crossMin,
    targetKm: target?.km ?? null, backoff: backoffWhy != null, backoffWhy, hardBefore, toleranceKm,
    ...keySessionSeed(ctx, weekStart),
  };
}

/**
 * What the key sessions step up from: the longest run of the 30 days before the week, the threshold rung
 * after the last threshold session before it that was run or is still to run (`rungBefore`), and the
 * faster finish's pace.
 */
export function keySessionSeed(ctx: Ctx, weekStart: ISODate): Pick<WeekSeed, "longestKm" | "rung" | "tempoPace"> {
  const dayBefore = addDays(weekStart, -1);
  const sessions = weekSummaries(ctx, addDays(weekStart, -7 * PAST_WEEKS), dayBefore).flatMap((w) => w.sessions);
  const T = NEXT.tempo;
  const race = repo.listRaces(ctx.db, ctx.userId)
    .filter((r) => r.priority === "A" && r.goalSeconds != null && r.date > weekStart && r.date <= addDays(weekStart, 7 * T.raceWeeks))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const thr = thresholdOn(ctx.thresholds, ctx.today);
  const tempoPace = race ? goalPace(race.goalSeconds!, race.distanceKm) + T.racePlus : thr?.paceSecPerKm != null ? thr.paceSecPerKm + T.thrPlus : null;
  return { longestKm: longestRun(ctx, addDays(weekStart, -NEXT.spikeDays), dayBefore), rung: rungBefore(weekStart, sessions, thr?.paceSecPerKm ?? null), tempoPace };
}

const HARD = new Set(["threshold", "intervals", "long", "race"]);
/** A hard session planned (not dropped) on `d`. */
export const hardOn = (ctx: Ctx, d: ISODate) =>
  repo.listWorkouts(ctx.db, ctx.userId, d, d).some((w) => w.status !== "dropped" && HARD.has(w.type));

/** Steps from the client, accepted only if they read back the same through the parser. */
function stepsParam(v: unknown, ctx: Ctx): WorkoutSteps {
  if (!v || typeof v !== "object") throw new BadRequest("steps must be an object");
  let text: string;
  try { text = stepsText(v as WorkoutSteps, "en", ctx.settings.units); } catch { throw new BadRequest("steps can't be read"); }
  const parsed = parseSteps(text, ctx.settings.units, "en");
  if (parsed.errors.length || !parsed.steps) throw new BadRequest("steps can't be read");
  return parsed.steps;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A week's suggested sessions from the client: 1–14, each inside the week, threshold steps read back by the parser. */
export function parseItems(ctx: Ctx, raw: unknown, weekStart: ISODate, label = "items"): SuggestItem[] {
  if (!Array.isArray(raw) || raw.length > 14) throw new BadRequest(`${label} must be up to 14 sessions`);
  const end = addDays(weekStart, 6);
  return raw.map((x: Record<string, unknown>, i: number) => {
    if (!x || typeof x !== "object") throw new BadRequest(`${label}[${i}] must be an object`);
    const d = date(x.date, `${label}[${i}].date`);
    if (d < weekStart || d > end) throw new BadRequest(`${label}[${i}].date must be in the week`);
    const type = oneOf(x.type, TYPES, `${label}[${i}].type`);
    if (type === "cross") return { date: d, type, km: 0, durationMin: num(x.durationMin, `${label}[${i}].durationMin`, 5, 600), steps: null };
    const steps = x.steps != null ? stepsParam(x.steps, ctx) : null;
    return { date: d, type, km: num(x.km, `${label}[${i}].km`, 0.5, 200), durationMin: null, steps };
  });
}

/** Write suggested sessions as planned workouts; returns their ids. */
export function insertItems(tx: Tx, ctx: Ctx, items: SuggestItem[]): number[] {
  return items.map((it) => {
    const amount = it.steps ? plannedFromSteps(it.steps, stepRefs(ctx, it.date)) : { distanceKm: it.type === "cross" ? null : it.km, durationMin: it.durationMin };
    return tx.insert(t.workouts).values({
      userId: ctx.userId, date: it.date, type: it.type, ...amount, zone2: false, steps: it.steps ? JSON.stringify(it.steps) : null,
    }).returning().get().id;
  });
}

/** Undo rows: the sessions a suggestion replaced, as the client sent them back, each inside [from, to]. */
export function restoreRows(ctx: Ctx, raw: unknown, from: ISODate, to: ISODate) {
  const restore = Array.isArray(raw) ? raw as Record<string, unknown>[] : [];
  if (restore.length > 120) throw new BadRequest("too many sessions");
  return restore.map((w, i) => {
    if (!w || typeof w !== "object") throw new BadRequest(`restore[${i}] must be an object`);
    const d = date(w.date, `restore[${i}].date`);
    if (d < from || d > to) throw new BadRequest(`restore[${i}].date must be in the range`);
    return {
      id: Number.isInteger(w.id) ? (w.id as number) : undefined,
      date: d, type: oneOf(w.type, WORKOUT_TYPES, `restore[${i}].type`),
      distanceKm: optNum(w.distanceKm, `restore[${i}].distanceKm`, 0, 500), durationMin: optNum(w.durationMin, `restore[${i}].durationMin`, 0, 1440),
      zone2: w.zone2 === true, notes: optStr(w.notes, `restore[${i}].notes`, 2000),
      status: oneOf(w.status ?? "planned", WORKOUT_STATUSES, `restore[${i}].status`), skipReason: optStr(w.skipReason, `restore[${i}].skipReason`, 60),
      steps: w.steps ? JSON.stringify(stepsParam(w.steps, ctx)) : null,
    };
  });
}

/** Remove `ids` (inside [from, to]) and put the restored rows back, with their ids when free. */
export function runUndo(tx: Tx, ctx: Ctx, ids: number[], rows: ReturnType<typeof restoreRows>, from: ISODate, to: ISODate) {
  for (const id of ids) {
    tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), eq(t.workouts.id, id), gte(t.workouts.date, from), lte(t.workouts.date, to))).run();
  }
  for (const { id, ...row } of rows) {
    const free = id != null && !tx.select({ id: t.workouts.id }).from(t.workouts).where(eq(t.workouts.id, id)).get();
    tx.insert(t.workouts).values({ ...(free ? { id } : {}), userId: ctx.userId, ...row }).run();
  }
}

export function nextWeekRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/plan/next-week", (c) => {
    const ctx = ctxFor(db, uid(c));
    const weekStart = weekParam(ctx, c.req.query("weekStart"));
    const replaces = planned(ctx, weekStart);
    if (hasRace(ctx, weekStart, replaces)) return c.json({ weekStart, ok: false, reason: "race" });
    const seed = c.req.query("light") === "1" ? { ...seedFor(ctx, weekStart), backoff: true } : seedFor(ctx, weekStart);
    const { suggestion, advice } = repo.tuned(db, uid(c), () => {
      // The week as a range, from today in the running week, planned by the one engine entry (shared/planrange.ts).
      const plan = planRange(weekAsBlock(seed), { from: weekStart > ctx.today ? weekStart : ctx.today, to: addDays(weekStart, 6), light: seed.backoff });
      const suggestion = asWeekSuggestion(seed, plan.suggestion, { items: plan.items[0], eval: plan.eval.weeks[0] });
      // Not enough run days for the week: the dialog offers another one (shared/nextweek.ts `daysAdvice`).
      const advice = daysAdvice(seed.runDays, seed.longRunDay, [{ weekStart, targetKm: suggestion.targetKm, items: suggestion.items }],
        (runDays) => { const s = suggestWeek({ ...seed, runDays }); return [{ weekStart, targetKm: s.targetKm, items: s.items }]; });
      return { suggestion, advice };
    });
    return c.json({ weekStart, ok: true, seed, suggestion, replaces, advice });
  });

  r.post("/plan/next-week", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const weekStart = weekParam(ctx, b.weekStart);
    if (!Array.isArray(b.items) || !b.items.length || b.items.length > 14) throw new BadRequest("items must be 1–14 sessions");
    const items = parseItems(ctx, b.items, weekStart);
    if (items.some((it) => it.date < ctx.today)) throw new BadRequest("sessions can't be planned on a day that is over");
    const shown = Array.isArray(b.replace) ? new Set(b.replace.map((x: unknown) => Number(x))) : new Set<number>();
    const current = planned(ctx, weekStart);
    if (hasRace(ctx, weekStart, current)) return c.json({ error: "the week has a race", conflict: "race" }, 409);
    // Replace only what the runner saw: a session added meanwhile (another tab, a sync) refuses the write.
    if (current.length !== shown.size || current.some((w) => !shown.has(w.id))) {
      return c.json({ error: "the week changed since the suggestion", conflict: "changed" }, 409);
    }
    let ids: number[] = [];
    db.transaction((tx) => {
      for (const w of current) tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), eq(t.workouts.id, w.id))).run();
      ids = insertItems(tx, ctx, items);
    });
    return c.json({ ids, removed: current });
  });

  /** Undo: remove the suggested sessions and put back the ones they replaced, with their ids when free. */
  r.post("/plan/next-week/undo", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const weekStart = date(b.weekStart, "weekStart");
    const end = addDays(weekStart, 6);
    const ids = Array.isArray(b.ids) ? b.ids.map((x: unknown) => Number(x)).filter(Number.isInteger) : [];
    if (ids.length > 14 || (Array.isArray(b.restore) && b.restore.length > 30)) throw new BadRequest("too many sessions");
    const rows = restoreRows(ctx, b.restore, weekStart, end);
    db.transaction((tx) => runUndo(tx, ctx, ids, rows, weekStart, end));
    return c.json({ ok: true });
  });

  return r;
}
