import { addDays, range, type ISODate } from "./dates";
import { blockWord, sessionText, type PlanItem } from "./blocktext";
import { fromUserDist, toUserDist, type Units } from "./format";
import { FORM, plannedLoad, pmc } from "./load";
import { parseWeekLine, splitSessions, type ParsedSession } from "./parser";
import { READINESS } from "./recovery";
import { parseSteps, plannedFromSteps, THRESHOLD_WARM_COOL_MIN, type StepItem, type StepLang, type StepRefs, type WorkoutSteps } from "./steps";
import type { Threshold, WorkoutType } from "./types";

/*
 * The block editor's coach (docs/decisions/fartlek-block-coach.md): project form (TSB) and the weekly
 * km ramp (ACWR) for the block being typed, judge it, and suggest text changes in a fixed order.
 * Everything here is pure: the server gathers history and planned load, the client shows the result.
 */

export const COACH = {
  /**
   * Form bands as a share of fitness (`formPct`, docs/decisions/fartlek-form-relative.md): the deepest build
   * week at `goal` (−10 %) or below is building; below `floor` (−30 %) is too hard. Above `goal` is calm, which
   * is fine: form is a guard against too much, not a target to reach.
   */
  goal: FORM.building,
  floor: -30,
  /** Weekly km ramp (week / mean of it and the 3 before): volume tips stay under `rampCap`, above `rampRisk` is flagged. */
  rampCap: READINESS.km.from,
  rampRisk: 1.4,
  /** Volume tips add at most this much on the week before. */
  weekGrowth: 1.1,
  /** Race mode: an A or B race inside the block or up to `afterDays` after it; race-day form goal (% of fitness). */
  race: { low: FORM.fresh, high: 20, afterDays: 28 },
  /** Other sports: intensity of the weekly habit, weeks of history it is prefilled from, minutes a tip adds. */
  cross: { intensity: 0.65, historyWeeks: 6, tipMin: 45 },
  /** Longer reps: minutes added per rep, never past `maxMin`. */
  reps: { addMin: 2, maxMin: 20 },
  /** Race-week tips: the week before keeps this share, race-week reps and easy runs these. */
  taper: { weekBefore: 0.7, reps: 0.5, easy: 0.6 },
} as const;

/** Load of `min` minutes a week of other sports, per day. */
export const crossLoadPerDay = (min: number) => ((min / 60) * COACH.cross.intensity ** 2 * 100) / 7;

/* ---------- Projection ---------- */

export interface CoachWeekIn { weekStart: ISODate; backoff: boolean; locked: boolean; km: number; plan: PlanItem[] }
export interface CoachInput {
  today: ISODate;
  /** Actual load per day (all history: CTL needs it). */
  history: Map<ISODate, number>;
  /** Planned load on days after today outside the block (planned workouts there). */
  outside: Map<ISODate, number>;
  weeks: CoachWeekIn[];
  /** Run km of the 3 weeks before the block, oldest first (actual, or planned for days ahead). */
  kmBefore: number[];
  /** Minutes a week of other sports inside the block, and outside it (the history mean). */
  crossMin: number;
  crossOutsideMin: number;
  race: { date: ISODate; name: string } | null;
  threshold: Threshold | null;
}

