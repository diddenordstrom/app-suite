import { and, eq, gt, gte, lte, sql } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { injuryNow, phaseRace } from "../racephase";
import { ctxFor, loadSeries, loadsWithToday, openToday, stepRefs, weekSummariesWithHistory, type Ctx } from "../analysis";
import { addDays, daysBetween, weekStartOf, type ISODate } from "../../shared/dates";
import { COACH, project, suggest, type CoachInput } from "../../shared/coach";
import { plannedKmOf } from "../../shared/compliance";
import { plannedLoad } from "../../shared/load";
import type { StepLang, StepRefs } from "../../shared/steps";
import { thresholdOn } from "../../shared/threshold";
import { blockEnd, checkEdges, raceHints, runPoints, spikeOf, summarizeBlock, type Push, type RunPoint } from "../../shared/blocks";
import { applyBlockText, blockText, type ApplyOptions, type ApplyResult, type WeekState } from "../../shared/blocktext";
import type { Msg } from "../../shared/types";
import { blockLines } from "../../shared/parser";
import { BLOCK_KINDS, type Block } from "../../shared/types";
import { body, date, idParam, num, oneOf, optStr, router, BadRequest } from "./util";

const MAX_WEEKS = 52;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function weekStartParam(ctx: Ctx, v: unknown, name = "startWeek") {
  const d = date(v, name);
  if (weekStartOf(d, ctx.settings.weekStart) !== d) throw new BadRequest(`${name} must be the first day of a week`);
  return d;
}

/** Week states for `weeks` weeks from `start`, leaving out what belongs to blocks about to be pushed on (it moves away). */
function weekStates(ctx: Ctx, start: string, weeks: number, moving: { from: string; to: string }[]) {
  const s = weekSummariesWithHistory(ctx, start, addDays(start, weeks * 7 - 1));
  const targets = repo.getTargets(ctx.db, ctx.userId, start, addDays(start, weeks * 7 - 1));
  const moves = (d: string) => moving.some((m) => d >= m.from && d <= m.to);
  const states: WeekState[] = s.weeks.map((w) => ({
    weekStart: w.weekStart,
    finished: addDays(w.weekStart, 6) < ctx.today,
    sessions: w.sessions.filter((x) => x.workout.status !== "dropped" && !moves(x.workout.date)),
    target: moves(w.weekStart) ? null : targets.get(w.weekStart) ?? null,
  }));
  return { states, summaries: s };
}

interface TextPlan {
  result: ApplyResult; pushes: Push[]; conflict: { reason: "overlap" | "started"; block: Block } | null; length: number;
  /** What the text was applied to, so the coach can try its suggestions on the same weeks. */
  states: WeekState[]; oldLength: number; opts: ApplyOptions;
}

const langParam = (v: unknown): StepLang => (v === "sv" ? "sv" : "en");

/** Step targets per date (the threshold valid that day), looked up once per date. */
function refsLookup(ctx: Ctx): (date: ISODate) => StepRefs {
  const cache = new Map<ISODate, StepRefs>();
  return (d) => {
    const key = d > ctx.today ? ctx.today : d;
    if (!cache.has(key)) cache.set(key, stepRefs(ctx, key));
    return cache.get(key)!;
  };
}

