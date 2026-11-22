import { KM_PER_MI, fromUserDist, toUserDist, type Units } from "./format";
import { stepIntensity } from "./load";
import { thresholdSteps } from "./nextweek";
import { flattenSteps, resolveTarget, stridesRepeat, withStrides, type StepDef, type StepItem, type StepRefs, type StepRole, type StepTarget, type WorkoutSteps } from "./steps";
import type { Threshold, WorkoutType } from "./types";

/*
 * Edits for the session builder (docs/decisions/fartlek-session-builder.md): the rows the runner
 * clicks together, as plain functions on WorkoutSteps. The builder writes the result back as step
 * text, so the text, the block text and the server keep one grammar.
 */

/* ---------- Amounts ---------- */

/** `dist` is the user's distance unit (km or mi). */
export type AmountUnit = "dist" | "m" | "min" | "s";
export interface Amount { value: number; unit: AmountUnit }

const round = (n: number, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

/** How a step's amount is shown in a row: whole minutes as min, the rest as s; under 1 km as m (metric). */
export function amountOf(def: Pick<StepDef, "km" | "min">, units: Units): Amount {
  if (def.min != null) {
    const sec = Math.round(def.min * 60);
    return sec % 60 === 0 ? { value: sec / 60, unit: "min" } : { value: sec, unit: "s" };
  }
  const km = def.km ?? 0;
  if (units === "metric" && km > 0 && km < 1) return { value: Math.round(km * 1000), unit: "m" };
  return { value: round(toUserDist(km, units), 2), unit: "dist" };
}

export function withAmount<T extends StepDef>(def: T, a: Amount, units: Units): T {
  const next: T = { ...def };
  delete next.km;
  delete next.min;
  if (a.unit === "min") next.min = round(a.value);
  else if (a.unit === "s") next.min = round(a.value / 60);
  else if (a.unit === "m") next.km = round(a.value / 1000);
  else next.km = round(fromUserDist(a.value, units));
  return next;
}

/* ---------- Targets ---------- */

export type TargetChoice = "easy" | "jog" | "threshold" | "strides" | "z1" | "z2" | "z3" | "z4" | "z5" | "pct" | "pace" | "hr" | "none";
export const TARGET_CHOICES: TargetChoice[] = ["easy", "jog", "threshold", "strides", "z1", "z2", "z3", "z4", "z5", "pct", "pace", "hr", "none"];
/** Choices that need a number beside them, with what the number starts at. */
export const TARGET_VALUE: Partial<Record<TargetChoice, number>> = { pct: 90, pace: 300, hr: 150 };

export function choiceOf(t: StepTarget | null): TargetChoice {
  if (!t) return "none";
  if (t.kind === "zone") return `z${t.zone}` as TargetChoice;
  return t.kind;
}

/** The number a pct/pace/hr target carries (pace in s per km). */
export function targetValue(t: StepTarget | null): number | null {
  if (t?.kind === "pct") return t.pct;
  if (t?.kind === "pace") return t.secPerKm;
  if (t?.kind === "hr") return t.bpm;
  return null;
}

export function targetFor(choice: TargetChoice, value?: number | null): StepTarget | null {
  switch (choice) {
    case "none": return null;
    case "pct": return { kind: "pct", pct: value ?? TARGET_VALUE.pct! };
    case "pace": return { kind: "pace", secPerKm: value ?? TARGET_VALUE.pace! };
    case "hr": return { kind: "hr", bpm: value ?? TARGET_VALUE.hr! };
    case "z1": case "z2": case "z3": case "z4": case "z5": return { kind: "zone", zone: Number(choice[1]) };
    default: return { kind: choice };
  }
}

/** A new target keeps the step's "judged on" only if it can still be judged that way (resolveTarget falls back anyway). */
export function withTarget<T extends StepDef>(def: T, choice: TargetChoice, value?: number | null): T {
  const next: T = { ...def, target: targetFor(choice, value) };
  if (choice === "strides" || choice === "jog" || choice === "none") delete next.judge;
  return next;
}

/** Pace typed as m:ss in the user's unit → s per km; null when it can't be read. */
export function readPace(text: string, units: Units): number | null {
  const m = text.trim().match(/^(\d{1,2}):([0-5]\d)$/);
  if (!m) return null;
  const perUnit = Number(m[1]) * 60 + Number(m[2]);
  const sec = Math.round(units === "imperial" ? perUnit / KM_PER_MI : perUnit);
  return sec >= 120 && sec <= 900 ? sec : null;
}
export function paceText(secPerKm: number, units: Units): string {
  const s = Math.round(units === "imperial" ? secPerKm * KM_PER_MI : secPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/* ---------- Items ---------- */

export type NewItem = "step" | "repeat" | "strides";

export function newItem(kind: NewItem): StepItem {
  if (kind === "strides") return stridesRepeat();
  if (kind === "repeat") return { kind: "repeat", times: 4, work: { min: 3, target: { kind: "threshold" } }, rest: { min: 1, target: { kind: "jog" } } };
  return { kind: "step", step: { km: 2, target: { kind: "easy" } } };
}

const of = (items: StepItem[]): WorkoutSteps | null => (items.length ? { v: 1, items } : null);

/** Steps with one more item: strides at the end, a step before a trailing cool-down… kept simple: at the end. */
export function addItem(s: WorkoutSteps | null, kind: NewItem): WorkoutSteps {
  return { v: 1, items: [...(s?.items ?? []), newItem(kind)] };
}
export function setItem(s: WorkoutSteps, i: number, item: StepItem): WorkoutSteps {
  return { v: 1, items: s.items.map((x, k) => (k === i ? item : x)) };
}
export function removeItem(s: WorkoutSteps, i: number): WorkoutSteps | null {
  return of(s.items.filter((_, k) => k !== i));
}
export function moveItem(s: WorkoutSteps, i: number, dir: -1 | 1): WorkoutSteps {
  const j = i + dir;
  if (j < 0 || j >= s.items.length) return s;
  const items = [...s.items];
  [items[i], items[j]] = [items[j], items[i]];
  return { v: 1, items };
}
export function duplicateItem(s: WorkoutSteps, i: number): WorkoutSteps {
  const items = [...s.items];
  items.splice(i + 1, 0, structuredClone(items[i]));
  return { v: 1, items };
}

/* ---------- Templates ---------- */

export type TemplateId = "threshold" | "strides" | "progressive" | "longMp";
export interface Template { id: TemplateId; type: WorkoutType; steps: WorkoutSteps }

/** Marathon pace as a share of threshold speed in the long-run template; the runner changes it to their own. */
export const MP_PCT = 88;

export const TEMPLATES: Template[] = [
  { id: "threshold", type: "threshold", steps: thresholdSteps(3, 8) },
  { id: "strides", type: "easy", steps: withStrides({ km: 8 }) },
  { id: "progressive", type: "threshold", steps: { v: 1, items: [
    { kind: "step", step: { km: 3, target: { kind: "easy" } } },
    { kind: "step", step: { km: 3, target: { kind: "zone", zone: 3 } } },
    { kind: "step", step: { km: 3, target: { kind: "threshold" } } },
    { kind: "step", step: { km: 1, target: { kind: "easy" } } },
  ] } },
  { id: "longMp", type: "long", steps: { v: 1, items: [
    { kind: "step", step: { km: 6, target: { kind: "easy" } } },
    { kind: "repeat", times: 3, work: { km: 3, target: { kind: "pct", pct: MP_PCT } }, rest: { km: 1, target: { kind: "easy" } } },
    { kind: "step", step: { km: 2, target: { kind: "easy" } } },
  ] } },
];

/* ---------- Profile and totals ---------- */

export interface Segment { min: number; intensity: number; role: StepRole; target: StepTarget | null }

/** Rough minutes for a step: its time, or its distance at its target pace (easy pace without one). */
function minutesOf(def: StepDef, refs: StepRefs): number {
  if (def.min != null) return def.min;
  const r = resolveTarget(def, refs);
  const easy = refs.easyPace ?? (refs.thresholdPace ? refs.thresholdPace * 1.25 : 360);
  const pace = r.pace ? (r.pace[0] + r.pace[1]) / 2 : def.target?.kind === "jog" ? easy + 20 : easy;
  return ((def.km ?? 0) * pace) / 60;
}

export const refsThreshold = (refs: StepRefs): Threshold | null =>
  refs.thresholdPace || refs.thresholdHr ? { id: 0, effectiveDate: "", paceSecPerKm: refs.thresholdPace, hr: refs.thresholdHr } : null;

/** The session's shape for the profile bar: every step in order, width by time, height by intensity. */
export function profile(s: WorkoutSteps, refs: StepRefs): Segment[] {
  const t = refsThreshold(refs);
  return flattenSteps(s).map((f) => ({ min: minutesOf(f.def, refs), intensity: stepIntensity(f.def.target, t), role: f.role, target: f.def.target }));
}

/** Minutes at threshold or harder, strides left out (they are seconds, not a session). */
export function qualityMin(segments: Segment[]): number {
  return segments.filter((x) => x.intensity >= 0.95 && x.target?.kind !== "strides").reduce((a, x) => a + x.min, 0);
}

/** The colour band of an intensity, for the profile and the row badges. */
export type Band = "jog" | "easy" | "steady" | "hard" | "fast";
export function bandOf(intensity: number, target: StepTarget | null): Band {
  if (target?.kind === "strides") return "fast";
  if (target?.kind === "jog" || intensity < 0.7) return "jog";
  if (intensity < 0.8) return "easy";
  if (intensity < 0.93) return "steady";
  return intensity <= 1.02 ? "hard" : "fast";
}