export type CoachState = "under" | "ok" | "over" | "tired" | "flat";
export interface CoachWeek {
  weekStart: ISODate;
  km: number;
  /** Change on the week before, as a fraction (0.1 = +10 %). */
  growth: number | null;
  /** Km ramp: this week / mean of it and the 3 before. */
  acwr: number | null;
  /** Lowest daily form in the week. */
  low: number | null;
  backoff: boolean;
  locked: boolean;
  /** Has days ahead and is not finished: tips may change it. */
  open: boolean;
  /** Counts for the verdict: open, not a backoff week. */
  judged: boolean;
}
export interface CoachResult {
  mode: "base" | "race";
  /** Base: the deepest judged week's form; race: form on race day. */
  value: number | null;
  /** The week the value comes from (base) or the race date. */
  at: ISODate | null;
  state: CoachState;
  /** The first judged week whose km ramp is over `rampRisk`. */
  risk: { weekStart: ISODate; acwr: number } | null;
  weeks: CoachWeek[];
  /** Daily form from two weeks before the block to its end (or race day); `projected` after today. */
  /** Daily form, and as a share of fitness (what the coach judges and the chart draws). */
  series: { date: ISODate; tsb: number; formPct: number; projected: boolean }[];
  race: { date: ISODate; name: string } | null;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function itemLoad(p: Pick<PlanItem, "type" | "km" | "durationMin" | "steps">, t: Threshold | null): number {
  return plannedLoad({ type: p.type, status: "planned", distanceKm: p.durationMin != null ? null : p.km, durationMin: p.durationMin, steps: p.steps }, t);
}

export function project(input: CoachInput): CoachResult {
  const { today, weeks } = input;
  const empty: CoachResult = { mode: input.race ? "race" : "base", value: null, at: null, state: "ok", risk: null, weeks: [], series: [], race: input.race };
  if (!weeks.length) return empty;
  const start = weeks[0].weekStart;
  const blockEnd = addDays(weeks.at(-1)!.weekStart, 6);
  const end = input.race && input.race.date > blockEnd ? input.race.date : blockEnd;

  const future = new Map<ISODate, number>();
  if (end > today) {
    for (const d of range(addDays(today, 1), end)) {
      const inBlock = d >= start && d <= blockEnd;
      future.set(d, (inBlock ? 0 : input.outside.get(d) ?? 0) + crossLoadPerDay(inBlock ? input.crossMin : input.crossOutsideMin));
    }
    for (const w of weeks) for (const p of w.plan) {
      if (p.date > today && p.open && future.has(p.date)) future.set(p.date, future.get(p.date)! + itemLoad(p, input.threshold));
    }
  }
  const from = addDays(start, -14);
  const points = pmc(input.history, from < today ? from : today, today, future)
    .filter((p) => p.date >= from && p.date <= end)
    .map((p) => ({ date: p.date, tsb: p.tsb, formPct: p.formPct, projected: !!p.projected }));
  // Judged on form as a share of fitness (docs/decisions/fartlek-form-relative.md).
  const tsbOn = new Map(points.map((p) => [p.date, p.formPct]));

  const kms = [...input.kmBefore, ...weeks.map((w) => w.km)];
  const off = input.kmBefore.length;
  const out: CoachWeek[] = weeks.map((w, i) => {
    const j = off + i;
    const win = kms.slice(Math.max(0, j - 3), j + 1);
    const chronic = win.reduce((a, b) => a + b, 0) / win.length;
    const prev = j > 0 ? kms[j - 1] : null;
    const lows = range(w.weekStart, addDays(w.weekStart, 6)).map((d) => tsbOn.get(d)).filter((x): x is number => x != null);
    const open = addDays(w.weekStart, 6) > today && !w.locked;
    return {
      weekStart: w.weekStart, km: r1(w.km), backoff: w.backoff, locked: w.locked,
      growth: prev ? r2(w.km / prev - 1) : null,
      acwr: chronic > 0 && win.length > 1 ? r2(w.km / chronic) : null,
      low: lows.length ? r1(Math.min(...lows)) : null,
      open, judged: open && !w.backoff,
    };
  });

  const series = points;
  if (input.race) {
    const v = tsbOn.get(input.race.date) ?? null;
    const state: CoachState = v == null ? "ok" : v < COACH.race.low ? "tired" : v > COACH.race.high ? "flat" : "ok";
    return { mode: "race", value: v == null ? null : r1(v), at: input.race.date, state, risk: null, weeks: out, series, race: input.race };
  }
  const judged = out.filter((w) => w.judged && w.low != null);
  if (!judged.length) return { ...empty, mode: "base", weeks: out, series };
  const deepest = judged.reduce((a, w) => (w.low! < a.low! ? w : a), judged[0]);
  const riskWeek = judged.find((w) => w.acwr != null && w.acwr > COACH.rampRisk) ?? null;
  const state: CoachState = deepest.low! < COACH.floor || riskWeek ? "over" : deepest.low! > COACH.goal ? "under" : "ok";
  return {
    mode: "base", value: deepest.low, at: deepest.weekStart, state, weeks: out, series, race: null,
    risk: riskWeek ? { weekStart: riskWeek.weekStart, acwr: riskWeek.acwr! } : null,
  };
}

/* ---------- Suggestions: rewrites of the block text ---------- */

export type TipId = "volume" | "reps" | "cross" | "quality" | "long" | "drop" | "swap" | "raceCut" | "raceReps" | "raceEasy";
export interface Tip {
  id: TipId;
  /** Weeks the tip changes (week starts). */
  weeks: ISODate[];
  /** Numbers for the message, e.g. reps' minutes before and after. */
  params: Record<string, number | string>;
  /** The whole block text with the tip applied. */
  text: string;
}
export interface TipContext { units: Units; lang: StepLang; refsFor: (date: ISODate) => StepRefs }

const BACKOFF_END = /\s*\b(backoff|back-off|vila vecka|avlastning(svecka)?)\s*$/i;

interface Part { raw: string; s: ParsedSession | null }
interface Line { locked: boolean; backoff: string; parts: Part[] }

/** A week line as raw parts plus what each part parses to, so a tip rewrites only the parts it touches. */
function readLine(line: string): Line | null {
  let text = line.trim();
  const locked = text.startsWith("✓");
  text = text.replace(/^✓\s*/, "");
  const bo = text.match(BACKOFF_END);
  const backoff = bo ? bo[1] : "";
  if (bo) text = text.slice(0, bo.index).trim();
  if (!text || /^[-–—]$/.test(text) || /^\d+\s+\d+(?:[.,]\d+)?$/.test(text)) return { locked, backoff, parts: [] };
  const parts = splitSessions(text).map((raw) => {
    const p = parseWeekLine(raw);
    return { raw, s: p.errors.length || p.sessions.length !== 1 ? null : p.sessions[0] };
  });
  return { locked, backoff, parts };
}

function writeLine(l: Line): string {
  const body = l.parts.map((p) => p.raw).join(", ") || (l.backoff ? "" : "-");
  return `${l.locked ? "✓ " : ""}${body}${l.backoff ? `${body ? " " : ""}${l.backoff}` : ""}`;
}

/** The sessions of a week line as written (for the list view's chips). */
export function lineParts(line: string): string[] {
  return readLine(line)?.parts.map((p) => p.raw) ?? [];
}
/** The line with one more session at the end (quick-add), keeping ✓ and a backoff mark. */
export function withPart(line: string, part: string): string {
  const l = readLine(line) ?? { locked: false, backoff: "", parts: [] };
  l.parts.push({ raw: part, s: null });
  return writeLine(l);
}
/** The line with its `k`-th session replaced (the list view's builder). */
export function withPartAt(line: string, k: number, part: string): string {
  const l = readLine(line);
  if (!l || !l.parts[k]) return line;
  l.parts[k] = { raw: part, s: null };
  return writeLine(l);
}
/** The line without its `k`-th session. */
export function withoutPart(line: string, k: number): string {
  const l = readLine(line);
  if (!l) return line;
  l.parts.splice(k, 1);
  return writeLine(l);
}

const half = (n: number) => Math.round(n * 2) / 2;
const isPlain = (s: ParsedSession | null, type: WorkoutType): s is ParsedSession => !!s && s.type === type && s.distance != null && !s.stepsText && !s.star;

function distText(s: ParsedSession, distUser: number, c: TipContext) {
  return sessionText({ type: s.type, distanceKm: fromUserDist(distUser, c.units), durationMin: null, zone2: s.zone2 }, c.units, c.lang);
}
function stepsPartText(type: WorkoutType, steps: WorkoutSteps, date: ISODate, c: TipContext) {
  return sessionText({ type, ...plannedFromSteps(steps, c.refsFor(date)), zone2: false, steps }, c.units, c.lang);
}
const stepsOfPart = (s: ParsedSession, c: TipContext) => (s.stepsText ? parseSteps(s.stepsText, c.units, c.lang).steps : null);

/** Text for every tip that changes something, in the order they are offered. `weeks` and `lines` share indexes. */
export function suggest(result: CoachResult, lines: string[], kmBefore: number[], c: TipContext): Tip[] {
  const weeks = result.weeks;
  const read = lines.map(readLine);
  const tips: Tip[] = [];
  const judged = weeks.map((w, i) => (w.judged && read[i] ? i : -1)).filter((i) => i >= 0);
  const emit = (id: TipId, ls: (Line | null)[], changed: number[], params: Tip["params"] = {}) => {
    if (!changed.length) return;
    tips.push({ id, weeks: changed.map((i) => weeks[i].weekStart), params, text: ls.map((l, i) => (l ? writeLine(l) : lines[i])).join("\n") });
  };
  const copy = () => read.map((l) => (l ? { ...l, parts: l.parts.map((p) => ({ ...p })) } : null));
  /** Most km this week can have inside the ramp cap, given the 3 weeks before it. */
  const kmSeries = [...kmBefore, ...weeks.map((w) => w.km)];
  const capFor = (series: number[], j: number) => {
    const s3 = series.slice(Math.max(0, j - 3), j).reduce((a, b) => a + b, 0);
    return (COACH.rampCap * s3) / (4 - COACH.rampCap);
  };

  if (result.state === "under") {
    // 1. Volume: up to +10 % on the week before and inside the ramp cap, half on the long run, half over the easy runs.
    {
      const ls = copy(), changed: number[] = [], series = [...kmSeries];
      for (const i of judged) {
        const j = kmBefore.length + i, l = ls[i]!;
        const prev = series[j - 1];
        if (!prev) continue;
        const room = Math.min(prev * COACH.weekGrowth, capFor(series, j)) - series[j];
        const longs = l.parts.filter((p) => isPlain(p.s, "long")), easies = l.parts.filter((p) => isPlain(p.s, "easy"));
        if (room < 1 || (!longs.length && !easies.length)) continue;
        const roomUser = toUserDist(room, c.units);
        const toLong = longs.length ? (easies.length ? roomUser / 2 : roomUser) : 0;
        const perEasy = easies.length ? (roomUser - toLong) / easies.length : 0;
        let added = 0;
        const bump = (p: Part, by: number) => {
          const next = half(p.s!.distance! + by);
          if (next <= p.s!.distance!) return;
          added += next - p.s!.distance!;
          p.raw = distText(p.s!, next, c);
        };
        if (longs.length) bump(longs[0], toLong);
        for (const p of easies) bump(p, perEasy);
        if (added > 0) { changed.push(i); series[j] += fromUserDist(added, c.units); }
      }
      emit("volume", ls, changed, { pct: Math.round((COACH.weekGrowth - 1) * 100) });
    }
    // 2. Longer reps on sessions that have them.
    {
      const ls = copy(), changed: number[] = [];
      let from = 0, to = 0;
      for (const i of judged) {
        for (const p of ls[i]!.parts) {
          if (!p.s || (p.s.type !== "threshold" && p.s.type !== "intervals")) continue;
          const steps = stepsOfPart(p.s, c);
          if (!steps) continue;
          let touched = false;
          const items = steps.items.map((it) => {
            if (it.kind !== "repeat" || it.work.min == null || it.work.min >= COACH.reps.maxMin) return it;
            touched = true;
            if (!from) { from = it.work.min; to = Math.min(COACH.reps.maxMin, it.work.min + COACH.reps.addMin); }
            return { ...it, work: { ...it.work, min: Math.min(COACH.reps.maxMin, it.work.min + COACH.reps.addMin) } };
          });
          if (!touched) continue;
          p.raw = stepsPartText(p.s.type, { v: 1, items }, addDays(weeks[i].weekStart, 1), c);
          if (!changed.includes(i)) changed.push(i);
        }
      }
      emit("reps", ls, changed, { from, to });
    }
    // 3. Another sport on top: load without touching the km ramp.
    {
      const ls = copy(), changed: number[] = [];
      for (const i of judged) {
        const text = `${COACH.cross.tipMin}min ${blockWord("cross", c.lang)}`;
        ls[i]!.parts.push({ raw: text, s: null });
        changed.push(i);
      }
      emit("cross", ls, changed, { min: COACH.cross.tipMin });
    }
    // 4. One easy run in the last build week becomes a threshold session of about the same length.
    {
      const ls = copy(), changed: number[] = [];
      const i = judged.at(-1);
      const l = i != null ? ls[i]! : null;
      const p = l?.parts.find((x) => isPlain(x.s, "easy") && x.s.distance! >= toUserDist(5, c.units));
      if (i != null && p) {
        const date = addDays(weeks[i].weekStart, 1);
        const jog: StepItem = { kind: "step", step: { min: THRESHOLD_WARM_COOL_MIN, target: { kind: "easy" } } };
        const reps: StepItem = { kind: "repeat", times: 2, work: { min: 10, target: { kind: "threshold" } }, rest: { min: 2, target: { kind: "jog" } } };
        const steps: WorkoutSteps = { v: 1, items: [jog, reps, jog] };
        p.raw = stepsPartText("threshold", steps, date, c);
        changed.push(i);
      }
      emit("quality", ls, changed);
    }
  }

  if (result.state === "over") {
    const flagged = judged.filter((i) => (weeks[i].acwr ?? 0) > COACH.rampRisk || (weeks[i].low ?? 0) < COACH.floor);
    // 1. Shorten the long run down to what the ramp cap allows (at least a quarter, never under 60 %).
    {
      const ls = copy(), changed: number[] = [];
      for (const i of flagged) {
        const j = kmBefore.length + i;
        const p = ls[i]!.parts.find((x) => isPlain(x.s, "long"));
        if (!p) continue;
        const over = toUserDist(Math.max(0, kmSeries[j] - capFor(kmSeries, j)), c.units);
        const d = p.s!.distance!;
        const next = half(Math.max(d * 0.6, d - Math.max(over, d * 0.25)));
        if (next < d) { p.raw = distText(p.s!, next, c); changed.push(i); }
      }
      emit("long", ls, changed);
    }
    // 2. Drop the week's last easy run, or 3. swap it for the same time on a bike.
    for (const id of ["drop", "swap"] as const) {
      const ls = copy(), changed: number[] = [];
      for (const i of flagged) {
        const l = ls[i]!;
        const idx = l.parts.map((x, k) => (isPlain(x.s, "easy") ? k : -1)).filter((k) => k >= 0).at(-1);
        if (idx == null) continue;
        if (id === "drop") l.parts.splice(idx, 1);
        else {
          const min = Math.max(20, Math.round((fromUserDist(l.parts[idx].s!.distance!, c.units) * 6) / 5) * 5);
          l.parts[idx] = { raw: `${min}min ${blockWord("cross", c.lang)}`, s: null };
        }
        changed.push(i);
      }
      emit(id, ls, changed);
    }
  }

  if (result.mode === "race" && result.state === "tired" && result.race) {
    const rd = result.race.date;
    const rw = weeks.findIndex((w) => rd >= w.weekStart && rd <= addDays(w.weekStart, 6));
    const raceWeek = rw >= 0 ? rw : weeks.length;
    const before = raceWeek - 1;
    const open = (i: number) => i >= 0 && i < weeks.length && weeks[i].open && !!read[i];
    const scale = (i: number, types: WorkoutType[], f: number, ls: (Line | null)[]) => {
      let any = false;
      for (const p of ls[i]!.parts) {
        if (!p.s || !types.some((t) => isPlain(p.s, t))) continue;
        const next = half(p.s.distance! * f);
        if (next < p.s.distance!) { p.raw = distText(p.s, next, c); any = true; }
      }
      return any;
    };
    {
      // Not again on a week that is already cut (about as much as the tip would) against the week before it.
      const j = kmBefore.length + before;
      const alreadyCut = j > 0 && kmSeries[j] <= kmSeries[j - 1] * (COACH.taper.weekBefore + 0.1);
      const ls = copy();
      emit("raceCut", ls, open(before) && !alreadyCut && scale(before, ["long", "easy"], COACH.taper.weekBefore, ls) ? [before] : [], { pct: Math.round((1 - COACH.taper.weekBefore) * 100) });
    }
    if (rw >= 0 && open(rw)) {
      const ls = copy();
      let touched = false;
      for (const p of ls[rw]!.parts) {
        if (!p.s || (p.s.type !== "threshold" && p.s.type !== "intervals")) continue;
        const steps = stepsOfPart(p.s, c);
        if (!steps) continue;
        const items = steps.items.map((it) => {
          if (it.kind !== "repeat") return it;
          if (it.work.min != null && it.work.min > 3) return { ...it, work: { ...it.work, min: Math.max(3, Math.round(it.work.min * COACH.taper.reps)) } };
          if (it.work.km != null && it.work.km > 0.4) return { ...it, work: { ...it.work, km: Math.max(0.4, Math.round(it.work.km * COACH.taper.reps * 10) / 10) } };
          return it;
        });
        const next = stepsPartText(p.s.type, { v: 1, items }, addDays(weeks[rw].weekStart, 1), c);
        if (next !== p.raw) { p.raw = next; touched = true; }
      }
      emit("raceReps", ls, touched ? [rw] : []);
      const le = copy();
      emit("raceEasy", le, scale(rw, ["easy"], COACH.taper.easy, le) ? [rw] : [], { pct: Math.round((1 - COACH.taper.easy) * 100) });
    }
  }
  return tips;
}
