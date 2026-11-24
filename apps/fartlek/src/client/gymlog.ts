import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "./http";
import { locale, t, type MsgKey } from "./i18n";
import { customName, exercise, isCustom, schemeFor, type Pattern, type Scheme, type TemplateId } from "@/shared/gym";
import { en as gymEn, sv as gymSv } from "./i18n/gym";
import { suggestSets, workSets, type GymSet, type GymSessionInput, type JointFeel, type LastTime, type LayoutEntry } from "@/shared/gymplan";
import type { ISODate } from "@/shared/dates";

/*
 * The phone side of the gym module (docs/decisions/fartlek-gym-module.md): a session in progress lives in
 * the browser's storage so a reload or a lost signal keeps it, and a finished session that couldn't be
 * sent waits in an outbox until there is a connection. The server saves a session once per client id,
 * so sending it twice is harmless.
 */

export interface DraftSet extends GymSet { done: boolean }
/** `uid` keeps a row the same element while the list is reordered (drafts saved before it existed have none). */
export interface DraftEntry { uid?: string; exercise: string; slot: Pattern | null; scheme: Scheme; note?: string; sets: DraftSet[] }
export interface Draft {
  clientId: string;
  date: ISODate;
  template: TemplateId | null;
  feel: JointFeel | null;
  workoutId: number | null;
  startedAt: number | null;
  /** The date of the runner's own version this session started from, or null when it started from the suggestion. */
  ownFrom?: ISODate | null;
  /** When the last set was ticked, for the rest clock. */
  lastSetAt: number | null;
  entries: DraftEntry[];
}

const DRAFT_KEY = "fartlek.gym.draft";
const OUTBOX_KEY = "fartlek.gym.outbox";

function read<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) as T : null;
  } catch { return null; }
}
function write(key: string, v: unknown) {
  try {
    if (v == null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(v));
  } catch { /* private mode or full storage: the session then lives only in memory */ }
}

export const loadDraft = () => read<Draft>(DRAFT_KEY);
export const saveDraft = (d: Draft | null) => write(DRAFT_KEY, d);

export const newClientId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** A new entry for an exercise, its sets filled in from last time. */
export function entryFor(id: string, slot: Pattern | null, scheme: Scheme | null, last: LastTime | undefined): DraftEntry {
  const sch = scheme ?? schemeFor(id);
  return { uid: Math.random().toString(36).slice(2, 10), exercise: id, slot, scheme: sch, note: last?.note ?? "", sets: suggestSets(id, sch, last).sets.map((s) => ({ ...s, done: false })) };
}

/**
 * The session as it stands, for the next session on the same template: every exercise still in it, skipped
 * ones included, with the number of sets planned. An exercise whose sets were all removed is left out.
 */
export function layoutOf(d: Draft): LayoutEntry[] | null {
  if (!d.template) return null;
  return d.entries.flatMap((e) => {
    const sets = workSets(e.sets).length;
    return sets ? [{ exercise: e.exercise, slot: e.slot, scheme: { ...e.scheme, sets } }] : [];
  });
}

export function toInput(d: Draft): GymSessionInput {
  return {
    clientId: d.clientId, date: d.date, startedAt: d.startedAt, finishedAt: Date.now(), template: d.template, feel: d.feel, workoutId: d.workoutId,
    layout: layoutOf(d),
    entries: d.entries.map((e) => ({ exercise: e.exercise, slot: e.slot, note: e.note?.trim() || null, sets: e.sets.filter((s) => s.done).map((s) => ({ kind: s.kind, kg: s.kg, reps: s.reps, seconds: s.seconds })) })).filter((e) => e.sets.length),
  };
}

/**
 * Changes set `j` of an exercise. A new weight also goes to the sets below that are not done and still had
 * the old weight, so 10 kg typed on the first set is suggested on the rest (one a runner set by hand stays).
 */
export function patchSet(sets: DraftSet[], j: number, patch: Partial<DraftSet>): DraftSet[] {
  const old = sets[j]?.kg ?? null;
  return sets.map((s, m) => {
    if (m === j) return { ...s, ...patch };
    if ("kg" in patch && m > j && !s.done && (s.kg ?? null) === old) return { ...s, kg: patch.kg ?? null };
    return s;
  });
}

