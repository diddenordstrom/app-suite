import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ApiError, api, useAction, useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { Badge, BusyButton, Button, Card, ErrorText, Field, Input, Dialog, SegmentedControl, Select, Spinner, Textarea, cn } from "../ui";
import { BLOCK_COLOR, StatusBadge, blockName, fmtDay } from "../bits";
import { t, tm, tn } from "../i18n";
import type { BlockPreview, BlocksData, BlockWithSummary, CoachTip } from "../types";
import { CoachPanel, CrossHabit, ListEditor, QuickAdd, WeekCalendar, wk } from "../blockcoach";
import { ReplanDialog } from "../suggestblock";
import { MoreMenu } from "../moremenu";
import { labelRight, raceLabels } from "../seasonlabels";
import { lang } from "../i18n";
import { withPart, withoutPart, withPartAt, type TipId } from "@/shared/coach";
import { addDays, addMonths, daysBetween, weekStartOf } from "@/shared/dates";
import { blockEnd, type Push } from "@/shared/blocks";
import { EASY_SHARE_FLAG } from "@/shared/compliance";
import type { AmountView, Change, WeekPreview } from "@/shared/blocktext";
import { BLOCK_KINDS, type Block, type BlockKind, type Race, type WorkoutType } from "@/shared/types";

/*
 * The plan's Block view (decision: sketch A) and the block text editor (sketch C).
 * Blocks are judged on volume and key sessions only; easy-session intensity is shown beside, never in the status.
 */

