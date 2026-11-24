import { KM_PER_MI, fromUserDist, toUserDist, type Units } from "./format";
import type { Msg, ZoneBounds } from "./types";

/*
 * Steps of a structured workout (docs/decisions/fartlek-structured-workouts.md).
 *
 * Written as a short text on the workout, items separated by commas:
 *   2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt
 *   10 min easy, 6x400 m @3:50 / 90 s jog, 10 min easy
 * An item is a step (`<amount> [target]`) or a repeat (`<n>x<step> [/ <rest step>]`, rest between reps).
 * Amount: `km`, `mi`, `m` (metres), `min`, `s`; a bare number is in the user's distance unit.
 * Target: `lugnt`/`easy`, `jogg`/`jog`, `@tröskel`/`@threshold`, `@z1`…`@z5`, `@90%` (of threshold
 * speed), `@4:40` (pace in the user's unit) or `@165` (bpm). `:puls`/`:hr` or `:tempo`/`:pace` after
 * a target overrides what the step is judged on.
 * The parser reads Swedish and English alike; stepsText writes the language the user reads.
 * This is syntax, like the block text, so its words live here rather than in the i18n dictionaries.
 */

export type StepTarget =
  | { kind: "easy" }
  | { kind: "jog" }
  | { kind: "threshold" }
  /** Short relaxed sprints (~20 s): never judged, GPS can't keep up with them. */
  | { kind: "strides" }
  | { kind: "zone"; zone: number }
  | { kind: "pct"; pct: number }
  | { kind: "pace"; secPerKm: number }
  | { kind: "hr"; bpm: number };
export type Judge = "pace" | "hr";
/** One step: a distance (km) or a duration (min), a target, and an optional override of what is judged. */
export interface StepDef { km?: number; min?: number; target: StepTarget | null; judge?: Judge }
export type StepItem =
  | { kind: "step"; step: StepDef }
  | { kind: "repeat"; times: number; work: StepDef; rest: StepDef | null };
export interface WorkoutSteps { v: 1; items: StepItem[] }

export type StepLang = "sv" | "en";

const WORDS: Record<"easy" | "jog" | "threshold" | "strides", { sv: string; en: string; read: string[] }> = {
  easy: { sv: "lugnt", en: "easy", read: ["lugnt", "lugn", "lätt", "latt", "easy"] },
  jog: { sv: "jogg", en: "jog", read: ["jogg", "jog", "joggning", "vila", "rest", "gång", "walk"] },
  threshold: { sv: "tröskel", en: "threshold", read: ["tröskel", "troskel", "threshold", "thr", "tempo"] },
  strides: { sv: "strides", en: "strides", read: ["strides", "stride", "stegring", "stegringar", "stegringslopp"] },
};
const JUDGE_WORDS: Record<Judge, { sv: string; en: string; read: string[] }> = {
  pace: { sv: "tempo", en: "pace", read: ["tempo", "fart", "pace"] },
  hr: { sv: "puls", en: "hr", read: ["puls", "hr", "heart", "pulse"] },
};
const ALL_TARGET_WORDS = Object.values(WORDS).flatMap((w) => w.read);

export const LIMITS = { items: 30, times: 50, km: 100, min: 600 };

/** The easy jog before and after a threshold session's reps, in minutes (a time, not a distance: the runner thinks in minutes). */
export const THRESHOLD_WARM_COOL_MIN = 10;

const num = (s: string) => Number(s.replace(",", "."));

function edits(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  }
  return d[a.length][b.length];
}

/** The closest known target word, for "did you mean". */
function suggest(word: string, lang: StepLang): string | null {
  let best: string | null = null, bestD = 3;
  for (const w of ALL_TARGET_WORDS) {
    const d = edits(word, w);
    if (d < bestD) { bestD = d; best = w; }
  }
  if (!best) return null;
  const key = (Object.keys(WORDS) as (keyof typeof WORDS)[]).find((k) => WORDS[k].read.includes(best!))!;
  return WORDS[key][lang];
}