/** The list with the item at `from` moved to `to`. */
export function moveItem<T>(xs: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= xs.length || to >= xs.length) return xs;
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}

export const outbox = () => read<GymSessionInput[]>(OUTBOX_KEY) ?? [];
export function queue(s: GymSessionInput) {
  write(OUTBOX_KEY, [...outbox().filter((x) => x.clientId !== s.clientId), s]);
}

/** Sends what waits in the outbox; a session the server refuses as invalid is dropped rather than retried forever. */
export async function flushOutbox(): Promise<number> {
  let sent = 0;
  for (const s of outbox()) {
    try {
      await api("/gym/sessions", { body: s });
      sent++;
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 400)) continue;
    }
    write(OUTBOX_KEY, outbox().filter((x) => x.clientId !== s.clientId));
  }
  return sent;
}

/** Sessions waiting for a connection; tries to send them on mount and when the phone comes online. */
export function useOutbox(onSent?: () => void) {
  const [waiting, setWaiting] = useState(() => outbox().length);
  const flush = useCallback(async () => {
    if (!outbox().length) return;
    const n = await flushOutbox();
    setWaiting(outbox().length);
    if (n) onSent?.();
  }, [onSent]);
  useEffect(() => {
    void flush();
    window.addEventListener("online", flush);
    return () => window.removeEventListener("online", flush);
  }, [flush]);
  return waiting;
}

export const exName = (id: string) => isCustom(id) ? customName(id) : t(`ex.${id}` as MsgKey);
/** Lower case with spaces, hyphens and the like gone, so "Pull up", "pull-ups" and "Pullup" meet. */
export const normalize = (x: string) => x.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Whether an exercise matches a search: its name in both languages, the names other apps export it as
 * (Bolt), and its movement pattern, so "pull up" finds Chins whatever the UI language.
 */
export function matchesSearch(id: string, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const key = `ex.${id}` as keyof typeof gymEn;
  const terms = isCustom(id) ? [customName(id)] : [gymEn[key], gymSv[key], ...(exercise(id).aliases ?? [])];
  terms.push(patternName(id, null));
  return terms.some((x) => x && normalize(x).includes(q));
}

export const patternName = (id: string, slot: Pattern | null) => isCustom(id) && !slot ? t("gym.pattern.custom") : t(`gym.pattern.${slot ?? exercise(id).pattern}` as MsgKey);

export const fmtKg = (n: number) => n.toLocaleString(locale, { maximumFractionDigits: 2 });

/** "60 × 8, 8, 6", "8, 6, 5" (body weight), "40 s, 45 s", or "60 × 8, 62,5 × 6" when the weight changed. */
export function setsText(sets: GymSet[]): string {
  const work = workSets(sets);
  if (!work.length) return "";
  if (work.every((s) => s.seconds != null && s.reps == null)) return work.map((s) => `${s.seconds} ${t("gym.sec")}`).join(", ");
  const kgs = new Set(work.map((s) => s.kg ?? 0));
  if (kgs.size === 1) {
    const kg = work[0].kg;
    const reps = work.map((s) => s.reps ?? "–").join(", ");
    return kg ? `${fmtKg(kg)} × ${reps}` : reps;
  }
  return work.map((s) => (s.kg ? `${fmtKg(s.kg)} × ${s.reps ?? "–"}` : `${s.reps ?? "–"}`)).join(", ");
}

/** "3 × 8–10 · 62,5 kg" for the session page. */
export function planText(e: DraftEntry): string {
  const ex = exercise(e.exercise);
  const range = e.scheme.low === e.scheme.high ? `${e.scheme.low}` : `${e.scheme.low}–${e.scheme.high}`;
  const kg = e.sets.find((s) => s.kg)?.kg;
  const amount = ex.load === "time" ? `${e.sets.length} × ${range} ${t("gym.sec")}` : `${e.sets.length} × ${range}`;
  return kg ? `${amount} · ${fmtKg(kg)} ${t("gym.kg")}` : ex.load === "bw" ? `${amount} · ${t("gym.bodyweight")}` : amount;
}

export const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};
