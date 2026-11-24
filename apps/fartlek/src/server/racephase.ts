import { and, eq } from "drizzle-orm";
import * as t from "./db/schema";
import * as repo from "./repo";
import { stepMatchFor, type Ctx } from "./analysis";
import { perfData } from "./performance";
import { addDays, daysBetween, type ISODate } from "../shared/dates";
import { AUTO_WINDOW_DAYS, autoCriticalSpeed, bestCurve, chooseCs, predictRace, trainingContext } from "../shared/bestefforts";
import { HALF_M, MARATHON_M } from "../shared/racemodels";
import { RACE_PHASE, racePace, type PaceChoice, type PaceSource, type PaceView, type RacePaceResult, type RacePaceView } from "../shared/racephase";
import type { SessionView } from "../shared/compliance";
import { injuryStop, type InjuryStop } from "../shared/recovery";
import { stepSummary } from "../shared/stepmatch";
import { thresholdOn } from "../shared/threshold";
import type { Race } from "../shared/types";

/*
 * The paces of the race-specific phase and their lock (docs/decisions/fartlek-race-specific-phase.md): MP and HMP
 * come from today's prediction, are locked when the phase starts, and only change when the runner says so.
 */

export interface PhaseRace { race: Race; kind: "marathon" | "half"; /** Weeks in phase: the race week is 1. */ wip: number }

const kindOf = (km: number): "marathon" | "half" | null =>
  Math.abs(km - MARATHON_M / 1000) <= 1 ? "marathon" : Math.abs(km - HALF_M / 1000) <= 1 ? "half" : null;

/** The next A race on or after the week, when it is a marathon or half and the week is inside its last 8 weeks. */
export function phaseRace(ctx: Ctx, weekStart: ISODate): PhaseRace | null {
  const race = repo.listRaces(ctx.db, ctx.userId).find((r) => r.priority === "A" && r.date >= weekStart);
  const kind = race && kindOf(race.distanceKm);
  if (!race || !kind) return null;
  const wip = Math.floor(daysBetween(weekStart, race.date) / 7) + 1;
  return wip <= RACE_PHASE.weeks ? { race, kind, wip } : null;
}

/** The first of `weeks` weeks from `startWeek` that is in a phase. */
export function phaseRaceIn(ctx: Ctx, startWeek: ISODate, weeks: number): PhaseRace | null {
  for (let i = 0; i < weeks; i++) {
    const p = phaseRace(ctx, addDays(startWeek, i * 7));
    if (p) return p;
  }
  return null;
}

/** What `racePace` needs, from today's best efforts and the race. */
function inputs(ctx: Ctx, race: Race, choice: PaceChoice | null) {
  const d = perfData(ctx);
  const chosen = chooseCs(autoCriticalSpeed(d.efforts, ctx.today), d.tests, ctx.today);
  const curve = bestCurve(d.efforts, addDays(ctx.today, -(AUTO_WINDOW_DAYS - 1)), ctx.today);
  const training = trainingContext(d.runs, ctx.today);
  const pace = (m: number) => { const p = predictRace(m / 1000, chosen?.cs ?? null, curve, training); return p ? p.seconds / (m / 1000) : null; };
  return {
    distanceKm: race.distanceKm, predMp: pace(MARATHON_M), predHmp: pace(HALF_M), csMps: chosen?.cs.csMps ?? null,
    goalSeconds: race.goalSeconds, thresholdPace: thresholdOn(ctx.thresholds, ctx.today)?.paceSecPerKm ?? null, choice,
  };
}

/** Real injury now (pain of level 8 or more, or level 5 or more on 3 days, in the last week); null when there is none. */
export const injuryNow = (ctx: Ctx): InjuryStop | null => injuryStop(repo.listPain(ctx.db, ctx.userId, addDays(ctx.today, -RACE_PHASE.injury.windowDays)), ctx.today);

/**
 * The runner should not be pushed deeper: pain of level 5 or more in the last week, or under half of the judged work reps in
 * target in either of the last two tagged sessions that were run (`sessions`, oldest first).
 */
