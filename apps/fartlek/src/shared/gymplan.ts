import { addDays, daysBetween, type ISODate } from "./dates";
import { exercise, schemeFor, TEMPLATE_IDS, TEMPLATES, type Pattern, type Scheme, type TemplateId } from "./gym";
import { KEY_TYPES, type Msg, type Workout } from "./types";

/*
 * The gym module's logic (docs/decisions/fartlek-gym-module.md): what to put in each set from last time,
 * which template suits the day in the run week, and what beat last time. Pure, so the client and the
 * server share it.
 */

export const SET_KINDS = ["work", "warmup", "drop"] as const;
export type SetKind = (typeof SET_KINDS)[number];

export interface GymSet { kind: SetKind; kg: number | null; reps: number | null; seconds: number | null }
/** `note` is the runner's comment on the exercise ("left leg first"); it comes back next time. */
export interface GymEntry { exercise: string; slot: Pattern | null; note?: string | null; sets: GymSet[] }

/** A joint check-in before a session; not asked in the first version, kept so stored sessions can carry it. */
export const JOINT_FEELS = ["none", "some", "pain"] as const;
export type JointFeel = (typeof JOINT_FEELS)[number];

export interface GymSessionInput {
  /** Made on the phone when the session starts, so a resend after a lost connection saves it once. */
  clientId: string;
  date: ISODate;
  startedAt: number | null;
  finishedAt: number | null;
  template: TemplateId | null;
  feel: JointFeel | null;
  workoutId: number | null;
  entries: GymEntry[];
}

/** The work sets of the latest session with an exercise. */
export interface LastTime { date: ISODate; sets: GymSet[]; note?: string }

export const workSets = (sets: GymSet[]) => sets.filter((x) => x.kind === "work");

/** One stored set, as the server reads it, for `latestByExercise`. */
export interface SetRow { sessionId: number; date: ISODate; startedAt: number | null; exercise: string; kind: string; kg: number | null; reps: number | null; seconds: number | null; note?: string | null }

/** For each exercise, the work sets of the latest session that had any. Rows in set order. */
export function latestByExercise(rows: SetRow[]): Record<string, LastTime> {
  const best = new Map<string, { date: ISODate; at: number; sessionId: number }>();
  for (const r of rows) {
    if (r.kind !== "work") continue;
    const at = r.startedAt ?? 0;
    const b = best.get(r.exercise);
    if (!b || r.date > b.date || (r.date === b.date && (at > b.at || (at === b.at && r.sessionId > b.sessionId)))) best.set(r.exercise, { date: r.date, at, sessionId: r.sessionId });
  }
  const out: Record<string, LastTime> = {};
  for (const r of rows) {
    const b = best.get(r.exercise);
    if (!b || r.sessionId !== b.sessionId) continue;
    const l = (out[r.exercise] ??= { date: b.date, sets: [] });
    // The note sits on the entry's first set, which may be a warm-up.
    if (r.note) l.note = r.note;
    if (r.kind === "work") l.sets.push({ kind: "work", kg: r.kg, reps: r.reps, seconds: r.seconds });
  }
  return out;
}

export type Change = "up" | "same" | "new";
export interface Suggestion { sets: GymSet[]; change: Change }

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Double progression: when every work set last time reached the top of the range, go up one step
 * (back to the bottom of the range); otherwise repeat last time's numbers. Body-weight exercises without
 * added weight go up a rep, held exercises five seconds. Nothing last time: the bottom of the range and no weight.
 */
