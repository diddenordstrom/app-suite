import { addDays, type ISODate } from "./dates";
import { plannedKmOf, type SessionView, type Spike, type WeekTarget } from "./compliance";
import { fromUserDist, toUserDist, type Units } from "./format";
import { blockLines, parseWeekLine, placeSessions, type ParsedSession, type ParsedWeek } from "./parser";
import { STRIDES, parseSteps, plannedFromSteps, stepsText, stridesOf, type StepLang, type StepRefs, type WorkoutSteps } from "./steps";
import type { Msg, Workout, WorkoutType } from "./types";

/*
 * The quick-add text as a two-way view of a block (docs/decisions/runplan-training-blocks.md).
 * Serialise: one line per week, same grammar as quick-add, finished weeks prefixed with ✓.
 * Apply: unchanged lines are not touched; in a changed week old and new sessions pair by type in
 * order (a paired workout keeps its day, notes and activity link and only gets the new amount), new
 * sessions go on free usual run days, and removed sessions are deleted only if planned and not linked.
 * Finished weeks are locked. The number of lines is the block's length.
 */

/** One week as it stands: its non-dropped sessions and target. */
export interface WeekState { weekStart: ISODate; finished: boolean; sessions: SessionView[]; target: WeekTarget | null }

/* Words the text is written in; the parser reads both languages (parser.ts). Syntax, so not in the i18n dictionaries. */
const WORDS: Record<StepLang, Record<WorkoutType | "longZone2" | "backoff", string>> = {
  en: { easy: "easy", long: "long run", longZone2: "long run zone 2", threshold: "threshold", intervals: "intervals", race: "race", cross: "cross", strength: "gym", rest: "rest", backoff: "backoff" },
  sv: { easy: "lugnt", long: "långpass", longZone2: "långpass zon 2", threshold: "tröskel", intervals: "intervaller", race: "lopp", cross: "annat", strength: "gym", rest: "vila", backoff: "avlastning" },
};
export const blockWord = (key: WorkoutType | "longZone2" | "backoff", lang: StepLang = "en") => WORDS[lang][key];

const numText = (n: number) => String(Math.round(n * 10) / 10);
const RUNS_NOTE = /^(\d+) runs\b/;

type Amount = Pick<Workout, "type" | "distanceKm" | "durationMin" | "zone2"> & { steps?: Workout["steps"] };

/** One session as block text. A workout with steps carries them in parentheses; its amount comes from them. */
export function sessionText(w: Amount, units: Units, lang: StepLang = "en"): string {
  const word = blockWord(w.type === "long" && w.zone2 ? "longZone2" : w.type, lang);
  // An easy run with strides reads as `8 lugnt + strides`: the number is the run before them.
  const st = stridesOf(w.steps ?? null);
  if (st) {
    const run = st.base.min != null ? `${numText(st.base.min)}min` : numText(toUserDist(st.base.km ?? 0, units));
    return `${run} ${word} + ${st.reps === STRIDES.reps ? "" : `${st.reps} `}strides`;
  }
  const steps = w.steps ? ` (${stepsText(w.steps, lang, units)})` : "";
  if (w.distanceKm != null) return `${numText(toUserDist(w.distanceKm, units))} ${word}${steps}`;
  if (w.durationMin != null) return `${numText(w.durationMin)}min ${word}${steps}`;
  if (w.type === "rest" || w.type === "cross" || w.type === "strength") return word;
  return `${steps ? "" : "0 "}${word}${steps}`;
}

const isBackoff = (t: WeekTarget | null) => /backoff/i.test(t?.note ?? "");

export function weekText(state: Pick<WeekState, "sessions" | "target">, units: Units, lang: StepLang = "en"): string {
  const sorted = [...state.sessions].sort((a, b) => a.workout.date.localeCompare(b.workout.date) || a.workout.id - b.workout.id);
  let line: string;
  if (sorted.length) line = sorted.map((s) => sessionText(s.workout, units, lang)).join(", ");
  else if (state.target?.km != null) line = `${state.target.note?.match(RUNS_NOTE)?.[1] ?? 0} ${numText(toUserDist(state.target.km, units))}`;
  else line = isBackoff(state.target) ? "" : "-";
  return isBackoff(state.target) ? `${line} ${blockWord("backoff", lang)}`.trim() : line;
}

