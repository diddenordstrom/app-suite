import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { ctxFor, type Ctx } from "../analysis";
import { kmByDay, weeksBefore } from "./blocks";
import { hardOn, insertItems, parseItems, restoreRows, runUndo, seedFor } from "./nextweek";
import { phaseView, racePaceGate } from "../racephase";
import { addDays, daysBetween, weekStartOf, type ISODate } from "../../shared/dates";
import { blockEnd, checkEdges } from "../../shared/blocks";
import { diffPlans, planRange, rangeWeeks, workoutWeeks } from "../../shared/planrange";
import { COACH } from "../../shared/coach";
import { BLOCK, blockDaysAdvice, raceChunks, raceRoles, tolerance, weekKm, type BlockSeed, type RaceChunk, type WeekRole } from "../../shared/blockplan";
import type { SuggestItem } from "../../shared/nextweek";
import type { Block, Race, Workout } from "../../shared/types";
import { body, date, idParam, num, optStr, router, BadRequest } from "./util";

/*
 * "Föreslå block" and "Räkna om resten" (docs/decisions/fartlek-block-goals.md).
 * GET /plan/block-suggest builds the seed and the engine's block for weeks that haven't started; POST writes it
 * as a new block (kind base, with its km goal), its sessions and weekly targets, replacing what was planned
 * in those weeks (only what the runner was shown) and returns what undo needs.
 * GET /blocks/:id/replan re-plans the weeks of a running block that haven't started toward its goal; POST writes it.
 */

const r1 = (n: number) => Math.round(n * 10) / 10;
const BACKOFF_NOTE = "backoff";
const TAPER_NOTE = "taper";

/** Sessions planned in [from, to] that a suggestion replaces (done or dropped ones stay). Never a day that is over. */
const plannedIn = (ctx: Ctx, from: ISODate, to: ISODate) =>
  repo.listWorkouts(ctx.db, ctx.userId, from < ctx.today ? ctx.today : from, to).filter((w) => w.status === "planned");
/** What a new block's suggestion replaces: the planned sessions, never a race (it is what the weeks lead to). */
const replacedBy = (ctx: Ctx, from: ISODate, to: ISODate) => plannedIn(ctx, from, to).filter((w) => w.type !== "race");

/**
 * A race ahead changes what "Skapa block" plans (docs/decisions/fartlek-race-blocks.md). An A race: the blocks counted
 * back from it; within 8 weeks the build and the form-peak block are planned together, further out only the first
 * block (which puts the runner in phase). A B race inside the block's weeks: the block ends with its race week.
 */
type RacePlan = { race: { name: string; date: ISODate; priority: "A" | "B" }; weeksToRace: number; chunks: RaceChunk[]; now: number };
function racePlanFor(race: { name: string; date: ISODate; priority?: string } | null, startWeek: ISODate, weeks: number): { plan: RacePlan; weeks: number; roles: WeekRole[] | null } | null {
  if (!race || race.date < startWeek) return null;
  const priority: "A" | "B" = race.priority === "A" ? "A" : "B";
  const weeksToRace = Math.floor(daysBetween(startWeek, race.date) / 7) + 1;
  const r = { name: race.name, date: race.date, priority };
  if (priority === "B") {
    if (weeksToRace > weeks) return null;
    const roles = raceRoles(weeksToRace, "B");
    return { plan: { race: r, weeksToRace, chunks: [{ weeks: weeksToRace, kind: "build", roles }], now: 1 }, weeks: weeksToRace, roles };
  }
  const chunks = raceChunks(weeksToRace);
  const near = weeksToRace <= RACE_TOGETHER_WEEKS;
  const now = near ? chunks.length : 1;
  const planWeeks = chunks.slice(0, now).reduce((a, c) => a + c.weeks, 0);
  return { plan: { race: r, weeksToRace, chunks, now }, weeks: planWeeks, roles: near ? raceRoles(weeksToRace, "A") : chunks[0].roles };
}
/** The roles of a re-plan's weeks when a race is in them: counted back from the race; weeks after it lighter. */
function replanRace(race: { date: ISODate; priority?: string }, startWeek: ISODate, weeks: number): { roles: WeekRole[]; race: { date: ISODate; priority: "A" | "B" } } | null {
  const at = Math.floor(daysBetween(startWeek, race.date) / 7);
  if (at < 0 || at >= weeks) return null;
  const priority: "A" | "B" = race.priority === "A" ? "A" : "B";
  const roles: WeekRole[] = [...raceRoles(at + 1, priority), ...Array<WeekRole>(weeks - at - 1).fill("lighter")];
  return { roles, race: { date: race.date, priority } };
}