export function suggestSets(id: string, scheme: Scheme = schemeFor(id), last: LastTime | null | undefined = null): Suggestion {
  const e = exercise(id);
  const work = last ? workSets(last.sets) : [];
  const n = scheme.sets;
  const make = (f: (i: number) => Omit<GymSet, "kind">): GymSet[] => Array.from({ length: n }, (_, i) => ({ kind: "work", ...f(i) }));
  if (!work.length) return { change: "new", sets: make(() => ({ kg: null, reps: e.load === "time" ? null : scheme.low, seconds: e.load === "time" ? scheme.low : null })) };
  const at = (i: number) => work[Math.min(i, work.length - 1)];
  if (e.load === "time") {
    const top = work.length >= n && work.every((x) => (x.seconds ?? 0) >= scheme.high);
    const most = Math.max(...work.map((x) => x.seconds ?? 0));
    return top ? { change: "up", sets: make(() => ({ kg: null, reps: null, seconds: most + 5 })) } : { change: "same", sets: make((i) => ({ kg: null, reps: null, seconds: at(i).seconds ?? scheme.low })) };
  }
  const topKg = Math.max(...work.map((x) => x.kg ?? 0));
  const kg = topKg > 0 ? topKg : null;
  const allTop = work.length >= n && work.every((x) => (x.reps ?? 0) >= scheme.high);
  if (allTop) {
    if (kg == null || e.load === "bw" && e.step === 0) return { change: "up", sets: make((i) => ({ kg, reps: (at(i).reps ?? scheme.low) + 1, seconds: null })) };
    return { change: "up", sets: make(() => ({ kg: round(kg + e.step), reps: scheme.low, seconds: null })) };
  }
  return { change: "same", sets: make((i) => ({ kg, reps: at(i).kg === topKg || kg == null ? at(i).reps ?? scheme.low : scheme.low, seconds: null })) };
}

export interface TemplateChoice { id: TemplateId; why: Msg }

/**
 * Which template suits `date` in the run week (C, the gentle one, is only chosen by hand): full body when the
 * week has one planned gym session (`perWeek`), so the legs get their turn every week; upper body the day before a key session (threshold, intervals, long run, race), so the legs are fresh for it;
 * otherwise A and B take turns, with legs first.
 */
export function chooseTemplate(date: ISODate, workouts: Workout[], lastTemplate: TemplateId | null, perWeek = 0): TemplateChoice {
  if (perWeek === 1) return { id: "F", why: { key: "gym.why.oncePerWeek" } };
  const ahead = workouts.filter((w) => w.status === "planned" && KEY_TYPES.includes(w.type) && w.date > date && w.date <= addDays(date, 7)).sort((a, b) => a.date.localeCompare(b.date));
  const next = ahead[0];
  if (next && daysBetween(date, next.date) === 1) return { id: "B", why: { key: "gym.why.keyTomorrow", params: { type: next.type } } };
  if (lastTemplate === "A") return { id: "B", why: { key: "gym.why.alternate" } };
  if (next) return { id: "A", why: { key: "gym.why.legsBefore", params: { type: next.type, days: daysBetween(date, next.date) } } };
  return { id: "A", why: { key: "gym.why.legs" } };
}

/** The first choice of each slot in a template, with its scheme. */
export function templateEntries(id: TemplateId): { exercise: string; slot: Pattern; scheme: Scheme }[] {
  return TEMPLATES[id].slots.map((s) => ({ exercise: s.choices[0], slot: s.pattern, scheme: s.scheme }));
}

/** A set's weight times reps, the usual measure of volume; held and body-weight sets count nothing. */
const volumeOf = (x: GymSet) => (x.kg ?? 0) * (x.reps ?? 0);
export function volume(entries: GymEntry[]): number {
  return entries.reduce((sum, e) => sum + workSets(e.sets).reduce((a, x) => a + volumeOf(x), 0), 0);
}
export const workSetCount = (entries: GymEntry[]) => entries.reduce((n, e) => n + workSets(e.sets).length, 0);

/** The best work set: heaviest, then most reps (or longest hold). */
export function bestSet(sets: GymSet[]): GymSet | null {
  return workSets(sets).reduce<GymSet | null>((b, x) => {
    if (!b) return x;
    const kx = x.kg ?? 0, kb = b.kg ?? 0;
    if (kx !== kb) return kx > kb ? x : b;
    return (x.reps ?? x.seconds ?? 0) > (b.reps ?? b.seconds ?? 0) ? x : b;
  }, null);
}

