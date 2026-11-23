import { fromExportName } from "./gym";
import type { GymEntry, GymSet, SetKind } from "./gymplan";
import type { ISODate } from "./dates";

/*
 * Import of a CSV export from Bolt (iOS), so "last time" works from the first session in Fartlek.
 * One row per set: Date, Workout Name, Exercise Name, Set, Weight, Reps, Distance, Duration, Level, Notes.
 * Weights use a decimal comma ("31,8"), Set is a number or W (warm-up) / D (drop set), body-weight sets
 * have weight 0, and the date with its time identifies the workout.
 */

export interface ImportedSession { clientId: string; date: ISODate; startedAt: number | null; name: string; entries: GymEntry[] }
export interface ParsedImport { sessions: ImportedSession[]; unknown: string[]; errors: string[] }

/** Split CSV text into rows of fields, honouring quotes and doubled quotes inside them. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

const number = (v: string | undefined): number | null => {
  if (v == null || v.trim() === "") return null;
  const n = Number(v.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

export function parseBoltCsv(text: string): ParsedImport {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  const head = (rows.shift() ?? []).map((h) => h.trim().toLowerCase());
  const col = (name: string) => head.indexOf(name);
  const c = { date: col("date"), workout: col("workout name"), exercise: col("exercise name"), set: col("set"), weight: col("weight"), reps: col("reps"), duration: col("duration"), notes: col("notes") };
  if (c.date < 0 || c.exercise < 0 || c.set < 0) return { sessions: [], unknown: [], errors: ["not a Bolt export: Date, Exercise Name and Set columns are needed"] };
  const sessions = new Map<string, ImportedSession>();
  const unknown = new Set<string>();
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const stamp = (r[c.date] ?? "").trim();
    const m = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(stamp);
    const name = (r[c.exercise] ?? "").trim();
    if (!m || !name) { errors.push(`row ${i + 2} skipped`); return; }
    const setCol = (r[c.set] ?? "").trim().toUpperCase();
    const kind: SetKind = setCol === "W" ? "warmup" : setCol === "D" ? "drop" : "work";
    const id = fromExportName(name);
    if (id.startsWith("x:")) unknown.add(name);
    const seconds = c.duration >= 0 ? number(r[c.duration]) : null;
    const kg = c.weight >= 0 ? number(r[c.weight]) : null;
    const set: GymSet = { kind, kg: kg && kg > 0 ? kg : null, reps: c.reps >= 0 ? number(r[c.reps]) || null : null, seconds: seconds && seconds > 0 ? seconds : null };
    let s = sessions.get(stamp);
    if (!s) {
      const startedAt = m[2] ? Date.UTC(+m[1].slice(0, 4), +m[1].slice(5, 7) - 1, +m[1].slice(8, 10), +m[2], +m[3], +(m[4] ?? 0)) : null;
      s = { clientId: `bolt:${stamp.replace(/[^0-9]/g, "")}`, date: m[1], startedAt, name: (r[c.workout] ?? "").trim(), entries: [] };
      sessions.set(stamp, s);
    }
    // A new entry when the exercise changes; Bolt lists warm-ups after the work sets sometimes, so keep them together.
    let entry = s.entries.find((e) => e.exercise === id);
    if (!entry) { entry = { exercise: id, slot: null, sets: [] }; s.entries.push(entry); }
    entry.sets.push(set);
  });
  return { sessions: [...sessions.values()].sort((a, b) => a.date.localeCompare(b.date)), unknown: [...unknown].sort(), errors };
}