function parseTarget(raw: string, units: Units, lang: StepLang): { target: StepTarget | null; judge?: Judge } | Msg {
  let s = raw.trim().toLowerCase();
  let judge: Judge | undefined;
  const jm = s.match(/:\s*([a-zåäö]+)$/);
  if (jm) {
    const j = (Object.keys(JUDGE_WORDS) as Judge[]).find((k) => JUDGE_WORDS[k].read.includes(jm[1]));
    if (!j) return { key: "steps.unknownJudge", params: { text: jm[1] } };
    judge = j;
    s = s.slice(0, jm.index).trim();
  }
  s = s.replace(/^@\s*/, "");
  if (!s) return { target: null, judge };
  for (const k of Object.keys(WORDS) as (keyof typeof WORDS)[]) if (WORDS[k].read.includes(s)) return { target: { kind: k }, judge };
  let m = s.match(/^(?:z|zon|zone)\s*([1-5])$/);
  if (m) return { target: { kind: "zone", zone: Number(m[1]) }, judge };
  m = s.match(/^(\d{2,3})\s*%$/);
  if (m) {
    const pct = Number(m[1]);
    if (pct < 50 || pct > 130) return { key: "steps.badTarget", params: { text: raw.trim() } };
    return { target: { kind: "pct", pct }, judge };
  }
  m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) {
    const perUnit = Number(m[1]) * 60 + Number(m[2]);
    const secPerKm = Math.round(units === "imperial" ? perUnit / KM_PER_MI : perUnit);
    if (secPerKm < 120 || secPerKm > 900) return { key: "steps.badTarget", params: { text: raw.trim() } };
    return { target: { kind: "pace", secPerKm }, judge };
  }
  m = s.match(/^(\d{2,3})(?:\s*bpm)?$/);
  if (m) {
    const bpm = Number(m[1]);
    if (bpm < 60 || bpm > 230) return { key: "steps.badTarget", params: { text: raw.trim() } };
    return { target: { kind: "hr", bpm }, judge };
  }
  const word = s.replace(/^@/, "");
  const guess = suggest(word, lang);
  return guess ? { key: "steps.unknownTargetSuggest", params: { text: word, suggestion: guess } } : { key: "steps.unknownTarget", params: { text: word } };
}

function parseStep(raw: string, units: Units, lang: StepLang): StepDef | Msg {
  const m = raw.trim().match(/^(\d+(?:[.,]\d+)?)\s*(km|k|mi|m|min|minuter|minutes|mins|s|sek|sec)?\b\s*(.*)$/i);
  if (!m) return { key: "steps.cantRead", params: { text: raw.trim() } };
  const n = num(m[1]);
  const unit = (m[2] ?? "").toLowerCase();
  const def: StepDef = { target: null };
  if (unit === "min" || unit === "minuter" || unit === "minutes" || unit === "mins") def.min = n;
  else if (unit === "s" || unit === "sek" || unit === "sec") def.min = Math.round((n / 60) * 1000) / 1000;
  else if (unit === "m") def.km = n / 1000;
  else if (unit === "km" || unit === "k") def.km = n;
  else if (unit === "mi") def.km = n * KM_PER_MI;
  else def.km = fromUserDist(n, units);
  if (def.km != null) def.km = Math.round(def.km * 1000) / 1000;
  if (!(n > 0) || (def.km ?? 0) > LIMITS.km || (def.min ?? 0) > LIMITS.min) return { key: "steps.badAmount", params: { text: raw.trim() } };
  const t = parseTarget(m[3], units, lang);
  if ("key" in t) return t;
  def.target = t.target;
  if (t.judge) def.judge = t.judge;
  return def;
}

export interface ParsedSteps { steps: WorkoutSteps | null; errors: Msg[] }

