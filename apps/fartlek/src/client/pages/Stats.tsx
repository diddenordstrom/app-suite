/**
 * Statistik (docs/decisions/fartlek-period-stats.md): how the time of a chosen period (A) was spent,
 * as plain totals. "Jämför" adds another period (B) to the same cards: a thin lavender bar and a
 * difference chip beside each figure, in neutral colours (the page shows change, it does not judge it).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { StatsSkeleton } from "../skeletons";
import { Button, Card, EmptyState, ErrorText, Field, Input, SegmentedControl, Spinner, cn, useTour } from "../ui";
import { trendsTour } from "../guide";
import { TrendsView } from "./StatsTrends";
import { blockName, fmtDay } from "../bits";
import { locale, t, tm, tn } from "../i18n";
import type { BlocksData } from "../types";
import { addDays, daysBetween, toDate, todayIn, type ISODate } from "@/shared/dates";
import { fmtClock } from "@/shared/format";
import { comparePeriods, presetAvailable, PRESETS, type Choice, type Comparison, type PeriodBlock, type PeriodContext, type PeriodLabel, type Preset } from "@/shared/periods";
import { BAND_SHARE, type BandSecs, type Period, type RunRow, type StatsResponse } from "@/shared/periodstats";

export type ColorMode = "zone" | "band";
/** Period: how the time of the period was spent. Trender: curves over months with the period shaded. */
export type View = "period" | "trends";
type Filter = "all" | "thr" | "mp" | "over";

const DEFAULT_CHOICE: Choice = { kind: "preset", preset: "month" };
const STORE = "fartlek.stats";
/** At least this much at threshold for the "≥ 10 min in threshold" filter. */
const THR_FILTER_S = 600;

/** The choice and colour mode survive moving between pages (per browser; nothing depends on it). */
interface Prefs { choice: Choice; mode: ColorMode; compare: boolean }
function loadPrefs(): Prefs {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null");
    if (v?.choice?.kind) return { choice: v.choice as Choice, mode: v.mode === "band" ? "band" : "zone", compare: v.compare === true };
  } catch { /* private mode or bad JSON: start fresh */ }
  return { choice: DEFAULT_CHOICE, mode: "zone", compare: false };
}
function savePrefs(p: Prefs) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* storage blocked */ }
}

export function Stats() {
  const { settings, loaded } = useSettings();
  // The view lives in the URL, so /trends (redirected here) and links to a Trender card land on it.
  const [params, setParams] = useSearchParams();
  const view: View = params.get("view") === "trends" ? "trends" : "period";
  const today = todayIn(settings.timezone);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => savePrefs(prefs), [prefs]);
  const blocksApi = useApi<BlocksData>("/blocks");
  const blocks = useMemo<PeriodBlock[]>(() => (blocksApi.data?.blocks ?? []).map((b) => ({ id: b.id, name: blockName(b), startWeek: b.startWeek, weeks: b.weeks })), [blocksApi.data]);
  const ctx: PeriodContext = { today, weekStart: settings.weekStart, blocks };

  // Wait for the settings (today's date, week start) and, for a block choice, the blocks.
  const needsBlocks = prefs.choice.kind === "block" || (prefs.choice.kind === "preset" && (prefs.choice.preset === "block" || prefs.choice.preset === "lastBlock"));
  const ready = loaded && !(needsBlocks && blocksApi.loading);
  const resolved = ready ? comparePeriods(prefs.choice, ctx) : null;
  const choice = resolved ? prefs.choice : DEFAULT_CHOICE;
  const cmp = resolved ?? comparePeriods(DEFAULT_CHOICE, ctx)!;
  const path = ready ? `/stats?from=${cmp.a.from}&to=${cmp.a.to}&cmpFrom=${cmp.b.from}&cmpTo=${cmp.b.to}` : null;
  const { data, error, loading, reload } = useApi<StatsResponse>(path);

  // Bands still being computed: say so and look again shortly.
  useEffect(() => {
    if (!data?.pending) return;
    const id = setTimeout(() => void reload(), 4000);
    return () => clearTimeout(id);
  }, [data, reload]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <StatsSkeleton />;
  return (
    <StatsView data={data} cmp={cmp} choice={choice} ctx={ctx} mode={prefs.mode} compare={prefs.compare} loading={loading} view={view}
      onView={(v) => setParams(v === "trends" ? { view: "trends" } : {}, { replace: true })}
      onMode={(mode) => setPrefs((p) => ({ ...p, mode }))}
      onCompare={(compare) => setPrefs((p) => ({ ...p, compare }))}
      onChoose={(c) => setPrefs((p) => ({ ...p, choice: c }))} />
  );
}