/** Within this many weeks of an A race, the build block and the form-peak block are planned together. */
const RACE_TOGETHER_WEEKS = 8;

/** An A or B race close enough to the block that race mode should plan it instead (BLOCK.raceWindowWeeks). */
function raceNear(ctx: Ctx, startWeek: ISODate, workouts: Workout[], end: ISODate): Race | { name: string; date: ISODate } | null {
  const window = addDays(startWeek, BLOCK.raceWindowWeeks * 7);
  const race = repo.listRaces(ctx.db, ctx.userId).find((r) => (r.priority === "A" || r.priority === "B") && r.date >= startWeek && r.date <= window);
  if (race) return race;
  const w = workouts.find((x) => x.type === "race" && x.date <= end);
  return w ? { name: w.notes ?? "", date: w.date } : null;
}

/** An A or B race in the `days` before the block (on the race list or as a session): recover first. */
function raceJustRun(ctx: Ctx, startWeek: ISODate, days = BLOCK.afterRaceDays) {
  const from = addDays(startWeek, -days), to = addDays(startWeek, -1);
  return repo.listRaces(ctx.db, ctx.userId).find((r) => (r.priority === "A" || r.priority === "B") && r.date >= from && r.date <= to)
    ?? repo.listWorkouts(ctx.db, ctx.userId, from, to).map((w) => (w.type === "race" && w.status !== "dropped" ? { name: w.notes ?? "", date: w.date } : null)).find(Boolean)
    ?? null;
}

/** A race in the weeks left of a block, or within the coach's race window after it: race mode plans those weeks. */
function raceInOpenWeeks(ctx: Ctx, from: ISODate, end: ISODate) {
  const to = addDays(end, COACH.race.afterDays);
  return repo.listRaces(ctx.db, ctx.userId).find((r) => (r.priority === "A" || r.priority === "B") && r.date >= from && r.date <= to)
    ?? repo.listWorkouts(ctx.db, ctx.userId, from, end).map((w) => (w.type === "race" ? { name: w.notes ?? "", date: w.date } : null)).find(Boolean)
    ?? null;
}

/** Run km per week for the `weeks` weeks before `weekStart`, oldest first (actual, planned ahead). */

/** The block engine's seed for `weeks` weeks from `startWeek` (a week that hasn't started). */
function blockSeedFor(ctx: Ctx, startWeek: ISODate, weeks: number, o: { goalKm: number | null; buildWeeksDone: number; lighterLast: boolean; light?: boolean; lighterWeeks?: boolean[]; roles?: WeekRole[] | null; race?: BlockSeed["race"] }): BlockSeed {
  const w = seedFor(ctx, startWeek, { formOverTarget: true });
  const seed: BlockSeed = {
    startWeek, weeks, ctl: w.ctl, atl: w.atl, kmBefore: w.kmBefore, past: w.past,
    tolerance: tolerance(weeksBefore(ctx, startWeek, BLOCK.tolerance.lookbackWeeks)),
    runDays: w.runDays, longRunDay: w.longRunDay, threshold: w.threshold, refs: w.refs, crossMin: w.crossMin,
    lighterLast: o.lighterLast, goalKm: o.goalKm, buildWeeksDone: o.buildWeeksDone, hardBefore: hardOn(ctx, addDays(startWeek, -1)),
    // The same rule as "Föreslå veckan": a lighter week due before the block makes its first week lighter.
    lighterFirst: !!o.light || (o.buildWeeksDone === 0 && w.backoff),
    lighterFirstWhy: o.light ? "light" : o.buildWeeksDone === 0 && w.backoff ? w.backoffWhy ?? "form" : null,
    longestKm: w.longestKm, rung: w.rung, tempoPace: w.tempoPace,
    ...(o.lighterWeeks ? { lighterWeeks: o.lighterWeeks } : {}),
    ...(o.race ? { race: o.race } : {}),
  };
  // A tired start makes a race plan's first build week lighter, as it does a block's.
  if (o.roles) {
    const roles = [...o.roles];
    // Never two lighter weeks in a row: a short in-phase block (build, lighter) becomes lighter, build.
    if (seed.lighterFirst && roles[0] === "build") { roles[0] = "lighter"; if (roles[1] === "lighter") roles[1] = "build"; }
    seed.roles = roles;
  }
  return seed;
}