/** The block as text: one line per week, ✓ before finished (locked) weeks. */
export function blockText(weeks: WeekState[], units: Units, lang: StepLang = "en"): string {
  return weeks.map((w) => (w.finished ? `✓ ${weekText(w, units, lang)}` : weekText(w, units, lang))).join("\n");
}

/* ---------- Apply ---------- */

export interface AmountView { distance: number | null; durationMin: number | null }
export interface Change {
  op: "update" | "create" | "delete" | "keep";
  type: WorkoutType;
  zone2: boolean;
  date: ISODate;
  /** In the user's unit. */
  before: AmountView | null;
  after: AmountView | null;
}
export type Op =
  /** `dropSteps`: a new amount on a workout with steps replaces the steps (they no longer add up to it). */
  | { op: "update"; id: number; distanceKm: number | null; durationMin: number | null; zone2: boolean; dropSteps?: boolean; steps?: string | null }
  | { op: "create"; date: ISODate; type: WorkoutType; distanceKm: number | null; durationMin: number | null; zone2: boolean; steps?: string | null }
  | { op: "delete"; id: number }
  | { op: "target"; weekStart: ISODate; target: WeekTarget | null };

export type WeekChange = "locked" | "unchanged" | "changed" | "added" | "removed";
export interface WeekPreview {
  index: number;
  weekStart: ISODate;
  state: WeekChange;
  beforeKm: number;
  afterKm: number;
  sessions: number;
  backoff: boolean;
  changes: Change[];
  warnings: Msg[];
  spikes: (Spike & { date: ISODate; type: WorkoutType })[];
  /** Planned runs still ahead after saving, for the long-run check. */
  ahead: { date: ISODate; km: number; type: WorkoutType }[];
  /** Sessions that stay but leave the block (removed weeks). */
  leaving: number;
  /** Every session of the week as it would be after saving (empty for removed weeks), for the load projection and the week calendar. */
  plan: PlanItem[];
}

/** A session as it would stand after saving. `open` = not done yet (no run linked, not in the past). */
export interface PlanItem { date: ISODate; type: WorkoutType; km: number; durationMin: number | null; zone2: boolean; steps: WorkoutSteps | null; open: boolean }

export interface ApplyOptions {
  /** The language steps are read in for "did you mean" (both are read). */
  lang?: StepLang;
  /** Step targets on a date, to derive a workout's amount from inline steps. Without it the written amount is used. */
  refsFor?: (date: ISODate) => StepRefs;
  /** Weekday the long run goes on (settings.longRunDay); without it, the last run day. */
  longRunDay?: number;
}

export interface ApplyResult { ops: Op[]; weeks: WeekPreview[]; errors: Msg[]; length: number }

const amountOf = (w: Pick<Workout, "distanceKm" | "durationMin">, units: Units): AmountView =>
  ({ distance: w.distanceKm != null ? Math.round(toUserDist(w.distanceKm, units) * 10) / 10 : null, durationMin: w.durationMin });
const parsedAmount = (p: ParsedSession): AmountView => ({ distance: p.distance, durationMin: p.durationMin });
const kmOfParsed = (p: ParsedSession, units: Units) => (p.distance != null ? Math.round(fromUserDist(p.distance, units) * 100) / 100 : null);
const normLine = (s: string) => s.replace(/^✓\s*/, "").trim().replace(/\s+/g, " ").toLowerCase();

function sameTarget(a: WeekTarget | null, b: WeekTarget | null) {
  return (a?.km ?? null) === (b?.km ?? null) && (a?.minutes ?? null) === (b?.minutes ?? null) && (a?.note ?? null) === (b?.note ?? null);
}

/** The week target after applying a line: totals set it; otherwise a manual km target stays and only the backoff mark follows the text. */
function nextTarget(old: WeekTarget | null, p: ParsedWeek, units: Units): WeekTarget | null {
  if (p.totals) {
    return { km: Math.round(fromUserDist(p.totals.distance, units) * 100) / 100, minutes: null, note: `${p.totals.runs} runs${p.backoff ? " · backoff" : ""}` };
  }
  const minutes = old?.minutes ?? null;
  let km = old?.km ?? null, note = old?.note ?? null;
  if (note && RUNS_NOTE.test(note)) { km = null; note = null; }
  if (p.backoff && !/backoff/i.test(note ?? "")) note = note ? `${note} · backoff` : "backoff";
  if (!p.backoff && note && /backoff/i.test(note)) note = note.replace(/\s*·?\s*backoff\s*/i, "").trim() || null;
  return km == null && minutes == null && !note ? null : { km, minutes, note };
}

