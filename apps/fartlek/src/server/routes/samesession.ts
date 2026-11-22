import type { Db } from "../db";
import * as repo from "../repo";
import { ctxFor, loadSeries, stepMatchFor, weekSummaries, type Ctx } from "../analysis";
import { addDays, type ISODate } from "../../shared/dates";
import { SAME, sessionNumbers, signature, workOf, type SessionPoint } from "../../shared/samesession";
import type { WorkoutSteps } from "../../shared/steps";
import { router } from "./util";

/*
 * The same session over time (docs/decisions/fartlek-same-session.md): every run of a structured
 * session in the last year, grouped by the fingerprint of its quality work, with each run's numbers.
 * Matching laps to steps runs per activity here, as on the activity page.
 */

export interface Outline { signature: string; work: WorkoutSteps; points: SessionPoint[] }

export function outlines(ctx: Ctx): Outline[] {
  const from = addDays(ctx.today, -SAME.lookbackDays);
  const tsb = new Map(loadSeries(ctx, SAME.lookbackDays + 1).map((p) => [p.date, p.tsb] as [ISODate, number]));
  const groups = new Map<string, Outline>();
  const sessions = weekSummaries(ctx, from, ctx.today).flatMap((w) => w.sessions)
    .filter((s) => s.workout.steps && s.activity && s.activity.isRun && s.activity.date >= from)
    .sort((a, b) => a.activity!.date.localeCompare(b.activity!.date));
  const seen = new Set<string>();
  for (const s of sessions) {
    const a = s.activity!;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const sig = signature(s.workout.steps);
    if (!sig) continue;
    const m = stepMatchFor(ctx, a, s.workout.steps!, s.workout.date);
    if (!m.ok) continue;
    const n = sessionNumbers(m, a.hasDetail ? repo.getStream(ctx.db, ctx.userId, a.id) : null);
    if (!n) continue;
    const g = groups.get(sig) ?? { signature: sig, work: workOf(s.workout.steps)!, points: [] };
    g.points.push({ ...n, activityId: a.id, date: a.date, tsb: tsb.get(a.date) ?? null, elevGain: a.elevationGain });
    groups.set(sig, g);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, points: g.points.slice(-SAME.maxPoints) }))
    .sort((a, b) => b.points.length - a.points.length || b.points.at(-1)!.date.localeCompare(a.points.at(-1)!.date));
}

export function sameSessionRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  /** Every outline run at least once in the last year, most run first (the Trends card). */
  r.get("/trends/same-sessions", (c) => c.json({ outlines: outlines(ctxFor(db, uid(c))), minTimes: SAME.minTimes }));

  /** The outline this run belongs to, with its runs up to and including this one (the activity page). */
  r.get("/activities/:id/same-session", (c) => {
    const ctx = ctxFor(db, uid(c));
    const id = c.req.param("id");
    const o = outlines(ctx).find((x) => x.points.some((p) => p.activityId === id));
    if (!o) return c.json({ outline: null, minTimes: SAME.minTimes });
    const i = o.points.findIndex((p) => p.activityId === id);
    return c.json({ outline: { ...o, points: o.points.slice(0, i + 1) }, minTimes: SAME.minTimes });
  });

  return r;
}