/** Everything saving `text` for a block would do, without writing. */
function planText(ctx: Ctx, existing: Block | null, startWeek: string, text: string, lang: StepLang = "en"): TextPlan {
  const blocks = repo.listBlocks(ctx.db, ctx.userId);
  const length = blockLines(text).length;
  const edge = checkEdges({ id: existing?.id, startWeek, weeks: Math.max(length, 1) }, blocks, ctx.today);
  const pushes = edge.ok ? edge.pushes : [];
  const moving = pushes.map((p) => { const b = blocks.find((x) => x.id === p.id)!; return { from: b.startWeek, to: blockEnd(b) }; });
  const oldLength = existing && existing.startWeek === startWeek ? existing.weeks : 0;
  const n = Math.max(length, oldLength, 1);
  const { states, summaries } = weekStates(ctx, startWeek, n, moving);
  const opts: ApplyOptions = { lang, refsFor: refsLookup(ctx), longRunDay: ctx.settings.longRunDay };
  const result = applyBlockText(states, oldLength, text, ctx.settings.runDays, ctx.settings.units, opts);

  // Long-run step check on what would be planned: runs outside the range as they are, runs inside as done + new plan.
  const rangeEnd = addDays(startWeek, n * 7 - 1);
  const inRange = (ws: string) => ws >= startWeek && ws <= rangeEnd;
  const history: RunPoint[] = [
    ...runPoints(summaries.all.filter((w) => !inRange(w.weekStart))),
    ...summaries.weeks.filter((w) => inRange(w.weekStart)).flatMap((w) =>
      [...w.sessions.flatMap((s) => (s.activity ? [s.activity] : [])), ...w.extras].filter((a) => a.isRun).map((a) => ({ date: a.date, km: a.distanceM / 1000 }))),
    ...result.weeks.flatMap((w) => w.ahead),
  ];
  for (const w of result.weeks) {
    if (w.state === "locked" || w.state === "removed") continue;
    for (const a of w.ahead) {
      if (a.type === "race") continue;
      const sp = spikeOf(a.date, a.km, history);
      if (sp) w.spikes.push({ ...sp, date: a.date, type: a.type });
    }
  }
  return { result, pushes, conflict: edge.ok ? null : { reason: edge.reason, block: edge.block }, length, states, oldLength, opts };
}

/* ---------- Coach (docs/decisions/fartlek-block-coach.md) ---------- */

/** Mean minutes a week of other sports over the coach's history window, to the nearest 5. */
export function crossHabit(ctx: Ctx): number {
  const days = COACH.cross.historyWeeks * 7;
  const secs = repo.listActivities(ctx.db, ctx.userId, { from: addDays(ctx.today, -(days - 1)), to: ctx.today })
    .filter((a) => !a.isRun).reduce((s, a) => s + a.durationS, 0);
  return Math.round(secs / 60 / COACH.cross.historyWeeks / 5) * 5;
}

/** Run km per day: actual up to today, planned (not dropped) after, and today's sessions not run yet. */
export function kmByDay(ctx: Ctx, from: ISODate, to: ISODate): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  const add = (d: ISODate, km: number) => m.set(d, (m.get(d) ?? 0) + km);
  for (const a of repo.listActivities(ctx.db, ctx.userId, { from, to: to < ctx.today ? to : ctx.today })) if (a.isRun) add(a.date, a.distanceM / 1000);
  if (from <= ctx.today && ctx.today <= to) for (const w of openToday(ctx)) if (w.type !== "cross") add(w.date, plannedKmOf(w));
  if (to > ctx.today) {
    for (const w of repo.listWorkouts(ctx.db, ctx.userId, addDays(ctx.today, 1), to)) {
      if (w.status !== "dropped" && w.date >= from && w.type !== "cross" && w.type !== "rest") add(w.date, plannedKmOf(w));
    }
  }
  return m;
}

/** Run km per week for the `weeks` weeks before `weekStart`, oldest first. */
export function weeksBefore(ctx: Ctx, weekStart: ISODate, weeks: number) {
  const from = addDays(weekStart, -7 * weeks);
  const km = kmByDay(ctx, from, addDays(weekStart, -1));
  return Array.from({ length: weeks }, (_, i) => {
    const ws = addDays(from, i * 7);
    let sum = 0;
    for (let d = 0; d < 7; d++) sum += km.get(addDays(ws, d)) ?? 0;
    return { weekStart: ws, km: Math.round(sum * 10) / 10 };
  });
}

/** The longest single run in [from, to]: runs done, and runs planned from today on (not skipped or dropped). */
export function longestRun(ctx: Ctx, from: ISODate, to: ISODate): number {
  let best = 0;
  for (const a of repo.listActivities(ctx.db, ctx.userId, { from, to: to < ctx.today ? to : ctx.today })) if (a.isRun) best = Math.max(best, a.distanceM / 1000);
  if (from <= ctx.today && ctx.today <= to) for (const w of openToday(ctx)) if (w.type !== "cross") best = Math.max(best, plannedKmOf(w));
  if (to > ctx.today) {
    for (const w of repo.listWorkouts(ctx.db, ctx.userId, addDays(ctx.today, 1), to)) {
      if (w.status === "planned" && w.date >= from && w.type !== "cross" && w.type !== "rest") best = Math.max(best, plannedKmOf(w));
    }
  }
  return Math.round(best * 10) / 10;
}