/** Parse step text. Empty text means no structure (`steps: null`). `lang` only picks the language of "did you mean". */
export function parseSteps(text: string, units: Units, lang: StepLang = "en"): ParsedSteps {
  const parts = text.trim().split(/;|(?<!\d),|,(?!\d)/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) return { steps: null, errors: [] };
  if (parts.length > LIMITS.items) return { steps: null, errors: [{ key: "steps.tooMany", params: { max: LIMITS.items } }] };
  const items: StepItem[] = [];
  const errors: Msg[] = [];
  parts.forEach((part, i) => {
    const err = (e: Msg) => errors.push({ key: e.key, params: { ...(e.params ?? {}), item: i + 1 } });
    const rep = part.match(/^(\d+)\s*[x×*]\s*(.+)$/i);
    if (rep) {
      const times = Number(rep[1]);
      if (times < 1 || times > LIMITS.times) return err({ key: "steps.badRepeat", params: { text: part } });
      const [w, r, ...extra] = rep[2].split("/");
      if (extra.length) return err({ key: "steps.cantRead", params: { text: part } });
      const work = parseStep(w, units, lang);
      if ("key" in work) return err(work);
      let rest: StepDef | null = null;
      if (r != null) {
        const p = parseStep(r, units, lang);
        if ("key" in p) return err(p);
        rest = p;
      }
      items.push({ kind: "repeat", times, work, rest });
      return;
    }
    const step = parseStep(part, units, lang);
    if ("key" in step) return err(step);
    items.push({ kind: "step", step });
  });
  return errors.length ? { steps: null, errors } : { steps: { v: 1, items }, errors: [] };
}

/** What a target is judged on when the runner hasn't said: pace for hard efforts (HR lags), HR for easy running. */
export function defaultJudge(target: StepTarget | null): Judge | null {
  if (!target || target.kind === "jog" || target.kind === "strides") return null;
  return target.kind === "threshold" || target.kind === "pct" || target.kind === "pace" ? "pace" : "hr";
}

