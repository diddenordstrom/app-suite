import * as repo from "./repo";
import type { Ctx } from "./analysis";
import { ensureEfforts, listEfforts, listRunSummaries } from "./efforts";
import { addDays, weekStartOf, type ISODate } from "../shared/dates";
import { blockEnd } from "../shared/blocks";
import {
  AUTO_WINDOW_DAYS, autoCriticalSpeed, bestCurve, chooseCs, comparePeriods, predictRace, predictionHistory, rollingPeriods, trainingContext,
  type ComparePeriods, type CsTestLike, type CurvePoint, type DatedEffort, type Estimate, type RunSummary, type TrainingContext,
} from "../shared/bestefforts";
import { trendPerStep } from "../shared/racemodels";
import type { Race } from "../shared/types";

/** How many weeks back the prediction line goes. */
export const PREDICTION_WEEKS = 26;

export interface PerfData { efforts: DatedEffort[]; tests: CsTestLike[]; runs: RunSummary[]; pending: number }

/** Efforts (extracting any that are waiting, within a time budget) and CS tests, loaded once per request. */
export function perfData(ctx: Ctx): PerfData {
  const pending = ensureEfforts(ctx.db, ctx.userId);
  return { efforts: listEfforts(ctx.db, ctx.userId), tests: repo.listCsTests(ctx.db, ctx.userId), runs: listRunSummaries(ctx.db, ctx.userId), pending };
}

const curves = (p: ComparePeriods, efforts: DatedEffort[]) => ({
  ...p,
  currentCurve: bestCurve(efforts, p.current.from, p.current.to),
  previousCurve: bestCurve(efforts, p.previous.from, p.previous.to),
});

/** Best-pace curve with both comparisons, and critical speed chosen as today. */
export function bestEffortsView(ctx: Ctx, d: PerfData) {
  const blocks = repo.listBlocks(ctx.db, ctx.userId).map((b) => ({ from: b.startWeek, to: blockEnd(b), name: b.name, kind: b.kind })).sort((a, b) => a.from.localeCompare(b.from));
  const byBlock = comparePeriods(ctx.today, blocks);
  const rolling = curves(rollingPeriods(ctx.today), d.efforts);
  const recent = d.efforts.filter((e) => e.date >= addDays(ctx.today, -(AUTO_WINDOW_DAYS - 1)));
  const auto = autoCriticalSpeed(d.efforts, ctx.today);
  const chosen = chooseCs(auto, d.tests, ctx.today);
  // The estimate at the end of the comparison's previous period, for "−6 s/km since then".
  const prevEnd = (byBlock.kind === "block" ? byBlock : rolling).previous.to;
  const before = chooseCs(autoCriticalSpeed(d.efforts, prevEnd), d.tests, prevEnd);
  return {
    pending: d.pending,
    allTime: bestCurve(d.efforts, null, ctx.today),
    block: byBlock.kind === "block" ? curves(byBlock, d.efforts) : null,
    rolling,
    /** Share of the last 84 days' runs measured with grade-adjusted speed. */
    gapShare: recent.length ? Math.round((new Set(recent.filter((e) => e.gap).map((e) => e.activityId)).size / new Set(recent.map((e) => e.activityId)).size) * 100) / 100 : null,
    cs: chosen && {
      source: chosen.source,
      csMps: chosen.cs.csMps, dPrimeM: chosen.cs.dPrimeM, paceSecPerKm: chosen.cs.paceSecPerKm, r2: chosen.cs.r2,
      testDate: chosen.source === "test" ? chosen.date : null,
      auto: auto && { csMps: auto.csMps, dPrimeM: auto.dPrimeM, paceSecPerKm: auto.paceSecPerKm, r2: auto.r2, efforts: auto.efforts, newest: auto.newest },
      before: before ? { paceSecPerKm: before.cs.paceSecPerKm, date: prevEnd } : null,
    },
    /** The newest test that lost to the automatic estimate, so the card can say why it isn't used. */
    olderTest: chosen?.source === "auto" ? d.tests.filter((x) => x.date <= ctx.today).at(-1) ?? null : null,
  };
}

/** Week ends from `weeks` weeks back up to today (today is the last point). */
export function weekEnds(ctx: Ctx, weeks = PREDICTION_WEEKS): ISODate[] {
  const out: ISODate[] = [];
  for (let w = weekStartOf(addDays(ctx.today, -weeks * 7), ctx.settings.weekStart); addDays(w, 6) < ctx.today; w = addDays(w, 7)) out.push(addDays(w, 6));
  out.push(ctx.today);
  return out;
}

export interface RacePredictionView {
  raceId: number;
  current: { seconds: number; model: "cs" | "riegel" | "marathon" | "between"; from: CurvePoint | null; estimates: Estimate[] | null } | null;
  /** Seconds per week, least squares over the last 8 weekly points; negative = getting faster. */
  trendPerWeek: number | null;
  history: { date: ISODate; seconds: number | null }[];
  training: TrainingContext;
}

export function racePrediction(ctx: Ctx, race: Race, d: PerfData, ends = weekEnds(ctx)): RacePredictionView {
  const chosen = chooseCs(autoCriticalSpeed(d.efforts, ctx.today), d.tests, ctx.today);
  const training = trainingContext(d.runs, ctx.today);
  const p = predictRace(race.distanceKm, chosen?.cs ?? null, bestCurve(d.efforts, addDays(ctx.today, -(AUTO_WINDOW_DAYS - 1)), ctx.today), training);
  const hist = predictionHistory(race.distanceKm, d.efforts, d.tests, ends, d.runs);
  const trend = trendPerStep(hist.map((h) => h.seconds));
  return {
    raceId: race.id,
    current: p ? { seconds: p.seconds, model: p.model, from: p.from ?? null, estimates: p.estimates ?? null } : null,
    trendPerWeek: trend == null ? null : Math.round(trend),
    history: hist.map((h) => ({ date: h.date, seconds: h.seconds })),
    training,
  };
}

/** Predictions for the given races. */
export function racePredictions(ctx: Ctx, d: PerfData, races: Race[]): RacePredictionView[] {
  const ends = weekEnds(ctx);
  return races.map((r) => racePrediction(ctx, r, d, ends));
}

/** Garmin's running VO2max for Trends: a year of daily values and the change over the last 8 weeks. */
export function vo2maxView(ctx: Ctx) {
  const rows = repo.listVo2max(ctx.db, ctx.userId, addDays(ctx.today, -365));
  const latest = rows.at(-1) ?? null;
  const ref = addDays(ctx.today, -56);
  const before = [...rows].reverse().find((r) => r.date <= ref) ?? null;
  return { points: rows, latest, change8w: latest && before ? Math.round((latest.value - before.value) * 10) / 10 : null };
}