/**
 * The running week can start a block from today when no block holds it and at least `BLOCK.minDaysLeft` days of it
 * are left: a runner on a Monday with nothing planned shouldn't have to wait a week.
 */
function runningWeekOpen(ctx: Ctx, blocks: Block[]): ISODate | null {
  const running = weekStartOf(ctx.today, ctx.settings.weekStart);
  const left = daysBetween(ctx.today, addDays(running, 6)) + 1;
  return left >= BLOCK.minDaysLeft && !overlapping(blocks, running, addDays(running, 6)) ? running : null;
}

/**
 * The first week the dialog offers: the running week when it is open, else the week after the last block that
 * hasn't ended, or next week. The default is the running week only when nothing is planned in what is left of it.
 */
function startWeeks(ctx: Ctx, blocks: Block[]): { earliest: ISODate; byDefault: ISODate } {
  const next = weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart);
  const ends = blocks.map(blockEnd).filter((e) => e >= ctx.today).sort();
  const after = ends.length ? addDays(ends.at(-1)!, 1) : next;
  const later = after > next ? after : next;
  const running = runningWeekOpen(ctx, blocks);
  if (!running) return { earliest: later, byDefault: later };
  const empty = !plannedIn(ctx, running, addDays(running, 6)).some((w) => w.type !== "rest");
  return { earliest: running, byDefault: empty ? running : later };
}

function startParam(ctx: Ctx, v: unknown, blocks: Block[]): ISODate {
  const ws = v == null || v === "" ? startWeeks(ctx, blocks).byDefault : date(v, "startWeek");
  if (weekStartOf(ws, ctx.settings.weekStart) !== ws) throw new BadRequest("startWeek must be the first day of a week");
  if (ws <= ctx.today && ws !== runningWeekOpen(ctx, blocks)) throw new BadRequest("startWeek must be a week that hasn't started, or the running week with days left");
  return ws;
}

const weeksParam = (v: unknown) => {
  const n = v == null || v === "" ? BLOCK.maxWeeks : num(v, "weeks", BLOCK.minWeeks, BLOCK.maxEditWeeks);
  if (!Number.isInteger(n)) throw new BadRequest("weeks must be a whole number");
  return n;
};

const overlapping = (blocks: Block[], from: ISODate, to: ISODate, except?: number) =>
  blocks.find((b) => b.id !== except && b.startWeek <= to && blockEnd(b) >= from) ?? null;

/** Every week's sessions from the client, in week order. */
function parseWeeks(ctx: Ctx, raw: unknown, startWeek: ISODate, weeks: number): SuggestItem[][] {
  if (!Array.isArray(raw) || raw.length !== weeks) throw new BadRequest(`weeks must hold ${weeks} weeks of sessions`);
  return raw.map((items, i) => parseItems(ctx, items, addDays(startWeek, i * 7), `weeks[${i}]`));
}

/** The shown set must still be exactly what is planned: something added meanwhile refuses the write. */
const sameShown = (current: Workout[], shownRaw: unknown) => {
  const shown = new Set(Array.isArray(shownRaw) ? shownRaw.map((x: unknown) => Number(x)) : []);
  return current.length === shown.size && current.every((w) => shown.has(w.id));
};

/** Editing or re-planning a block never touches its races: they stay planned and are left out of what is replaced. */
const editable = (planned: Workout[], edit: boolean) => (edit ? planned.filter((w) => w.type !== "race") : planned);