const trim = (n: number, d = 2) => String(Math.round(n * 10 ** d) / 10 ** d);
function mmss(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function amountText(d: Pick<StepDef, "km" | "min">, units: Units): string {
  if (d.min != null) return Number.isInteger(Math.round(d.min * 1000) / 1000) ? `${trim(d.min)} min` : `${Math.round(d.min * 60)} s`;
  const km = d.km ?? 0;
  if (units === "metric" && km < 1) return `${Math.round(km * 1000)} m`;
  return `${trim(toUserDist(km, units))} ${units === "imperial" ? "mi" : "km"}`;
}

export function targetText(t: StepTarget | null, lang: StepLang, units: Units): string {
  if (!t) return "";
  switch (t.kind) {
    case "easy": case "jog": case "strides": return WORDS[t.kind][lang];
    case "threshold": return `@${WORDS.threshold[lang]}`;
    case "zone": return `@z${t.zone}`;
    case "pct": return `@${t.pct}%`;
    case "pace": return `@${mmss(units === "imperial" ? t.secPerKm * KM_PER_MI : t.secPerKm)}`;
    case "hr": return `@${t.bpm}`;
  }
}

function stepText(d: StepDef, lang: StepLang, units: Units): string {
  let out = amountText(d, units);
  const tt = targetText(d.target, lang, units);
  if (tt) out += ` ${tt}`;
  if (d.judge && d.judge !== defaultJudge(d.target)) out += `:${JUDGE_WORDS[d.judge][lang]}`;
  return out;
}

/** The steps as text in the user's language; parseSteps reads it back to the same steps. */
export function stepsText(s: WorkoutSteps | null, lang: StepLang, units: Units): string {
  if (!s) return "";
  return s.items.map((it) => it.kind === "step"
    ? stepText(it.step, lang, units)
    : `${it.times}x${stepText(it.work, lang, units)}${it.rest ? ` / ${stepText(it.rest, lang, units)}` : ""}`).join(", ");
}

/** A short label for a week chip: the first repeat, e.g. `3×8 min tröskel`; null when there is none. */
export function stepsSummary(s: WorkoutSteps | null, lang: StepLang, units: Units): string | null {
  const st = stridesOf(s);
  if (st) return `+ ${st.reps} ${WORDS.strides[lang]}`;
  const rep = s?.items.find((i): i is Extract<StepItem, { kind: "repeat" }> => i.kind === "repeat");
  if (!rep) return null;
  const word = targetText(rep.work.target, lang, units).replace(/^@/, "");
  return `${rep.times}×${amountText(rep.work, units)}${word ? ` ${word}` : ""}`;
}

/* ---------- Flat steps, targets, totals ---------- */

export type StepRole = "warmup" | "run" | "work" | "recovery" | "cooldown";
export interface FlatStep { item: number; role: StepRole; def: StepDef; rep: number | null; of: number | null }

const hard = (t: StepTarget | null) => !!t && (t.kind === "threshold" || t.kind === "pct" || t.kind === "pace" || (t.kind === "zone" && t.zone >= 4));

/** Every step in running order (repeats expanded, rest between reps), with its role. */
export function flattenSteps(s: WorkoutSteps): FlatStep[] {
  // Strides are a finish to an easy run, so the run before them stays a run rather than a warm-up.
  const isHard = s.items.map((it) => (it.kind === "repeat" ? it.work.target?.kind !== "strides" : hard(it.step.target)));
  const firstHard = isHard.indexOf(true), lastHard = isHard.lastIndexOf(true);
  const out: FlatStep[] = [];
  s.items.forEach((it, i) => {
    if (it.kind === "repeat") {
      for (let r = 1; r <= it.times; r++) {
        out.push({ item: i, role: "work", def: it.work, rep: r, of: it.times });
        if (it.rest && r < it.times) out.push({ item: i, role: "recovery", def: it.rest, rep: r, of: it.times });
      }
      return;
    }
    const role: StepRole = isHard[i] ? "work" : firstHard > i ? "warmup" : lastHard >= 0 && lastHard < i ? "cooldown" : "run";
    out.push({ item: i, role, def: it.step, rep: null, of: null });
  });
  return out;
}

/** What a target means on a given date: the athlete's numbers it resolves against. */
export interface StepRefs {
  thresholdPace: number | null;
  thresholdHr: number | null;
  easyLow: number | null;
  easyHigh: number | null;
  zones: ZoneBounds | null;
  /** Typical easy pace, only to estimate distance from time (and back). */
  easyPace: number | null;
}

export interface ResolvedTarget {
  /** Seconds per km, fast end first. */
  pace: [number, number] | null;
  hr: [number, number] | null;
  /** Shown beside a pace target, never judged on its own (threshold HR). */
  hrRef: number | null;
  /** The HR range is a ceiling: below it counts as in target (easy running can't be too easy). */
  hrCeiling: boolean;
  judge: Judge | null;
}

/**
 * Resolve a target against the refs. Only numbers Fartlek already has are used: the easy HR band,
 * the threshold window (estimate −15/+20 s/km, as rangeCheck), the zones, or what was typed.
 */
export function resolveTarget(def: StepDef, refs: StepRefs): ResolvedTarget {
  const t = def.target;
  let pace: [number, number] | null = null, hr: [number, number] | null = null, hrRef: number | null = null;
  const hrCeiling = t?.kind === "easy";
  const tp = refs.thresholdPace;
  if (t?.kind === "easy") {
    if (refs.easyLow && refs.easyHigh) hr = [refs.easyLow, refs.easyHigh];
    else if (refs.zones) hr = [refs.zones[0] + 1, refs.zones[1]];
  } else if (t?.kind === "threshold") {
    if (tp) pace = [tp - 15, tp + 20];
    if (refs.thresholdHr) { hr = [refs.thresholdHr - 5, refs.thresholdHr + 5]; hrRef = refs.thresholdHr; }
  } else if (t?.kind === "pct") {
    if (tp) { const c = (tp * 100) / t.pct; pace = [Math.round(c - 10), Math.round(c + 10)]; }
  } else if (t?.kind === "zone") {
    const z = refs.zones;
    if (z) hr = t.zone === 1 ? [z[0] - 30, z[0]] : t.zone === 5 ? [z[3] + 1, 230] : [z[t.zone - 2] + 1, z[t.zone - 1]];
  } else if (t?.kind === "pace") {
    pace = [t.secPerKm - 5, t.secPerKm + 5];
  } else if (t?.kind === "hr") {
    hr = [t.bpm - 3, t.bpm + 3];
  }
  let judge = t?.kind === "strides" ? null : def.judge ?? defaultJudge(t);
  if (judge === "pace" && !pace) judge = hr ? "hr" : null;
  else if (judge === "hr" && !hr) judge = pace ? "pace" : null;
  return { pace, hr, hrRef, hrCeiling, judge };
}

/** The pace used to turn a step's time into distance or back: its target pace, else the easy pace. */
function estimatePace(def: StepDef, refs: StepRefs): number {
  const r = resolveTarget(def, refs);
  if (r.pace) return (r.pace[0] + r.pace[1]) / 2;
  const easy = refs.easyPace ?? (refs.thresholdPace ? refs.thresholdPace * 1.25 : 360);
  return def.target?.kind === "jog" ? easy + 20 : easy;
}

export interface StepTotals { km: number; min: number; allTime: boolean; allDistance: boolean }

export function stepTotals(s: WorkoutSteps, refs: StepRefs): StepTotals {
  let km = 0, min = 0;
  const flat = flattenSteps(s);
  for (const f of flat) {
    const p = estimatePace(f.def, refs);
    if (f.def.km != null) { km += f.def.km; min += (f.def.km * p) / 60; } else if (f.def.min != null) { min += f.def.min; km += (f.def.min * 60) / p; }
  }
  return { km, min, allTime: flat.every((f) => f.def.min != null), allDistance: flat.every((f) => f.def.km != null) };
}

/** The workout's planned amount from its steps: minutes when every step is timed, otherwise distance. */
export function plannedFromSteps(s: WorkoutSteps, refs: StepRefs): { distanceKm: number | null; durationMin: number | null } {
  const tot = stepTotals(s, refs);
  return tot.allTime ? { distanceKm: null, durationMin: Math.round(tot.min) } : { distanceKm: Math.round(tot.km * 10) / 10, durationMin: null };
}

/** Read stored steps, tolerating an old or broken value (it becomes "no steps" rather than an error). */
export function readSteps(json: string | null): WorkoutSteps | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as WorkoutSteps;
    return v && v.v === 1 && Array.isArray(v.items) && v.items.length ? v : null;
  } catch {
    return null;
  }
}