// ---- Formatting ------------------------------------------------------------------------------

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const dayMonth = (d: ISODate) => fmtDay(d, { day: "numeric", month: "short" });
const rangeFmt = () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
export function rangeText(p: Period): string {
  return p.from === p.to ? dayMonth(p.from) : rangeFmt().formatRange(toDate(p.from), toDate(p.to));
}
function monthName(month: ISODate, style: "long" | "short", today: ISODate) {
  const name = toDate(month).toLocaleDateString(locale, { month: style, timeZone: "UTC" }).replace(/\.$/, "");
  return month.slice(0, 4) === today.slice(0, 4) ? name : `${name} ${month.slice(0, 4)}`;
}
function labelText(l: PeriodLabel, today: ISODate, short = false): string {
  switch (l.kind) {
    case "day": return dayMonth(l.date);
    case "week": return short ? t("stats.weekShort", { week: l.week }) : t("stats.week", { week: l.week });
    case "month": return short ? monthName(l.month, "short", today) : cap(monthName(l.month, "long", today));
    case "block": return l.name;
    case "range": return rangeText(l);
  }
}
/** Seconds → `h:mm`. */
const hm = (s: number) => {
  const m = Math.round(s / 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
};
/** A time difference: minutes below an hour, else `h:mm h`. */
const hmDelta = (s: number) => (s < 3600 ? t("stats.min", { n: Math.round(s / 60) }) : `${hm(s)} h`);
const pctOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

// ---- Shared pieces ---------------------------------------------------------------------------

const sumBands = (rs: RunRow[]): BandSecs => rs.reduce<BandSecs>((s, r) => ({
  totalS: s.totalS + r.bands.totalS,
  zones: s.zones.map((z, i) => z + r.bands.zones[i]!) as BandSecs["zones"],
  belowS: s.belowS + r.bands.belowS, atS: s.atS + r.bands.atS, overS: s.overS + r.bands.overS, targetS: s.targetS + r.bands.targetS,
}), { totalS: 0, zones: [0, 0, 0, 0, 0], belowS: 0, atS: 0, overS: 0, targetS: 0 });
const duration = (rs: RunRow[]) => rs.reduce((s, r) => s + r.durationS, 0);

const ZONE_COLORS = [1, 2, 3, 4, 5].map((n) => `var(--zone-${n})`);
const BAND_COLORS = { easy: "var(--band-easy)", mp: "var(--band-mp)", thr: "var(--band-thr)", over: "var(--band-over)" };
interface Part { grow: number; color: string }

/** How a run's (or a day's) time splits, in the chosen colour mode. Target pace is part of "below threshold". */
function partsOf(b: BandSecs, mode: ColorMode): Part[] {
  const parts = mode === "zone"
    ? b.zones.map((s, i) => ({ grow: s, color: ZONE_COLORS[i]! }))
    : [
        { grow: Math.max(0, b.totalS - b.targetS - b.atS - b.overS), color: BAND_COLORS.easy },
        { grow: b.targetS, color: BAND_COLORS.mp },
        { grow: b.atS, color: BAND_COLORS.thr },
        { grow: b.overS, color: BAND_COLORS.over },
      ];
  const shown = parts.filter((p) => p.grow > 0);
  return shown.length ? shown : [{ grow: 1, color: "var(--border)" }];
}

function Weave({ parts, className, style, vertical, reverse, title }: { parts: Part[]; className?: string; title?: string; style?: CSSProperties; vertical?: boolean; reverse?: boolean }) {
  return (
    <div title={title} className={cn("flex overflow-hidden", vertical && (reverse ? "flex-col-reverse" : "flex-col"), className)} style={style}>
      {parts.map((p, i) => <div key={i} style={{ flex: `${p.grow} 1 0`, background: p.color }} />)}
    </div>
  );
}

const Eyebrow = ({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) =>
  <span className={cn("text-[11px] font-medium uppercase leading-4 tracking-[0.08em] text-muted-foreground", className)} style={style}>{children}</span>;

/** One mirrored measure: B and A and how to print them. */
interface Measure {
  label: string;
  a: number | null;
  b: number | null;
  fmt: (v: number) => string;
  /** The difference, unsigned. Defaults to `fmt`. */
  fmtDelta?: (v: number) => string;
  swatch?: string;
}
const A_FG = "var(--stats-a-foreground)";
const B_FG = "var(--stats-b-foreground)";

function diff(m: Measure) {
  if (m.a == null || m.b == null) return { text: "–", color: "var(--muted-foreground)", title: m.label };
  const d = m.a - m.b;
  const f = m.fmtDelta ?? m.fmt;
  const zero = d === 0 || f(Math.abs(d)) === f(0);
  const sign = d > 0 ? "+" : "−";
  const pct = m.b ? Math.round((d / m.b) * 100) : null;
  return {
    text: zero ? "±0" : sign + f(Math.abs(d)),
    // Neutral: more in the signature's text colour, less in lavender; never green or red.
    color: zero ? "var(--muted-foreground)" : d > 0 ? A_FG : "var(--accent-foreground)",
    title: `${m.label}: ${m.fmt(m.b)} → ${m.fmt(m.a)}${pct ? ` (${pct > 0 ? "+" : "−"}${Math.abs(pct)} %)` : ""}`,
  };
}
/** Bar widths for one row against `scale`, the largest value of the card, so rows can be compared. */
const widths = (m: Measure, scale: number) => ({
  a: scale ? `${((m.a ?? 0) / scale) * 100}%` : "0%",
  b: scale ? `${((m.b ?? 0) / scale) * 100}%` : "0%",
});

/** The difference against B as a small chip, with B's own value after it. */
function DiffChip({ m, name }: { m: Measure; name: string }) {
  const d = diff(m);
  return (
    <span title={d.title} className="inline-flex flex-wrap items-baseline gap-x-1.5 text-xs tabular-nums">
      <span className="rounded-full bg-muted px-1.5 py-px font-semibold" style={{ color: d.color }}>{d.text}</span>
      <span className="text-muted-foreground">{name} {m.b == null ? "–" : m.fmt(m.b)}</span>
    </span>
  );
}

// ---- The page --------------------------------------------------------------------------------

export function StatsView({ data, cmp, choice, ctx, mode, compare = false, loading, view = "period", onView, onMode, onCompare, onChoose }: {
  data: StatsResponse;
  cmp: Comparison;
  choice: Choice;
  ctx: PeriodContext;
  mode: ColorMode;
  /** Show period B beside A on every card. */
  compare?: boolean;
  loading?: boolean;
  view?: View;
  onView?: (v: View) => void;
  onMode: (m: ColorMode) => void;
  onCompare?: (on: boolean) => void;
  onChoose: (c: Choice) => void;
}) {
  const { today } = ctx;
  const nameA = labelText(cmp.labelA, today), nameB = labelText(cmp.labelB, today);
  const shortA = labelText(cmp.labelA, today, true), shortB = labelText(cmp.labelB, today, true);
  const sides = { nameA, nameB, shortA, shortB, compare };
  const empty = data.a.runs === 0 && (!compare || data.b.runs === 0);
  const tour = useTour();

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Eyebrow>{t("nav.stats")}</Eyebrow>
          <h1 className="max-w-full truncate font-display text-3xl tracking-tight sm:text-[40px] sm:leading-[44px]">{nameA}</h1>
          <span className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-muted-foreground">
            <span>{rangeText(cmp.a)} · {tn("stats.runs", data.a.runs)}</span>
            {compare && (
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-[2px]" style={{ background: "var(--stats-b)" }} />
                {t("stats.versusPeriod", { name: nameB, range: rangeText(cmp.b) })} · {tn("stats.runs", data.b.runs)}
              </span>
            )}
            {loading && <Spinner className="size-3" />}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {view === "trends" && <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => tour.start(trendsTour())}>{t("tour.replay")}</Button>}
        <SegmentedControl aria-label={t("stats.view")} value={view} onChange={(v) => onView?.(v)}
          options={[{ value: "period", label: t("stats.view.period") }, { value: "trends", label: t("nav.trends") }]} />
        <button type="button" role="switch" aria-checked={compare} onClick={() => onCompare?.(!compare)}
          className={cn("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-medium transition",
            compare ? "border-ring bg-accent text-accent-foreground" : "border-border bg-card text-foreground hover:bg-accent")}>
          <span aria-hidden className={cn("relative h-4 w-7 rounded-full transition", compare ? "bg-primary" : "bg-muted")}>
            <span className={cn("absolute top-0.5 size-3 rounded-full bg-card shadow-control transition-all", compare ? "left-[14px]" : "left-0.5")} />
          </span>
          {t("stats.compare", { name: shortB })}
        </button>
        </div>
      </header>

      {view === "period" && data.pending > 0 && (
        <Card className="flex items-center gap-2 py-3 text-sm text-muted-foreground" role="status"><Spinner /> {tn("stats.pending", data.pending)}</Card>
      )}

      <PeriodCard data={data} cmp={cmp} choice={choice} ctx={ctx} mode={mode} sides={sides} onChoose={onChoose} />

      {view === "trends" ? <TrendsView today={today} sides={{ a: cmp.a, b: compare ? cmp.b : null, shortA, shortB }} />
        : empty ? <EmptyState title={t(compare ? "stats.emptyTitle" : "stats.emptyTitleOne")}>{t("stats.emptyText")}</EmptyState> : (
        <>
          <Kpis data={data} sides={sides} />
          <div className="grid gap-4 lg:grid-cols-2">
            <ZoneCard data={data} sides={sides} />
            <BandCard data={data} sides={sides} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <DayByDay data={data} cmp={cmp} mode={mode} sides={sides} onMode={onMode} />
            <PlanCard data={data} sides={sides} />
          </div>
          <RunsTable data={data} mode={mode} />
        </>
      )}
    </div>
  );
}

