import type { Db } from "./db";
import * as repo from "./repo";
import { addDays, range, todayIn, weekStartOf, type ISODate } from "../shared/dates";
import { summarizeWeek, type WeekSummary } from "../shared/compliance";
import { blockEnd, markSpikes, runPoints, type RunPoint } from "../shared/blocks";
import { activityLoad, edwardsTrimp, pmc, plannedLoad, type ActivityLoad, type PmcPoint } from "../shared/load";
import { thresholdOn } from "../shared/threshold";
import { easyScore, zoneSecsFor, type ZoneSecs } from "../shared/zones";
import { isStrengthType, type Activity, type Settings, type Threshold, type Workout } from "../shared/types";
import type { StepRefs, WorkoutSteps } from "../shared/steps";
import { matchSteps, type StepMatchResult } from "../shared/stepmatch";
import { lapsFit, refineMerged, suggestFromStream, type StreamSuggestion } from "../shared/streamsteps";
import { parseFit } from "./providers/fit";

export interface Ctx { db: Db; userId: number; settings: Settings; today: ISODate; thresholds: Threshold[] }

export function ctxFor(db: Db, userId: number): Ctx {
  const settings = repo.getSettings(db, userId);
  return { db, userId, settings, today: todayIn(settings.timezone), thresholds: repo.listThresholds(db, userId) };
}

/**
 * What step targets resolve against on `date` (shared/steps.ts): the threshold valid then, the easy
 * band and zones from Settings, and a typical easy pace (median of the last six weeks' easy runs)
 * that is only used to estimate distance from time.
 */
export function stepRefs(ctx: Ctx, date: ISODate): StepRefs {
  const thr = thresholdOn(ctx.thresholds, date);
  const recent = repo.listActivities(ctx.db, ctx.userId, { from: addDays(ctx.today, -42), to: ctx.today })
    .filter((a) => a.isRun && !a.thresholdFlag && a.distanceM >= 3000 && a.durationS < 100 * 60)
    .map((a) => a.durationS / (a.distanceM / 1000))
    .sort((x, y) => x - y);
  return {
    thresholdPace: thr?.paceSecPerKm ?? null,
    thresholdHr: thr?.hr ?? null,
    easyLow: ctx.settings.easyLow,
    easyHigh: ctx.settings.easyHigh,
    zones: ctx.settings.zones,
    easyPace: recent.length ? Math.round(recent[Math.floor(recent.length / 2)]) : null,
  };
}

/** The planned session an activity counts for (as the plan pairs them), if any. */
export function sessionForActivity(ctx: Ctx, a: Activity) {
  return weekSummaries(ctx, a.date, a.date).flatMap((w) => w.sessions).find((s) => s.activity?.id === a.id) ?? null;
}

/** The activity's laps judged against its workout's steps, with the targets as they were on the workout's date. */
export function stepMatchFor(ctx: Ctx, a: Activity, steps: WorkoutSteps, date: ISODate): StepMatchResult {
  const laps = a.hasDetail ? repo.getLaps(ctx.db, ctx.userId, a.id) : [];
  const stream = a.hasDetail ? repo.getStream(ctx.db, ctx.userId, a.id) : null;
  return matchSteps(steps, laps, stream, stepRefs(ctx, date), repo.getSplits(ctx.db, ctx.userId, a.id));
}

/**
 * The step match for the activity page, plus what the stream suggests when the laps don't fit
 * (docs/decisions/fartlek-stream-steps.md). Detection reads a 1 s stream with Garmin's grade-adjusted
 * speed from the kept FIT file, parsed here and never stored; without a kept file the stored stream is used.
 */
export function stepMatchWithStream(ctx: Ctx, a: Activity, steps: WorkoutSteps, date: ISODate): { match: StepMatchResult; suggestion: StreamSuggestion | null } {
  const laps = a.hasDetail ? repo.getLaps(ctx.db, ctx.userId, a.id) : [];
  const stream = a.hasDetail ? repo.getStream(ctx.db, ctx.userId, a.id) : null;
  const refs = stepRefs(ctx, date), splits = repo.getSplits(ctx.db, ctx.userId, a.id);
  const match = matchSteps(steps, laps, stream, refs, splits);
  if (lapsFit(match) || !laps.length) return { match, suggestion: null };
  let fine = stream;
  const fit = repo.getFit(ctx.db, ctx.userId, a.id);
  if (fit) { try { fine = parseFit(fit, 1, { gap: true }).stream ?? stream; } catch { /* a broken file: the stored stream will do */ } }
  return { match: refineMerged(match, fine), suggestion: suggestFromStream(steps, laps, stream, fine, refs, splits) };
}

