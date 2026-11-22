import { addDays, daysBetween, type ISODate } from "./dates";
import { plannedKmOf, summarizeMonth, type SessionView, type Spike, type WeekStatus, type WeekSummary } from "./compliance";
import { intensityDistribution, type Distribution, type ZoneSecs } from "./zones";
import { BLOCK_KEY_TYPES, RUN_WORKOUT_TYPES, type Activity, type Block, type Msg, type Race } from "./types";

/*
 * Training blocks (docs/decisions/runplan-training-blocks.md). A block is start week + number of weeks;
 * workouts belong to whichever block covers their date. Blocks never overlap; gaps are "no block".
 */

export const blockEnd = (b: Pick<Block, "startWeek" | "weeks">): ISODate => addDays(b.startWeek, b.weeks * 7 - 1);
export const blockOn = <B extends Pick<Block, "startWeek" | "weeks">>(date: ISODate, blocks: B[]): B | null =>
  blocks.find((b) => b.startWeek <= date && blockEnd(b) >= date) ?? null;

/* ---------- Edges: overlap and pushing the next block on ---------- */

export interface Push { id: number; name: string | null; kind: Block["kind"]; weeks: number }
export type EdgeCheck =
  | { ok: true; pushes: Push[] }
  | { ok: false; reason: "overlap" | "started"; block: Block };

/**
 * Can `candidate` (a new or changed block) take its range? A block starting before it that reaches into
 * it is a hard overlap. Blocks starting inside it would have to be pushed on (later), cascading to the
 * blocks after them; a block that has already started is never pushed. The caller asks before pushing.
 */
export function checkEdges(candidate: { id?: number; startWeek: ISODate; weeks: number }, blocks: Block[], today: ISODate): EdgeCheck {
  const others = blocks.filter((b) => b.id !== candidate.id).sort((a, b) => a.startWeek.localeCompare(b.startWeek));
  const end = blockEnd(candidate);
  const before = others.find((b) => b.startWeek < candidate.startWeek && blockEnd(b) >= candidate.startWeek);
  if (before) return { ok: false, reason: "overlap", block: before };
  const pushes: Push[] = [];
  let reach = end;
  for (const b of others.filter((x) => x.startWeek >= candidate.startWeek)) {
    if (b.startWeek > reach) break;
    if (b.startWeek <= today) return { ok: false, reason: "started", block: b };
    const weeks = Math.floor(daysBetween(b.startWeek, reach) / 7) + 1;
    pushes.push({ id: b.id, name: b.name, kind: b.kind, weeks });
    reach = addDays(blockEnd(b), weeks * 7);
  }
  return { ok: true, pushes };
}

/* ---------- Long-run step (spike) check ---------- */

export interface RunPoint { date: ISODate; km: number }
export const SPIKE_LIMIT = 0.1;
/** A long run lifted after an unexplained miss (docs/decisions/fartlek-adaptive-engine.md) carries this tag in its notes and may go this far over. */
export const CATCHUP_TAG = "[catch-up]";
export const CATCHUP_LIMIT = 0.15;
export const spikeLimitOf = (w: { notes: string | null }) => (w.notes?.includes(CATCHUP_TAG) ? CATCHUP_LIMIT : SPIKE_LIMIT);

/** Longest run in the 30 days before `date` and how much longer `km` is. */
export function longestStep(date: ISODate, km: number, history: RunPoint[]): { refKm: number; pct: number } | null {
  const from = addDays(date, -30);
  let ref = 0;
  for (const p of history) if (p.date >= from && p.date < date && p.km > ref) ref = p.km;
  return ref > 0 ? { refKm: Math.round(ref * 10) / 10, pct: km / ref - 1 } : null;
}

/**
 * A spike: more than 10 % over the longest run of the 30 days before, with the suggestion engine's rounding
 * to the half km (`spikeMax` in nextweek.ts), so the plan never flags a session the engine suggested.
 */