/** Set what one step is judged on and return the new text (the dialog's "judged on" button). */
export function withJudge(s: WorkoutSteps, item: number, part: "work" | "rest" | "step", judge: Judge): WorkoutSteps {
  const items = s.items.map((it, i) => {
    if (i !== item) return it;
    const set = (d: StepDef): StepDef => {
      const next: StepDef = { ...d };
      if (judge === defaultJudge(d.target)) delete next.judge; else next.judge = judge;
      return next;
    };
    if (it.kind === "step") return { ...it, step: set(it.step) };
    return part === "rest" && it.rest ? { ...it, rest: set(it.rest) } : { ...it, work: set(it.work) };
  });
  return { v: 1, items };
}

/* ---------- Strides ---------- */

/** Strides as Fartlek writes them: reps × 20 s, 1 min jog between, at the end of an easy run. */
export const STRIDES = { reps: 6, sec: 20, restMin: 1, minReps: 2, maxReps: 12 } as const;

export function stridesRepeat(reps: number = STRIDES.reps): StepItem {
  return { kind: "repeat", times: reps, work: { min: Math.round((STRIDES.sec / 60) * 1000) / 1000, target: { kind: "strides" } }, rest: { min: STRIDES.restMin, target: { kind: "jog" } } };
}

/** An easy run of `base` (km or min) with strides at the end. */
export function withStrides(base: Pick<StepDef, "km" | "min">, reps: number = STRIDES.reps): WorkoutSteps {
  const run: StepDef = { ...(base.min != null ? { min: base.min } : { km: base.km }), target: { kind: "easy" } };
  return { v: 1, items: [{ kind: "step", step: run }, stridesRepeat(reps)] };
}

/** The easy run and rep count when the steps are exactly "easy run + strides" (the block text's `+ strides`), else null. */
export function stridesOf(s: WorkoutSteps | null): { base: StepDef; reps: number } | null {
  if (!s || s.items.length !== 2) return null;
  const [a, b] = s.items;
  if (a.kind !== "step" || b.kind !== "repeat" || a.step.target?.kind !== "easy" || a.step.judge) return null;
  if (b.work.target?.kind !== "strides" || Math.round((b.work.min ?? 0) * 60) !== STRIDES.sec || b.work.km != null) return null;
  if (b.rest?.target?.kind !== "jog" || b.rest.min !== STRIDES.restMin) return null;
  return { base: a.step, reps: b.times };
}

/** Whether any step is strides (the week chips' "+ strides"). */
export const hasStrides = (s: WorkoutSteps | null) => !!s?.items.some((it) => it.kind === "repeat" && it.work.target?.kind === "strides");