function coachInputs(ctx: Ctx, startWeek: ISODate, plan: TextPlan, crossMin: number) {
  const n = Math.max(plan.length, 1);
  const blockEnd = addDays(startWeek, n * 7 - 1);
  const race = repo.listRaces(ctx.db, ctx.userId)
    .find((r) => (r.priority === "A" || r.priority === "B") && r.date > ctx.today && r.date >= startWeek && r.date <= addDays(blockEnd, COACH.race.afterDays)) ?? null;
  const end = race && race.date > blockEnd ? race.date : blockEnd;
  const thr = thresholdOn(ctx.thresholds, ctx.today);
  const outside = new Map<ISODate, number>();
  if (end > ctx.today) {
    for (const w of repo.listWorkouts(ctx.db, ctx.userId, addDays(ctx.today, 1), end)) {
      if (w.date >= startWeek && w.date <= blockEnd) continue;
      outside.set(w.date, (outside.get(w.date) ?? 0) + plannedLoad(w, thr));
    }
  }
  const before = kmByDay(ctx, addDays(startWeek, -21), addDays(startWeek, -1));
  const kmBefore = [3, 2, 1].map((k) => {
    let km = 0;
    for (let d = 0; d < 7; d++) km += before.get(addDays(startWeek, -7 * k + d)) ?? 0;
    return Math.round(km * 10) / 10;
  });
  const base: Omit<CoachInput, "weeks"> = {
    today: ctx.today, history: loadsWithToday(ctx), outside, kmBefore, crossMin, crossOutsideMin: crossHabit(ctx),
    race: race ? { date: race.date, name: race.name } : null, threshold: thr,
  };
  const weeksOf = (r: ApplyResult): CoachInput["weeks"] => r.weeks.slice(0, n).map((w) => ({
    weekStart: w.weekStart, backoff: w.backoff, locked: w.state === "locked", km: w.afterKm, plan: w.plan,
  }));
  return { base, weeksOf };
}

/** The coach's verdict on `text`, with each suggestion's text and what it would do to the verdict. */
function coachFor(ctx: Ctx, startWeek: ISODate, plan: TextPlan, text: string, lang: StepLang, crossMin: number | null) {
  const habitMin = crossHabit(ctx);
  const cross = crossMin ?? habitMin;
  if (plan.result.errors.length || !plan.length) return null;
  const { base, weeksOf } = coachInputs(ctx, startWeek, plan, cross);
  const result = project({ ...base, weeks: weeksOf(plan.result) });
  const lines = blockLines(text);
  const tips = suggest(result, lines, base.kmBefore, { units: ctx.settings.units, lang, refsFor: plan.opts.refsFor! }).flatMap((tip) => {
    const r = applyBlockText(plan.states, plan.oldLength, tip.text, ctx.settings.runDays, ctx.settings.units, plan.opts);
    if (r.errors.length) return [];
    const after = project({ ...base, weeks: weeksOf(r) });
    return [{ ...tip, before: result.value, after: after.value, afterState: after.state }];
  });
  return { ...result, tips, habitMin, crossMin: cross, crossSet: crossMin != null };
}

const crossParam = (v: unknown) => (v === undefined ? undefined : v === null ? null : Math.round(num(v, "crossMin", 0, 1500)));

/** Push blocks on (later) with their sessions and weekly targets, last first so nothing collides. */
function runPushes(tx: Tx, userId: number, blocks: Block[], pushes: Push[]) {
  for (const p of [...pushes].reverse()) {
    const b = blocks.find((x) => x.id === p.id)!;
    const from = b.startWeek, to = blockEnd(b), days = p.weeks * 7;
    tx.update(t.workouts).set({ date: sql`date(${t.workouts.date}, ${`+${days} days`})` })
      .where(and(eq(t.workouts.userId, userId), gte(t.workouts.date, from), lte(t.workouts.date, to))).run();
    const targets = tx.select().from(t.weekTargets).where(and(eq(t.weekTargets.userId, userId), gte(t.weekTargets.weekStart, from), lte(t.weekTargets.weekStart, to))).all();
    tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, userId), gte(t.weekTargets.weekStart, from), lte(t.weekTargets.weekStart, to))).run();
    for (const tg of targets) {
      const ws = addDays(tg.weekStart, days);
      tx.insert(t.weekTargets).values({ ...tg, weekStart: ws })
        .onConflictDoUpdate({ target: [t.weekTargets.userId, t.weekTargets.weekStart], set: { km: tg.km, minutes: tg.minutes, note: tg.note } }).run();
    }
    tx.update(t.blocks).set({ startWeek: addDays(from, days) }).where(and(eq(t.blocks.userId, userId), eq(t.blocks.id, b.id))).run();
  }
}