export function spikeOf(date: ISODate, km: number, history: RunPoint[], limit = SPIKE_LIMIT): Spike | null {
  const s = longestStep(date, km, history);
  const max = s ? Math.round(s.refKm * (1 + limit) * 2) / 2 : 0;
  return s && s.pct > limit && km > max + 0.05 ? { km, refKm: s.refKm, pct: Math.round(s.pct * 100) / 100 } : null;
}

const plannedRun = (s: SessionView) =>
  (s.outcome === "upcoming" || s.outcome === "to_do") && RUN_WORKOUT_TYPES.includes(s.workout.type) && plannedKmOf(s.workout) > 0;

/** Runs that happened plus runs still planned, for the 30-day look-back. */
export function runPoints(weeks: WeekSummary[]): RunPoint[] {
  const out: RunPoint[] = [];
  for (const w of weeks) {
    for (const s of w.sessions) {
      if (s.activity?.isRun) out.push({ date: s.activity.date, km: s.activity.distanceM / 1000 });
      else if (plannedRun(s)) out.push({ date: s.workout.date, km: plannedKmOf(s.workout) });
    }
    for (const a of w.extras) if (a.isRun) out.push({ date: a.date, km: a.distanceM / 1000 });
  }
  return out;
}

/** Mark planned runs (not races) that step up more than 10 % over the longest run of the previous 30 days. */
export function markSpikes(weeks: WeekSummary[], history = runPoints(weeks)) {
  for (const w of weeks) for (const s of w.sessions) {
    if (plannedRun(s) && s.workout.type !== "race") s.spike = spikeOf(s.workout.date, plannedKmOf(s.workout), history, spikeLimitOf(s.workout));
  }
}

/* ---------- Block summary ---------- */

export type BlockStatus = WeekStatus;

export interface BlockWeek {
  weekStart: ISODate;
  targetKm: number | null;
  actualKm: number;
  keyPlanned: number;
  keyDone: number;
  easyShare: number | null;
  status: WeekStatus;
  backoff: boolean;
  finished: boolean;
  current: boolean;
}

export interface BlockSummary {
  start: ISODate;
  end: ISODate;
  /** 1-based week we are in, null outside the block. */
  weekNo: number | null;
  finishedWeeks: number;
  /** Over finished weeks: planned (target) vs run; `totalKm` is the whole block's plan. */
  volume: { targetKm: number; actualKm: number; pct: number | null; totalKm: number; doneKm: number };
  /** Threshold, intervals and long: done vs planned over finished weeks; `total` in the whole block. */
  key: { planned: number; done: number; total: number };
  /** Z1–2 share on easy/long sessions run so far. */
  easy: { share: number | null; count: number };
  distribution: Distribution;
  longest: { km: number; date: ISODate; planned: boolean; refKm: number | null; pct: number | null } | null;
  status: BlockStatus;
  reasons: Msg[];
  weeks: BlockWeek[];
}

const isKey = (s: SessionView) => BLOCK_KEY_TYPES.includes(s.workout.type) && s.workout.status !== "dropped";
const keyDone = (s: SessionView) => s.outcome === "done" || s.outcome === "short";

/**
 * Judge a block only on what the plan states (decision "On track"): volume over finished weeks with the
 * month's tolerance, plus key sessions done vs planned (more than one missed, and over a quarter, is behind).
 * Intensity is reported separately and never changes the status.
 */
