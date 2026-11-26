import type { Db } from "../db";
import * as repo from "../repo";
import { ctxFor, weekSummaries, type Ctx } from "../analysis";
import { backfillUserBands, ensureBands, rowsOf, toBands } from "../bands";
import { easyShareOf, paceBand, sumBands, targetRace } from "../../shared/bands";
import { addDays, addMonths, daysBetween, isoWeek, monthEnd, monthStart, weekStartOf, type ISODate } from "../../shared/dates";
import { plannedKmOf } from "../../shared/compliance";
import { thresholdOn } from "../../shared/threshold";
import { KEY_TYPES, RUN_WORKOUT_TYPES, type Activity } from "../../shared/types";
import type { BandSecs, Period, PeriodTotals, RunRow, StatsResponse } from "../../shared/periodstats";
import { BadRequest, isDate, router } from "./util";

/** Longest period accepted, in days. */
export const MAX_PERIOD_DAYS = 400;
/** Weeks the timeline shows at least, and the longest span it covers. */
export const TIMELINE_WEEKS = 12;
export const MAX_TIMELINE_DAYS = 3 * 366;

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** This month from day 1 to today, against the same day numbers of last month. */
export function defaultPeriods(today: ISODate): { a: Period; b: Period } {
  const prevStart = addMonths(today, -1);
  const day = Number(today.slice(8, 10));
  const prevEnd = addDays(prevStart, Math.min(day, Number(monthEnd(prevStart).slice(8, 10))) - 1);
  return { a: { from: monthStart(today), to: today }, b: { from: prevStart, to: prevEnd } };
}

function period(from: unknown, to: unknown, name: string): Period {
  if (!isDate(from) || !isDate(to)) throw new BadRequest(`${name} needs two dates as YYYY-MM-DD`);
  if (from > to) throw new BadRequest(`${name} ends before it starts`);
  if (daysBetween(from, to) + 1 > MAX_PERIOD_DAYS) throw new BadRequest(`${name} is longer than ${MAX_PERIOD_DAYS} days`);
  return { from, to };
}

const present = (...vs: (string | undefined)[]) => vs.some((v) => v !== undefined && v !== "");

/** A and B from the query; A alone is compared with the same number of days just before it. */
export function parsePeriods(q: { from?: string; to?: string; cmpFrom?: string; cmpTo?: string }, today: ISODate): { a: Period; b: Period } {
  const def = defaultPeriods(today);
  const a = present(q.from, q.to) ? period(q.from, q.to, "from/to") : def.a;
  let b: Period;
  if (present(q.cmpFrom, q.cmpTo)) b = period(q.cmpFrom, q.cmpTo, "cmpFrom/cmpTo");
  else if (present(q.from, q.to)) {
    const len = daysBetween(a.from, a.to) + 1;
    b = { from: addDays(a.from, -len), to: addDays(a.from, -1) };
  } else b = def.b;
  const lo = a.from < b.from ? a.from : b.from, hi = a.to > b.to ? a.to : b.to;
  if (daysBetween(lo, hi) + 1 > MAX_TIMELINE_DAYS) throw new BadRequest(`the two periods lie more than ${MAX_TIMELINE_DAYS} days apart`);
  return { a, b };
}

const within = (p: Period) => (d: ISODate) => d >= p.from && d <= p.to;

/** Planned against done in a period: the run sessions dated in it, matched to runs as the plan pairs them. */
function planOf(ctx: Ctx, p: Period): { plan: PeriodTotals["plan"]; kinds: Map<string, string> } {
  const kinds = new Map<string, string>();
  const plan = { km: 0, doneKm: 0, sessions: 0, doneSessions: 0, key: 0, doneKey: 0, long: 0, doneLong: 0 };
  for (const w of weekSummaries(ctx, p.from, p.to)) {
    for (const s of w.sessions) {
      if (s.activity) kinds.set(s.activity.id, s.workout.type);
      const wo = s.workout;
      if (wo.date < p.from || wo.date > p.to || !RUN_WORKOUT_TYPES.includes(wo.type) || wo.status === "dropped") continue;
      const done = s.outcome === "done" || s.outcome === "short";
      plan.km += plannedKmOf(wo);
      plan.sessions++;
      if (done) { plan.doneSessions++; plan.doneKm += (s.activity?.isRun ? s.activity.distanceM : 0) / 1000; }
      if (KEY_TYPES.includes(wo.type)) { plan.key++; if (done) plan.doneKey++; }
      if (wo.type === "long") { plan.long++; if (done) plan.doneLong++; }
    }
  }
  return { plan: { ...plan, km: round1(plan.km), doneKm: round1(plan.doneKm) }, kinds };
}

