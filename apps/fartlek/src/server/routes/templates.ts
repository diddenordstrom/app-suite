import { and, asc, eq } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import { ctxFor } from "../analysis";
import { parseSteps, readSteps, stepsText } from "../../shared/steps";
import { RUN_WORKOUT_TYPES, type WorkoutType } from "../../shared/types";
import { BadRequest, body, idParam, oneOf, optStr, router } from "./util";

/*
 * The session library (docs/decisions/fartlek-session-builder.md): the runner's own templates for the
 * session builder. Steps are stored as JSON and handed out as step text in the asked language and the
 * runner's units, so a template reads the same as anything else typed in Fartlek.
 */

/** Enough for a personal library; past it, old ones should go first. */
export const MAX_TEMPLATES = 50;

export function templateRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/templates", (c) => {
    const ctx = ctxFor(db, uid(c));
    const lang = c.req.query("lang") === "sv" ? "sv" : "en";
    const rows = db.select().from(t.sessionTemplates).where(eq(t.sessionTemplates.userId, ctx.userId)).orderBy(asc(t.sessionTemplates.name)).all();
    return c.json(rows.flatMap((x) => {
      const steps = readSteps(x.steps);
      return steps ? [{ id: x.id, name: x.name, type: x.type as WorkoutType, stepsText: stepsText(steps, lang, ctx.settings.units) }] : [];
    }));
  });

  r.post("/templates", async (c) => {
    const ctx = ctxFor(db, uid(c));
    const b = await body(c);
    const name = optStr(b.name, "name", 40);
    if (!name) throw new BadRequest("name is required");
    const type = oneOf(b.type, RUN_WORKOUT_TYPES.filter((x) => x !== "race"), "type");
    if (typeof b.stepsText !== "string") throw new BadRequest("stepsText must be text");
    const parsed = parseSteps(b.stepsText, ctx.settings.units);
    if (parsed.errors.length || !parsed.steps) throw new BadRequest("steps can't be read");
    const count = db.select({ id: t.sessionTemplates.id }).from(t.sessionTemplates).where(eq(t.sessionTemplates.userId, ctx.userId)).all().length;
    if (count >= MAX_TEMPLATES) throw new BadRequest(`at most ${MAX_TEMPLATES} templates`);
    const row = db.insert(t.sessionTemplates).values({ userId: ctx.userId, name, type, steps: JSON.stringify(parsed.steps), createdAt: Date.now() }).returning({ id: t.sessionTemplates.id }).get();
    return c.json({ id: row.id }, 201);
  });

  r.delete("/templates/:id", (c) => {
    const id = idParam(c.req.param("id"));
    db.delete(t.sessionTemplates).where(and(eq(t.sessionTemplates.userId, uid(c)), eq(t.sessionTemplates.id, id))).run();
    return c.json({ ok: true });
  });

  return r;
}