const lighterParam = (v: unknown, n: number) => Array.from({ length: n }, (_, i) => Array.isArray(v) && v[i] === true);
const ROLES: WeekRole[] = ["build", "lighter", "taper", "race"];
/** Every week's role from the client: `roles` when sent, else build or lighter from `lighter`. */
const rolesParam = (roles: unknown, lighter: unknown, n: number): WeekRole[] => {
  const l = lighterParam(lighter, n);
  return Array.from({ length: n }, (_, i) => (Array.isArray(roles) && ROLES.includes(roles[i]) ? roles[i] as WeekRole : l[i] ? "lighter" : "build"));
};
const BLOCK_KIND_OF: Record<RaceChunk["kind"], Block["kind"]> = { inPhase: "base", build: "build", peak: "specific" };
/** The blocks to write: the parts sent (a race plan), else one base block of all the weeks. */
function blockParts(raw: unknown, n: number, name: string | null): { weeks: number; kind: Block["kind"]; name: string | null }[] {
  if (!Array.isArray(raw) || !raw.length) return [{ weeks: n, kind: "base", name }];
  const parts = raw.slice(0, 4).map((p: Record<string, unknown>, i) => ({
    weeks: Math.trunc(Number(p?.weeks)) || 0,
    kind: BLOCK_KIND_OF[p?.kind as RaceChunk["kind"]] ?? "base",
    name: optStr(p?.name, `blocks[${i}].name`, 60),
  }));
  if (parts.some((p) => p.weeks < 1) || parts.reduce((a, p) => a + p.weeks, 0) !== n) throw new BadRequest("blocks must add up to the weeks");
  return parts;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Weekly targets for the weeks written: their km, and a note on the lighter and taper weeks (a re-plan reads `backoff`). */
function writeTargets(tx: Tx, userId: number, startWeek: ISODate, weeks: SuggestItem[][], roles: (WeekRole | boolean)[]) {
  weeks.forEach((items, i) => {
    const ws = addDays(startWeek, i * 7);
    const role = roles[i] === true ? "lighter" : roles[i] === false ? "build" : roles[i];
    const target = { km: weekKm(items), minutes: null, note: role === "lighter" ? BACKOFF_NOTE : role === "taper" || role === "race" ? TAPER_NOTE : null };
    tx.insert(t.weekTargets).values({ userId, weekStart: ws, ...target })
      .onConflictDoUpdate({ target: [t.weekTargets.userId, t.weekTargets.weekStart], set: target }).run();
  });
}

export function blockPlanRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/plan/block-suggest", (c) => {
    const ctx = ctxFor(db, uid(c));
    const blocks = repo.listBlocks(db, ctx.userId);
    const { earliest, byDefault: firstStart } = startWeeks(ctx, blocks);
    const startWeek = startParam(ctx, c.req.query("startWeek"), blocks);
    const asked = weeksParam(c.req.query("weeks"));
    // An A or B race ahead decides the weeks and their roles; the rhythm asked for applies only without one.
    const raceAhead = raceNear(ctx, startWeek, repo.listWorkouts(db, ctx.userId, startWeek, addDays(startWeek, BLOCK.raceWindowWeeks * 7)), addDays(startWeek, asked * 7 - 1));
    const rp = racePlanFor(raceAhead, startWeek, asked);
    const weeks = rp ? rp.weeks : asked;
    // "1:1" (the rhythm picked in "Skapa block"): two weeks, the second lighter. The engine's own rule has no lighter week under three.
    const lighterWeeks = !rp && c.req.query("rhythm") === "1:1" && weeks === 2 ? [false, true] : undefined;
    const end = addDays(startWeek, weeks * 7 - 1);
    const block = overlapping(blocks, startWeek, end);
    if (block) return c.json({ startWeek, defaultStart: firstStart, earliest, today: ctx.today, weeks, ok: false, reason: "block", block });
    const ran = raceJustRun(ctx, startWeek);
    if (ran) return c.json({ startWeek, defaultStart: firstStart, earliest, today: ctx.today, weeks, ok: false, reason: "afterRace", race: { name: ran.name, date: ran.date } });
    // The running week is planned from today on; the days before stay as they were (shown locked with what was run).
    const from = startWeek > ctx.today ? startWeek : ctx.today;
    const replaces = replacedBy(ctx, startWeek, end);
    const { seed, suggestion, advice } = repo.tuned(db, uid(c), () => {
      // The block's weeks as a range, planned by the one engine entry (shared/planrange.ts).
      const rw = rangeWeeks({ from: startWeek, to: end }, ctx.settings.weekStart);
      const raceIn = rp && rp.roles?.includes("race") ? { date: rp.plan.race.date, priority: rp.plan.race.priority } : null;
      const seed = blockSeedFor(ctx, rw.startWeek, rw.weeks, { goalKm: null, buildWeeksDone: 0, lighterLast: true, lighterWeeks, roles: rp?.roles, race: raceIn });
      const plan = planRange(seed, { from, to: end });
      const suggestion = from > startWeek ? { ...plan.suggestion, eval: plan.eval, weeks: plan.suggestion.weeks.map((w, i) => ({ ...w, items: plan.items[i] })) } : plan.suggestion;
      // Not enough run days for the block: the dialog offers another one. Never when re-planning a running block.
      const advice = blockDaysAdvice(seed, suggestion.weeks);
      return { seed, suggestion, advice };
    });
    const next = repo.listRaces(db, ctx.userId).find((x) => (x.priority === "A" || x.priority === "B") && x.date >= startWeek) ?? null;
    const doneDays = from > startWeek ? Object.fromEntries(kmByDay(ctx, startWeek, addDays(from, -1))) : {};
    return c.json({ startWeek, defaultStart: firstStart, earliest, weeks, ok: true, seed, suggestion, replaces, advice, race: next && { name: next.name, date: next.date }, racePlan: rp?.plan ?? null, today: ctx.today, doneDays, racePace: phaseView(ctx, startWeek, weeks) });
  });

  r.post("/plan/block-suggest", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const blocks = repo.listBlocks(db, ctx.userId);
    const startWeek = startParam(ctx, b.startWeek, blocks);
    const n = Array.isArray(b.weeks) ? b.weeks.length : 0;
    // A race plan saves one block per part (the build block and the form peak); each part is a block of its own size.
    const parts = blockParts(b.blocks, n, optStr(b.name, "name", 60));
    const raceWeek = Array.isArray(b.roles) && b.roles.includes("race");
    if (n < (raceWeek ? 1 : BLOCK.minWeeks) || parts.some((p) => p.weeks > BLOCK.maxEditWeeks) || n > RACE_TOGETHER_WEEKS) throw new BadRequest(`weeks must hold ${BLOCK.minWeeks}–${BLOCK.maxEditWeeks} weeks a block`);
    const weeks = parseWeeks(ctx, b.weeks, startWeek, n);
    if (!weeks.some((w) => w.length)) throw new BadRequest("the block has no sessions");
    if (weeks.flat().some((it) => it.date < ctx.today)) throw new BadRequest("sessions can't be planned on a day that is over");
    const roles = rolesParam(b.roles, b.lighter, n);
    const end = addDays(startWeek, n * 7 - 1);
    const block = overlapping(blocks, startWeek, end);
    if (block) return c.json({ error: "overlaps another block", conflict: "block", block }, 409);
    const current = replacedBy(ctx, startWeek, end);
    if (raceJustRun(ctx, startWeek)) return c.json({ error: "a race was just run", conflict: "afterRace" }, 409);
    if (!sameShown(current, b.replace)) return c.json({ error: "the weeks changed since the suggestion", conflict: "changed" }, 409);
    const gate = racePaceGate(ctx, startWeek, n);
    if (gate.blocked) return c.json({ error: "choose the race paces first", conflict: "racePace" }, 409);
    const targetsBefore = [...repo.getTargets(db, ctx.userId, startWeek, end).values()];
    let ids: number[] = [];
    const blockIds: number[] = [];
    db.transaction((tx) => {
      for (const w of current) tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), eq(t.workouts.id, w.id))).run();
      let at = 0;
      for (const p of parts) {
        const goalKm = r1(weeks.slice(at, at + p.weeks).reduce((s, w) => s + weekKm(w), 0));
        blockIds.push(tx.insert(t.blocks).values({ userId: ctx.userId, kind: p.kind, name: p.name, note: null, startWeek: addDays(startWeek, at * 7), weeks: p.weeks, crossMin: null, goalKm }).returning().get().id);
        at += p.weeks;
      }
      ids = weeks.flatMap((items) => insertItems(tx, ctx, items));
      writeTargets(tx, ctx.userId, startWeek, weeks, roles);
    });
    gate.done();
    return c.json({ id: blockIds[0], blockIds, ids, removed: current, targetsBefore });
  });

  /** Undo a suggested block: the block, its sessions and targets go, and what they replaced comes back. */
  r.post("/plan/block-suggest/undo", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const id = idParam(String(b.id));
    // A race plan wrote more than one block: all of them go.
    const wanted = new Set([id, ...(Array.isArray(b.blockIds) ? b.blockIds.map((x: unknown) => Number(x)).filter(Number.isInteger) : [])]);
    const mine = repo.listBlocks(db, ctx.userId).filter((x) => wanted.has(x.id));
    if (!mine.some((x) => x.id === id)) return c.json({ error: "not found" }, 404);
    const from = mine.map((x) => x.startWeek).sort()[0], to = mine.map(blockEnd).sort().at(-1)!;
    const ids = Array.isArray(b.ids) ? b.ids.map((x: unknown) => Number(x)).filter(Number.isInteger) : [];
    if (ids.length > 60) throw new BadRequest("too many sessions");
    const rows = restoreRows(ctx, b.restore, from, to);
    const targets = Array.isArray(b.targetsBefore) ? (b.targetsBefore as Record<string, unknown>[]) : [];
    db.transaction((tx) => {
      runUndo(tx, ctx, ids, rows, from, to);
      tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, ctx.userId), gte(t.weekTargets.weekStart, from), lte(t.weekTargets.weekStart, to))).run();
      for (const tg of targets.slice(0, 8)) {
        const ws = date(tg.weekStart, "targetsBefore.weekStart");
        if (ws < from || ws > to) continue;
        tx.insert(t.weekTargets).values({
          userId: ctx.userId, weekStart: ws, km: typeof tg.km === "number" ? tg.km : null,
          minutes: typeof tg.minutes === "number" ? tg.minutes : null, note: typeof tg.note === "string" ? tg.note.slice(0, 200) : null,
        }).run();
      }
      for (const x of mine) tx.delete(t.blocks).where(and(eq(t.blocks.userId, ctx.userId), eq(t.blocks.id, x.id))).run();
    });
    return c.json({ ok: true });
  });

  /* ---------- Re-plan what is left of a block toward its goal ---------- */

  /**
   * The weeks of a block still to plan, and what the ones before them came to. `thisWeek` starts from the running
   * week (from today on), `extend` adds weeks to the end of the block (a pause): the same engine with other input.
   */
  function replanState(ctx: Ctx, block: Block, o: { extend?: number; thisWeek?: boolean; pause?: boolean } = {}) {
    const extend = o.extend ?? 0;
    const end = blockEnd(block);
    const open = o.thisWeek ? weekStartOf(ctx.today, ctx.settings.weekStart) : weekStartOf(addDays(ctx.today, 7), ctx.settings.weekStart);
    const first = open > block.startWeek ? open : block.startWeek;
    if (first > end) return null;
    const baseWeeks = Math.floor(daysBetween(first, end) / 7) + 1;
    const weeksLeft = baseWeeks + extend;
    const newEnd = addDays(end, extend * 7);
    // What was run before the range: up to yesterday when the range starts today or earlier in the running week.
    const doneDays = kmByDay(ctx, block.startWeek, first <= ctx.today ? addDays(ctx.today, -1) : addDays(first, -1));
    const doneKm = r1([...doneDays.values()].reduce((a, b2) => a + b2, 0));
    const doneWeeks = block.weeks - baseWeeks;
    const targets = repo.getTargets(ctx.db, ctx.userId, block.startWeek, end);
    const targetOf = (ws: ISODate) => targets.get(ws)?.km ?? null;
    const lighterLast = /backoff/i.test(targets.get(addDays(block.startWeek, (block.weeks - 1) * 7))?.note ?? "") || (block.weeks >= 3 && !targets.size);
    const allTargets = Array.from({ length: block.weeks }, (_, i) => targetOf(addDays(block.startWeek, i * 7)) ?? 0);
    const goal = block.goalKm ?? (allTargets.some((x) => x > 0) ? r1(allTargets.reduce((a, b2) => a + b2, 0)) : null);
    // A week skipped for sickness or injury is never caught up: the rest keeps its own plan.
    const sick = repo.listWorkouts(ctx.db, ctx.userId, block.startWeek, addDays(first, -1)).some((w) => w.skipReason === "sick" || w.skipReason === "injury");
    const before = Array.from({ length: weeksLeft }, (_, i) => {
      const ws = addDays(first, i * 7);
      const planned = plannedIn(ctx, ws, addDays(ws, 6)).filter((w) => w.type !== "cross" && w.type !== "rest").reduce((s, w) => s + (w.distanceKm ?? 0), 0);
      return { weekStart: ws, km: targetOf(ws) ?? r1(planned) };
    });
    const openPlanned = r1(before.reduce((s, w) => s + w.km, 0));
    // A longer block (a pause) aims at no goal: as much as is safe. Sickness keeps what was planned.
    const remaining = goal == null || extend > 0 || o.pause ? null : sick ? openPlanned : Math.max(0, r1(goal - doneKm));
    const doneBuild = Math.max(0, doneWeeks);
    return { first, weeksLeft, end, newEnd, extend, doneKm, doneDays, doneWeeks, goal, sick, before, remaining, lighterLast: lighterLast && block.weeks >= 3, doneBuild };
  }

  const replanOptions = (c: { req: { query: (k: string) => string | undefined } }) => {
    const extend = Math.min(2, Math.max(0, Math.trunc(Number(c.req.query("extend")) || 0)));
    return { extend, thisWeek: c.req.query("thisWeek") === "1", light: c.req.query("light") === "1", edit: c.req.query("edit") === "1" };
  };

  /** Extending the block must not run into the next one. */
  const extendBlocked = (ctx: Ctx, block: Block, extend: number) => {
    if (!extend) return null;
    const edge = checkEdges({ id: block.id, startWeek: block.startWeek, weeks: block.weeks + extend }, repo.listBlocks(ctx.db, ctx.userId), ctx.today);
    return !edge.ok ? edge.block : edge.pushes.length ? (repo.listBlocks(ctx.db, ctx.userId).find((x) => x.id === edge.pushes[0].id) ?? null) : null;
  };

  r.get("/blocks/:id/replan", (c) => {
    const ctx = ctxFor(db, uid(c));
    const block = repo.listBlocks(db, ctx.userId).find((x) => x.id === idParam(c.req.param("id")));
    if (!block) return c.json({ error: "not found" }, 404);
    const o = replanOptions(c);
    let s = replanState(ctx, block, o);
    if (!s) return c.json({ ok: false, reason: "nothingLeft" });
    // A pause that can't grow the block (the next block, or a race just after it, holds the end): the same call without
    // the extra week, which compresses the rest into the weeks that are left and says what gives.
    let compressed: { by: "block" | "race"; name: string } | null = null;
    if (s.extend) {
      const blocked = extendBlocked(ctx, block, s.extend);
      const raceAfter = !raceInOpenWeeks(ctx, s.first, s.end) ? raceInOpenWeeks(ctx, s.first, s.newEnd) : null;
      if (blocked || raceAfter) {
        compressed = blocked ? { by: "block", name: blocked.name ?? "" } : { by: "race", name: raceAfter!.name };
        s = replanState(ctx, block, { thisWeek: o.thisWeek, pause: true })!;
      }
    }
    const st = s;
    const race = raceInOpenWeeks(ctx, st.first, st.newEnd);
    // The range from today (or the first open week) to the block's end, planned by the one engine entry.
    const from = st.first > ctx.today ? st.first : ctx.today;
    const rw = rangeWeeks({ from, to: st.newEnd }, ctx.settings.weekStart);
    // A race in the weeks left: they are planned toward it, counted back from the race (docs/decisions/fartlek-race-blocks.md).
    const rr = race ? replanRace(race, rw.startWeek, rw.weeks) : null;
    const seed = blockSeedFor(ctx, rw.startWeek, rw.weeks, { goalKm: rr ? null : st.remaining, buildWeeksDone: st.doneBuild, lighterLast: st.lighterLast, light: o.light, roles: rr?.roles, race: rr?.race });
    const plan = repo.tuned(db, uid(c), () => planRange(seed, { from, to: st.newEnd, goalKm: st.remaining, light: o.light }));
    const replaces = editable(plannedIn(ctx, st.first, st.newEnd), true);
    const suggestion = { ...plan.suggestion, eval: plan.eval, weeks: plan.suggestion.weeks.map((w, i) => ({ ...w, items: plan.items[i] })) };
    const diff = diffPlans(seed, workoutWeeks(replaces, st.first, st.weeksLeft - st.extend), plan.items);
    return c.json({
      ok: true, block, seed, suggestion, replaces, diff, extend: st.extend, compressed,
      // Run km per day of the range's first week that is already over: the editor shows those days locked.
      done: { km: st.doneKm, weeks: st.doneWeeks, sick: st.sick, days: Object.fromEntries([...st.doneDays].filter(([d]) => d >= seed.startWeek && d < ctx.today)) },
      goal: st.goal, before: st.before, today: ctx.today,
      race: race ? { name: race.name, date: race.date } : null,
      racePace: phaseView(ctx, st.first, st.weeksLeft),
      raceDays: repo.listWorkouts(db, ctx.userId, st.first, st.newEnd).filter((w) => w.type === "race").map((w) => w.date),
    });
  });

  r.post("/blocks/:id/replan", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const block = repo.listBlocks(db, ctx.userId).find((x) => x.id === idParam(c.req.param("id")));
    if (!block) return c.json({ error: "not found" }, 404);
    const extend = Math.min(2, Math.max(0, Math.trunc(Number(b.extend) || 0)));
    const s = replanState(ctx, block, { extend, thisWeek: b.thisWeek === true, pause: b.pause === true });
    if (!s) return c.json({ error: "no weeks left to plan", conflict: "nothingLeft" }, 409);
    if (extendBlocked(ctx, block, extend)) return c.json({ error: "the longer block runs into the next one", conflict: "extend" }, 409);
    const weeks = parseWeeks(ctx, b.weeks, s.first, s.weeksLeft);
    if (weeks.flat().some((it) => it.date < ctx.today)) throw new BadRequest("sessions can't be planned on a day that is over");
    const roles = rolesParam(b.roles, b.lighter, weeks.length);
    // Races are never replaced: re-planning plans toward them.
    const current = editable(plannedIn(ctx, s.first, s.newEnd), true);
    if (!sameShown(current, b.replace)) return c.json({ error: "the weeks changed since the suggestion", conflict: "changed" }, 409);
    const goalKm = r1(s.doneKm + weeks.reduce((sum, w) => sum + weekKm(w), 0));
    const gate = racePaceGate(ctx, s.first, weeks.length);
    if (gate.blocked) return c.json({ error: "choose the race paces first", conflict: "racePace" }, 409);
    let ids: number[] = [];
    db.transaction((tx) => {
      for (const w of current) tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), eq(t.workouts.id, w.id))).run();
      ids = weeks.flatMap((items) => insertItems(tx, ctx, items));
      writeTargets(tx, ctx.userId, s.first, weeks, roles);
      tx.update(t.blocks).set({ goalKm, weeks: block.weeks + extend }).where(and(eq(t.blocks.userId, ctx.userId), eq(t.blocks.id, block.id))).run();
    });
    gate.done();
    return c.json({ ids, goalKm });
  });

  return r;
}