export function summarizeBlock(
  block: Pick<Block, "startWeek" | "weeks">,
  weeks: WeekSummary[],
  today: ISODate,
  opts: { zonesOf?: (a: Activity) => ZoneSecs | null; history?: RunPoint[] } = {},
): BlockSummary {
  const start = block.startWeek, end = blockEnd(block);
  const inBlock = weeks.filter((w) => w.weekStart >= start && w.weekStart <= end);
  const finished = inBlock.filter((w) => addDays(w.weekStart, 6) < today);
  const zonesOf = opts.zonesOf ?? ((a: Activity) => a.zoneSecs);
  const sessions = inBlock.flatMap((w) => w.sessions);
  const finishedSessions = finished.flatMap((w) => w.sessions);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const r1 = (n: number) => Math.round(n * 10) / 10;

  const targetKm = r1(sum(finished.map((w) => w.targetKm ?? 0)));
  const actualKm = r1(sum(finished.map((w) => w.actualKm)));
  const totalKm = r1(sum(inBlock.map((w) => w.targetKm ?? 0)));
  // Everything run in the block so far, the current week included (display only; the status judges finished weeks).
  const doneKm = r1(sum(inBlock.map((w) => w.actualKm)));
  const key = { planned: finishedSessions.filter(isKey).length, done: finishedSessions.filter((s) => isKey(s) && keyDone(s)).length, total: sessions.filter(isKey).length };

  let easyLow = 0, easyAll = 0, easyCount = 0;
  for (const s of sessions) {
    if (!s.activity?.isRun || (s.workout.type !== "easy" && s.workout.type !== "long")) continue;
    const z = zonesOf(s.activity);
    const tot = z ? sum(z) : 0;
    if (!z || !tot) continue;
    easyLow += z[0] + z[1]; easyAll += tot; easyCount++;
  }
  const runs = inBlock.flatMap((w) => [...w.sessions.flatMap((s) => (s.activity ? [s.activity] : [])), ...w.extras]).filter((a) => a.isRun);
  const distribution = intensityDistribution(runs.map(zonesOf));

  // Longest run in the block: the longest that happened, or a longer one still planned.
  const history = opts.history ?? runPoints(weeks);
  let longest: BlockSummary["longest"] = null;
  for (const a of runs) if (!longest || a.distanceM / 1000 > longest.km) longest = { km: r1(a.distanceM / 1000), date: a.date, planned: false, refKm: null, pct: null };
  for (const s of sessions) {
    if (!plannedRun(s) || s.workout.type === "race") continue;
    const km = plannedKmOf(s.workout);
    if (!longest || km > longest.km) longest = { km: r1(km), date: s.workout.date, planned: true, refKm: null, pct: null };
  }
  if (longest) {
    const step = longestStep(longest.date, longest.km, history);
    if (step) { longest.refKm = step.refKm; longest.pct = Math.round(step.pct * 100) / 100; }
  }

  const reasons: Msg[] = [];
  let status: BlockStatus;
  if (start > today) status = "upcoming";
  else if (!totalKm && !key.total) status = "no_plan";
  else if (!finished.length) status = "in_progress";
  else {
    const vol = summarizeMonth(finished, true);
    reasons.push(...vol.reasons);
    if (key.planned) reasons.push({ key: "reason.keyOf", params: { done: key.done, planned: key.planned } });
    const missedKeys = key.planned - key.done;
    const keysBehind = missedKeys > 1 && missedKeys / key.planned > 0.25;
    if (vol.status === "overreaching") status = "overreaching";
    else if (vol.status === "behind" || keysBehind) status = "behind";
    else if (finished.length < inBlock.length && vol.status === "no_plan" && !key.planned) status = "in_progress";
    else status = "on_track";
  }

  const weekNo = today >= start && today <= end ? Math.floor(daysBetween(start, today) / 7) + 1 : null;
  return {
    start, end, weekNo, finishedWeeks: finished.length,
    volume: { targetKm, actualKm, pct: targetKm ? Math.round((actualKm / targetKm) * 100) : null, totalKm, doneKm },
    key,
    easy: { share: easyAll ? easyLow / easyAll : null, count: easyCount },
    distribution,
    longest,
    status, reasons,
    weeks: inBlock.map((w) => {
      const s = w.sessions.filter(isKey);
      return {
        weekStart: w.weekStart, targetKm: w.targetKm, actualKm: w.actualKm, keyPlanned: s.length, keyDone: s.filter(keyDone).length,
        easyShare: w.easyShare, status: w.status, backoff: w.backoff,
        finished: addDays(w.weekStart, 6) < today, current: w.weekStart <= today && addDays(w.weekStart, 6) >= today,
      };
    }),
  };
}

