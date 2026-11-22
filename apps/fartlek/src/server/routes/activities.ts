import { and, eq } from "drizzle-orm";
import type { Config } from "../config";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { ctxFor, runMetrics, sessionForActivity, stepMatchWithStream, weekSummaries, type Ctx } from "../analysis";
import { addDays } from "../../shared/dates";
import { DETAIL_VERSION, garminProviderFor } from "../sync";
import { afterResult, raceCandidate } from "../races";
import { thresholdOn, intervalLaps, lapPace, rangeCheck } from "../../shared/threshold";
import { hrHistogram, paceInBand } from "../../shared/zones";
import { looksLikeThreshold } from "../../shared/matching";
import { PAIN_AREAS, type Activity, type Stream } from "../../shared/types";
import { carbsPerHour, durability, giScore, srpeLoad, type ActivityLog } from "../../shared/activitylog";
import { body, date, idParam, num, oneOf, optNum, optStr, router } from "./util";
import { FEELS, type Feel } from "../../shared/today";

/** Average cadence while moving (cadence above 100 spm, so standing still and walking breaks don't pull it down). */
export function avgCadence(stream: Stream | null): number | null {
  const xs = (stream?.cad ?? []).filter((c): c is number => c != null && c > 100);
  return xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null;
}

/** The workout this run counts for and, when it has steps, how each step went. */
function plannedFor(ctx: Ctx, a: Activity) {
  const s = a.isRun ? sessionForActivity(ctx, a) : null;
  if (!s) return null;
  if (!s.workout.steps) return { workout: s.workout, match: null, suggestion: null };
  return { workout: s.workout, ...stepMatchWithStream(ctx, a, s.workout.steps, s.workout.date) };
}