export function backOffNow(ctx: Ctx, sessions: SessionView[]): boolean {
  const L = RACE_PHASE.injury;
  if (repo.listPain(ctx.db, ctx.userId, addDays(ctx.today, -L.windowDays)).some((p) => p.level >= L.repeatLevel && p.date <= ctx.today)) return true;
  const ran = sessions.filter((s) => s.workout.blueprint && s.activity && s.workout.steps && (s.outcome === "done" || s.outcome === "short"))
    .sort((a, b) => a.workout.date.localeCompare(b.workout.date)).slice(-2);
  return ran.some((s) => {
    const m = stepSummary(stepMatchFor(ctx, s.activity!, s.workout.steps!, s.workout.date));
    return !!m && m.workJudged > 0 && m.workIn / m.workJudged < RACE_PHASE.paceMissShare;
  });
}

const view = (r: RacePaceResult): PaceView => ({ mp: r.mp, hmp: r.hmp, source: r.source, overCap: r.overCap });

/** The paces the phase uses for a race, and the question the runner must answer first, if any. */
export function racePaceView(ctx: Ctx, ph: PhaseRace): RacePaceView {
  const { race } = ph;
  const base = { raceId: race.id, name: race.name, date: race.date, kind: ph.kind, wip: ph.wip, injury: injuryNow(ctx) };
  const prediction = racePace(inputs(ctx, race, null));
  const goalPaces = race.goalSeconds ? racePace(inputs(ctx, race, "goal")) : null;
  if (race.paceLockedOn == null) {
    return { ...base, paces: view(prediction), locked: false, lockedOn: null,
      question: prediction.ask ? { kind: "choose", current: null, prediction: view(prediction), goal: goalPaces && view(goalPaces) } : null };
  }
  const source = (race.paceSource ?? "none") as PaceSource;
  const current: PaceView = { mp: race.mpSec, hmp: race.hmpSec, source, overCap: false };
  // A B race run after the paces were locked, inside the phase: the runner decides whether to take its news in.
  const b = repo.listRaces(ctx.db, ctx.userId).some((x) => x.priority === "B" && x.resultSeconds != null && x.date > race.paceLockedOn! && x.date <= ctx.today && x.date < race.date);
  return { ...base, paces: current, locked: true, lockedOn: race.paceLockedOn,
    question: b ? { kind: "recalc", current, prediction: view(prediction), goal: goalPaces && view(goalPaces) } : null };
}

/** Lock a race's paces: the prediction, the goal, or (re-stamping the date) the paces already locked. */
export function lockRacePace(ctx: Ctx, race: Race, choice: PaceChoice | "keep" | null): void {
  const today = ctx.today;
  if (choice === "keep") {
    ctx.db.update(t.races).set({ paceLockedOn: today }).where(and(eq(t.races.userId, ctx.userId), eq(t.races.id, race.id))).run();
    return;
  }
  const p = racePace(inputs(ctx, race, choice));
  // With nothing to go on there is nothing to lock: the zone targets stay a proposal until there is.
  if (p.source === "none") return;
  ctx.db.update(t.races).set({ mpSec: p.mp, hmpSec: p.hmp, paceSource: p.source, paceLockedOn: today }).where(and(eq(t.races.userId, ctx.userId), eq(t.races.id, race.id))).run();
}

/** What a request that plans `weeks` weeks from `startWeek` shows: the phase's paces, or null outside a phase. */
export function phaseView(ctx: Ctx, startWeek: ISODate, weeks: number): RacePaceView | null {
  const ph = phaseRaceIn(ctx, startWeek, weeks);
  return ph ? racePaceView(ctx, ph) : null;
}

/**
 * Before a write of phase weeks: a pending question stops it (409 `racePace`); with nothing locked the proposal is
 * locked once the write has gone through (`done`). Outside a phase it does nothing.
 */
export function racePaceGate(ctx: Ctx, startWeek: ISODate, weeks: number): { blocked: boolean; done: () => void } {
  const ph = phaseRaceIn(ctx, startWeek, weeks);
  if (!ph) return { blocked: false, done: () => {} };
  const v = racePaceView(ctx, ph);
  if (v.question) return { blocked: true, done: () => {} };
  return { blocked: false, done: () => { if (!v.locked) lockRacePace(ctx, ph.race, null); } };
}