/* ---------- Races: taper suggestion and volume / long-run hints ---------- */

export const TAPER_WEEKS = 2;
export const TAPER_CUT = [0.4, 0.6] as const;

export type RaceDistance = "half" | "marathon" | "other";
export const raceDistance = (km: number): RaceDistance => (Math.abs(km - 21.1) < 0.6 ? "half" : Math.abs(km - 42.2) < 1 ? "marathon" : "other");

export type Band = "low" | "mid" | "ok" | "high";
export interface RaceHints {
  /** Taper suggestion for A races: two weeks before, volume −40–60 %, keep intensity and frequency. */
  taper: { from: ISODate; to: ISODate; baseKm: number | null; lowKm: number | null; highKm: number | null } | null;
  /** Average weekly km and longest run 6–2 weeks before the race (run where past, planned where ahead), with the band it falls in. */
  build: { from: ISODate; to: ISODate; weeklyKm: number | null; longestKm: number | null; volume: Band | null; long: Band | null; kind: "half" | "marathon" } | null;
}

/**
 * Hints from Bosquet 2007 (taper) and Fokkema 2020 (volume and longest run 2–6 weeks out), both
 * "you might want to…", never pass/fail. `weeks` must cover the 6 weeks before the race.
 *   half:     > 32 km/week and a longest run > 21 km went with faster times.
 *   marathon: > 65 km/week faster, < 40 slower; longest < 25 km slower, > 35 km no extra gain.
 */
export function raceHints(race: Pick<Race, "date" | "distanceKm" | "priority">, weeks: WeekSummary[], weekStart: (d: ISODate) => ISODate): RaceHints {
  const raceWeek = weekStart(race.date);
  const taperFrom = addDays(raceWeek, -7 * (TAPER_WEEKS - 1));
  const buildFrom = addDays(raceWeek, -7 * 6), buildTo = addDays(taperFrom, -1);
  const buildWeeks = weeks.filter((w) => w.weekStart >= buildFrom && w.weekStart <= buildTo);
  const volumeOf = (w: WeekSummary) => (w.status === "upcoming" || w.status === "in_progress" ? Math.max(w.actualKm, w.targetKm ?? 0) : w.actualKm);
  // Nothing run or planned in the window says nothing yet: no "0 km/week" for a race months away.
  const known = buildWeeks.some((w) => volumeOf(w) > 0);
  const weeklyKm = buildWeeks.length && known ? Math.round(buildWeeks.reduce((a, w) => a + volumeOf(w), 0) / buildWeeks.length) : null;
  let longestKm: number | null = null;
  for (const p of runPoints(buildWeeks)) if (longestKm == null || p.km > longestKm) longestKm = Math.round(p.km * 10) / 10;

  let taper: RaceHints["taper"] = null;
  if (race.priority === "A") {
    const base = weeklyKm || null;
    taper = { from: taperFrom, to: addDays(race.date, -1), baseKm: base, lowKm: base ? Math.round(base * (1 - TAPER_CUT[1])) : null, highKm: base ? Math.round(base * (1 - TAPER_CUT[0])) : null };
  }
  const kind = raceDistance(race.distanceKm);
  let build: RaceHints["build"] = null;
  if (kind === "half") {
    build = { from: buildFrom, to: buildTo, weeklyKm, longestKm, kind,
      volume: weeklyKm == null ? null : weeklyKm > 32 ? "ok" : "low",
      long: longestKm == null ? null : longestKm > 21 ? "ok" : "low" };
  } else if (kind === "marathon") {
    build = { from: buildFrom, to: buildTo, weeklyKm, longestKm, kind,
      volume: weeklyKm == null ? null : weeklyKm > 65 ? "ok" : weeklyKm < 40 ? "low" : "mid",
      long: longestKm == null ? null : longestKm < 25 ? "low" : longestKm > 35 ? "high" : "ok" };
  }
  return { taper, build };
}
