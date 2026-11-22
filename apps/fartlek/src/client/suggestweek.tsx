import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { api, useApi } from "./http";
import { lang, locale, t, tn, WEEKDAY_LONG, WEEKDAY_SHORT } from "./i18n";
import { useFmt, useSettings } from "./prefs";
import { Button, Dialog, ErrorText, InfoTip, Spinner, cn } from "./ui";
import { TYPE_COLOR } from "./bits";
import { addDays, weekNumber, weekday, type ISODate } from "@/shared/dates";
import { sessionText } from "@/shared/blocktext";
import { COACH } from "@/shared/coach";
import { FORM, formPct } from "@/shared/load";
import { evaluate, growthBase, NEXT, type DaysAdvice, spikeMax, stepsKm, thresholdSteps, type SuggestItem, type SuggestType, type Suggestion, type Try, type WeekEval, type WeekSeed, type Why } from "@/shared/nextweek";
import { stepsText, stridesOf, withStrides, type WorkoutSteps } from "@/shared/steps";
import { StepsPanel } from "./sessionbuilder";
import type { Settings, Workout } from "@/shared/types";

/*
 * "Suggest next week" (docs/decisions/fartlek-suggest-week.md): a short honest simulation of what the
 * engine tried, then the week to edit freely. Numbers and charts are re-evaluated from the seed on every
 * change; nothing blocks "Use", the warnings only say what is off.
 */

type Res = { weekStart: ISODate; ok: false; reason: "race" } | { weekStart: ISODate; ok: true; seed: WeekSeed; suggestion: Suggestion; replaces: Workout[]; advice: DaysAdvice | null };
/** What "Använd" wrote and what it replaced, for undo. */
export interface Applied { ids: number[]; removed: Workout[] }

const stepLang = lang === "sv" ? "sv" : "en";
export const one = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const ratio = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${one(Math.abs(v))}`;
export const signedInt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}`;
const pctText = (g: number | null) => (g == null ? "" : `${signedInt(g * 100)} %`);
const STEP_MS = 650;

/** Days of the week, each with at most one session (the suggestion never stacks two). */
const byDay = (weekStart: ISODate, items: SuggestItem[]) =>
  Array.from({ length: 7 }, (_, i) => { const d = addDays(weekStart, i); return { date: d, item: items.find((x) => x.date === d) ?? null }; });

export function SuggestWeekDialog({ weekStart, light, onClose, onApplied }: { weekStart: ISODate; /** Build the week lighter (Monday's check-in after stress or tiredness). */ light?: boolean; onClose: () => void; onApplied: (a: Applied) => void }) {
  // `rev` makes a new request after a run day was added, so the simulation is run again with it.
  const [rev, setRev] = useState(0);
  const { data, error, loading } = useApi<Res>(`/plan/next-week?weekStart=${weekStart}${light ? "&light=1" : ""}&r=${rev}`);
  const [phase, setPhase] = useState<"sim" | "days" | "edit">("sim");
  const ready = data && !loading;
  return (
    <Dialog open onClose={onClose} title={t("next.title", { week: weekNumber(weekStart) })} className="sm:max-w-5xl">
      <ErrorText>{error}</ErrorText>
      {(!ready) && !error && <Spinner className="text-muted-foreground" />}
      {ready && !data.ok && <p className="text-sm text-muted-foreground">{t("next.race")}</p>}
      {ready && data.ok && phase === "sim" && <Simulation s={data.suggestion} onDone={() => setPhase(data.advice ? "days" : "edit")} />}
      {ready && data.ok && phase === "days" && data.advice && (
        <MoreDays advice={data.advice} onAdded={() => { setRev(rev + 1); setPhase("sim"); }} onSkip={() => setPhase("edit")} />
      )}
      {ready && data.ok && phase === "edit" && <Editor seed={data.seed} s={data.suggestion} replaces={data.replaces} onClose={onClose} onApplied={onApplied} />}
    </Dialog>
  );
}

/**
 * "We recommend another run day": shown after the simulation when the plan needs more days than the runner has
 * (shared/nextweek.ts `daysAdvice`), for a new week or block, never a running one. The free days come furthest
 * from the hard sessions first. A pick is added to the run days in the settings and the simulation runs again;
 * "continue anyway" keeps the days as they are (nothing is locked, and nothing is remembered).
 */