function runOps(tx: Tx, userId: number, result: ApplyResult) {
  for (const op of result.ops) {
    if (op.op === "update") {
      const steps = op.steps !== undefined ? { steps: op.steps } : op.dropSteps ? { steps: null } : {};
      tx.update(t.workouts).set({ distanceKm: op.distanceKm, durationMin: op.durationMin, zone2: op.zone2, ...steps })
        .where(and(eq(t.workouts.userId, userId), eq(t.workouts.id, op.id))).run();
    } else if (op.op === "create") {
      tx.insert(t.workouts).values({ userId, date: op.date, type: op.type, distanceKm: op.distanceKm, durationMin: op.durationMin, zone2: op.zone2, steps: op.steps ?? null }).run();
    } else if (op.op === "delete") {
      tx.delete(t.workouts).where(and(eq(t.workouts.userId, userId), eq(t.workouts.id, op.id), eq(t.workouts.status, "planned"))).run();
    } else if (op.target) {
      tx.insert(t.weekTargets).values({ userId, weekStart: op.weekStart, ...op.target })
        .onConflictDoUpdate({ target: [t.weekTargets.userId, t.weekTargets.weekStart], set: op.target }).run();
    } else {
      tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, userId), eq(t.weekTargets.weekStart, op.weekStart))).run();
    }
  }
}

/** Refuse a save that runs into another block, unless the user agreed to push the next one(s) on. */
/** Plain-text errors for API callers; the app shows the translated preview instead. */
const errorText = (errors: Msg[]) => errors.map((e) => e.params?.week ? `Week ${e.params.week}: can't read "${e.params.text}"` : e.key);

function edgeResponse(plan: Pick<TextPlan, "conflict" | "pushes">, pushNext: boolean) {
  if (plan.conflict) return { error: plan.conflict.reason === "started" ? "the next block has already started" : "overlaps another block", conflict: plan.conflict.reason, block: plan.conflict.block };
  if (plan.pushes.length && !pushNext) return { error: "would run into the next block", conflict: "push" as const, pushes: plan.pushes };
  return null;
}