export function statsFor(db: Db, userId: number, q: Parameters<typeof parsePeriods>[0]): StatsResponse {
  const ctx = ctxFor(db, userId);
  const { a, b } = parsePeriods(q, ctx.today);
  const inA = within(a), inB = within(b);
  const { pendingFirst, pending: allPending } = ensureBands(db, userId, 1500, (d) => inA(d) || inB(d));
  // What the budget left goes on in the background, so a reload finds it done.
  if (allPending > 0) void backfillUserBands(db, userId).catch((e) => console.warn(`bands ${userId}: ${(e as Error).message}`));
  const rows = rowsOf(db, userId);
  const bandsOf = (x: Activity): BandSecs => {
    const r = rows.get(x.id);
    return r ? toBands(r) : { totalS: x.durationS, zones: x.zoneSecs ?? [0, 0, 0, 0, 0], belowS: 0, atS: 0, overS: 0, targetS: 0 };
  };

  const side = (p: Period) => {
    const runs = repo.listActivities(db, userId, { from: p.from, to: p.to }).filter((x) => x.isRun)
      .sort((x, y) => y.startTimeLocal.localeCompare(x.startTimeLocal));
    const { plan, kinds } = planOf(ctx, p);
    const list: RunRow[] = runs.map((x) => ({
      id: x.id, date: x.date, name: x.name, distanceKm: round2(x.distanceM / 1000), durationS: x.durationS, kind: kinds.get(x.id) ?? null, bands: bandsOf(x),
    }));
    const sum = sumBands(list.map((r) => r.bands));
    const totals: PeriodTotals = {
      ...sum, period: p, runs: runs.length,
      distanceKm: round1(runs.reduce((s, x) => s + x.distanceM, 0) / 1000),
      longestKm: round1(Math.max(0, ...runs.map((x) => x.distanceM)) / 1000),
      easyShare: easyShareOf(sum), plan,
    };
    return { totals, list };
  };
  const A = side(a), B = side(b);

  // Timeline: Monday weeks over both periods, at least TIMELINE_WEEKS back from the latest one.
  const last = weekStartOf(a.to > b.to ? a.to : b.to, "monday");
  const lo = weekStartOf(a.from < b.from ? a.from : b.from, "monday");
  const firstWeek = addDays(last, -7 * (TIMELINE_WEEKS - 1)) < lo ? addDays(last, -7 * (TIMELINE_WEEKS - 1)) : lo;
  const end = addDays(last, 6);
  const km = new Map<ISODate, number>();
  for (const x of repo.listActivities(db, userId, { from: firstWeek, to: end })) {
    if (!x.isRun) continue;
    const w = weekStartOf(x.date, "monday");
    km.set(w, (km.get(w) ?? 0) + x.distanceM / 1000);
  }
  const weeks: StatsResponse["weeks"] = [];
  for (let w = firstWeek; w <= last; w = addDays(w, 7)) weeks.push({ weekStart: w, week: isoWeek(w), km: round1(km.get(w) ?? 0) });
  const blocks = repo.listBlocks(db, userId)
    .filter((bl) => bl.startWeek <= end && addDays(bl.startWeek, bl.weeks * 7 - 1) >= firstWeek)
    .sort((x, y) => x.startWeek.localeCompare(y.startWeek))
    .map((bl) => ({ id: bl.id, name: bl.name ?? bl.kind, startWeek: bl.startWeek, weeks: bl.weeks }));

  const thr = thresholdOn(ctx.thresholds, ctx.today)?.paceSecPerKm ?? null;
  const tgt = targetRace(repo.listRaces(db, userId), ctx.today);
  return {
    a: A.totals, b: B.totals,
    threshold: thr ? paceBand(thr) : null,
    target: tgt ? { ...paceBand(tgt.pace), raceName: tgt.race.name, distanceKm: tgt.race.distanceKm, goalSeconds: tgt.race.goalSeconds } : null,
    runs: A.list, runsB: B.list, weeks, blocks, pending: pendingFirst,
  };
}

export function statsRoutes(db: Db) {
  const r = router();
  r.get("/stats", (c) => c.json(statsFor(db, c.get("user").id, c.req.query())));
  return r;
}
