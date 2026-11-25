import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { afterResult, raceChecks, resultSuggestions } from "../races";
import { lockRacePace, phaseRace, racePaceView } from "../racephase";
import { ctxFor, stepMatchFor, stepRefs, weekSummaries, type Ctx } from "../analysis";
import { stepSummary } from "../../shared/stepmatch";
import { parseSteps, plannedFromSteps, readSteps, type WorkoutSteps } from "../../shared/steps";
import { addDays, weekStartOf } from "../../shared/dates";
import { fromUserDist } from "../../shared/format";
import { RUN_WORKOUT_TYPES, SKIP_REASONS, WORKOUT_TYPES, type WorkoutType } from "../../shared/types";
import { body, date, idParam, oneOf, optNum, optStr, router, BadRequest, isDate } from "./util";

export function planRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;
  const own = <T extends typeof t.workouts | typeof t.races>(tbl: T, userId: number, id: number) =>
    and(eq(tbl.userId, userId), eq(tbl.id, id));

  /** Everything the calendar needs for a date range. */
  r.get("/plan", (c) => {
    const ctx = ctxFor(db, uid(c));
    const from = isDate(c.req.query("from")) ? c.req.query("from")! : weekStartOf(ctx.today, ctx.settings.weekStart);
    const to = isDate(c.req.query("to")) ? c.req.query("to")! : addDays(from, 34);
    if (to < from || (Date.parse(to) - Date.parse(from)) / 864e5 > 200) throw new BadRequest("range too large");
    const weeks = weekSummaries(ctx, from, to).map((w) => ({
      ...w,
      // Structured sessions that were run carry how their reps went, for the week chip.
      sessions: w.sessions.map((s) => (s.workout.steps && s.activity
        ? { ...s, stepSummary: stepSummary(stepMatchFor(ctx, s.activity, s.workout.steps, s.workout.date)) }
        : s)),
    }));
    return c.json({
      today: ctx.today,
      weeks,
      targets: Object.fromEntries(repo.getTargets(db, ctx.userId, weeks[0]?.weekStart ?? from, to)),
      races: repo.listRaces(db, ctx.userId),
      blocks: repo.listBlocks(db, ctx.userId),
      // The race plan's targets for weeks not in a block yet (docs/decisions/fartlek-race-plan-skeleton.md). Never read as a target.
      skeleton: Object.fromEntries(repo.listPlanWeeks(db, ctx.userId, weeks[0]?.weekStart ?? from, to).filter((w) => w.km != null)
        .map((w) => [w.weekStart, { phase: w.phase, km: w.km!, longKm: w.longKm }])),
    });
  });

  const workoutFields = (b: Record<string, unknown>, partial: boolean) => {
    const out: Partial<typeof t.workouts.$inferInsert> = {};
    if (!partial || b.date !== undefined) out.date = date(b.date);
    if (!partial || b.type !== undefined) out.type = oneOf(b.type, WORKOUT_TYPES, "type");
    if (b.distanceKm !== undefined) out.distanceKm = optNum(b.distanceKm, "distance", 0, 500);
    if (b.durationMin !== undefined) out.durationMin = optNum(b.durationMin, "duration", 0, 1440);
    if (b.zone2 !== undefined) out.zone2 = !!b.zone2;
    if (b.notes !== undefined) out.notes = optStr(b.notes, "notes", 500);
    if (b.status !== undefined) out.status = oneOf(b.status, ["planned", "skipped", "dropped"] as const, "status");
    if (b.skipReason !== undefined) out.skipReason = b.skipReason === null ? null : oneOf(b.skipReason, SKIP_REASONS, "skipReason");
    if (b.manualActivityId !== undefined) out.manualActivityId = optStr(b.manualActivityId, "activity", 100);
    if (b.manualUnlinked !== undefined) out.manualUnlinked = !!b.manualUnlinked;
    return out;
  };

  /**
   * Steps from the body's `stepsText` (any language the parser reads; empty = no steps), or the
   * workout's current ones. Types without running (cross, rest, race) can't have steps. When there
   * are steps, the planned amount is derived from them for the workout's date.
   */
  const applySteps = (ctx: Ctx, b: Record<string, unknown>, f: Partial<typeof t.workouts.$inferInsert>, current: { date: string; type: string; steps: string | null } | null) => {
    let steps: WorkoutSteps | null = readSteps(current?.steps ?? null);
    if (b.stepsText !== undefined) {
      if (b.stepsText !== null && typeof b.stepsText !== "string") throw new BadRequest("stepsText must be text");
      const parsed = parseSteps(String(b.stepsText ?? ""), ctx.settings.units);
      if (parsed.errors.length) throw new BadRequest(`steps: ${parsed.errors.map((e) => `${e.key} ${JSON.stringify(e.params ?? {})}`).join("; ")}`);
      steps = parsed.steps;
    }
    const type = (f.type ?? current?.type) as WorkoutType;
    if (steps && !RUN_WORKOUT_TYPES.includes(type)) {
      if (b.stepsText) throw new BadRequest("only running workouts can have steps");
      steps = null;
    }
    if (b.stepsText === undefined && !current?.steps) return;
    f.steps = steps ? JSON.stringify(steps) : null;
    if (steps) Object.assign(f, plannedFromSteps(steps, stepRefs(ctx, f.date ?? current!.date)));
  };

  /** What step targets resolve against on a date, so the dialog can preview steps as they are typed. */
  r.get("/workouts/step-refs", (c) => {
    const ctx = ctxFor(db, uid(c));
    const d = c.req.query("date");
    return c.json(stepRefs(ctx, isDate(d) ? d! : ctx.today));
  });

  r.post("/workouts", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const f = workoutFields(b, false);
    applySteps(ctx, b, f, null);
    const row = db.insert(t.workouts).values({ userId: ctx.userId, ...f, date: f.date!, type: f.type! }).returning().get();
    return c.json(repo.toWorkout(row));
  });
  r.patch("/workouts/:id", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const where = own(t.workouts, ctx.userId, idParam(c.req.param("id")));
    const current = db.select().from(t.workouts).where(where).get();
    if (!current) return c.json({ error: "not found" }, 404);
    const f = workoutFields(b, true);
    if (f.manualActivityId) f.manualUnlinked = false;
    if (f.manualUnlinked) f.manualActivityId = null;
    if (f.status === "planned") f.skipReason = null;
    applySteps(ctx, b, f, current);
    const row = db.update(t.workouts).set(f).where(where).returning().get();
    return c.json(repo.toWorkout(row!));
  });
  r.delete("/workouts/:id", (c) => {
    db.delete(t.workouts).where(own(t.workouts, uid(c), idParam(c.req.param("id")))).run();
    return c.json({ ok: true });
  });
  /** Delete planned sessions (and optionally weekly targets) in a date range. Activities, races and blocks stay. */
  r.post("/plan/clear", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const from = date(b.from, "from"), to = date(b.to, "to");
    if (to < from) throw new BadRequest("to must be on or after from");
    let deleted = 0, targets = 0;
    db.transaction((tx) => {
      deleted = tx.delete(t.workouts).where(and(eq(t.workouts.userId, ctx.userId), gte(t.workouts.date, from), lte(t.workouts.date, to))).run().changes;
      if (b.targets) {
        targets = tx.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, ctx.userId),
          gte(t.weekTargets.weekStart, weekStartOf(from, ctx.settings.weekStart)), lte(t.weekTargets.weekStart, to))).run().changes;
      }
    });
    return c.json({ deleted, targets });
  });

  r.post("/workouts/:id/copy", async (c) => {
    const to = date((await body(c)).date);
    const src = db.select().from(t.workouts).where(own(t.workouts, uid(c), idParam(c.req.param("id")))).get();
    if (!src) return c.json({ error: "not found" }, 404);
    const row = db.insert(t.workouts).values({ userId: src.userId, date: to, type: src.type, distanceKm: src.distanceKm, durationMin: src.durationMin, zone2: src.zone2, notes: src.notes, steps: src.steps, blueprint: src.blueprint }).returning().get();
    return c.json(repo.toWorkout(row));
  });

  /** Copy `count` weeks starting at `from` so they start at `to`. Copies are plain planned workouts. */
  r.post("/weeks/copy", async (c) => {
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    const from = weekStartOf(date(b.from, "from"), ctx.settings.weekStart);
    const to = weekStartOf(date(b.to, "to"), ctx.settings.weekStart);
    const count = optNum(b.count, "count", 1, 12) ?? 1;
    const shift = (Date.parse(to) - Date.parse(from)) / 864e5;
    if (!shift) throw new BadRequest("pick a different week");
    const src = repo.listWorkouts(db, ctx.userId, from, addDays(from, count * 7 - 1));
    const targets = repo.getTargets(db, ctx.userId, from, addDays(from, count * 7 - 1));
    db.transaction((tx) => {
      for (const w of src) {
        tx.insert(t.workouts).values({
          userId: ctx.userId, date: addDays(w.date, shift), type: w.type, distanceKm: w.distanceKm, durationMin: w.durationMin, zone2: w.zone2, notes: w.notes,
          steps: w.steps ? JSON.stringify(w.steps) : null, blueprint: w.blueprint,
        }).run();
      }
      for (const [ws, tg] of targets) {
        tx.insert(t.weekTargets).values({ userId: ctx.userId, weekStart: addDays(ws, shift), ...tg })
          .onConflictDoUpdate({ target: [t.weekTargets.userId, t.weekTargets.weekStart], set: tg }).run();
      }
    });
    return c.json({ copied: src.length });
  });

  r.put("/targets/:weekStart", async (c) => {
    const ws = date(c.req.param("weekStart"), "weekStart");
    const b = await body(c);
    const ctx = ctxFor(db, uid(c));
    if (weekStartOf(ws, ctx.settings.weekStart) !== ws) throw new BadRequest("not a week start");
    const km = optNum(b.km, "km", 0, 1000);
    const vals = { km: km == null ? null : fromUserDist(km, ctx.settings.units), minutes: optNum(b.minutes, "minutes", 0, 10000), note: optStr(b.note, "note", 200) };
    if (vals.km == null && vals.minutes == null && !vals.note) {
      db.delete(t.weekTargets).where(and(eq(t.weekTargets.userId, ctx.userId), eq(t.weekTargets.weekStart, ws))).run();
    } else {
      db.insert(t.weekTargets).values({ userId: ctx.userId, weekStart: ws, ...vals }).onConflictDoUpdate({ target: [t.weekTargets.userId, t.weekTargets.weekStart], set: vals }).run();
    }
    return c.json({ ok: true });
  });

  const raceFields = (b: Record<string, unknown>) => {
    const name = optStr(b.name, "name", 80);
    if (!name) throw new BadRequest("name is required");
    return {
      name,
      date: date(b.date),
      distanceKm: optNum(b.distanceKm, "distance", 0.1, 1000) ?? 42.195,
      goalSeconds: optNum(b.goalSeconds, "goal", 60, 7 * 86400),
      priority: oneOf(b.priority ?? "A", ["A", "B", "C"] as const, "priority"),
      // Left out of an edit that doesn't send it, so changing the goal keeps the result.
      ...("resultSeconds" in b ? { resultSeconds: optNum(b.resultSeconds, "result", 60, 7 * 86400) } : {}),
    };
  };
  r.get("/races", (c) => c.json(repo.listRaces(db, uid(c))));
  r.post("/races", async (c) => {
    const row = db.insert(t.races).values({ userId: uid(c), ...raceFields(await body(c)) }).returning({ id: t.races.id }).get();
    afterResult(ctxFor(db, uid(c)), row.id);
    return c.json(repo.listRaces(db, uid(c)));
  });
  /** A race's plan rows go when the race goes, or when its date, distance or priority changes (a new goal keeps them). */
  const dropPlan = (userId: number, raceId: number) =>
    db.delete(t.racePlanWeeks).where(and(eq(t.racePlanWeeks.userId, userId), eq(t.racePlanWeeks.raceId, raceId))).run();
  r.put("/races/:id", async (c) => {
    const id = idParam(c.req.param("id"));
    const before = repo.listRaces(db, uid(c)).find((x) => x.id === id);
    const fields = raceFields(await body(c));
    db.update(t.races).set(fields).where(own(t.races, uid(c), id)).run();
    if (before && (before.date !== fields.date || before.distanceKm !== fields.distanceKm || before.priority !== fields.priority)) dropPlan(uid(c), id);
    afterResult(ctxFor(db, uid(c)), id);
    return c.json(repo.listRaces(db, uid(c)));
  });
  /**
   * The runner's answer to a pace question of the race phase: train for the "prediction" or the "goal", or "keep" the
   * paces already locked (a B race was run). Returns the phase's view after the answer.
   */
  r.post("/races/:id/race-pace", async (c) => {
    const ctx = ctxFor(db, uid(c));
    const race = repo.listRaces(db, ctx.userId).find((x) => x.id === idParam(c.req.param("id")));
    if (!race) return c.json({ error: "not found" }, 404);
    const choice = oneOf((await body(c)).choice, ["prediction", "goal", "keep"] as const, "choice");
    const ph = phaseRace(ctx, weekStartOf(ctx.today, ctx.settings.weekStart));
    if (!ph || ph.race.id !== race.id) throw new BadRequest("the race is not in its race-specific phase");
    if (choice === "goal" && !race.goalSeconds) throw new BadRequest("the race has no goal time");
    if (choice === "keep" && race.paceLockedOn == null) throw new BadRequest("no paces are locked");
    lockRacePace(ctx, race, choice === "keep" ? "keep" : choice);
    return c.json(racePaceView(ctx, { ...ph, race: repo.listRaces(db, ctx.userId).find((x) => x.id === race.id)! }));
  });
  r.delete("/races/:id", (c) => {
    const id = idParam(c.req.param("id"));
    db.delete(t.races).where(own(t.races, uid(c), id)).run();
    db.delete(t.raceChecks).where(and(eq(t.raceChecks.userId, uid(c)), eq(t.raceChecks.raceId, id))).run();
    dropPlan(uid(c), id);
    return c.json(repo.listRaces(db, uid(c)));
  });
  /** Past races' answer key: what Fartlek said the day before against the result, and runs to suggest as results. */
  r.get("/races/results", (c) => {
    const ctx = ctxFor(db, uid(c));
    return c.json({ checks: raceChecks(ctx), suggestions: resultSuggestions(ctx) });
  });

  return r;
}