export interface Improvement { exercise: string; best: GymSet; kg: number; reps: number; seconds: number }

/** Exercises whose best set beat last time's: more weight, or the same weight for more reps or a longer hold. */
export function improvements(entries: GymEntry[], last: Record<string, LastTime>): Improvement[] {
  return entries.flatMap((e) => {
    const now = bestSet(e.sets);
    const prev = last[e.exercise] ? bestSet(last[e.exercise].sets) : null;
    if (!now || !prev) return [];
    const kg = round((now.kg ?? 0) - (prev.kg ?? 0));
    const reps = (now.reps ?? 0) - (prev.reps ?? 0);
    const seconds = (now.seconds ?? 0) - (prev.seconds ?? 0);
    const better = kg > 0 || (kg === 0 && (reps > 0 || seconds > 0));
    return better ? [{ exercise: e.exercise, best: now, kg, reps: kg > 0 ? 0 : reps, seconds: kg > 0 ? 0 : seconds }] : [];
  });
}

/** Checks a session sent by the client; returns what is wrong (empty when fine). */
export function checkSession(s: unknown): string[] {
  const errs: string[] = [];
  if (!s || typeof s !== "object") return ["session must be an object"];
  const x = s as Record<string, unknown>;
  if (typeof x.clientId !== "string" || !/^[A-Za-z0-9:_-]{6,80}$/.test(x.clientId)) errs.push("clientId is required");
  if (typeof x.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x.date)) errs.push("date must be YYYY-MM-DD");
  if (x.template != null && !TEMPLATE_IDS.includes(x.template as TemplateId)) errs.push("template must be A, B, C or F");
  if (x.feel != null && !JOINT_FEELS.includes(x.feel as JointFeel)) errs.push("feel must be none, some or pain");
  for (const k of ["startedAt", "finishedAt", "workoutId"] as const) if (x[k] != null && (typeof x[k] !== "number" || !Number.isFinite(x[k]))) errs.push(`${k} must be a number`);
  if (!Array.isArray(x.entries) || x.entries.length > 40) return [...errs, "entries must be a list of at most 40"];
  const okNum = (v: unknown, max: number) => v == null || (typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max);
  x.entries.forEach((e, i) => {
    const en = e as Record<string, unknown>;
    if (typeof en?.exercise !== "string" || !en.exercise.trim() || en.exercise.length > 80) errs.push(`entry ${i + 1}: exercise is required`);
    if (en?.note != null && (typeof en.note !== "string" || en.note.length > 300)) errs.push(`entry ${i + 1}: note must be text of at most 300 characters`);
    if (!Array.isArray(en?.sets) || en.sets.length > 30) { errs.push(`entry ${i + 1}: sets must be a list of at most 30`); return; }
    (en.sets as Record<string, unknown>[]).forEach((st, j) => {
      if (!SET_KINDS.includes(st?.kind as SetKind) || !okNum(st.kg, 1000) || !okNum(st.reps, 1000) || !okNum(st.seconds, 36000)) errs.push(`entry ${i + 1}, set ${j + 1} is invalid`);
    });
  });
  return errs;
}

/** What the server hands the gym page for a day (GET /api/gym). */
export interface GymDay {
  date: ISODate;
  /** A planned gym session on that day, to start from. */
  planned: Workout | null;
  suggested: TemplateChoice;
  last: Record<string, LastTime>;
  /** Sessions already logged that day. */
  logged: GymSummary[];
  /** Gym sessions done and planned in the last four weeks, for "7 of 8". */
  recent: { done: number; planned: number };
}

export interface GymSummary { id: number; date: ISODate; template: TemplateId | null; name: string | null; source: string; exercises: string[]; sets: number; volume: number }
export interface GymSessionFull extends GymSummary { feel: JointFeel | null; startedAt: number | null; finishedAt: number | null; entries: GymEntry[] }