type Sides = { nameA: string; nameB: string; shortA: string; shortB: string; compare: boolean };

// ---- Period card: presets, the weave, the timeline -------------------------------------------

const PRESET_LABEL: Record<Preset, string> = {
  today: "stats.preset.today", week: "stats.preset.week", lastWeek: "stats.preset.lastWeek", month: "stats.preset.month",
  lastMonth: "stats.preset.lastMonth", block: "stats.preset.block", lastBlock: "stats.preset.lastBlock", custom: "stats.preset.custom",
};

const overlaps = (from: ISODate, to: ISODate, p: Period) => from <= p.to && to >= p.from;
/** Week columns of the timeline, first and last inclusive. */
type Span = { start: number; end: number };
type DragKind = "move" | "start" | "end" | "draw";

function PeriodCard({ data, cmp, choice, ctx, mode, sides, onChoose }: { data: StatsResponse; cmp: Comparison; choice: Choice; ctx: PeriodContext; mode: ColorMode; sides: Sides; onChoose: (c: Choice) => void }) {
  const fmt = useFmt();
  const { today } = ctx;
  const active: Preset | null = choice.kind === "preset" ? choice.preset : choice.kind === "custom" ? "custom" : null;
  const pickPreset = (p: Preset) => onChoose(p === "custom" ? { kind: "custom", from: cmp.a.from, to: cmp.a.to } : { kind: "preset", preset: p });

  // Timeline: a column per week, brackets over the weeks A and B touch.
  const weeks = data.weeks;
  const n = weeks.length;
  const maxKm = Math.max(1, ...weeks.map((w) => w.km));
  const cols = { gridTemplateColumns: `repeat(${Math.max(n, 1)}, minmax(0, 1fr))` };
  const bracket = (p: Period) => {
    const idx = weeks.map((w, i) => (overlaps(w.weekStart, addDays(w.weekStart, 6), p) ? i : -1)).filter((i) => i >= 0);
    return idx.length ? `${idx[0]! + 1} / span ${idx.at(-1)! - idx[0]! + 1}` : null;
  };
  const colB = sides.compare ? bracket(cmp.b) : null;

  // Dragging A's bracket: the body moves it, the edges stretch it, a drag over the weeks draws a new one.
  // It snaps to whole weeks and never past this week; B follows the usual rule once it is let go.
  const gridRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<Span | null>(null);
  const lastIdx = weeks.reduce((m, w, i) => (w.weekStart <= today ? i : m), 0);
  const spanOf = (p: Period): Span | null => {
    const idx = weeks.map((w, i) => (overlaps(w.weekStart, addDays(w.weekStart, 6), p) ? i : -1)).filter((i) => i >= 0);
    return idx.length ? { start: idx[0]!, end: idx.at(-1)! } : null;
  };
  const spanA = drag ?? spanOf(cmp.a);
  const colA = spanA ? `${spanA.start + 1} / span ${spanA.end - spanA.start + 1}` : null;
  const commit = (sp: Span) => {
    const from = weeks[sp.start]!.weekStart, end = addDays(weeks[sp.end]!.weekStart, 6);
    onChoose(sp.start === sp.end ? { kind: "week", weekStart: from } : { kind: "custom", from, to: end > today ? today : end });
  };
  const idxAt = (x: number) => {
    const r = gridRef.current!.getBoundingClientRect();
    return Math.max(0, Math.min(lastIdx, Math.floor(((x - r.left) / r.width) * n)));
  };
  const startDrag = (e: ReactPointerEvent, kind: DragKind) => {
    if (e.button !== 0 || !gridRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    const at0 = idxAt(e.clientX);
    const base = spanOf(cmp.a) ?? { start: at0, end: at0 };
    let cur: Span = kind === "draw" ? { start: at0, end: at0 } : base;
    let moved = false;
    const move = (ev: PointerEvent) => {
      const at = idxAt(ev.clientX);
      if (at !== at0) moved = true;
      if (kind === "move") {
        const len = base.end - base.start;
        const st = Math.max(0, Math.min(lastIdx - len, base.start + at - at0));
        cur = { start: st, end: st + len };
      } else if (kind === "start") cur = { start: Math.min(at, base.end), end: base.end };
      else if (kind === "end") cur = { start: base.start, end: Math.max(at, base.start) };
      else cur = { start: Math.min(at0, at), end: Math.max(at0, at) };
      setDrag(cur);
    };
    const stop = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      setDrag(null);
      // A plain click on a week picks that week; a click on the bracket changes nothing; a cancelled
      // pointer (the phone took over to scroll the timeline) picks nothing.
      if (ev.type === "pointerup" && (moved || kind === "draw")) commit(cur);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
  };
  /** Arrows move the bracket a week; with Shift they stretch or shrink its end. */
  const onBracketKey = (e: KeyboardEvent) => {
    const sp = spanOf(cmp.a);
    if (!sp || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const d = e.key === "ArrowLeft" ? -1 : 1;
    if (e.shiftKey) commit({ start: sp.start, end: Math.max(sp.start, Math.min(lastIdx, sp.end + d)) });
    else if (sp.start + d >= 0 && sp.end + d <= lastIdx) commit({ start: sp.start + d, end: sp.end + d });
  };
  const blockCols = n ? data.blocks.map((b) => {
    const start = Math.round(daysBetween(weeks[0]!.weekStart, b.startWeek) / 7);
    const s = Math.max(0, start), e = Math.min(n - 1, start + b.weeks - 1);
    const end = addDays(b.startWeek, b.weeks * 7 - 1);
    return e < s ? null : { ...b, col: `${s + 1} / span ${e - s + 1}`, ongoing: b.startWeek <= today && end >= today, known: ctx.blocks?.some((x) => x.id === b.id) };
  }).filter((b) => !!b) : [];

  // The weave: each run a segment as long as the run; B's ribbon as long as B's time against A's.
  const runsA = [...data.runs].reverse(), runsB = [...data.runsB].reverse();
  const totA = duration(runsA), totB = sides.compare ? duration(runsB) : 0;
  const max = Math.max(totA, totB, 1);

  return (
    <Card className="space-y-3.5 px-4 pb-3 pt-3.5" aria-label={t("stats.period")} role="region">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-muted p-1" role="group" aria-label={t("stats.period")}>
          {PRESETS.map((p) => {
            const on = active === p;
            const ok = presetAvailable(p, ctx);
            return (
              <button key={p} type="button" aria-pressed={on} disabled={!ok} onClick={() => pickPreset(p)}
                title={ok ? undefined : t("stats.noBlock")}
                className={cn("h-[30px] whitespace-nowrap rounded-full px-3 text-[13px] font-medium transition disabled:opacity-40",
                  on ? "bg-control text-foreground shadow-control" : "text-muted-foreground hover:text-foreground")}>
                {t(PRESET_LABEL[p] as Parameters<typeof t>[0])}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-1.5 text-xs font-medium">
          {data.threshold && <span className="inline-flex h-[26px] items-center rounded-full bg-muted px-2.5 text-muted-foreground">{t("stats.gapChip")}</span>}
          {data.target && (
            <span className="inline-flex h-[26px] items-center rounded-full bg-signature-soft px-2.5 text-signature-foreground">
              {t("stats.targetChip", { pace: fmt.pace(data.target.pace), race: data.target.raceName })}
            </span>
          )}
        </div>
      </div>

      {choice.kind === "custom" && (
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t("common.from")} className="w-44">
            <Input type="date" value={choice.from} max={today} onChange={(e) => e.target.value && onChoose({ ...choice, from: e.target.value })} />
          </Field>
          <Field label={t("common.to")} className="w-44">
            <Input type="date" value={choice.to} max={today} onChange={(e) => e.target.value && onChoose({ ...choice, to: e.target.value })} />
          </Field>
        </div>
      )}

      <div className="grid grid-cols-[minmax(2rem,max-content)_minmax(0,1fr)_3rem] items-center gap-x-2.5 gap-y-1.5">
        {sides.compare && <>
          <span className="max-w-24 truncate text-[11px] font-semibold" style={{ color: B_FG }}>{sides.shortB}</span>
          <Ribbon runs={runsB} mode={mode} width={totB / max} />
          <span className="text-right text-xs tabular-nums">{hm(totB)}</span>
        </>}
        <span className="max-w-24 truncate text-[11px] font-semibold" style={{ color: A_FG }}>{sides.shortA}</span>
        <Ribbon runs={runsA} mode={mode} width={totA / max} />
        <span className="text-right text-xs font-semibold tabular-nums">{hm(totA)}</span>
      </div>

      {n > 0 && (
        <div className="-mx-1 overflow-x-auto px-1">
          <div className="flex min-w-[620px] flex-col gap-1">
            <div ref={gridRef} className="relative grid h-16 touch-pan-x select-none gap-1.5" style={cols} onPointerDown={(e) => startDrag(e, "draw")}>
              <div className="pointer-events-none absolute -bottom-0.5 -top-[3px] inset-x-0 z-10 grid gap-1.5" style={cols}>
                {colB && <div aria-hidden className="rounded-[7px] border-[1.5px]" style={{ gridRow: 1, gridColumn: colB, borderColor: "var(--stats-b)", background: "color-mix(in oklab, var(--stats-b) 10%, transparent)" }} />}
                {colA && (
                  <div role="group" tabIndex={0} aria-label={t("stats.dragLabel")} onKeyDown={onBracketKey}
                    onPointerDown={(e) => startDrag(e, "move")}
                    className={cn("group pointer-events-auto relative touch-none rounded-[7px] border-[1.5px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      drag ? "cursor-grabbing" : "cursor-grab")}
                    style={{ gridRow: 1, gridColumn: colA, borderColor: "var(--stats-a)", background: `color-mix(in oklab, var(--stats-a) ${drag ? 18 : 10}%, transparent)` }}>
                    {(["start", "end"] as const).map((side) => (
                      <span key={side} aria-hidden onPointerDown={(e) => startDrag(e, side)}
                        className={cn("absolute inset-y-0 flex w-3 cursor-ew-resize touch-none items-center justify-center", side === "start" ? "-left-1.5" : "-right-1.5")}>
                        <span className="h-6 w-1.5 rounded-full opacity-70 transition group-hover:opacity-100" style={{ background: "var(--stats-a)" }} />
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {weeks.map((w, i) => {
                const end = addDays(w.weekStart, 6);
                // While dragging, the bars inside the bracket follow it; B shows again once it is let go.
                const inA = spanA ? i >= spanA.start && i <= spanA.end : false;
                const color = inA ? "var(--stats-a)" : sides.compare && !drag && overlaps(w.weekStart, end, cmp.b) ? "var(--stats-b)" : "var(--border)";
                return (
                  <button key={w.weekStart} type="button" disabled={w.weekStart > today} aria-label={t("stats.pickWeek", { week: w.week })}
                    // Pointer clicks are handled by the drag above (a click without moving picks the week); this is the keyboard's way.
                    onClick={(e) => e.detail === 0 && onChoose({ kind: "week", weekStart: w.weekStart })}
                    className="flex h-full flex-col items-center justify-end rounded-md hover:bg-accent disabled:cursor-default">
                    <span className="w-2/5 rounded-t-[3px]" style={{ height: `${(w.km / maxKm) * 100}%`, background: color }} />
                  </button>
                );
              })}
            </div>
            <div className="grid gap-1.5" style={cols}>
              {weeks.map((w) => (
                <span key={w.weekStart} className="text-center text-[11px] tabular-nums text-muted-foreground">
                  {t("stats.weekShort", { week: w.week })} · <span className="text-foreground">{fmt.num(w.km)}{addDays(w.weekStart, 6) > today ? "…" : ""}</span>
                </span>
              ))}
            </div>
            {blockCols.length > 0 && (
              <div className="grid gap-1.5" style={cols}>
                {blockCols.map((b) => (
                  <button key={b.id} type="button" disabled={!b.known} style={{ gridColumn: b.col }} onClick={() => onChoose({ kind: "block", id: b.id })}
                    className="truncate border-t border-border pt-[3px] text-left text-[11px] text-muted-foreground hover:border-ring hover:text-foreground disabled:hover:border-border disabled:hover:text-muted-foreground">
                    {b.ongoing ? t("stats.blockOngoing", { name: b.name }) : b.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {n > 0 && <p className="text-xs text-muted-foreground">{t("stats.dragHint")}</p>}
      {sides.compare && <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <svg viewBox="0 0 24 24" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></svg>
        {tm(cmp.note)}
      </p>}
    </Card>
  );
}

function Ribbon({ runs, mode, width }: { runs: RunRow[]; mode: ColorMode; width: number }) {
  if (!runs.length) return <div className="h-3 rounded-sm bg-muted" />;
  return (
    <div className="flex h-3 gap-0.5" style={{ width: `${width * 100}%` }}>
      {runs.map((r) => (
        <Weave key={r.id} title={`${fmtDay(r.date)} · ${r.name} · ${hm(r.durationS)}`} parts={partsOf(r.bands, mode)} className="min-w-0 rounded-sm" style={{ flex: `${r.durationS} 1 0` }} />
      ))}
    </div>
  );
}

// ---- Key figures -----------------------------------------------------------------------------

function Kpis({ data, sides }: { data: StatsResponse; sides: Sides }) {
  const fmt = useFmt();
  const { a, b } = data;
  const kpis: (Measure & { accent?: string })[] = [
    { label: t("stats.kpi.time"), a: a.durationS, b: b.durationS, fmt: (v) => `${hm(v)} h`, fmtDelta: hmDelta },
    { label: t("stats.kpi.distance"), a: a.distanceKm, b: b.distanceKm, fmt: (v) => fmt.dist(v) },
    { label: t("stats.kpi.runs"), a: a.runs, b: b.runs, fmt: String },
    { label: t("stats.kpi.longest"), a: a.longestKm, b: b.longestKm, fmt: (v) => fmt.dist(v) },
    ...(data.threshold ? [{ label: t("stats.bands.at"), a: a.atS, b: b.atS, fmt: (v: number) => `${hm(v)} h`, fmtDelta: hmDelta, accent: BAND_COLORS.thr }] : []),
    ...(data.target ? [{ label: t("stats.bands.atTarget"), a: a.targetS, b: b.targetS, fmt: (v: number) => `${hm(v)} h`, fmtDelta: hmDelta, accent: BAND_COLORS.mp }] : []),
  ];
  return (
    <section aria-label={t("stats.kpis")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {kpis.map((k) => (
        <Card key={k.label} className="flex flex-col gap-1.5 px-3.5 py-3" style={k.accent ? { boxShadow: `inset 0 3px 0 ${k.accent}` } : undefined}>
          <Eyebrow>{k.label}</Eyebrow>
          <span className="font-display text-[26px] font-medium leading-[30px] tabular-nums">{k.a == null ? "–" : k.fmt(k.a)}</span>
          {sides.compare && <DiffChip m={k} name={sides.shortB} />}
        </Card>
      ))}
    </section>
  );
}

// ---- Time per zone and per pace band -------------------------------------------------------

/**
 * A row per measure: A's time as a bar in the measure's own colour (one scale for the whole card, so
 * 7 minutes never look like 6 hours), its time and share of the run time. Comparing adds B as a thin
 * lavender bar under it and the difference.
 */
function BarCard({ title, sub, sides, rows, total, foot, children }: { title: string; sub: ReactNode; sides: Sides; rows: Measure[]; total: number; foot?: ReactNode; children?: ReactNode }) {
  const scale = Math.max(0, ...rows.flatMap((r) => [r.a ?? 0, sides.compare ? r.b ?? 0 : 0]));
  return (
    <Card className="flex flex-col gap-3 px-5 pb-3 pt-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{sub}</span>
      </div>
      {children ?? (
        <div className="flex flex-col">
          {rows.map((r) => {
            const w = widths(r, scale);
            return (
              <div key={r.label} className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)_auto] items-center gap-x-3 border-t border-border/50 py-2 first:border-t-0">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium">
                  <span className="size-2.5 rounded-[3px]" style={{ background: r.swatch ?? "var(--stats-a)" }} />{r.label}
                </span>
                <div className="flex flex-col gap-1">
                  <div className="h-3 rounded-[3px]" style={{ width: w.a, minWidth: r.a ? 2 : 0, background: r.swatch ?? "var(--stats-a)" }} />
                  {sides.compare && <div className="h-1.5 rounded-[2px]" style={{ width: w.b, minWidth: r.b ? 2 : 0, background: "var(--stats-b)" }} />}
                </div>
                <div className="flex flex-col items-end">
                  <span className="whitespace-nowrap text-sm font-semibold tabular-nums">
                    {r.a == null ? "–" : r.fmt(r.a)} <span className="text-xs font-normal text-muted-foreground">{pctOf(r.a ?? 0, total)} %</span>
                  </span>
                  {sides.compare && <DiffChip m={r} name={sides.shortB} />}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {foot && <span className="text-xs text-muted-foreground">{foot}</span>}
    </Card>
  );
}

function ZoneCard({ data, sides }: { data: StatsResponse; sides: Sides }) {
  const { a, b } = data;
  const zt = (z: BandSecs["zones"]) => z.reduce((s, v) => s + v, 0);
  const has = zt(a.zones) > 0 || (sides.compare && zt(b.zones) > 0);
  const rows: Measure[] = a.zones.map((s, i) => ({ label: t("stats.zone", { n: i + 1 }), a: s, b: b.zones[i]!, fmt: hm, fmtDelta: hmDelta, swatch: ZONE_COLORS[i] }));
  const hard = (z: BandSecs["zones"]) => pctOf(z[3] + z[4], zt(z));
  const easy = (z: BandSecs["zones"]) => pctOf(z[0] + z[1], zt(z));
  return (
    <BarCard title={t("stats.zones.title")} sub={t("stats.zones.sub")} sides={sides} rows={rows} total={zt(a.zones)}
      foot={has ? (sides.compare ? t("stats.zones.foot", { a: easy(a.zones), h: hard(a.zones), name: sides.shortB, b: easy(b.zones), hb: hard(b.zones) }) : t("stats.zones.footOne", { a: easy(a.zones), h: hard(a.zones) })) : undefined}>
      {has ? undefined : <p className="py-2 text-sm text-muted-foreground">{t("stats.zones.none")}</p>}
    </BarCard>
  );
}

function BandCard({ data, sides }: { data: StatsResponse; sides: Sides }) {
  const fmt = useFmt();
  const { a, b, threshold, target } = data;
  const bare = (s: number) => fmt.pace(s).split("/")[0]!;
  const share = (BAND_SHARE * 100).toLocaleString(locale, { maximumFractionDigits: 1 });
  const band = (p: { pace: number; low: number; high: number }) =>
    t("stats.band", { pace: bare(p.pace), share, low: bare(Math.min(p.low, p.high)), high: bare(Math.max(p.low, p.high)) });
  const sub = [t("stats.gap"),
    threshold && `${t("stats.bands.threshold")} ${band(threshold)}`,
    target && `${t("stats.bands.target")} ${band(target)}`].filter(Boolean).join(" · ");
  const rows: Measure[] = [
    ...(threshold ? [
      { label: t("stats.bands.below"), a: a.belowS, b: b.belowS, fmt: hm, fmtDelta: hmDelta, swatch: BAND_COLORS.easy },
      { label: t("stats.bands.at"), a: a.atS, b: b.atS, fmt: hm, fmtDelta: hmDelta, swatch: BAND_COLORS.thr },
      { label: t("stats.bands.over"), a: a.overS, b: b.overS, fmt: hm, fmtDelta: hmDelta, swatch: BAND_COLORS.over },
    ] : []),
    ...(target ? [{ label: t("stats.bands.atTarget"), a: a.targetS, b: b.targetS, fmt: hm, fmtDelta: hmDelta, swatch: BAND_COLORS.mp }] : []),
  ];
  const foot = target ? t(threshold ? "stats.bands.foot" : "stats.bands.footNoThreshold") : threshold ? t("stats.bands.noTarget") : undefined;
  return (
    <BarCard title={t("stats.bands.title")} sub={sub} sides={sides} rows={rows} total={a.totalS} foot={foot}>
      {rows.length ? undefined : <p className="py-2 text-sm text-muted-foreground">{t("stats.bands.none")}</p>}
    </BarCard>
  );
}

// ---- Day by day ------------------------------------------------------------------------------

function byDate(runs: RunRow[]) {
  const m = new Map<ISODate, RunRow[]>();
  for (const r of runs) m.set(r.date, [...(m.get(r.date) ?? []), r]);
  return m;
}

function DayByDay({ data, cmp, mode, sides, onMode }: { data: StatsResponse; cmp: Comparison; mode: ColorMode; sides: Sides; onMode: (m: ColorMode) => void }) {
  const n = cmp.days;
  const mapA = byDate(data.runs), mapB = byDate(data.runsB);
  const day = (from: ISODate, m: Map<ISODate, RunRow[]>, i: number) => {
    const date = addDays(from, i);
    const rs = m.get(date) ?? [];
    return { date, runs: rs, dur: duration(rs), bands: sumBands(rs) };
  };
  const daysA = Array.from({ length: n }, (_, i) => day(cmp.a.from, mapA, i));
  const daysB = Array.from({ length: n }, (_, i) => day(cmp.b.from, mapB, i));
  const max = Math.max(1, ...daysA.map((d) => d.dur), ...(sides.compare ? daysB.map((d) => d.dur) : []));
  const cols = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, gap: n > 40 ? 1 : 3 };
  const title = (d: (typeof daysA)[number]) =>
    `${fmtDay(d.date)} · ${d.runs.length ? `${d.runs.map((r) => r.name).join(", ")} · ${hm(d.dur)}` : t("stats.rest")}`;
  const every = n <= 31 ? 1 : 7;
  const legend = mode === "zone"
    ? ZONE_COLORS.map((color, i) => ({ color, label: t("stats.zone", { n: i + 1 }) }))
    : [{ color: BAND_COLORS.easy, label: t("stats.legend.easy") }, { color: BAND_COLORS.mp, label: t("stats.legend.target") },
       { color: BAND_COLORS.thr, label: t("stats.legend.threshold") }, { color: BAND_COLORS.over, label: t("stats.bands.over") }];

  return (
    <Card className="flex flex-col gap-3 px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2.5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{t(sides.compare ? "stats.days.title" : "stats.days.titleOne")}</h2>
          <span className="text-xs text-muted-foreground">{sides.compare ? t("stats.days.sub", { n, a: sides.shortA, b: sides.shortB }) : t("stats.days.subOne", { n })}</span>
        </div>
        <SegmentedControl aria-label={t("stats.colorBy")} value={mode} onChange={onMode}
          options={[{ value: "zone", label: t("stats.mode.zone") }, { value: "band", label: t("stats.mode.band") }]} />
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {legend.map((l) => <span key={l.label} className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px]" style={{ background: l.color }} />{l.label}</span>)}
      </div>
      <div className="flex flex-col">
        <div className="grid h-[92px] items-end" style={cols}>
          {daysA.map((d) => d.dur
            ? <Weave key={d.date} title={title(d)} vertical reverse parts={partsOf(d.bands, mode)} className="min-h-0.5 rounded-t-[3px] bg-muted" style={{ height: `${(d.dur / max) * 100}%` }} />
            : <div key={d.date} title={title(d)} className="h-0.5 bg-muted" />)}
        </div>
        <div className="my-[3px] h-px bg-foreground opacity-35" />
        {sides.compare && (
          <div className="grid h-[92px] items-start opacity-80" style={cols}>
            {daysB.map((d) => d.dur
              ? <Weave key={d.date} title={title(d)} vertical parts={partsOf(d.bands, mode)} className="min-h-0.5 rounded-b-[3px] bg-muted" style={{ height: `${(d.dur / max) * 100}%` }} />
              : <div key={d.date} title={title(d)} className="h-0.5 bg-muted" />)}
          </div>
        )}
        <div className="grid pt-1 text-center text-[10px] tabular-nums text-muted-foreground" style={cols}>
          {daysA.map((d, i) => (
            // Every day on wide screens (up to a month); on phones day 1 and every fifth day once it gets crowded.
            <span key={d.date} title={sides.compare ? `${title(d)}\n${title(daysB[i]!)}` : title(d)} className={cn(every === 1 && n > 14 && i > 0 && (i + 1) % 5 !== 0 && "invisible sm:visible")}>
              {i % every === 0 ? i + 1 : ""}
            </span>
          ))}
        </div>
      </div>
      {sides.compare && (
        <div className="flex justify-between text-xs font-semibold">
          <span style={{ color: A_FG }}>▲ {sides.shortA}</span>
          <span style={{ color: B_FG }}>▼ {sides.shortB}</span>
        </div>
      )}
    </Card>
  );
}

// ---- Plan against actual ---------------------------------------------------------------------

function PlanCard({ data, sides }: { data: StatsResponse; sides: Sides }) {
  const fmt = useFmt();
  const pa = data.a.plan, pb = data.b.plan;
  const rows = [
    { label: t("stats.plan.km"), done: pa.doneKm, planned: pa.km, doneB: pb.doneKm, plannedB: pb.km, f: fmt.num, unit: ` ${fmt.unit}` },
    { label: t("stats.plan.sessions"), done: pa.doneSessions, planned: pa.sessions, doneB: pb.doneSessions, plannedB: pb.sessions, f: String, unit: "" },
    { label: t("stats.plan.key"), done: pa.doneKey, planned: pa.key, doneB: pb.doneKey, plannedB: pb.key, f: String, unit: "" },
    { label: t("stats.plan.long"), done: pa.doneLong, planned: pa.long, doneB: pb.doneLong, plannedB: pb.long, f: String, unit: "" },
  ];
  const any = rows.some((r) => r.planned > 0 || (sides.compare && r.plannedB > 0));
  return (
    <Card className="flex flex-col gap-3.5 px-5 py-4">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold">{t("stats.plan.title")}</h2>
        {sides.compare && <span className="text-xs text-muted-foreground">{t("stats.plan.sub", { a: sides.shortA, b: sides.shortB })}</span>}
      </div>
      {!any && <p className="text-sm text-muted-foreground">{t("stats.plan.none")}</p>}
      {any && rows.map((r) => {
        const pct = r.planned > 0 ? Math.min(1, r.done / r.planned) : 0;
        const prev = sides.compare && r.plannedB > 0 ? Math.min(1, r.doneB / r.plannedB) : null;
        const note = !sides.compare ? (r.planned > 0 ? t("stats.plan.noteOne", { pct: pctOf(r.done, r.planned) }) : t("stats.plan.notPlannedOne"))
          : r.planned > 0 && r.plannedB === 0 ? t("stats.plan.noteNoB", { pct: pctOf(r.done, r.planned), name: sides.shortB })
          : r.planned > 0
          ? t("stats.plan.note", { pct: pctOf(r.done, r.planned), name: sides.shortB, pctB: `${pctOf(r.doneB, r.plannedB)} %`, doneB: r.f(r.doneB), plannedB: r.f(r.plannedB) })
          : t("stats.plan.notPlanned", { name: sides.shortB, doneB: r.f(r.doneB), plannedB: r.f(r.plannedB) });
        return (
          <div key={r.label} className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-2 text-[13px]">
              <span className="font-medium">{r.label}</span>
              <span className="font-semibold tabular-nums">{r.f(r.done)} <span className="text-xs font-normal text-muted-foreground">/ {r.f(r.planned)}{r.unit}</span></span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: "var(--chart-3)" }} />
              {prev != null && <div className="absolute -top-[3px] h-3.5 w-0.5 rounded-[1px]" style={{ left: `calc(${prev * 100}% - 1px)`, background: "var(--stats-b)" }} />}
            </div>
            <span className="text-[11px] tabular-nums text-muted-foreground">{note}</span>
          </div>
        );
      })}
    </Card>
  );
}

// ---- Runs in the period ----------------------------------------------------------------------

export const runFilters: Record<Filter, (r: RunRow) => boolean> = {
  all: () => true,
  thr: (r) => r.bands.atS >= THR_FILTER_S,
  mp: (r) => r.bands.targetS > 0,
  over: (r) => r.bands.overS > 0,
};

function RunsTable({ data, mode }: { data: StatsResponse; mode: ColorMode }) {
  const fmt = useFmt();
  const [filter, setFilter] = useState<Filter>("all");
  const hasThr = !!data.threshold, hasTarget = !!data.target;
  const filters = (["all", "thr", "mp", "over"] as const).filter((f) => (f === "mp" ? hasTarget : f === "all" ? true : hasThr));
  const f = filters.includes(filter) ? filter : "all";
  const runs = data.runs.filter(runFilters[f]);
  const maxDur = Math.max(1, ...data.runs.map((r) => r.durationS));
  const cell = (s: number, hi: boolean, tone: "thr" | "mp") =>
    <span className={cn(hi ? "rounded px-1.5 py-0.5 font-semibold" : s === 0 && "text-muted-foreground", hi && (tone === "thr" ? "bg-accent text-accent-foreground" : "bg-signature-soft text-signature-foreground"))}>{fmtClock(s)}</span>;
  const th = "whitespace-nowrap border-b border-border px-3 py-2 text-right text-[11px] font-medium uppercase tracking-[0.06em] text-muted-foreground";
  const td = "whitespace-nowrap border-b border-border px-3 py-2.5 text-right tabular-nums";

  return (
    <Card className="flex flex-col gap-3 px-0 pb-2 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="text-sm font-semibold">{t("stats.runsTitle")}</h2>
          <span className="text-xs text-muted-foreground">
            {f === "all" ? tn("stats.runCount", data.runs.length) : t("stats.runCountOf", { n: runs.length, count: data.runs.length })} · {t("stats.weaveHint")}
          </span>
        </div>
        <div role="group" aria-label={t("stats.filter")} className="flex flex-wrap gap-1.5">
          {filters.map((id) => (
            <button key={id} type="button" aria-pressed={f === id} onClick={() => setFilter(id)}
              className={cn("inline-flex h-[30px] items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-medium",
                f === id ? "border-ring bg-accent text-accent-foreground" : "border-border bg-card text-foreground hover:bg-accent")}>
              {t(`stats.filter.${id}`)}
            </button>
          ))}
        </div>
      </div>
      {runs.length === 0 ? <p className="px-5 py-3 text-sm text-muted-foreground">{t("stats.noRuns")}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className={cn(th, "pl-5 text-left")}>{t("common.date")}</th>
                <th className={cn(th, "text-left")}>{t("stats.col.run")}</th>
                <th className={cn(th, "min-w-[180px] text-left")}>{t("stats.col.weave")}</th>
                <th className={th}>{t("stats.kpi.distance")}</th>
                <th className={th}>{t("stats.col.time")}</th>
                {hasThr && <th className={th}>{t("stats.bands.at")}</th>}
                {hasThr && <th className={th}>{t("stats.bands.over")}</th>}
                {hasTarget && <th className={th}>{t("stats.bands.atTarget")}</th>}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-accent">
                  <td className={cn(td, "pl-5 text-left text-muted-foreground")}>{fmtDay(r.date)}</td>
                  <td className={cn(td, "text-left")}><Link to={`/activities/${encodeURIComponent(r.id)}`} className="font-medium hover:underline">{r.name}</Link></td>
                  <td className={cn(td, "text-left")}><Weave parts={partsOf(r.bands, mode)} className="h-2.5 rounded-[3px]" style={{ width: `${(r.durationS / maxDur) * 100}%` }} /></td>
                  <td className={td}>{fmt.dist(r.distanceKm)}</td>
                  <td className={td}>{fmtClock(r.durationS)}</td>
                  {hasThr && <td className={td}>{cell(r.bands.atS, runFilters.thr(r), "thr")}</td>}
                  {hasThr && <td className={td}>{cell(r.bands.overS, false, "thr")}</td>}
                  {hasTarget && <td className={td}>{cell(r.bands.targetS, runFilters.mp(r), "mp")}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