const pct = (x: number) => Math.round(x * 100);
const signedForm = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(Math.round(v))}`;
const stepLang = lang === "sv" ? "sv" : "en";
const short = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

export function BlockView({ onOpenWeek, creating, onCreatingDone, initialSelected = null }: { onOpenWeek: (weekStart: string) => void; creating: boolean; onCreatingDone: () => void; initialSelected?: number | null }) {
  const { data, error, reload, loading } = useApi<BlocksData>("/blocks");
  const [selected, setSelected] = useState<number | null>(initialSelected);
  const [replanning, setReplanning] = useState<{ block: BlockWithSummary; startWith: "plan" | "engine" } | null>(null);
  const [editing, setEditing] = useState<BlockWithSummary | null>(null);
  const [changing, setChanging] = useState<BlockWithSummary | null>(null);

  const current = useMemo(() => {
    if (!data?.blocks.length) return null;
    const bs = data.blocks;
    return bs.find((b) => b.id === selected)
      ?? bs.find((b) => b.summary.start <= data.today && b.summary.end >= data.today)
      ?? bs.find((b) => b.summary.start > data.today) ?? bs.at(-1)!;
  }, [data, selected]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <div className="flex items-center gap-2 text-muted-foreground"><Spinner /> {t("common.loading")}…</div>;

  const done = (id?: number) => { setEditing(null); onCreatingDone(); if (id) setSelected(id); void reload(); };

  return (
    <div className="space-y-4">
      {loading && <Spinner className="text-muted-foreground" />}
      {data.blocks.length > 0 && <SeasonStrip data={data} selected={current?.id ?? null} onSelect={(id) => { setSelected(id); setEditing(null); }} />}

      {creating || editing ? (
        <BlockEditor key={editing?.id ?? "new"} block={editing} blocks={data.blocks} today={data.today} onDone={done} onCancel={() => { setEditing(null); onCreatingDone(); }} />
      ) : current ? (
        <>
          <BlockCard block={current} today={data.today} onEdit={() => setEditing(current)} onChange={() => setChanging(current)}
            onReplan={() => setReplanning({ block: current, startWith: "engine" })} onWeeks={() => setReplanning({ block: current, startWith: "plan" })} />
          <WeekRows block={current} onOpenWeek={onOpenWeek} />
        </>
      ) : (
        <Card><p className="text-sm text-muted-foreground">{t("block.none")}</p></Card>
      )}

      {replanning && <ReplanDialog block={replanning.block} startWith={replanning.startWith} options={{ thisWeek: true }} onClose={() => setReplanning(null)} onSaved={() => { setReplanning(null); void reload(); }} />}
      {changing && <ChangeDialog block={changing} onClose={() => setChanging(null)} onSaved={() => { setChanging(null); void reload(); }} />}
    </div>
  );
}

/* ---------- Season strip: blocks to scale, races, today, gaps ---------- */

export function SeasonStrip({ data, selected, onSelect }: { data: BlocksData; selected: number | null; onSelect: (id: number) => void }) {
  const { settings } = useSettings();
  const blocks = data.blocks;
  const thisWeek = weekStartOf(data.today, settings.weekStart);
  const lastEnd = blocks.map((b) => b.summary.end).sort().at(-1)!;
  const from = blocks[0].startWeek < thisWeek ? blocks[0].startWeek : thisWeek;
  const races: Race[] = data.races.filter((r) => r.date >= from && r.date <= addDays(lastEnd > data.today ? lastEnd : data.today, 120));
  const to = [lastEnd, data.today, ...races.map((r) => r.date)].sort().at(-1)!;
  const span = daysBetween(from, to) + 1;
  const pos = (d: string) => (daysBetween(from, d) / span) * 100;

  // Race names only where they have room (either way they point); otherwise just ⚑ (the name is in its title).
  const strip = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!strip.current) return;
    setWidth(strip.current.clientWidth);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(strip.current);
    return () => ro.disconnect();
  }, []);
  const shown = raceLabels(races.map((r) => ({ pos: pos(r.date), name: r.name })), width);
  const flagged = races.map((race, i) => ({ race, label: shown[i] }));

  const months: string[] = [];
  for (let m = addMonths(from, from.slice(8) === "01" ? 0 : 1); m <= to; m = addMonths(m, 1)) months.push(m);
  const every = Math.max(1, Math.ceil(months.length / 12));
  const gaps: { from: string; to: string }[] = [];
  blocks.forEach((b, i) => {
    const next = blocks[i + 1]?.startWeek ?? addDays(to, 1);
    const end = addDays(blockEnd(b), 1);
    if (daysBetween(end, next) >= 7) gaps.push({ from: end, to: next });
  });

  return (
    <Card className="px-4 pb-3 pt-4">
      <div className="mb-2 flex justify-between text-xs text-muted-foreground">
        <span>{fmtDay(from, { month: "short", year: "numeric" })} – {fmtDay(to, { month: "short", year: "numeric" })}</span>
      </div>
      <div ref={strip} className="relative h-24">
        <div className="absolute inset-x-0 top-7 h-9 rounded-md bg-muted" />
        {gaps.map((g) => pos(g.to) - pos(g.from) > 7 && (
          <span key={g.from} className="absolute top-9 truncate text-center text-xs text-muted-foreground" style={{ left: `${pos(g.from)}%`, width: `${pos(g.to) - pos(g.from)}%` }}>{t("block.gap")}</span>
        ))}
        {blocks.map((b) => (
          <button key={b.id} type="button" onClick={() => onSelect(b.id)} title={`${blockName(b)} · ${short(b.summary.start)} – ${short(b.summary.end)}`}
            aria-pressed={b.id === selected}
            className={cn("absolute top-7 h-9 overflow-hidden whitespace-nowrap rounded-md border-l-4 px-1.5 text-left text-xs font-semibold text-foreground", b.id === selected && "outline-2 outline-offset-2 outline-foreground")}
            style={{ left: `${pos(b.startWeek)}%`, width: `calc(${(b.weeks * 7 / span) * 100}% - 2px)`, borderLeftColor: BLOCK_COLOR[b.kind], background: `color-mix(in oklab, ${BLOCK_COLOR[b.kind]} 28%, var(--card))` }}>
            {blockName(b)} · {b.weeks}
          </button>
        ))}
        {flagged.map(({ race: r, label }) => (
          <div key={r.id} className="pointer-events-none absolute inset-y-0" style={{ left: `${pos(r.date)}%` }} title={`${r.name} · ${short(r.date)}`}>
            <div className="absolute bottom-5 top-4 w-0.5 bg-foreground" />
            <div className={cn("absolute top-0 max-w-40 truncate whitespace-nowrap text-xs font-semibold", labelRight(pos(r.date)) ? "left-1" : "right-1")}>⚑{label && ` ${r.name}`}</div>
          </div>
        ))}
        {data.today >= from && data.today <= to && (
          <div className="pointer-events-none absolute bottom-5 top-6 w-0.5 bg-signature" style={{ left: `${pos(data.today)}%` }} title={t("plan.today")} />
        )}
        <div className="absolute inset-x-0 bottom-0 h-4 text-xs text-muted-foreground">
          {months.map((m, i) => i % every === 0 && <span key={m} className="absolute" style={{ left: `${pos(m)}%` }}>{fmtDay(m, { month: "short" })}</span>)}
        </div>
      </div>
    </Card>
  );
}

/* ---------- The selected block ---------- */

function BlockCard({ block, today, onEdit, onChange, onReplan, onWeeks }: { block: BlockWithSummary; today: string; onEdit: () => void; onChange: () => void; onReplan: () => void; onWeeks: () => void }) {
  const fmt = useFmt();
  const s = block.summary;
  // Weeks not started can be re-planned toward the goal; offered more loudly once a finished week is off its target.
  const canReplan = block.startWeek <= today && s.weeks.some((w) => w.weekStart > today) && (block.goalKm != null || s.volume.totalKm > 0);
  const offTarget = s.weeks.some((w) => w.finished && w.targetKm != null && w.targetKm > 0 && Math.abs(w.actualKm / w.targetKm - 1) > 0.1);
  const easyLow = s.easy.share != null && s.easy.share < EASY_SHARE_FLAG;
  const longWarn = s.longest?.pct != null && s.longest.pct > 0.1 && s.longest.date >= today;
  const finished = s.end < today;
  return (
    <Card className="space-y-4 border-l-4" style={{ borderLeftColor: BLOCK_COLOR[block.kind] }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-semibold">{blockName(block)}</h2>
            {block.name && <Badge>{t(`block.kind.${block.kind}`)}</Badge>}
            {finished
              ? <Badge tone={s.status === "on_track" ? "success" : s.status === "behind" || s.status === "overreaching" ? "warning" : "neutral"}>{t("block.finished")}</Badge>
              : <StatusBadge status={s.status} />}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            {short(s.start)} – {short(s.end)} · {tn("block.weeks", block.weeks)}{s.weekNo && ` · ${t("block.weekNo", { n: s.weekNo, total: block.weeks })}`}
            {block.note && ` · ${block.note}`}
          </div>
          {block.goalKm != null && (
            <div className="mt-1 text-sm">
              <span className="font-medium tabular-nums">{t("block.goal", { dist: fmt.dist(block.goalKm, 0) })}</span>
              {canReplan && offTarget && <span className="ml-2 text-xs text-warning">{t("block.goalOff")}</span>}
            </div>
          )}
          {block.form?.running && block.form.start && block.form.end && (
            <div className="mt-1 text-xs tabular-nums text-muted-foreground">{t("block.formNow", { from: signedForm(block.form.start.value), to: signedForm(block.form.end.value) })}</div>
          )}
          {s.reasons.length > 0 && <div className="mt-1 text-xs text-muted-foreground">{s.reasons.map((r) => tm({ ...r, params: { unit: fmt.unit, ...r.params } })).join(" · ")}</div>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canReplan && <Button variant={offTarget ? "primary" : "outline"} className="h-9" onClick={onReplan}>{t("rp.button")}</Button>}
          {!finished && <Button variant={offTarget ? "outline" : "primary"} className="h-9" onClick={onWeeks}>{t("block.change")}</Button>}
          <MoreMenu className="h-9 w-9" items={[{ label: t("block.editText"), onClick: onEdit }, { label: t("block.settings"), onClick: onChange }]} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label={t("block.volume")} value={`${fmt.num(s.volume.doneKm)} / ${fmt.num(s.volume.totalKm)} ${fmt.unit}`}
          sub={s.volume.pct != null ? t("block.volumeSub", { pct: s.volume.pct }) : t("block.volumeNone")} />
        <Tile label={t("block.key")} value={`${s.key.done} / ${s.key.planned}`} sub={t("block.keySub", { count: s.key.total })} />
        <Tile label={t("block.easy")} value={s.easy.share != null ? t("block.easyPct", { pct: pct(s.easy.share) }) : "–"}
          sub={s.easy.share == null ? t("block.easyNone") : easyLow ? t("block.easyHigh") : t("block.easyOk")} warn={easyLow} />
        <Tile label={t("block.longest")} value={s.longest ? fmt.dist(s.longest.km) : "–"} warn={longWarn}
          sub={s.longest && <>{s.longest.planned && `${t("block.planned")} · `}{s.longest.pct != null && s.longest.pct > 0 && t("block.step", { sign: s.longest.pct >= 0 ? "+" : "", pct: pct(s.longest.pct) })}</>} />
      </div>
      {finished && <FinishedSummary block={block} />}
      {s.distribution.total > 0 && (
        <p className="text-xs text-muted-foreground">{t("block.split", { low: pct(s.distribution.low), mid: pct(s.distribution.mid), high: pct(s.distribution.high) })}</p>
      )}
    </Card>
  );
}

/** What a finished block came to, in one or two sentences from its own numbers. */
function FinishedSummary({ block }: { block: BlockWithSummary }) {
  const s = block.summary;
  const parts = [
    s.volume.pct != null && t("block.sum.volume", { pct: s.volume.pct }),
    s.key.planned > 0 && t("block.sum.key", { done: s.key.done, planned: s.key.planned }),
    s.easy.share != null && t(s.easy.share < EASY_SHARE_FLAG ? "block.sum.easyLow" : "block.sum.easy", { pct: pct(s.easy.share) }),
  ].filter(Boolean) as string[];
  const f = block.form;
  if (!parts.length && !f?.start) return null;
  return (
    <div className="space-y-1 rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">
      {f?.start && f.end && <p className="font-semibold tabular-nums">{t("block.sum.form", { from: signedForm(f.start.value), to: signedForm(f.end.value) })}</p>}
      {parts.length > 0 && <p>{parts.join(" ")}</p>}
    </div>
  );
}

function Tile({ label, value, sub, warn }: { label: string; value: ReactNode; sub?: ReactNode; warn?: boolean }) {
  return (
    <div className="rounded-md bg-muted px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className={cn("text-xs", warn ? "text-warning" : "text-muted-foreground")}>{sub}</div>}
    </div>
  );
}

function WeekRows({ block, onOpenWeek }: { block: BlockWithSummary; onOpenWeek: (ws: string) => void }) {
  const fmt = useFmt();
  const weeks = block.summary.weeks;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.targetKm ?? 0, w.actualKm)));
  const cols = "md:grid-cols-[8rem_minmax(0,1fr)_4.5rem_4.5rem_7.5rem]";
  return (
    <div className="space-y-2">
      <div className={cn("hidden gap-4 px-4 text-xs text-muted-foreground md:grid", cols)}>
        <span>{t("block.colWeek")}</span><span>{t("block.colKm")}</span><span>{t("block.colKey")}</span><span>{t("block.colEasy")}</span><span>{t("block.colStatus")}</span>
      </div>
      {weeks.map((w) => {
        const lowEasy = w.easyShare != null && w.easyShare < EASY_SHARE_FLAG;
        return (
          <button key={w.weekStart} type="button" onClick={() => onOpenWeek(w.weekStart)}
            className={cn("grid w-full grid-cols-[6rem_minmax(0,1fr)] items-center gap-x-4 gap-y-2 rounded-lg border px-4 py-3 text-left text-sm hover:bg-accent", cols,
              w.current ? "border-signature bg-signature-soft/40" : "border-border bg-card")}>
            <span className="font-medium">
              {short(w.weekStart)}{w.current && ` · ${t("block.now")}`}
              {w.backoff && <span className="block text-xs font-normal text-muted-foreground">{t("plan.backoff")}</span>}
            </span>
            <span className="flex items-center gap-3">
              <span className="relative h-2.5 flex-1 rounded-full bg-muted" aria-hidden>
                {w.actualKm > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(w.actualKm / max) * 100}%`, background: BLOCK_COLOR[block.kind] }} />}
                {w.targetKm != null && <span className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: `${(w.targetKm / max) * 100}%` }} />}
              </span>
              <span className="w-20 text-right tabular-nums">{w.finished || w.current ? fmt.num(w.actualKm) : "–"} / {w.targetKm != null ? fmt.num(w.targetKm) : "–"}</span>
            </span>
            <span className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 md:contents">
              <span className="tabular-nums"><span className="text-muted-foreground md:hidden">{t("block.colKey")} </span>{w.keyDone} / {w.keyPlanned}</span>
              <span className={cn("tabular-nums", lowEasy ? "text-warning" : w.easyShare == null && "text-muted-foreground")}>
                <span className="text-muted-foreground md:hidden">{t("block.colEasy")} </span>{w.easyShare != null ? `${pct(w.easyShare)} %` : "–"}
              </span>
              <span><StatusBadge status={w.status} /></span>
            </span>
          </button>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("block.clickWeek")}</p>
    </div>
  );
}

