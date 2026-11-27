import { eq } from "drizzle-orm";
import type { Db } from "../db";
import * as t from "../db/schema";
import * as repo from "../repo";
import { ctxFor, loadSeries, planEnd, runMetrics, stepRefs, weekSummaries, weekSummariesWithHistory, type Ctx } from "../analysis";
import { blockOn } from "../../shared/blocks";
import { addDays, monthEnd, monthStart, range, daysBetween } from "../../shared/dates";
import { summarizeMonth } from "../../shared/compliance";
import { countdown, goalPace, neededThreshold, painTrends, readiness } from "../../shared/recovery";
import { proposeThreshold, rangeCheck, sessionPoint, thresholdOn, intervalLaps, lapPace } from "../../shared/threshold";
import { gradeEasy, paceInBand } from "../../shared/zones";
import { compareWithThreshold, csZones } from "../../shared/criticalspeed";
import { carbsPerHour, durability, fuelAdvice, giScore, srpeLoad } from "../../shared/activitylog";
import { longestStep } from "../../shared/blocks";
import { longRunCatchUp, reviewWeek } from "../../shared/weekreview";
import { hardSession, keyFixes, lowFormPlan, missedSessions, movePlan, rebalance, todaySessions, tooFastEasy, tooHardPlan, TODAY } from "../../shared/today";
import { activityLoad, plannedLoad } from "../../shared/load";
import { router } from "./util";
import { bestEffortsView, perfData, racePrediction, racePredictions, vo2maxView } from "../performance";

export function readinessFor(ctx: Ctx) {
  const runs = repo.listActivities(ctx.db, ctx.userId, { from: addDays(ctx.today, -60) }).filter((a) => a.isRun);
  const daily = new Map<string, number>();
  for (const a of runs) daily.set(a.date, (daily.get(a.date) ?? 0) + a.distanceM / 1000);
  const pain = repo.listPain(ctx.db, ctx.userId, addDays(ctx.today, -90));
  const trends = painTrends(runs.map((a) => ({ id: a.id, date: a.date })), pain);
  const wellness = repo.listWellness(ctx.db, ctx.userId, addDays(ctx.today, -35));
  const checkins = repo.listCheckins(ctx.db, ctx.userId, addDays(ctx.today, -28));
  const last = loadSeries(ctx, 1).at(-1);
  const ready = readiness({ today: ctx.today, dailyKm: daily, firstActivity: repo.firstActivityDate(ctx.db, ctx.userId), tsb: last?.tsb ?? null, formPct: last?.formPct ?? null, painTrends: trends, pain, wellness, checkins });
  return { readiness: ready, trends, wellness, checkins };
}

function thresholdPoints(ctx: Ctx) {
  const flagged = repo.listActivities(ctx.db, ctx.userId).filter((a) => a.thresholdFlag);
  const lapMap = repo.lapsByActivity(ctx.db, ctx.userId);
  return flagged.map((a) => {
    const est = thresholdOn(ctx.thresholds, a.date);
    const p = sessionPoint({ date: a.date, laps: lapMap.get(a.id) ?? [] }, est?.paceSecPerKm);
    if (!p) return null;
    const iv = intervalLaps(lapMap.get(a.id) ?? [], est?.paceSecPerKm);
    const inRange = est?.paceSecPerKm ? iv.filter((l) => rangeCheck(lapPace(l), est.paceSecPerKm!) === "in").length : null;
    return { ...p, activityId: a.id, name: a.name, inRange };
  }).filter((p): p is NonNullable<typeof p> => !!p).sort((a, b) => a.date.localeCompare(b.date));
}