export function MoreDays({ advice, onAdded, onSkip }: { advice: DaysAdvice; onAdded: () => void; onSkip: () => void }) {
  const fmt = useFmt();
  const { settings, setSettings } = useSettings();
  const [busy, setBusy] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const add = async (day: number) => {
    setBusy(day); setErr(null);
    try {
      const next = await api<Settings>("/settings", { method: "PUT", body: { ...settings, runDays: [...new Set([...settings.runDays, day])].sort() } });
      setSettings(next);
      onAdded();
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  return (
    <div className="space-y-4 py-2">
      <h3 className="text-lg font-semibold">{t("days.title")}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {advice.why.includes("peak") && <li>{t("days.peak", { dist: fmt.dist(advice.peakKm, 0), have: advice.have, need: advice.need })}</li>}
        {advice.why.includes("fit") && <li>{t("days.fit", { have: advice.have, dist: fmt.dist(advice.shortKm, 0) })}</li>}
      </ul>
      <p className="text-sm">{t("days.pick")}</p>
      <div className="flex flex-wrap gap-2">
        {advice.free.map((d, i) => (
          <Button key={d} variant={i === 0 ? "primary" : "outline"} disabled={busy != null} onClick={() => void add(d)}>
            {busy === d ? <Spinner /> : WEEKDAY_LONG[d]}
          </Button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("days.note")}</p>
      <div><Button variant="outline" disabled={busy != null} onClick={onSkip}>{t("days.skip")}</Button></div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

/* ---------- The simulation: the engine's real tries, one line at a time ---------- */

export interface Line { text: string; verdict: string | null; tone: "ok" | "no" | "info" }

type Fmt = ReturnType<typeof useFmt>;

/** The verdict of a variant that wasn't tried, from its `why`. */
export const skipVerdict = (p: Try["params"]) =>
  p.why === "fewDays" ? t("next.v.fewDays", { need: p.need ?? NEXT.secondMinDays }) : p.why === "fewKm" ? t("next.v.fewKm")
    : p.why === "short" ? t("next.v.short") : p.why === "noLong" ? t("next.v.noLong") : t("next.v.notNeeded");

function tryLine(tr: Try, fmt: Fmt): Line {
  const form = tr.form == null ? "" : signed(tr.form);
  const p = { ...tr.params, dist: fmt.dist(tr.km), form, pct: typeof tr.params.pct === "number" ? `${signedInt(tr.params.pct)} %` : tr.params.pct ?? "",
    pace: typeof tr.params.pace === "number" ? fmt.pace(tr.params.pace) : "",
    why: tr.id === "backoff" ? t(`next.backoffWhy.${(tr.params.why as "asked" | "form") ?? "form"}`, { form: `${signedInt(Number(tr.params.formPct ?? 0))} %` }) : "" };
  if (tr.state === "skip") return { text: tr.id === "tempo" ? t("next.try.tempoSkip") : t(`next.try.${tr.id}`, p).replace(/ → .*$/, ""), verdict: skipVerdict(tr.params), tone: "info" };
  const plain = tr.id === "start" || tr.id === "target" || tr.id === "backoff";
  return { text: t(`next.try.${tr.id}`, p), verdict: plain ? null : t(`next.v.${tr.state}`), tone: tr.state === "ok" ? "ok" : plain ? "info" : "no" };
}

function Simulation({ s, onDone }: { s: Suggestion; onDone: () => void }) {
  const fmt = useFmt();
  const longDay = s.items.find((x) => x.type === "long")?.date;
  const lines: Line[] = useMemo(() => [
    { text: t("next.try.read", { dist: fmt.dist(s.before.km), form: signed(s.before.tsb) }), verdict: null, tone: "info" },
    ...s.tries.map((tr) => tryLine(tr, fmt)),
    { text: t("next.try.place", { day: longDay ? WEEKDAY_LONG[weekday(longDay)].toLowerCase() : "–" }), verdict: null, tone: "ok" },
  ], [s, fmt, longDay]);
  return <SimLines lines={lines} onDone={onDone} />;
}

/** The engine's tries shown one line at a time, then `onDone`. */
export function SimLines({ lines, onDone, running = t("next.sim.running") }: { lines: Line[]; onDone: () => void; running?: string }) {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduced ? lines.length : 0);
  const done = shown >= lines.length;
  useEffect(() => {
    if (done) { const id = setTimeout(onDone, reduced ? 400 : 700); return () => clearTimeout(id); }
    const id = setTimeout(() => setShown((n) => n + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [shown, done, onDone, reduced]);
  const headline = done ? t("next.sim.done") : shown < 2 ? running : t("next.sim.testing");
  return (
    <div className="space-y-4 py-2" aria-live="polite">
      <div className="flex items-center gap-3">
        {done
          ? <svg viewBox="0 0 24 24" className="size-6 text-success" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
          : <Spinner className="text-signature" />}
        <h3 className="text-lg font-semibold">{headline}</h3>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-signature transition-[width] duration-500" style={{ width: `${Math.round((shown / lines.length) * 100)}%` }} />
      </div>
      <ol className="space-y-2.5">
        {lines.slice(0, shown).map((l, i) => (
          <li key={i} className="flex items-center gap-3 text-sm motion-safe:animate-[fadein_.25s_ease-out]">
            <LineIcon tone={l.tone} />
            <span className="flex-1">{l.text}</span>
            {l.verdict && <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", l.tone === "ok" ? "bg-success/15 text-success" : l.tone === "no" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>{l.verdict}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function LineIcon({ tone }: { tone: Line["tone"] }) {
  if (tone === "ok") return <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>;
  if (tone === "no") return <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-warning" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>;
  return <svg viewBox="0 0 24 24" className="size-[18px] shrink-0 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><circle cx="12" cy="12" r="3.5" /></svg>;
}

/* ---------- The editor ---------- */

const TYPES: SuggestType[] = ["easy", "threshold", "long", "cross"];

/** Session edits shared by the week and block dialogs: change type, one step shorter or longer, a new easy run. */
export function editType(x: SuggestItem, type: SuggestType, refs: WeekSeed["refs"]): SuggestItem {
  if (type === x.type) return x;
  if (type === "cross") return { date: x.date, type, km: 0, durationMin: 45, steps: null };
  if (type === "threshold") { const r = NEXT.ladder[0], steps = thresholdSteps(r.reps, r.min, r.rest); return { date: x.date, type, km: stepsKm(steps, refs), durationMin: null, steps }; }
  return { date: x.date, type, km: x.type === "cross" ? 6 : x.km, durationMin: null, steps: null };
}
export function editStep(x: SuggestItem, dir: 1 | -1, refs: WeekSeed["refs"]): SuggestItem {
  if (x.type === "cross") return { ...x, durationMin: Math.max(15, (x.durationMin ?? 45) + dir * 15) };
  const st = stridesOf(x.steps);
  if (st && st.base.km != null) {
    // An easy run with strides grows at the run, so the strides stay as they are.
    const steps = withStrides({ km: Math.max(1, Math.round((st.base.km + dir * 0.5) * 2) / 2) }, st.reps);
    return { ...x, steps, km: stepsKm(steps, refs) };
  }
  if (x.steps) { const steps = withCooldown(x.steps, dir * 0.5); return { ...x, steps, km: stepsKm(steps, refs) }; }
  const by = x.km >= 20 ? 1 : 0.5;
  return { ...x, km: Math.max(1, Math.round((x.km + dir * by) * 2) / 2) };
}
export const newEasy = (date: ISODate): SuggestItem => ({ date, type: "easy", km: 6, durationMin: null, steps: null });

/** Threshold sessions change length at the cool-down, so the reps stay as planned. */
function withCooldown(s: WorkoutSteps, by: number): WorkoutSteps {
  const items = [...s.items];
  const last = items.at(-1);
  if (last?.kind === "step" && last.step.km != null) items[items.length - 1] = { ...last, step: { ...last.step, km: Math.max(0.5, Math.round((last.step.km + by) * 2) / 2) } };
  return { ...s, items };
}

function Editor({ seed, s, replaces, onClose, onApplied }: { seed: WeekSeed; s: Suggestion; replaces: Workout[]; onClose: () => void; onApplied: (a: Applied) => void }) {
  const fmt = useFmt();
  const [items, setItems] = useState<SuggestItem[]>(s.items);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ev = useMemo(() => evaluate(seed, items), [seed, items]);
  const days = byDay(seed.weekStart, items);
  const edited = JSON.stringify(items) !== JSON.stringify(s.items);
  const dayName = (d: ISODate) => WEEKDAY_LONG[weekday(d)].toLowerCase();

  const update = (date: ISODate, fn: (it: SuggestItem) => SuggestItem | null) =>
    setItems((xs) => xs.flatMap((x) => (x.date === date ? (fn(x) ? [fn(x)!] : []) : [x])));
  const swap = (a: ISODate, b: ISODate) => setItems((xs) => xs.map((x) => (x.date === a ? { ...x, date: b } : x.date === b ? { ...x, date: a } : x)));
  const setType = (date: ISODate, type: SuggestType) => update(date, (x) => editType(x, type, seed.refs));
  const step = (date: ISODate, dir: 1 | -1) => update(date, (x) => editStep(x, dir, seed.refs));
  const add = (date: ISODate) => setItems((xs) => [...xs, newEasy(date)].sort((a, b) => a.date.localeCompare(b.date)));
  const [stepsOf, setStepsOf] = useState<ISODate | null>(null);
  const editing = stepsOf ? items.find((x) => x.date === stepsOf && x.type !== "cross") ?? null : null;

  const apply = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await api<Applied>("/plan/next-week", { body: { weekStart: seed.weekStart, items, replace: replaces.map((w) => w.id) } });
      onApplied(r);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };

  const drag = useDayDrag((from, to) => swap(from, to));
  const blockText = items.map((x) => sessionText({ type: x.type, distanceKm: x.type === "cross" ? null : x.km, durationMin: x.durationMin, zone2: false, steps: x.steps }, fmt.units, stepLang)).join(", ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{t("next.suggestion")}</h3>
        <span className="text-xs text-muted-foreground">{edited ? t("next.edited") : <span className="hidden md:inline">{t("next.dragHint")}</span>}</span>
      </div>
      <WhyLine why={s.why} />

      <div className="grid gap-2 md:grid-cols-7">
        {days.map(({ date, item }, i) => (
          <DayCell key={date} date={date} item={item} refsKm={(x) => fmt.dist(x)} first={i === 0} last={i === 6}
            over={drag.over === date && drag.from !== date} dragged={drag.from === date}
            onStart={(e) => drag.start(e, date)} onType={(v) => setType(date, v)} onStep={(d) => step(date, d)}
            onRemove={() => update(date, () => null)} onAdd={() => add(date)}
            onLeft={() => swap(date, addDays(date, -1))} onRight={() => swap(date, addDays(date, 1))} dayName={dayName(date)}
            onSteps={() => setStepsOf(stepsOf === date ? null : date)} stepsOpen={stepsOf === date} />
        ))}
      </div>
      {editing && (
        <StepsPanel key={editing.date} item={editing} refs={seed.refs} title={t("builder.editing", { day: dayName(editing.date) })}
          onChange={(it) => update(editing.date, () => it)} onClose={() => setStepsOf(null)} />
      )}
      {drag.label && <div aria-hidden className="pointer-events-none fixed z-[60] rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background" style={{ left: drag.label.x + 12, top: drag.label.y + 12 }}>{drag.label.text}</div>}

      <Stats seed={seed} ev={ev} />
      {ev.state === "under" && !edited && <p className="text-xs text-muted-foreground">{t("next.underNote", { pct: Math.round((COACH.weekGrowth - 1) * 100) })}</p>}
      <Warnings ev={ev} />
      <Charts seed={seed} ev={ev} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap gap-x-5 gap-y-2 text-sm">
          <details className="min-w-0">
            <summary className="cursor-pointer text-primary">{t("next.blockText")}</summary>
            <pre className="mt-2 whitespace-pre-wrap rounded-md border border-border bg-muted px-3 py-2 font-mono text-xs">{blockText || "-"}</pre>
          </details>
          <details className="min-w-0">
            <summary className="cursor-pointer text-primary">{t("next.how")}</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {s.tries.map((tr, i) => {
                const l = tryLine(tr, fmt);
                return <li key={i} className={cn(tr.id === s.chosen && tr.state !== "skip" && "text-foreground")}>{l.text}{l.verdict ? `: ${l.verdict.toLowerCase()}` : ""}</li>;
              })}
            </ul>
          </details>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {replaces.length > 0 && <span className="text-xs text-muted-foreground">{tn("next.replaces", replaces.length)}</span>}
          <Button variant="outline" onClick={onClose}>{t("common.cancel")}</Button>
          {edited && <Button variant="outline" onClick={() => setItems(s.items)}>{t("next.restore")}</Button>}
          <Button onClick={() => void apply()} disabled={busy || !items.length}>{busy ? <Spinner /> : t("next.apply")}</Button>
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
    </div>
  );
}

/** Drag a day's session onto another day (swap). Mouse: the whole card; touch: the grip, so scrolling still works. */
export function useDayDrag(onDrop: (from: ISODate, to: ISODate) => void) {
  const [from, setFrom] = useState<ISODate | null>(null);
  const [over, setOver] = useState<ISODate | null>(null);
  const [label, setLabel] = useState<{ x: number; y: number; text: string } | null>(null);
  const pending = useRef<{ date: ISODate; x: number; y: number; text: string; id: number } | null>(null);
  const live = useRef<{ from: ISODate | null; over: ISODate | null }>({ from: null, over: null });

  useEffect(() => {
    const dayAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest("[data-day]") as HTMLElement | null)?.dataset.day ?? null;
    const onMove = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      if (!live.current.from && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 5) { live.current.from = p.date; setFrom(p.date); }
      if (!live.current.from) return;
      e.preventDefault();
      const d = dayAt(e.clientX, e.clientY);
      if (d !== live.current.over) { live.current.over = d; setOver(d); }
      setLabel({ x: e.clientX, y: e.clientY, text: p.text });
    };
    const end = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      const { from: f, over: o } = live.current;
      if (f && o && o !== f && e.type === "pointerup") onDrop(f, o);
      pending.current = null; live.current = { from: null, over: null };
      setFrom(null); setOver(null); setLabel(null);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); };
  }, [onDrop]);

  const start = (e: ReactPointerEvent, date: ISODate) => {
    const el = e.target as HTMLElement;
    const onGrip = !!el.closest("[data-grip]");
    if (e.button !== 0 || (e.pointerType !== "mouse" && !onGrip) || (!onGrip && el.closest("button, select, input, summary"))) return;
    const text = (e.currentTarget as HTMLElement).dataset.label ?? "";
    pending.current = { date, x: e.clientX, y: e.clientY, text, id: e.pointerId };
    if (onGrip) { live.current.from = date; setFrom(date); setLabel({ x: e.clientX, y: e.clientY, text }); }
  };
  return { from, over, label, start };
}

export function DayCell({ date, item, first, last, over, dragged, dayName, refsKm, onStart, onType, onStep, onRemove, onAdd, onLeft, onRight, onSteps, stepsOpen, tall = true }: {
  date: ISODate; item: SuggestItem | null; first: boolean; last: boolean; over: boolean; dragged: boolean; dayName: string;
  refsKm: (km: number) => string; onStart: (e: ReactPointerEvent) => void; onType: (t: SuggestType) => void; onStep: (d: 1 | -1) => void;
  onRemove: () => void; onAdd: () => void; onLeft: () => void; onRight: () => void;
  /** Open the session builder for the day (the "Steps ›" link); left out where the steps can't be edited. */
  onSteps?: () => void; stepsOpen?: boolean;
  /** Cells in a row of seven are tall; in the block editor's columns they size to their content. */
  tall?: boolean;
}) {
  const color = item ? TYPE_COLOR[item.type] : undefined;
  const amount = item ? (item.type === "cross" ? `${item.durationMin} min` : refsKm(item.km)) : "";
  const strides = stridesOf(item?.steps ?? null);
  const reps = item?.steps && !strides ? item.steps.items.filter((x) => x.kind === "repeat") : [];
  // A long run's faster finish: its last step when that has a pace.
  const fast = item?.type === "long" ? item.steps?.items.at(-1) : undefined;
  const finish = fast?.kind === "step" && fast.step.target?.kind === "pace" ? stepsText({ v: 1, items: [fast] }, stepLang, "metric") : null;
  return (
    <div data-day={date} data-label={item ? `${t(`workout.${item.type}`)} · ${amount}` : undefined} onPointerDown={item ? onStart : undefined}
      className={cn("group flex select-none gap-2 rounded-lg border p-2.5 transition-opacity md:flex-col", tall ? "md:min-h-44" : "md:min-h-24",
        item ? "cursor-grab flex-col border-border bg-card" : "items-center border-transparent bg-muted md:items-stretch",
        over && "outline-dashed outline-2 outline-offset-2 outline-primary bg-accent", dragged && "opacity-45")}>
      <div className="flex h-6 items-center justify-between gap-1 text-xs text-muted-foreground">
        <span><span className="font-semibold text-foreground">{WEEKDAY_SHORT[weekday(date)]}</span> {Number(date.slice(8))}</span>
        {item && (
          <span className="flex items-center">
            <button type="button" data-grip aria-hidden tabIndex={-1} className="touch-none px-1 text-muted-foreground md:hidden">
              <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><circle cx="9" cy="7" r="1.5" /><circle cx="15" cy="7" r="1.5" /><circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" /><circle cx="9" cy="17" r="1.5" /><circle cx="15" cy="17" r="1.5" /></svg>
            </button>
            <button type="button" onClick={onRemove} aria-label={t("next.remove", { day: dayName })}
              className="inline-flex size-7 items-center justify-center rounded-md hover:bg-accent md:opacity-0 md:focus-visible:opacity-100 md:group-hover:opacity-100">
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          </span>
        )}
      </div>
      {item ? (
        <div className="grid flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 md:flex md:flex-col md:items-stretch md:gap-2">
          <select value={item.type} onChange={(e) => onType(e.target.value as SuggestType)} aria-label={t("next.type", { day: dayName })}
            className="h-8 w-full min-w-0 cursor-pointer truncate rounded-md border-0 px-1.5 text-sm font-semibold text-foreground"
            style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
            {TYPES.map((x) => <option key={x} value={x}>{t(`workout.${x}`)}</option>)}
          </select>
          {reps.length > 0 && <span className="col-span-2 row-start-2 text-xs text-muted-foreground">{stepsText({ v: 1, items: reps }, stepLang, "metric")}</span>}
          {strides && <span className="col-span-2 row-start-2 text-xs font-medium text-accent-foreground">{t("builder.stridesPlus", { n: strides.reps })}</span>}
          {finish && <span className="col-span-2 row-start-2 text-xs text-muted-foreground">{t("next.fastFinish", { text: finish })}</span>}
          {onSteps && item.type !== "cross" && (
            <button type="button" onClick={onSteps} onPointerDown={(e) => e.stopPropagation()} aria-expanded={!!stepsOpen}
              className={cn("col-span-2 justify-self-start text-left text-xs font-semibold text-primary hover:underline", stepsOpen && "underline")}>
              {t("builder.stepsLink")}
            </button>
          )}
          <div className="flex items-center justify-between gap-1 md:mt-auto">
            <Button variant="ghost" className="size-8 shrink-0 p-0 text-base" aria-label={t("next.less", { day: dayName })} onClick={() => onStep(-1)}>−</Button>
            <span className="whitespace-nowrap text-sm font-semibold tabular-nums">{amount}</span>
            <Button variant="ghost" className="size-8 shrink-0 p-0 text-base" aria-label={t("next.more", { day: dayName })} onClick={() => onStep(1)}>+</Button>
          </div>
          <div className="sr-only col-span-2 flex justify-between focus-within:not-sr-only">
            <Button variant="outline" className="h-8 px-2" disabled={first} aria-label={t("next.moveLeft", { day: dayName })} onClick={onLeft}>‹</Button>
            <Button variant="outline" className="h-8 px-2" disabled={last} aria-label={t("next.moveRight", { day: dayName })} onClick={onRight}>›</Button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={onAdd} aria-label={t("next.add", { day: dayName })}
          className="ml-auto flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground md:ml-0 md:size-auto md:min-h-10 md:flex-1">
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>
      )}
    </div>
  );
}

/* ---------- Numbers, warnings, charts ---------- */

export type Tone = "ok" | "warn" | "bad";
export const PILL: Record<Exclude<Tone, "ok">, string> = { warn: "bg-warning/15 text-warning", bad: "bg-danger/15 text-danger" };

/** The 30-day rule and the study behind it, for the ⓘ by the long run. */
export const STUDY_URL = "https://pmc.ncbi.nlm.nih.gov/articles/PMC12421110/";
export function SpikeInfo({ longestKm }: { longestKm: number }) {
  const fmt = useFmt();
  return (
    <InfoTip label={t("next.why.label")}>
      <span className="block">{longestKm > 0 ? t("next.why.info", { max: fmt.dist(spikeMax(longestKm)) }) : t("next.why.infoNone")}</span>
      <a className="mt-1 inline-block font-medium text-primary underline" href={STUDY_URL} target="_blank" rel="noreferrer">{t("next.why.study")}</a>
    </InfoTip>
  );
}

/** One line on why the week looks as it does: the long run's step, the threshold rung, what zone 2 fills. */
export function whyText(why: Why, fmt: Fmt): string {
  const l = why.long;
  const long = l ? t(`next.why.${l.why}`, { dist: fmt.dist(l.km), from: fmt.dist(l.longestKm) }) : t("next.why.share", { dist: "" }).replace(/\s+:/, ":");
  const parts = [long];
  if (why.thr) parts.push(why.rung != null
    ? t("next.why.thrStep", { reps: why.thr.reps, min: why.thr.min, n: why.rung + 1, of: NEXT.ladder.length })
    : t("next.why.thr", { reps: why.thr.reps, min: why.thr.min }));
  if (why.tempo) parts.push(t("next.why.tempo"));
  if (why.z2Km > 0) parts.push(t("next.why.z2", { dist: fmt.dist(why.z2Km) }));
  if (why.reentryKm) parts.push(t("next.why.reentry", { dist: fmt.dist(why.reentryKm) }));
  return parts.join(" · ");
}

function WhyLine({ why }: { why: Why }) {
  const fmt = useFmt();
  return (
    <div className="space-y-1 text-sm text-muted-foreground">
      <p>{whyText(why, fmt)} <SpikeInfo longestKm={why.long?.longestKm ?? 0} /></p>
      {why.moreDays && <p>{t("next.why.moreDays", { n: NEXT.moreDays })}</p>}
    </div>
  );
}

function Stats({ seed, ev }: { seed: WeekSeed; ev: WeekEval }) {
  const fmt = useFmt();
  const growthPct = Math.round((COACH.weekGrowth - 1) * 100);
  // Judged as a share of fitness; calm (above the band) is fine, so it reads as ok with its own badge.
  const f = ev.formPct;
  const tiles: { label: string; value: string; sub: string; tone: Tone; badge: string }[] = [
    { label: t("next.stat.form"), value: signed(ev.form), sub: t("next.stat.formSub", { pct: Math.round(f), value: signed(seed.ctl - seed.atl) }),
      tone: f < COACH.floor ? "bad" : f < FORM.heavy ? "warn" : "ok",
      badge: f > COACH.goal ? t("next.b.under") : f < COACH.floor ? t("next.b.over") : t("next.b.heavy") },
    { label: t("next.stat.km"), value: fmt.dist(ev.km), sub: ev.growth == null ? "" : t(ev.growthBase === "mean" ? "next.stat.kmMean" : "next.stat.kmWeek", { pct: pctText(ev.growth) }),
      tone: ev.growth != null && ev.growth > COACH.weekGrowth - 1 + 0.005 ? "warn" : "ok", badge: t("next.b.growth", { pct: growthPct }) },
    { label: t("next.stat.ramp"), value: ev.acwr == null ? "–" : ratio(ev.acwr), sub: t("next.stat.rampSub", { cap: ratio(COACH.rampCap) }),
      tone: (ev.acwr ?? 0) > COACH.rampRisk ? "bad" : (ev.acwr ?? 0) > COACH.rampCap ? "warn" : "ok",
      badge: (ev.acwr ?? 0) > COACH.rampRisk ? t("next.b.over") : t("next.b.rampHigh") },
    { label: t("next.stat.long"), value: ev.longKm ? fmt.dist(ev.longKm) : "–", sub: ev.spikeMax == null ? "" : t("next.stat.longSub", { max: fmt.dist(ev.spikeMax) }),
      tone: !ev.longKm || ev.spike ? "warn" : "ok", badge: !ev.longKm ? t("next.b.noLong") : t("next.b.spike") },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      {tiles.map((x) => (
        <div key={x.label} className="space-y-0.5 rounded-lg border border-border bg-card p-3">
          <div className="text-xs text-muted-foreground">{x.label}</div>
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-xl font-semibold tabular-nums">{x.value}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{x.sub}</span>
          </div>
          {x.tone !== "ok" && <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs font-medium", PILL[x.tone])}>{x.badge}</span>}
        </div>
      ))}
    </div>
  );
}

export function Warnings({ ev }: { ev: WeekEval }) {
  const fmt = useFmt();
  const w = [
    ev.spike && t("next.w.spike", { day: WEEKDAY_LONG[weekday(ev.spike.date)], dist: fmt.dist(ev.spike.km), from: fmt.dist(ev.longestKm) }),
    ev.adjacent && t("next.w.adjacent"), !ev.hard && t("next.w.noThreshold"),
    ev.qualityOver && t("next.w.quality", { pct: Math.round(ev.qualityShare * 100) }),
  ].filter(Boolean) as string[];
  if (!w.length) return null;
  return <ul className="space-y-1 text-sm text-warning">{w.map((x) => <li key={x}>{x}</li>)}</ul>;
}

const W = 340, H = 150, X0 = 20, DX = 50;

function Charts({ seed, ev }: { seed: WeekSeed; ev: WeekEval }) {
  const fmt = useFmt();
  const weeks = [...seed.past.map((p) => ({ ws: p.weekStart, km: p.km, ctl: p.ctl, atl: p.atl })), { ws: seed.weekStart, km: ev.km, ctl: ev.ctl, atl: ev.atl }];
  const n = weeks.length;
  const x = (i: number) => X0 + (i + (7 - n)) * DX;
  const labels = weeks.map((w, i) => <text key={w.ws} x={x(i)} y={H - 4} fontSize={10} textAnchor="middle" fill={i === n - 1 ? "var(--foreground)" : "var(--muted-foreground)"} fontWeight={i === n - 1 ? 600 : 400}>{t("plan.weekShort", { week: weekNumber(w.ws) })}</text>);
  const line = (vals: number[], y: (v: number) => number, from: number, to: number) => vals.slice(from, to).map((v, k) => `${x(from + k)},${y(v).toFixed(1)}`).join(" ");
  const top = Math.max(60, ...weeks.flatMap((w) => [w.ctl, w.atl])) * 1.1;
  const yLoad = (v: number) => 128 - (v / top) * 118;
  const yForm = (v: number) => Math.min(128, Math.max(4, 30 + -v * 2.4));
  const kmTop = Math.max(20, ...weeks.map((w) => w.km)) * 1.15;
  const yKm = (v: number) => 128 - (v / kmTop) * 118;
  const cap = growthBase(seed.kmBefore).base * COACH.weekGrowth;
  const fit = weeks.map((w) => w.ctl), fat = weeks.map((w) => w.atl), form = weeks.map((w) => formPct(w.ctl - w.atl, w.ctl));
  const last = n - 1;
  const card = "space-y-1 rounded-lg border border-border bg-card p-3";
  return (
    <div className="grid gap-2 md:grid-cols-3">
      <figure className={card}>
        <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm font-semibold">{t("next.chart.load")}
          <span className="flex gap-3 text-xs font-normal text-muted-foreground">
            <span><span aria-hidden className="mr-1 inline-block h-0.5 w-3 bg-chart-1 align-middle" />{t("next.chart.fitness")}</span>
            <span><span aria-hidden className="mr-1 inline-block h-0.5 w-3 bg-chart-5 align-middle" />{t("next.chart.fatigue")}</span>
          </span>
        </figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t("next.aria.load", { fit: one(ev.ctl), fat: one(ev.atl), week: weekNumber(seed.weekStart) })}>
          <line x1={X0} x2={W - X0} y1={128} y2={128} stroke="var(--border)" />
          <polyline points={line(fit, yLoad, 0, last)} fill="none" stroke="var(--chart-1)" strokeWidth={2.2} strokeLinejoin="round" />
          <polyline points={line(fit, yLoad, last - 1, last + 1)} fill="none" stroke="var(--chart-1)" strokeWidth={2.2} strokeDasharray="4 4" />
          <polyline points={line(fat, yLoad, 0, last)} fill="none" stroke="var(--chart-5)" strokeWidth={2.2} strokeLinejoin="round" />
          <polyline points={line(fat, yLoad, last - 1, last + 1)} fill="none" stroke="var(--chart-5)" strokeWidth={2.2} strokeDasharray="4 4" />
          <circle cx={x(last)} cy={yLoad(ev.ctl)} r={3.5} fill="var(--chart-1)" />
          <circle cx={x(last)} cy={yLoad(ev.atl)} r={3.5} fill="var(--chart-5)" />
          {labels}
        </svg>
      </figure>
      <figure className={card}>
        <figcaption className="text-sm font-semibold">{t("next.chart.form")}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t("next.aria.form", { form: `${Math.round(ev.formPct)} %`, week: weekNumber(seed.weekStart), goal: signedInt(COACH.goal), heavy: signedInt(FORM.heavy) })}>
          <rect x={8} y={yForm(COACH.goal)} width={W - 16} height={yForm(FORM.heavy) - yForm(COACH.goal)} fill="var(--signature-soft)" />
          <text x={12} y={yForm(COACH.goal) + 12} fontSize={10} fill="var(--signature-foreground)">{t("next.chart.band")}</text>
          <line x1={X0} x2={W - X0} y1={yForm(0)} y2={yForm(0)} stroke="var(--border)" />
          <text x={W - 4} y={yForm(0) + 3} fontSize={10} textAnchor="end" fill="var(--muted-foreground)">0</text>
          <polyline points={line(form, yForm, 0, last)} fill="none" stroke="var(--chart-4)" strokeWidth={2.2} strokeLinejoin="round" />
          <polyline points={line(form, yForm, last - 1, last + 1)} fill="none" stroke="var(--chart-4)" strokeWidth={2.2} strokeDasharray="4 4" />
          <circle cx={x(last)} cy={yForm(ev.formPct)} r={4} fill="var(--chart-4)" />
          {labels}
        </svg>
      </figure>
      <figure className={card}>
        <figcaption className="text-sm font-semibold">{t("next.chart.km")}</figcaption>
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={t("next.aria.km", { list: seed.past.map((p) => fmt.dist(p.km)).join(", "), week: weekNumber(seed.weekStart), dist: fmt.dist(ev.km) })}>
          <line x1={6} x2={W - 6} y1={128} y2={128} stroke="var(--border)" />
          {weeks.map((w, i) => (
            <rect key={w.ws} x={x(i) - 14} y={yKm(w.km)} width={28} height={Math.max(0, 128 - yKm(w.km))} rx={2}
              fill={i === last ? "var(--signature)" : "var(--muted-foreground)"} fillOpacity={i === last ? 1 : 0.35} />
          ))}
          {cap > 0 && <>
            <line x1={x(last) - 20} x2={x(last) + 20} y1={yKm(cap)} y2={yKm(cap)} stroke="var(--foreground)" strokeWidth={1.2} strokeDasharray="3 3" />
            <text x={x(last) - 24} y={yKm(cap) + 3} fontSize={10} textAnchor="end" fill="var(--muted-foreground)">{`+${Math.round((COACH.weekGrowth - 1) * 100)} %`}</text>
          </>}
          <text x={x(last)} y={yKm(ev.km) - 6} fontSize={11} fontWeight={600} textAnchor="middle" fill="var(--foreground)">{fmt.num(ev.km)}</text>
          {labels}
        </svg>
      </figure>
    </div>
  );
}