export function activityRoutes(db: Db, config: Config) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/activities", (c) => {
    const ctx = ctxFor(db, uid(c));
    const limit = Math.min(Number(c.req.query("limit")) || 30, 200);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);
    const all = repo.listActivities(db, ctx.userId, { limit: limit + offset + 1 });
    const page = all.slice(offset, offset + limit);
    const pain = repo.listPain(db, ctx.userId, page.at(-1)?.date);
    return c.json({
      items: page.map((a) => {
        const m = runMetrics(ctx, a);
        return { ...a, easyScore: m.easyScore, load: m.load, suggestedThreshold: !a.thresholdFlag && looksLikeThreshold(a), pain: pain.filter((p) => p.activityId === a.id) };
      }),
      more: all.length > offset + limit,
    });
  });

  // Before /activities/:id, which would take "latest-structured" for an id.
  /** The latest run that counts for a workout with steps (last eight weeks), for the "Show me" tour. */
  r.get("/activities/latest-structured", (c) => {
    const ctx = ctxFor(db, uid(c));
    const s = weekSummaries(ctx, addDays(ctx.today, -56), ctx.today).flatMap((w) => w.sessions)
      .filter((x) => x.workout.steps && x.activity).sort((a, b) => (a.activity!.date < b.activity!.date ? 1 : -1))[0];
    return c.json({ id: s?.activity?.id ?? null });
  });

  r.get("/activities/:id", (c) => {
    const ctx = ctxFor(db, uid(c));
    const a = repo.getActivity(db, ctx.userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const m = runMetrics(ctx, a);
    const laps = repo.getLaps(db, ctx.userId, a.id);
    const est = thresholdOn(ctx.thresholds, a.date);
    const ivIdx = new Set(intervalLaps(laps, est?.paceSecPerKm).map((l) => l.index));
    const stream = a.hasDetail ? repo.getStream(db, ctx.userId, a.id) : null;
    const log = repo.getLog(db, ctx.userId, a.id);
    const step = stream ? Math.max(1, Math.ceil(stream.t.length / 400)) : 1;
    const row = db.select({ s: t.activities.detailStatus, e: t.activities.detailError }).from(t.activities).where(and(eq(t.activities.userId, ctx.userId), eq(t.activities.id, a.id))).get();
    return c.json({
      activity: a,
      metrics: m,
      detailStatus: row?.s, detailError: row?.e,
      laps: laps.map((l) => {
        const isInterval = a.thresholdFlag && ivIdx.has(l.index);
        return { ...l, pace: l.distanceM > 0 ? lapPace(l) : null, isInterval, range: isInterval && est?.paceSecPerKm ? rangeCheck(lapPace(l), est.paceSecPerKm) : null };
      }),
      estimate: est,
      histogram: stream ? hrHistogram(stream) : [],
      bandPace: stream && ctx.settings.easyLow && ctx.settings.easyHigh ? paceInBand(stream, ctx.settings.easyLow, ctx.settings.easyHigh) : null,
      series: stream ? stream.t.filter((_, i) => i % step === 0).map((tt, j) => {
        const i = j * step;
        return { t: tt, hr: stream.hr[i], pace: stream.speed[i] && stream.speed[i]! > 0.5 ? 1000 / stream.speed[i]! : null, alt: stream.alt[i], cad: stream.cad?.[i] ?? null };
      }) : [],
      avgCadence: avgCadence(stream),
      pain: repo.listPain(db, ctx.userId).filter((p) => p.activityId === a.id),
      suggestedThreshold: !a.thresholdFlag && looksLikeThreshold(a),
      log,
      logMetrics: { srpe: srpeLoad(log.rpe, a.durationS), gPerH: carbsPerHour(log.carbsG, a.durationS), gi: giScore(log) },
      durability: a.isRun ? durability(stream) : null,
      planned: plannedFor(ctx, a),
      ...raceCandidate(ctx, a.id),
    });
  });

  /** "Yes, it was a race": the result goes on the race planned that day, or on a new past race. */
  r.post("/activities/:id/race", async (c) => {
    const ctx = ctxFor(db, uid(c));
    const a = repo.getActivity(db, ctx.userId, c.req.param("id"));
    if (!a || !a.isRun) return c.json({ error: "not found" }, 404);
    const b = await body(c);
    const name = optStr(b.name, "name", 80) || a.name;
    const distanceKm = optNum(b.distanceKm, "distance", 0.1, 1000) ?? Math.round(a.distanceM / 100) / 10;
    const resultSeconds = optNum(b.resultSeconds, "result", 60, 7 * 86400) ?? Math.round(a.durationS);
    const planned = repo.listRaces(db, ctx.userId).find((x) => x.date === a.date && (x.resultSeconds == null || x.activityId === a.id));
    let id: number;
    if (planned) {
      db.update(t.races).set({ name, distanceKm, resultSeconds, activityId: a.id }).where(and(eq(t.races.userId, ctx.userId), eq(t.races.id, planned.id))).run();
      id = planned.id;
    } else {
      id = db.insert(t.races).values({ userId: ctx.userId, name, date: a.date, distanceKm, resultSeconds, activityId: a.id, priority: "B" }).returning({ id: t.races.id }).get().id;
    }
    afterResult(ctx, id);
    return c.json(raceCandidate(ctx, a.id));
  });

  /** "No, an ordinary run": not asked again. */
  r.post("/activities/:id/not-race", (c) => {
    db.update(t.activities).set({ notRace: true }).where(and(eq(t.activities.userId, uid(c)), eq(t.activities.id, c.req.param("id")))).run();
    return c.json({ ok: true });
  });

  /**
   * Split a lap where a lap press was forgotten (`atS`, seconds from the start), or take the stream's
   * step changes as a whole (`all`); only step judging changes.
   */
  r.post("/activities/:id/splits", async (c) => {
    const ctx = ctxFor(db, uid(c));
    const a = repo.getActivity(db, ctx.userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const b = await body(c);
    if (Array.isArray(b.all)) {
      // The stream's step changes taken as a whole: they replace any earlier splits.
      if (!b.all.length || b.all.length > 100) return c.json({ error: "all: 1–100 split times" }, 400);
      const all = b.all.map((x: unknown, i: number) => Math.round(num(x, `all[${i}]`, 1, a.durationS * 3)));
      repo.replaceSplits(db, ctx.userId, a.id, all);
    } else {
      repo.addSplit(db, ctx.userId, a.id, Math.round(num(b.atS, "atS", 1, a.durationS * 3)));
    }
    return c.json({ planned: plannedFor(ctx, a) });
  });
  r.delete("/activities/:id/splits", (c) => {
    const ctx = ctxFor(db, uid(c));
    const a = repo.getActivity(db, ctx.userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    repo.clearSplits(db, ctx.userId, a.id);
    return c.json({ planned: plannedFor(ctx, a) });
  });

  /** Threshold flag (old 3.10). Laps are needed, so a missing detail is fetched first; a failed fetch leaves the run unflagged. */
  r.post("/activities/:id/flag", async (c) => {
    const userId = uid(c);
    const flag = !!(await body(c)).flag;
    const a = repo.getActivity(db, userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    if (flag && !a.hasDetail && a.isRun) {
      const provider = a.id.startsWith("garmin:") ? garminProviderFor(db, config, userId) : null;
      if (provider) {
        try {
          const d = await provider.detail(a.id);
          repo.saveDetail(db, userId, a.id, d, DETAIL_VERSION);
        } catch (e) {
          return c.json({ error: `Could not download laps: ${(e as Error).message}` }, 502);
        }
      }
    }
    db.update(t.activities).set({ thresholdFlag: flag }).where(and(eq(t.activities.userId, userId), eq(t.activities.id, a.id))).run();
    return c.json({ ok: true });
  });

  r.post("/activities/:id/detail", async (c) => {
    const userId = uid(c);
    const a = repo.getActivity(db, userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const provider = garminProviderFor(db, config, userId);
    if (!provider || !a.id.startsWith("garmin:")) return c.json({ error: "No Garmin connection for this activity" }, 400);
    try {
      const d = await provider.detail(a.id);
      repo.saveDetail(db, userId, a.id, d, DETAIL_VERSION);
      return c.json({ ok: true });
    } catch (e) {
      return c.json({ error: (e as Error).message }, 502);
    }
  });

  /** What the runner writes per activity: note, sRPE, carbs and stomach. Replaces the whole log; an empty one deletes it. */
  r.put("/activities/:id/log", async (c) => {
    const userId = uid(c);
    const a = repo.getActivity(db, userId, c.req.param("id"));
    if (!a) return c.json({ error: "not found" }, 404);
    const b = await body(c);
    const scale = (v: unknown, n: string) => { const x = optNum(v, n, 0, 10); return x == null ? null : Math.round(x); };
    const carbs = optNum(b.carbsG, "carbsG", 0, 1500);
    const log: ActivityLog = {
      note: optStr(b.note, "note", 1000),
      rpe: scale(b.rpe, "rpe"),
      carbsG: carbs == null ? null : Math.round(carbs),
      nausea: scale(b.nausea, "nausea"),
      bloating: scale(b.bloating, "bloating"),
      cramps: scale(b.cramps, "cramps"),
      feel: scale(b.feel, "feel"),
    };
    repo.saveLog(db, userId, a.id, log);
    return c.json({ ok: true });
  });

  r.post("/pain", async (c) => {
    const b = await body(c);
    const userId = uid(c);
    const activityId = optStr(b.activityId, "activity", 100);
    if (activityId && !repo.getActivity(db, userId, activityId)) return c.json({ error: "activity not found" }, 400);
    db.insert(t.painEntries).values({
      userId, date: date(b.date), activityId, area: oneOf(b.area, PAIN_AREAS, "area"),
      level: Math.round(num(b.level, "level", 0, 10)), note: optStr(b.note, "note", 300),
    }).run();
    return c.json({ ok: true });
  });
  r.delete("/pain/:id", (c) => {
    db.delete(t.painEntries).where(and(eq(t.painEntries.userId, uid(c)), eq(t.painEntries.id, idParam(c.req.param("id"))))).run();
    return c.json({ ok: true });
  });

  r.put("/checkins/:date", async (c) => {
    const d = date(c.req.param("date"));
    const b = await body(c);
    const scale = (v: unknown, n: string) => { const x = optNum(v, n, 1, 5); return x == null ? null : Math.round(x); };
    const vals = { soreness: scale(b.soreness, "soreness"), note: optStr(b.note, "note", 300) };
    db.insert(t.checkins).values({ userId: uid(c), date: d, ...vals }).onConflictDoUpdate({ target: [t.checkins.userId, t.checkins.date], set: vals }).run();
    return c.json({ ok: true });
  });
  /** Only the feel answer, so the rest of the day's check-in stays as it is. */
  r.put("/checkins/:date/feel", async (c) => {
    const d = date(c.req.param("date"));
    const b = await body(c);
    if (b.feel !== null && !FEELS.includes(b.feel as Feel)) return c.json({ error: "feel" }, 400);
    const feel = (b.feel as Feel | null) ?? null;
    db.insert(t.checkins).values({ userId: uid(c), date: d, feel }).onConflictDoUpdate({ target: [t.checkins.userId, t.checkins.date], set: { feel } }).run();
    return c.json({ ok: true });
  });

  return r;
}