export function overviewRoutes(db: Db) {
  const r = router();
  const uid = (c: { get: (k: "user") => { id: number } }) => c.get("user").id;

  r.get("/home", (c) => {
    const ctx = ctxFor(db, uid(c));
    const ms = monthStart(ctx.today), me = monthEnd(ctx.today);
    // Up to the week after today at least: the key sessions ahead are checked against what was run.
    const until = addDays(ctx.today, TODAY.aheadDays);
    const sw = weekSummariesWithHistory(ctx, addDays(ctx.today, -28), me < until ? until : me);
    const weeks = sw.weeks;
    const week = weeks.find((w) => w.weekStart <= ctx.today && addDays(w.weekStart, 6) >= ctx.today)!;
    const prev4 = weeks.filter((w) => w.weekStart < week.weekStart).slice(-4);
    const ringGoal = week.targetKm ?? (prev4.length ? Math.round((prev4.reduce((a, w) => a + w.actualKm, 0) / prev4.length) * 10) / 10 || null : null);
    const monthWeeks = weeks.filter((w) => addDays(w.weekStart, 6) >= ms && w.weekStart <= me);
    const month = summarizeMonth(monthWeeks, ctx.today >= me);

    const races = repo.listRaces(db, ctx.userId).filter((x) => x.date >= ctx.today).slice(0, 3);
    let perfCache: ReturnType<typeof perfData> | null = null;
    const perf = () => (perfCache ??= perfData(ctx));
    const current = thresholdOn(ctx.thresholds, ctx.today);
    const { readiness: ready, trends, wellness, checkins } = readinessFor(ctx);
    const weekEnd = addDays(week.weekStart, 6);
    const runDays = ctx.settings.runDays;
    const missed = missedSessions(week.sessions, ctx.today).map((s) => {
      const plan = movePlan(s.workout, week.sessions, ctx.today, weekEnd, runDays);
      return { ...s, moveTo: plan?.kind === "move" ? plan.date : null, swap: plan?.kind === "swap" ? plan : null };
    });
    const lastRunA = repo.listActivities(db, ctx.userId, { limit: 20 }).find((a) => a.isRun) ?? null;
    const series = loadSeries(ctx, 42);
    const latestW = [...wellness].reverse();
    const garmin = db.select().from(t.garminAccounts).where(eq(t.garminAccounts.userId, ctx.userId)).get();
    const block = blockOn(ctx.today, repo.listBlocks(db, ctx.userId));
    // A session much harder than planned in the last days: the first step of the dial (docs/decisions/fartlek-adaptive-engine.md).
    const recent = sw.all.flatMap((w) => w.sessions).filter((x) => x.activity && (x.outcome === "done" || x.outcome === "short"));
    const hard = hardSession(recent.map((x) => ({ workout: x.workout, actual: activityLoad(x.activity!, thresholdOn(ctx.thresholds, x.workout.date)).load, planned: plannedLoad(x.workout, thresholdOn(ctx.thresholds, x.workout.date)) })), ctx.today);
    const tooHard = hard ? tooHardPlan(hard, week.sessions, ctx.today, weekEnd, runDays, { score: ready.score, units: ctx.settings.units }) : null;
    // Monday's check-in: how last week went (the card shows it through the first days of the week, docs/decisions/fartlek-adaptive-engine.md).
    const prevWeek = weeks.find((w) => w.weekStart === addDays(week.weekStart, -7));
    const review = prevWeek ? reviewWeek(prevWeek, ctx.today) : null;
    const longRun = week.sessions.find((x) => x.workout.type === "long" && x.workout.status === "planned" && (x.outcome === "to_do" || x.outcome === "upcoming"))?.workout ?? null;
    const longest = longRun?.distanceKm ? longestStep(longRun.date, longRun.distanceKm, sw.history)?.refKm ?? 0 : 0;
    const catchUp = review && review.kind === "small" ? longRunCatchUp(review, longRun, longest) : null;

    return c.json({
      today: ctx.today,
      hasData: repo.countActivities(db, ctx.userId) > 0,
      week, ringGoal, ringGoalSource: week.targetKm ? "plan" : ringGoal ? "average" : null,
      remaining: week.sessions.filter((s) => s.outcome === "to_do"),
      month: { ...month, weeks: monthWeeks.map((w) => ({ weekStart: w.weekStart, actualKm: w.actualKm, targetKm: w.targetKm, status: w.status })) },
      readiness: ready,
      painTrends: trends,
      todaySessions: todaySessions(week.sessions, ctx.today),
      review: review && { ...review, weekEnd: addDays(review.weekStart, 6), catchUp },
      tooHard,
      // The app's own easy score, the one shown next to the run, so the two never disagree.
      tooFast: tooFastEasy(sw.all.flatMap((w) => w.sessions), ctx.today, (a) => runMetrics(ctx, a).easyScore),
      missed,
      lowForm: lowFormPlan(ready.verdict, week.sessions, ctx.today, weekEnd, runDays),
      keyFixes: keyFixes(sw.all.flatMap((w) => w.sessions), sw.history, ctx.today, {
        easyPace: stepRefs(ctx, ctx.today).easyPace, thresholdPace: current?.paceSecPerKm ?? null, units: ctx.settings.units,
      }),
      feel: checkins.find((x) => x.date === ctx.today)?.feel ?? null,
      // Shown as a Garmin info row next to the signals; it doesn't affect today's form.
      bodyBattery: latestW.find((w) => w.bodyBatteryMax != null && daysBetween(w.date, ctx.today) <= 1) ?? null,
      races: races.map((x, i) => {
        const gp = x.goalSeconds ? goalPace(x.goalSeconds, x.distanceKm) : null;
        // Only the first race gets a prediction on Home; the Races page has them all.
        const p = i === 0 ? racePrediction(ctx, x, perf()) : null;
        return {
          ...x, countdown: countdown(ctx.today, x.date), goalPace: gp, neededThreshold: gp ? neededThreshold(gp, x.distanceKm) : null,
          prediction: p && { seconds: p.current?.seconds ?? null, trendPerWeek: p.trendPerWeek },
        };
      }),
      threshold: current,
      proposal: proposeThreshold(thresholdPoints(ctx), current, ctx.today),
      lastRun: lastRunA ? { ...lastRunA, ...runMetrics(ctx, lastRunA) } : null,
      fitness: series.at(-1) ?? null,
      loadTrend: series.map((p) => ({ date: p.date, ctl: p.ctl, atl: p.atl })),
      block,
      garmin: garmin ? {
        connected: true, lastSyncAt: garmin.lastSyncAt, lastError: garmin.lastError,
        daysLeft: garmin.keyExpiresOn ? daysBetween(ctx.today, garmin.keyExpiresOn) : null,
      } : { connected: false },
      // The intervals.icu add-on: which of today's workouts were sent on to the watch.
      watch: db.select({ id: t.intervalsAccounts.userId }).from(t.intervalsAccounts).where(eq(t.intervalsAccounts.userId, ctx.userId)).get()
        ? { sent: db.select({ id: t.intervalsEvents.workoutId }).from(t.intervalsEvents).where(eq(t.intervalsEvents.userId, ctx.userId)).all().map((r) => r.id) }
        : null,
    });
  });

  /** What spreading `km` struck from this week over the runs still ahead would change; nothing is saved. */
  r.get("/home/rebalance", (c) => {
    const ctx = ctxFor(db, uid(c));
    const km = Math.min(Math.max(Number(c.req.query("km")) || 0, 0), 100);
    const sw = weekSummariesWithHistory(ctx, ctx.today, ctx.today);
    const week = sw.weeks.find((w) => w.weekStart <= ctx.today && addDays(w.weekStart, 6) >= ctx.today);
    if (!week) return c.json({ changes: [], placedKm: 0, leftoverKm: km, weekKm: 0 });
    return c.json(rebalance(km, week.sessions, ctx.today, sw.history));
  });

  r.get("/trends", (c) => {
    const ctx = ctxFor(db, uid(c));
    // The window the curves cover, in weeks back from today (Statistik picks it from the chosen period).
    const nWeeks = Math.min(Math.max(Number(c.req.query("weeks")) || 12, 4), 104);
    const span = Math.max(90, nWeeks * 7);
    const from = addDays(ctx.today, -(span - 1));

    // Km per week is on Statistik's period view now; the portfolio's Fartlek landing still draws it from here.
    const weeks = weekSummaries(ctx, addDays(ctx.today, -(nWeeks * 7 - 1)), addDays(ctx.today, 28));

    const acts = repo.listActivities(db, ctx.userId, { from });
    const metrics = new Map(acts.map((a) => [a.id, runMetrics(ctx, a)]));
    const runsInWindow = acts.filter((a) => a.isRun);
    const s = ctx.settings;
    const easyRuns = runsInWindow.filter((a) => !a.thresholdFlag).map((a) => {
      const m = metrics.get(a.id)!;
      const stream = s.easyLow && s.easyHigh && a.hasDetail ? repo.getStream(db, ctx.userId, a.id) : null;
      const band = stream ? paceInBand(stream, s.easyLow!, s.easyHigh!) : null;
      return {
        id: a.id, date: a.date, km: a.distanceM / 1000, hr: a.avgHr, pace: a.distanceM ? a.durationS / (a.distanceM / 1000) : null,
        score: m.easyScore, grade: m.easyScore == null ? null : gradeEasy(m.easyScore), bandPace: band?.pace ?? null, bandHr: band ? Math.round(band.hr) : null,
      };
    }).reverse();

    const nextA = repo.listRaces(db, ctx.userId).find((x) => x.date > ctx.today && x.priority === "A" && daysBetween(ctx.today, x.date) <= 200);
    const end = planEnd(ctx);
    const pmcSeries = loadSeries(ctx, span, end ?? undefined);

    const logs = repo.logsFor(db, ctx.userId, acts.map((a) => a.id));
    const fuel = acts.flatMap((a) => {
      const l = logs.get(a.id);
      const gPerH = l ? carbsPerHour(l.carbsG, a.durationS) : null;
      if (!l || gPerH == null) return [];
      return [{ id: a.id, date: a.date, name: a.name, minutes: Math.round(a.durationS / 60), carbsG: l.carbsG!, gPerH, gi: giScore(l), nausea: l.nausea, bloating: l.bloating, cramps: l.cramps, feel: l.feel }];
    });
    const srpe = acts.flatMap((a) => {
      const l = logs.get(a.id);
      const load = l ? srpeLoad(l.rpe, a.durationS) : null;
      return load == null ? [] : [{ id: a.id, date: a.date, name: a.name, rpe: l!.rpe!, srpe: load, load: metrics.get(a.id)!.load.load, method: metrics.get(a.id)!.load.method, trimp: metrics.get(a.id)!.trimp }];
    });
    const durable = acts.filter((a) => a.isRun && a.hasDetail && a.durationS >= 75 * 60).flatMap((a) => {
      const d = durability(repo.getStream(db, ctx.userId, a.id));
      return d ? [{ id: a.id, date: a.date, name: a.name, km: a.distanceM / 1000, driftPct: d.driftPct, thirds: d.thirds }] : [];
    });

    const csTests = repo.listCsTests(db, ctx.userId);
    const best = bestEffortsView(ctx, perfData(ctx));
    const thrPace = thresholdOn(ctx.thresholds, ctx.today)?.paceSecPerKm ?? null;
    const cs = best.cs && {
      ...best.cs,
      zones: csZones({ csMps: best.cs.csMps, dPrimeM: best.cs.dPrimeM, paceSecPerKm: best.cs.paceSecPerKm, r2: best.cs.r2 }),
      comparison: thrPace ? compareWithThreshold(best.cs.paceSecPerKm, thrPace) : null,
    };

    const { trends, checkins } = readinessFor(ctx);
    const wellnessByDay = new Map(repo.listWellness(db, ctx.userId, from).map((w) => [w.date, w]));
    const points = thresholdPoints(ctx);
    const current = thresholdOn(ctx.thresholds, ctx.today);

    return c.json({
      today: ctx.today,
      from,
      weekly: weeks.map((w) => ({ weekStart: w.weekStart, actualKm: w.actualKm, plannedKm: w.targetKm, runs: w.runs, minutes: w.actualMin, status: w.status, future: w.weekStart > ctx.today })),
      load: { series: pmcSeries, race: nextA ?? null, planEnd: end },
      easy: easyRuns,
      threshold: { points, estimates: ctx.thresholds, current, proposal: proposeThreshold(points, current, ctx.today) },
      cs: { tests: csTests, latest: cs ?? null, olderTest: best.olderTest },
      vo2max: vo2maxView(ctx),
      best: { pending: best.pending, allTime: best.allTime, block: best.block, rolling: best.rolling, gapShare: best.gapShare },
      log: { fuel, fuelAdvice: fuelAdvice(fuel.map((f) => ({ date: f.date, gPerH: f.gPerH, gi: f.gi }))), srpe, durability: durable },
      pain: { trends, entries: repo.listPain(db, ctx.userId, addDays(ctx.today, -90)) },
      wellness: range(from, ctx.today).map((d) => wellnessByDay.get(d) ?? { date: d, hrvWeeklyAvg: null, hrvLastNight: null, hrvBaselineLow: null, restingHr: null, bodyBatteryMax: null, sleepScore: null }),
      checkins,
    });
  });

  r.get("/races/predictions", (c) => {
    const ctx = ctxFor(db, uid(c));
    const races = repo.listRaces(db, ctx.userId).filter((x) => x.date >= ctx.today);
    return c.json({ today: ctx.today, predictions: racePredictions(ctx, perfData(ctx), races) });
  });

  return r;
}