export function weekStarts(ctx: Ctx, from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let w = weekStartOf(from, ctx.settings.weekStart); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** Zone seconds per activity: from the stream with the user's own zones when set, else the watch's (cached per request). */
export function zonesGetter(ctx: Ctx): (a: Activity) => ZoneSecs | null {
  const cache = new Map<string, ZoneSecs | null>();
  return (a) => {
    if (!cache.has(a.id)) {
      const stream = ctx.settings.zones && a.hasDetail ? repo.getStream(ctx.db, ctx.userId, a.id) : null;
      cache.set(a.id, zoneSecsFor(a, stream, ctx.settings));
    }
    return cache.get(a.id)!;
  };
}

/**
 * Week summaries for every week touching [from, to], with easy-session share and the long-run step
 * check on planned runs. Five extra weeks before are read for the 30-day look-back (`history`).
 */
export interface Summaries { weeks: WeekSummary[]; all: WeekSummary[]; history: RunPoint[]; zonesOf: (a: Activity) => ZoneSecs | null }
export function weekSummariesWithHistory(ctx: Ctx, from: ISODate, to: ISODate): Summaries {
  const starts = weekStarts(ctx, from, to);
  const zonesOf = zonesGetter(ctx);
  if (!starts.length) return { weeks: [], all: [], history: [], zonesOf };
  const all = weekStarts(ctx, addDays(starts[0], -35), to);
  const end = addDays(starts.at(-1)!, 6);
  const workouts = repo.listWorkouts(ctx.db, ctx.userId, all[0], end);
  const acts = repo.listActivities(ctx.db, ctx.userId, { from: all[0], to: end });
  const targets = repo.getTargets(ctx.db, ctx.userId, all[0], end);
  const weeks = all.map((ws) => {
    const we = addDays(ws, 6);
    const inWeek = <T extends { date: string }>(x: T) => x.date >= ws && x.date <= we;
    return summarizeWeek(ws, workouts.filter(inWeek), acts.filter(inWeek), targets.get(ws) ?? null, ctx.today, zonesOf);
  });
  const history = runPoints(weeks);
  markSpikes(weeks, history);
  return { weeks: weeks.filter((w) => w.weekStart >= starts[0]), all: weeks, history, zonesOf };
}

export function weekSummaries(ctx: Ctx, from: ISODate, to: ISODate): WeekSummary[] {
  return weekSummariesWithHistory(ctx, from, to).weeks;
}

/** Where the plan ends: the later of the last block's end and the last planned workout; null if nothing lies ahead. */
export function planEnd(ctx: Ctx, maxDays = 200): ISODate | null {
  const lastBlock = repo.listBlocks(ctx.db, ctx.userId).map(blockEnd).sort().at(-1) ?? null;
  const lastWorkout = repo.lastPlannedDate(ctx.db, ctx.userId);
  let end = [lastBlock, lastWorkout].filter((d): d is string => !!d && d > ctx.today).sort().at(-1) ?? null;
  const cap = addDays(ctx.today, maxDays);
  if (end && end > cap) end = cap;
  return end;
}

export interface RunMetrics { zoneSecs: ZoneSecs | null; easyScore: number | null; load: ActivityLoad; trimp: number | null }

export function runMetrics(ctx: Ctx, a: Activity): RunMetrics {
  const stream = a.hasDetail ? repo.getStream(ctx.db, ctx.userId, a.id) : null;
  const zs = zoneSecsFor(a, stream, ctx.settings);
  return {
    zoneSecs: zs,
    easyScore: a.isRun ? easyScore(zs, stream, ctx.settings) : null,
    load: activityLoad(a, thresholdOn(ctx.thresholds, a.date)),
    trimp: edwardsTrimp(zs),
  };
}

/** Daily load over all activities (CTL needs the full history). */
/**
 * Today's planned sessions that haven't been run yet: a run session while no run is synced today, other
 * sports while no other activity is. Projections treat today as history and start the plan tomorrow, so
 * without these a morning projection drops the day's session (its km and its load).
 */
export function openToday(ctx: Ctx): Workout[] {
  const acts = repo.listActivities(ctx.db, ctx.userId, { from: ctx.today, to: ctx.today });
  const ranToday = acts.some((a) => a.isRun), gymToday = acts.some((a) => isStrengthType(a.typeKey)), otherToday = acts.some((a) => !a.isRun && !isStrengthType(a.typeKey));
  return repo.listWorkouts(ctx.db, ctx.userId, ctx.today, ctx.today).filter((w) =>
    w.status === "planned" && w.type !== "rest" && (w.type === "strength" ? !gymToday : w.type === "cross" ? !otherToday : !ranToday));
}

/** Actual load per day, with today's not-yet-run sessions counted as planned (see openToday). */
export function loadsWithToday(ctx: Ctx): Map<ISODate, number> {
  const m = dailyLoads(ctx);
  const thr = thresholdOn(ctx.thresholds, ctx.today);
  const open = openToday(ctx).reduce((s, w) => s + plannedLoad(w, thr), 0);
  if (open) m.set(ctx.today, (m.get(ctx.today) ?? 0) + open);
  return m;
}

export function dailyLoads(ctx: Ctx): Map<ISODate, number> {
  const m = new Map<ISODate, number>();
  for (const a of repo.listActivities(ctx.db, ctx.userId)) {
    const l = activityLoad(a, thresholdOn(ctx.thresholds, a.date)).load;
    m.set(a.date, (m.get(a.date) ?? 0) + l);
  }
  return m;
}

/** CTL/ATL/TSB for the window, optionally projected through planned workouts up to `until` (the plan's end, never past it). */
export function loadSeries(ctx: Ctx, days: number, until?: ISODate): PmcPoint[] {
  const loads = dailyLoads(ctx);
  const from = addDays(ctx.today, -(days - 1));
  let future: Map<ISODate, number> | undefined;
  if (until && until > ctx.today) {
    future = new Map(range(addDays(ctx.today, 1), until).map((d) => [d, 0]));
    const current = thresholdOn(ctx.thresholds, ctx.today);
    for (const w of repo.listWorkouts(ctx.db, ctx.userId, addDays(ctx.today, 1), until)) {
      future.set(w.date, (future.get(w.date) ?? 0) + plannedLoad(w, current));
    }
  }
  return pmc(loads, from, ctx.today, future);
}