/* ---------- Block editor: text or list, quick-add, coach (docs/decisions/fartlek-block-coach.md) ---------- */

function BlockEditor({ block, blocks, today, onDone, onCancel }: { block: BlockWithSummary | null; blocks: Block[]; today: string; onDone: (id?: number) => void; onCancel: () => void }) {
  const { settings } = useSettings();
  const ws = settings.weekStart;
  const thisWeek = weekStartOf(today, ws);
  const defaultStart = () => {
    const lastEnd = blocks.map(blockEnd).sort().at(-1);
    return lastEnd && lastEnd >= thisWeek ? addDays(lastEnd, 1) : thisWeek;
  };
  const [name, setName] = useState(block?.name ?? "");
  const [kind, setKind] = useState<BlockKind>(block?.kind ?? "base");
  const [start, setStart] = useState(block?.startWeek ?? defaultStart());
  const [text, setText] = useState("");
  const [touched, setTouched] = useState(false);
  const [loaded, setLoaded] = useState(!block);
  const [preview, setPreview] = useState<BlockPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [view, setView] = useState<"text" | "list">("text");
  const [sel, setSel] = useState<number | null>(null);
  /** Minutes a week of other sports: undefined = as stored on the block (or the history mean), null = back to the mean. */
  const [cross, setCross] = useState<number | null | undefined>(undefined);
  const [undo, setUndo] = useState<{ id: TipId; text: string; value: number | null } | null>(null);
  const seq = useRef(0);

  // Starting text: the block as it stands, or for a new block starting in the past, its finished weeks.
  useEffect(() => {
    const weeks = block ? block.weeks : start < thisWeek ? Math.min(52, Math.round(daysBetween(start, thisWeek) / 7)) : 0;
    if (!block && touched) return;
    if (!weeks) { setText(""); return; }
    let live = true;
    void api<{ text: string }>(`/blocks/text?start=${start}&weeks=${weeks}&lang=${stepLang}`).then((r) => {
      if (!live) return;
      setText(block ? r.text : `${r.text}\n`);
      setLoaded(true);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.id, start]);

  useEffect(() => {
    if (!loaded) return;
    const n = ++seq.current;
    setPreviewing(true);
    const timer = setTimeout(() => {
      const body = { ...(block ? { id: block.id } : { startWeek: start }), text, lang: stepLang, ...(cross !== undefined ? { crossMin: cross } : {}) };
      api<BlockPreview>("/blocks/preview", { body })
        .then((p) => { if (n === seq.current) setPreview(p); })
        .catch(() => { if (n === seq.current) setPreview(null); })
        .finally(() => { if (n === seq.current) setPreviewing(false); });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, start, loaded, block, cross]);

  const savedId = useRef<number | undefined>(block?.id);
  const save = useAction(async (pushNext: boolean) => {
    const body = { text, pushNext, lang: stepLang, ...(cross !== undefined ? { crossMin: cross } : {}) };
    if (block) await api(`/blocks/${block.id}/text`, { method: "PUT", body });
    else savedId.current = (await api<{ id: number }>("/blocks", { body: { ...body, name: name || null, kind, startWeek: start } })).id;
  }, () => onDone(savedId.current));
  const submit = (pushNext: boolean) => void save.run(pushNext);

  const lines = text.split("\n");
  const rows = Math.max(6, lines.length + 1);
  const blocked = !preview || preview.errors.length > 0 || !!preview.conflict || !text.trim();
  const pushes = preview?.pushes ?? [];
  const firstOpen = Math.max(0, lines.findIndex((l) => !l.trim().startsWith("✓")));
  const target = sel ?? firstOpen;
  const edit = (next: string) => { setText(next); setTouched(true); setUndo(null); };
  const lineAtCaret = (el: HTMLTextAreaElement) => setSel(el.value.slice(0, el.selectionStart).split("\n").length - 1);
  const setLine = (i: number, f: (line: string) => string) => {
    const ls = [...lines];
    while (ls.length <= i) ls.push("-");
    ls[i] = f(ls[i] ?? "");
    edit(ls.join("\n").replace(/\n+$/, (m) => (m.length > 1 ? "\n" : m)));
  };
  const applyTip = (tip: CoachTip) => { setUndo({ id: tip.id, text, value: preview?.coach?.value ?? null }); setText(tip.text); setTouched(true); };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">{block ? blockName(block) : t("block.new")}</h2>
        {block && <span className="text-sm text-muted-foreground">{t(`block.kind.${block.kind}`)} · {wk(block.startWeek)}–{wk(addDays(block.startWeek, (block.weeks - 1) * 7))} · {tn("block.weeks", block.weeks)}</span>}
      </div>
      {!block && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={t("settings.name")}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t(`block.kind.${kind}`)} /></Field>
          <Field label={t("block.kindLabel")}>
            <Select value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>{BLOCK_KINDS.map((k) => <option key={k} value={k}>{t(`block.kind.${k}`)}</option>)}</Select>
          </Field>
          <Field label={t("block.startWeek")}><Input type="date" value={start} onChange={(e) => e.target.value && setStart(weekStartOf(e.target.value, ws))} /></Field>
        </div>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[1_1_26rem] space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="block-text" className="text-sm font-medium">{t("block.text")}</label>
            <SegmentedControl aria-label={t("edit.as")} value={view} onChange={setView} options={[{ value: "text", label: t("edit.text") }, { value: "list", label: t("edit.list") }]} />
          </div>
          <QuickAdd weekLabel={wk(addDays(start, target * 7))} onAdd={(part) => setLine(target, (l) => withPart(l, part))} />

          {view === "text" ? (
            <>
              <div className="flex overflow-hidden rounded-md border border-border bg-background focus-within:outline-2 focus-within:outline-ring">
                <div className="shrink-0 select-none border-r border-border bg-muted/50 py-2 font-mono text-xs leading-7">
                  {Array.from({ length: rows }, (_, i) => (i < lines.length || i === 0 ? (
                    <button key={i} type="button" tabIndex={-1} aria-label={t("edit.pick", { week: wk(addDays(start, i * 7)) })} onClick={() => setSel(i)}
                      className={cn("block w-full pl-3 pr-2 text-right", i === target ? "bg-accent font-semibold text-accent-foreground" : "text-muted-foreground")}>
                      {wk(addDays(start, i * 7))}
                    </button>
                  ) : <div key={i} aria-hidden>&nbsp;</div>))}
                </div>
                <Textarea id="block-text" rows={rows} spellCheck={false} wrap="off" value={text}
                  onChange={(e) => { edit(e.target.value); lineAtCaret(e.currentTarget); }} onKeyUp={(e) => lineAtCaret(e.currentTarget)} onClick={(e) => lineAtCaret(e.currentTarget)}
                  className="min-h-0 resize-none overflow-x-auto overflow-y-hidden whitespace-pre rounded-none border-0 py-2 font-mono text-sm leading-7 focus-visible:outline-0"
                  placeholder={stepLang === "sv" ? "6 lugnt, 9 tröskel, 12 långpass\n6 lugnt, 10 tröskel, 13 långpass\n5 lugnt, 8 tröskel, 10 långpass avlastning" : "6 easy, 9 threshold, 12 long run\n6 easy, 10 threshold, 13 long run\n5 easy, 8 threshold, 10 long run backoff"} />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("block.textHint")} <code>6 zone 2, 9 tröskel, 15 long run</code> · <code>15 long run zone 2</code> · <code>45min easy</code> · <code>4 20</code> · <code>backoff</code> · <code>-</code>
              </p>
              <p className="text-xs text-muted-foreground">{t("block.stepsHint", { example: "9 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)" })}</p>
            </>
          ) : (
            <ListEditor lines={lines.filter((l, i) => l.trim() || i < lines.length - 1)} start={start} sel={target} onSel={setSel} onRemove={(i, k) => setLine(i, (l) => withoutPart(l, k))}
              onEdit={(i, k, part) => setLine(i, (l) => withPartAt(l, k, part))} />
          )}

          {preview?.coach && <CrossHabit coach={preview.coach} onChange={setCross} />}
          {preview && text.trim() && <WeekCalendar weeks={preview.weeks} crossMin={preview.coach?.crossMin ?? null} />}
        </div>

        <div className="min-w-0 flex-[1_1_30rem] space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">{t("block.preview")}{previewing && <Spinner className="text-muted-foreground" />}</div>
          {!preview || !text.trim() ? <p className="text-sm text-muted-foreground">{t("block.previewEmpty")}</p> : (
            <>
              {preview.coach && <CoachPanel coach={preview.coach} baseValue={undo?.value ?? null} onApply={applyTip} undo={undo?.id ?? null} onUndo={() => { if (undo) setText(undo.text); setUndo(null); }} />}
              <WeekNotices weeks={preview.weeks} />
              {preview.length !== preview.oldLength && block && (
                <p className="text-xs text-muted-foreground">{t("block.lengthChange", { from: preview.oldLength, to: preview.length })}</p>
              )}
              {preview.errors.map((e, i) => <p key={i} className="text-sm text-danger">{tm(e)}</p>)}
              {preview.conflict && (
                <p className="text-sm text-danger">{t(preview.conflict.reason === "started" ? "block.started" : "block.overlap", { name: blockName(preview.conflict.block) })}</p>
              )}
              {pushes.map((p: Push) => <p key={p.id} className="text-sm text-warning">{tn("block.push", p.weeks, { name: blockName(p) })}</p>)}
            </>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {pushes.length > 0
              ? <BusyButton busy={save.busy} disabled={blocked} onClick={() => submit(true)}>{t("block.pushYes")}</BusyButton>
              : <BusyButton busy={save.busy} disabled={blocked} onClick={() => submit(false)}>{block ? t("block.save") : t("block.create")}</BusyButton>}
            <Button variant="ghost" onClick={onCancel}>{t("common.cancel")}</Button>
          </div>
          <ErrorText>{save.error}</ErrorText>
        </div>
      </div>
    </Card>
  );
}

/** What the week calendar doesn't show: sessions that stay or leave, dropped steps and long-run spikes. */
function WeekNotices({ weeks }: { weeks: WeekPreview[] }) {
  const fmt = useFmt();
  const items = weeks.flatMap((w) => [
    ...(w.state === "removed" && w.leaving > 0 ? [{ key: `${w.weekStart}-l`, warn: false, text: `${wk(w.weekStart)}: ${tn("block.leaving", w.leaving)}` }] : []),
    ...w.changes.filter((c) => c.op === "keep").map((c, i) => ({ key: `${w.weekStart}-k${i}`, warn: true, text: changeText(c, fmt.unit) })),
    ...w.warnings.map((x, i) => ({
      key: `${w.weekStart}-w${i}`, warn: true,
      text: x.key === "bt.stepsDropped"
        ? t("bt.stepsDropped", { type: t(`workout.${x.params!.type as WorkoutType}`), day: fmtDay(String(x.params!.date), { weekday: "short" }) })
        : tm(x),
    })),
    ...w.spikes.map((s) => ({
      key: `${w.weekStart}-s${s.date}`, warn: true,
      text: `▲ ${t("block.spikeWarn", { type: t(`workout.${s.type}`), day: fmtDay(s.date, { weekday: "short" }), km: fmt.dist(s.km), pct: pct(s.pct), ref: fmt.dist(s.refKm) })}`,
    })),
  ]);
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((x) => <li key={x.key} className={cn("rounded px-2 py-1 text-xs", x.warn ? "bg-warning/15 text-warning" : "text-muted-foreground")}>{x.text}</li>)}
    </ul>
  );
}

function amountText(a: AmountView | null, unit: string) {
  if (!a) return "";
  if (a.distance != null) return `${a.distance} ${unit}`;
  if (a.durationMin != null) return `${a.durationMin} min`;
  return "";
}

function changeText(c: Change, unit: string) {
  const type = c.type === "long" && c.zone2 ? t("workout.longEasy") : t(`workout.${c.type}`);
  const day = fmtDay(c.date, { weekday: "short" });
  return t(`block.ch.${c.op}`, { type, from: amountText(c.before, unit), to: amountText(c.after, unit), day });
}

/* ---------- Change or delete a block ---------- */

function ChangeDialog({ block, onClose, onSaved }: { block: BlockWithSummary; onClose: () => void; onSaved: () => void }) {
  const { settings } = useSettings();
  const [name, setName] = useState(block.name ?? "");
  const [kind, setKind] = useState<BlockKind>(block.kind);
  const [note, setNote] = useState(block.note ?? "");
  const [start, setStart] = useState(block.startWeek);
  const [weeks, setWeeks] = useState(String(block.weeks));
  const [pushes, setPushes] = useState<Push[] | null>(null);
  const [alsoWorkouts, setAlsoWorkouts] = useState(false);
  const [deleted, setDeleted] = useState<number | null>(null);

  const save = useAction(async (pushNext: boolean) => {
    try {
      await api(`/blocks/${block.id}`, { method: "PATCH", body: { name: name || null, kind, note: note || null, startWeek: start, weeks: Number(weeks), pushNext } });
    } catch (e) {
      const d = e instanceof ApiError ? e.data as { conflict?: string; pushes?: Push[]; block?: Block } | null : null;
      if (d?.conflict === "push" && d.pushes) { setPushes(d.pushes); throw new Error(d.pushes.map((p) => tn("block.push", p.weeks, { name: blockName(p) })).join(" "), { cause: e }); }
      if (d?.block) throw new Error(t(d.conflict === "started" ? "block.started" : "block.overlap", { name: blockName(d.block) }), { cause: e });
      throw e;
    }
  }, onSaved);
  const del = useAction(async () => setDeleted((await api<{ deleted: number }>(`/blocks/${block.id}${alsoWorkouts ? "?workouts=1" : ""}`, { method: "DELETE" })).deleted));

  return (
    <Dialog open onClose={deleted != null ? onSaved : onClose} title={t("block.changeTitle", { name: blockName(block) })}>
      {deleted != null ? (
        <div className="space-y-3">
          <p className="text-sm">{tn("block.deleted", deleted)}.</p>
          <Button onClick={onSaved}>{t("common.done")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("settings.name")}><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder={t(`block.kind.${kind}`)} /></Field>
            <Field label={t("block.kindLabel")}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as BlockKind)}>{BLOCK_KINDS.map((k) => <option key={k} value={k}>{t(`block.kind.${k}`)}</option>)}</Select>
            </Field>
            <Field label={t("block.startWeek")}><Input type="date" value={start} onChange={(e) => e.target.value && setStart(weekStartOf(e.target.value, settings.weekStart))} /></Field>
            <Field label={t("block.weeksLabel")}><Input type="number" min={1} max={52} value={weeks} onChange={(e) => { setWeeks(e.target.value); setPushes(null); }} /></Field>
          </div>
          <Field label={t("target.note")}><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} /></Field>
          <p className="text-xs text-muted-foreground">{t("block.edgeHint")}</p>
          <div className="flex flex-wrap gap-2">
            {pushes
              ? <BusyButton busy={save.busy} onClick={() => save.run(true)}>{t("block.pushYes")}</BusyButton>
              : <BusyButton busy={save.busy} onClick={() => save.run(false)}>{t("common.save")}</BusyButton>}
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          </div>
          <ErrorText>{save.error}</ErrorText>

          <div className="space-y-2 border-t border-border pt-3">
            <p className="text-xs text-muted-foreground">{t("block.deleteHint")}</p>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={alsoWorkouts} onChange={(e) => setAlsoWorkouts(e.target.checked)} /> {t("block.deleteWorkouts")}</label>
            <BusyButton variant="danger" className="h-8 text-xs" busy={del.busy} onClick={() => del.run()}>{t("block.delete")}</BusyButton>
            <ErrorText>{del.error}</ErrorText>
          </div>
        </div>
      )}
    </Dialog>
  );
}