export function blockRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;
  const find = (ctx: Ctx, id: number) => repo.listBlocks(db, ctx.userId).find((b) => b.id === id) ?? null;

  const fields = (b: Record<string, unknown>) => ({
    kind: oneOf(b.kind, BLOCK_KINDS, "kind"),
    name: optStr(b.name, "name", 60),
    note: optStr(b.note, "note", 200),
  });
  const textOf = (b: Record<string, unknown>) => {
    if (typeof b.text !== "string" || b.text.length > 10000) throw new BadRequest("text required");
    return b.text;
  };

  /**
   * Form (TSB: yesterday's fitness − fatigue) going into a block and coming out of it, or today while it runs;
   * null for a block that hasn't started. `pct` is form as a share of fitness, the scale the build band is judged on.
   */
  function blockForm(ctx: Ctx, from: ISODate) {
    if (from > ctx.today) return () => null;
    const at = new Map(loadSeries(ctx, daysBetween(from, ctx.today) + 1).map((p) => [p.date, p]));
    const point = (d: ISODate) => { const p = at.get(d); return p ? { value: Math.round(p.tsb * 10) / 10, pct: Math.round(p.formPct) } : null; };
    return (b: Block) => {
      if (b.startWeek > ctx.today) return null;
      const after = addDays(blockEnd(b), 1);
      const running = after > ctx.today;
      return { start: point(b.startWeek), end: point(running ? ctx.today : after), running };
    };
  }

  /** All blocks with their summaries, plus races for the season strip. */
  r.get("/blocks", (c) => {
    const ctx = ctxFor(db, uid(c));
    const blocks = repo.listBlocks(db, ctx.userId);
    const races = repo.listRaces(db, ctx.userId);
    // Real injury while an A race's phase is on: the client offers a lighter re-plan (the runner chooses).
    const injury = phaseRace(ctx, weekStartOf(ctx.today, ctx.settings.weekStart)) ? injuryNow(ctx) : null;
    if (!blocks.length) return c.json({ today: ctx.today, blocks: [], races, injury });
    const from = blocks[0].startWeek, to = blocks.map(blockEnd).sort().at(-1)!;
    const s = weekSummariesWithHistory(ctx, from, to);
    const formOf = blockForm(ctx, from);
    return c.json({
      today: ctx.today,
      races, injury,
      blocks: blocks.map((b) => ({ ...b, summary: summarizeBlock(b, s.weeks, ctx.today, { zonesOf: s.zonesOf, history: s.history }), form: formOf(b) })),
    });
  });

  /** Upcoming races with a taper suggestion (A races) and volume / long-run hints for halves and marathons. */
  r.get("/races/hints", (c) => {
    const ctx = ctxFor(db, uid(c));
    const races = repo.listRaces(db, ctx.userId).filter((x) => x.date >= ctx.today && x.date <= addDays(ctx.today, 366));
    if (!races.length) return c.json({ today: ctx.today, hints: {} });
    const s = weekSummariesWithHistory(ctx, addDays(races[0].date, -7 * 7), races.at(-1)!.date);
    const ws = (d: string) => weekStartOf(d, ctx.settings.weekStart);
    return c.json({ today: ctx.today, hints: Object.fromEntries(races.map((x) => [x.id, raceHints(x, s.weeks, ws)])) });
  });

  /** A range of weeks as block text (finished weeks marked ✓): the text editor's starting point. */
  r.get("/blocks/text", (c) => {
    const ctx = ctxFor(db, uid(c));
    const start = weekStartParam(ctx, c.req.query("start"), "start");
    const weeks = Number(c.req.query("weeks") ?? 0);
    if (!Number.isInteger(weeks) || weeks < 0 || weeks > MAX_WEEKS) throw new BadRequest("weeks must be 0–52");
    if (!weeks) return c.json({ text: "" });
    const { states } = weekStates(ctx, start, weeks, []);
    return c.json({ text: blockText(states, ctx.settings.units, langParam(c.req.query("lang"))) });
  });

  /** What saving this text would change, week by week. `id` = the block being edited, absent for a new one. */
  r.post("/blocks/preview", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const existing = b.id == null ? null : find(ctx, idParam(String(b.id)));
    if (b.id != null && !existing) return c.json({ error: "not found" }, 404);
    const start = existing ? existing.startWeek : weekStartParam(ctx, b.startWeek);
    const lang = langParam(b.lang);
    const text = textOf(b);
    const plan = planText(ctx, existing, start, text, lang);
    const cross = crossParam(b.crossMin);
    const coach = coachFor(ctx, start, plan, text, lang, cross === undefined ? existing?.crossMin ?? null : cross);
    return c.json({ weeks: plan.result.weeks, errors: plan.result.errors, length: plan.length, oldLength: existing?.weeks ?? 0, pushes: plan.pushes, conflict: plan.conflict, coach });
  });

  /** New block: name, kind, start week and its text. */
  r.post("/blocks", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const f = fields(b);
    const start = weekStartParam(ctx, b.startWeek);
    const plan = planText(ctx, null, start, textOf(b), langParam(b.lang));
    const crossMin = crossParam(b.crossMin) ?? null;
    if (plan.result.errors.length) return c.json({ errors: errorText(plan.result.errors) }, 400);
    const refused = edgeResponse(plan, !!b.pushNext);
    if (refused) return c.json(refused, 409);
    const blocks = repo.listBlocks(db, ctx.userId);
    let id = 0;
    db.transaction((tx) => {
      runPushes(tx, ctx.userId, blocks, plan.pushes);
      id = tx.insert(t.blocks).values({ userId: ctx.userId, ...f, startWeek: start, weeks: plan.length, crossMin }).returning().get().id;
      runOps(tx, ctx.userId, plan.result);
    });
    return c.json({ id, ops: plan.result.ops.length });
  });

  /** Save a block's text: applies the difference and sets its length to the number of lines. */
  r.put("/blocks/:id/text", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const existing = find(ctx, idParam(c.req.param("id")));
    if (!existing) return c.json({ error: "not found" }, 404);
    const plan = planText(ctx, existing, existing.startWeek, textOf(b), langParam(b.lang));
    if (plan.result.errors.length) return c.json({ errors: errorText(plan.result.errors) }, 400);
    const refused = edgeResponse(plan, !!b.pushNext);
    if (refused) return c.json(refused, 409);
    const blocks = repo.listBlocks(db, ctx.userId);
    const cross = crossParam(b.crossMin);
    db.transaction((tx) => {
      runPushes(tx, ctx.userId, blocks, plan.pushes);
      tx.update(t.blocks).set({ weeks: plan.length, ...(cross === undefined ? {} : { crossMin: cross }) }).where(and(eq(t.blocks.userId, ctx.userId), eq(t.blocks.id, existing.id))).run();
      runOps(tx, ctx.userId, plan.result);
    });
    return c.json({ id: existing.id, ops: plan.result.ops.length });
  });

  /** Change name, kind, note, start or length. Sessions stay where they are (they belong by date). */
  r.patch("/blocks/:id", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const existing = find(ctx, idParam(c.req.param("id")));
    if (!existing) return c.json({ error: "not found" }, 404);
    const f = fields({ kind: existing.kind, name: existing.name, note: existing.note, ...b });
    const startWeek = b.startWeek === undefined ? existing.startWeek : weekStartParam(ctx, b.startWeek);
    const weeks = b.weeks === undefined ? existing.weeks : num(b.weeks, "weeks", 1, MAX_WEEKS);
    if (!Number.isInteger(weeks)) throw new BadRequest("weeks must be a whole number");
    const blocks = repo.listBlocks(db, ctx.userId);
    const edge = checkEdges({ id: existing.id, startWeek, weeks }, blocks, ctx.today);
    const refused = edgeResponse(edge.ok ? { conflict: null, pushes: edge.pushes } : { conflict: { reason: edge.reason, block: edge.block }, pushes: [] }, !!b.pushNext);
    if (refused) return c.json(refused, 409);
    db.transaction((tx) => {
      if (edge.ok) runPushes(tx, ctx.userId, blocks, edge.pushes);
      tx.update(t.blocks).set({ ...f, startWeek, weeks }).where(and(eq(t.blocks.userId, ctx.userId), eq(t.blocks.id, existing.id))).run();
    });
    return c.json({ ok: true });
  });

  /**
   * Delete a block. Its sessions stay as "no block" unless `workouts=1`: then planned sessions not yet done
   * (from today on, no run linked) go too, and so do the weekly targets of its weeks not yet started. A
   * suggested block wrote those targets, and a target left behind would size the next "Föreslå veckan".
   */
  r.delete("/blocks/:id", (c) => {
    const ctx = ctxFor(db, uid(c));
    const existing = find(ctx, idParam(c.req.param("id")));
    if (!existing) return c.json({ error: "not found" }, 404);
    let deleted = 0, targets = 0;
    const doomed = c.req.query("workouts") === "1"
      ? weekSummariesWithHistory(ctx, existing.startWeek, blockEnd(existing)).weeks.flatMap((w) => w.sessions)
        .filter((s) => s.workout.status === "planned" && !s.activity && s.workout.date >= ctx.today).map((s) => s.workout.id)
      : [];
    db.transaction((tx) => {
      for (const id of doomed) deleted += tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), eq(t.workouts.id, id))).run().changes;
      if (c.req.query("workouts") === "1") {
        targets = tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, ctx.userId),
          gt(t.weekTargets.weekStart, ctx.today), gte(t.weekTargets.weekStart, existing.startWeek), lte(t.weekTargets.weekStart, blockEnd(existing)))).run().changes;
      }
      tx.delete(t.blocks).where(and(eq(t.blocks.userId, ctx.userId), eq(t.blocks.id, existing.id))).run();
    });
    return c.json({ deleted, targets });
  });

  return r;
}