/**
 * Work out what saving `text` does to the block's weeks. `weeks` holds the state of every week from the
 * block's start through max(old, new) length (weeks past the old end may hold "no block" sessions,
 * which then join the block). Nothing is written; the caller runs `ops`.
 */
export function applyBlockText(weeks: WeekState[], oldLength: number, text: string, runDays: number[], units: Units, opts: ApplyOptions = {}): ApplyResult {
  const lang = opts.lang ?? "en";
  const stepsSame = (a: WorkoutSteps | null, b: WorkoutSteps | null) => (a ? stepsText(a, "en", units) : "") === (b ? stepsText(b, "en", units) : "");
  const amountFromSteps = (s: WorkoutSteps, date: ISODate, p: ParsedSession) =>
    opts.refsFor ? plannedFromSteps(s, opts.refsFor(date)) : { distanceKm: kmOfParsed(p, units), durationMin: p.distance != null ? null : p.durationMin };
  const lines = blockLines(text);
  const ops: Op[] = [];
  const errors: Msg[] = [];
  const previews: WeekPreview[] = [];
  if (!lines.length) errors.push({ key: "bt.empty" });
  if (lines.length > 52) errors.push({ key: "bt.tooLong", params: { max: 52 } });
  const n = Math.max(lines.length, oldLength);

  for (let i = 0; i < n; i++) {
    const state = weeks[i] ?? { weekStart: addDays(weeks[0]?.weekStart ?? "1970-01-05", i * 7), finished: false, sessions: [], target: null };
    const sessions = state.sessions.filter((s) => s.workout.status !== "dropped");
    const beforeKm = Math.round(sessions.reduce((a, s) => a + (s.workout.type === "rest" ? 0 : plannedKmOf(s.workout)), 0) * 10) / 10;
    const aheadOf = (list: { date: ISODate; type: WorkoutType; km: number; open: boolean }[]) =>
      list.filter((x) => x.open && x.km > 0 && x.type !== "rest" && x.type !== "cross").map(({ date, km, type }) => ({ date, km, type }));
    const open = (s: SessionView) => !s.activity && (s.outcome === "upcoming" || s.outcome === "to_do");
    const item = (w: Workout, isOpen: boolean): PlanItem => ({ date: w.date, type: w.type, km: plannedKmOf(w), durationMin: w.durationMin, zone2: w.zone2, steps: w.steps, open: isOpen });
    const base: WeekPreview = {
      index: i, weekStart: state.weekStart, state: "unchanged", beforeKm, afterKm: beforeKm, sessions: sessions.length,
      backoff: isBackoff(state.target), changes: [], warnings: [], spikes: [], ahead: [], leaving: 0,
      plan: sessions.map((s) => item(s.workout, open(s))),
    };

    if (i >= lines.length) {
      previews.push({ ...base, state: "removed", leaving: sessions.length, plan: [], ahead: aheadOf(sessions.map((s) => ({ date: s.workout.date, type: s.workout.type, km: plannedKmOf(s.workout), open: open(s) }))) });
      continue;
    }
    const line = lines[i];
    const current = weekText({ sessions, target: state.target }, units, lang);
    if (state.finished) {
      const warnings: Msg[] = normLine(line) !== normLine(current) ? [{ key: "bt.lockedEdit" }] : [];
      previews.push({ ...base, state: "locked", warnings });
      continue;
    }
    const parsed = parseWeekLine(line);
    // Inline steps: parsed once per session; `undefined` = keep the workout's (a `*` or nothing written), null = none.
    const stepsOf = new Map<ParsedSession, WorkoutSteps | null | undefined>();
    for (const p of parsed.sessions) {
      if (p.stepsText == null) { stepsOf.set(p, p.star ? undefined : null); continue; }
      const s = parseSteps(p.stepsText, units, lang);
      if (s.errors.length) parsed.errors.push(...s.errors);
      stepsOf.set(p, s.steps);
    }
    if (parsed.errors.length) {
      for (const e of parsed.errors) errors.push({ key: "bt.lineError", params: { week: i + 1, ...(e.params ?? {}), error: e.key } });
      previews.push({ ...base, state: i >= oldLength ? "added" : "changed" });
      continue;
    }

    const changes: Change[] = [];
    const weekOps: Op[] = [];
    const stepWarnings: Msg[] = [];
    const final: (PlanItem & { open: boolean })[] = [];
    const taken = new Set<ISODate>();
    const types = [...new Set([...sessions.map((s) => s.workout.type), ...parsed.sessions.map((p) => p.type)])];
    const fresh: ParsedSession[] = [];
    for (const type of types) {
      const olds = sessions.filter((s) => s.workout.type === type).sort((a, b) => a.workout.date.localeCompare(b.workout.date) || a.workout.id - b.workout.id);
      const news = parsed.sessions.filter((p) => p.type === type);
      olds.forEach((s, j) => {
        const p = news[j];
        const w = s.workout;
        if (p) {
          taken.add(w.date);
          const zone2 = type === "long" && p.zone2;
          const want = stepsOf.get(p);
          let next: Amount & { steps: WorkoutSteps | null };
          if (want) {
            // Steps written inline: the amount follows them, and only a change in the steps rewrites it.
            const same = stepsSame(want, w.steps);
            next = { type, ...(same ? { distanceKm: w.distanceKm, durationMin: w.durationMin } : amountFromSteps(want, w.date, p)), zone2, steps: want };
            if (!same || w.zone2 !== zone2) {
              weekOps.push({ op: "update", id: w.id, distanceKm: next.distanceKm, durationMin: next.durationMin, zone2, steps: JSON.stringify(want) });
              changes.push({ op: "update", type, zone2, date: w.date, before: amountOf(w, units), after: amountOf(next, units) });
            }
          } else {
            next = { type, distanceKm: kmOfParsed(p, units), durationMin: p.distance != null ? null : p.durationMin, zone2, steps: want === undefined ? w.steps : null };
            const amountChanged = sessionText({ ...w, steps: null }, units) !== sessionText({ ...next, steps: null }, units);
            // No steps on the line (and no `*`): writing the session without its parentheses drops them.
            const dropSteps = !!w.steps && (amountChanged || want === null);
            if (dropSteps) next.steps = null;
            if (amountChanged || dropSteps) {
              weekOps.push({ op: "update", id: w.id, distanceKm: next.distanceKm, durationMin: next.durationMin, zone2, ...(dropSteps ? { dropSteps } : {}) });
              changes.push({ op: "update", type, zone2, date: w.date, before: amountOf(w, units), after: parsedAmount(p) });
              if (dropSteps) stepWarnings.push({ key: "bt.stepsDropped", params: { type, date: w.date } });
            }
          }
          final.push({ ...item({ ...w, ...next }, open(s)) });
        } else if (w.status === "planned" && !s.activity) {
          weekOps.push({ op: "delete", id: w.id });
          changes.push({ op: "delete", type, zone2: w.zone2, date: w.date, before: amountOf(w, units), after: null });
        } else {
          taken.add(w.date);
          changes.push({ op: "keep", type, zone2: w.zone2, date: w.date, before: amountOf(w, units), after: null });
          final.push(item(w, false));
        }
      });
      fresh.push(...news.slice(olds.length));
    }
    const days = placeSessions(state.weekStart, fresh, runDays, taken, opts.longRunDay);
    fresh.forEach((p, j) => {
      const zone2 = p.type === "long" && p.zone2;
      const steps = stepsOf.get(p) ?? null;
      const amount = steps ? amountFromSteps(steps, days[j], p) : { distanceKm: kmOfParsed(p, units), durationMin: p.distance != null ? null : p.durationMin };
      weekOps.push({ op: "create", date: days[j], type: p.type, ...amount, zone2, ...(steps ? { steps: JSON.stringify(steps) } : {}) });
      changes.push({ op: "create", type: p.type, zone2, date: days[j], before: null, after: steps ? amountOf(amount, units) : parsedAmount(p) });
      final.push(item({ date: days[j], type: p.type, ...amount, zone2, steps } as Workout, true));
    });
    const target = nextTarget(state.target, parsed, units);
    if (!sameTarget(state.target, target)) weekOps.push({ op: "target", weekStart: state.weekStart, target });

    const afterKm = Math.round(final.reduce((a, x) => a + (x.type === "rest" ? 0 : x.km), 0) * 10) / 10;
    const touched = weekOps.length > 0;
    ops.push(...weekOps);
    previews.push({
      ...base,
      state: i >= oldLength ? "added" : touched ? "changed" : "unchanged",
      afterKm, sessions: final.length, backoff: isBackoff(target),
      changes: touched ? changes : [],
      warnings: stepWarnings,
      ahead: aheadOf(final),
      plan: final,
    });
  }
  return { ops: errors.length ? [] : ops, weeks: previews, errors, length: lines.length };
}
