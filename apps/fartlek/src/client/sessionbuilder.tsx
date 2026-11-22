import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { stepsLoad } from "../shared/load";
import {
  addItem, amountOf, bandOf, choiceOf, duplicateItem, moveItem, MP_PCT, paceText, profile, qualityMin, readPace, refsThreshold,
  removeItem, setItem, TARGET_CHOICES, TEMPLATES, targetValue, withAmount, withTarget,
  type AmountUnit, type Band, type NewItem, type Segment, type TargetChoice, type TemplateId,
} from "../shared/stepedit";
import {
  flattenSteps, resolveTarget, stepsText, stepTotals, withJudge,
  type Judge, type StepDef, type StepItem, type StepRefs, type StepRole, type WorkoutSteps,
} from "../shared/steps";
import { stepsKm, type SuggestItem } from "../shared/nextweek";
import { parseSteps, plannedFromSteps } from "../shared/steps";
import { sessionText } from "../shared/blocktext";
import { parseWeekLine } from "../shared/parser";
import type { WorkoutType } from "../shared/types";
import { TYPE_COLOR } from "./bits";
import { api, useApi } from "./http";
import { lang, t, tm, type MsgKey } from "./i18n";
import { useFmt } from "./prefs";
import { useParsedSteps } from "./steps";
import { Button, Dialog, Input, Textarea, cn } from "./ui";

/*
 * The session builder (docs/decisions/fartlek-session-builder.md): a session as rows, one step at a
 * time (amount, unit, intensity), with repeats as their own group, a profile bar and the totals.
 * The step text stays the one source of truth: every edit is written back with stepsText and parsed
 * again, so the text view, the block text and the server read the same thing. The same builder is
 * used by the workout dialog, the week suggestion and the block editor.
 */

const stepLang = lang === "sv" ? "sv" : "en";

const BAND_COLOR: Record<Band, string> = {
  jog: "var(--border)", easy: "var(--seq-1)", steady: "var(--seq-2)", hard: "var(--signature)", fast: "var(--chart-5)",
};
const ROLE_KEY: Record<StepRole, MsgKey> = {
  warmup: "steps.role.warmup", run: "steps.role.run", work: "steps.role.work", recovery: "steps.role.recovery", cooldown: "steps.role.cooldown",
};

/** `57 min`, `1 h 25 min`: a planned length, not a clock time. */
export function minutesText(min: number): string {
  const m = Math.round(min);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

/** Narrow screens get one open row at a time (the sheet in the mocks); wider ones show every row. */
function useNarrow(): boolean {
  const q = "(max-width: 639px)";
  const [narrow, setNarrow] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setNarrow(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return narrow;
}

/* ---------- Profile bar ---------- */

/** The session's shape: width by time, height by intensity. Used in the builder and on session chips. */
export function StepProfile({ steps, refs, className, height = 48 }: { steps: WorkoutSteps; refs: StepRefs; className?: string; height?: number }) {
  const segs = useMemo(() => profile(steps, refs), [steps, refs]);
  return <ProfileBars segs={segs} className={className} height={height} />;
}

function ProfileBars({ segs, className, height }: { segs: Segment[]; className?: string; height: number }) {
  return (
    <div aria-hidden className={cn("flex items-end gap-px", className)} style={{ height }}>
      {segs.map((s, i) => (
        <span key={i} className="block rounded-t-[3px]" style={{
          flex: `${Math.max(s.min, 0.4)} 1 0`, background: BAND_COLOR[bandOf(s.intensity, s.target)],
          height: `${Math.round(Math.min(1, Math.max(0.16, (s.intensity - 0.5) / 0.6)) * 100)}%`,
        }} />
      ))}
    </div>
  );
}

/* ---------- Small inputs that keep a draft while typing ---------- */

function NumberInput({ value, onCommit, label, className, decimals = true, min = 0 }: {
  value: number; onCommit: (n: number) => void; label: string; className?: string; decimals?: boolean; min?: number;
}) {
  const show = (n: number) => (stepLang === "sv" ? String(n).replace(".", ",") : String(n));
  const [draft, setDraft] = useState(show(value));
  // Don't overwrite what is being typed ("1," on the way to "1,5") with the committed value.
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(show(value)); }, [value]);
  const commit = (s: string) => {
    const n = Number(s.replace(",", "."));
    if (Number.isFinite(n) && n > min && (decimals || Number.isInteger(n))) onCommit(n);
  };
  return (
    <Input inputMode={decimals ? "decimal" : "numeric"} aria-label={label} value={draft}
      onFocus={() => { focused.current = true; }} onChange={(e) => { setDraft(e.target.value); commit(e.target.value); }}
      onBlur={() => { focused.current = false; setDraft(show(value)); }}
      className={cn("h-9 text-right tabular-nums", className)} />
  );
}

function PaceInput({ secPerKm, onCommit, label }: { secPerKm: number; onCommit: (s: number) => void; label: string }) {
  const fmt = useFmt();
  const [draft, setDraft] = useState(paceText(secPerKm, fmt.units));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setDraft(paceText(secPerKm, fmt.units)); }, [secPerKm, fmt.units]);
  return (
    <Input aria-label={label} value={draft} placeholder="4:40" title={t("builder.paceHint", { unit: fmt.unit })}
      onChange={(e) => { setDraft(e.target.value); const s = readPace(e.target.value, fmt.units); if (s) onCommit(s); }}
      onFocus={() => { focused.current = true; }} onBlur={() => { focused.current = false; setDraft(paceText(secPerKm, fmt.units)); }}
      className="h-9 w-20 text-right tabular-nums" />
  );
}

const selectCls = "h-9 rounded-md border border-border bg-background px-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring";

/* ---------- One step's fields: amount, unit, intensity, target value ---------- */

function AmountFields({ def, onChange, n, rest = false }: { def: StepDef; onChange: (d: StepDef) => void; n: number; rest?: boolean }) {
  const fmt = useFmt();
  const a = amountOf(def, fmt.units);
  const units: AmountUnit[] = ["dist", "m", "min", "s"];
  return (
    <>
      <NumberInput value={a.value} label={t("builder.amount", { n })} className="w-[4.5rem]" onCommit={(v) => onChange(withAmount(def, { value: v, unit: a.unit }, fmt.units))} />
      <select aria-label={t("builder.unit", { n })} value={a.unit} className={cn(selectCls, "w-[4.25rem]")}
        onChange={(e) => {
          const unit = e.target.value as AmountUnit;
          // Switching unit keeps a sensible number rather than converting 2 km into 2000 m.
          const value = unit === "m" ? (a.unit === "dist" ? Math.round(a.value * 1000) : 400) : unit === "s" ? (a.unit === "min" ? Math.round(a.value * 60) : 30) : unit === "min" ? (a.unit === "s" ? Math.max(1, Math.round(a.value / 60)) : rest ? 2 : 10) : a.unit === "m" ? a.value / 1000 : 2;
          onChange(withAmount(def, { value, unit }, fmt.units));
        }}>
        {units.map((u) => <option key={u} value={u}>{u === "dist" ? fmt.unit : u}</option>)}
      </select>
    </>
  );
}

function TargetFields({ def, onChange, n, choices = TARGET_CHOICES }: { def: StepDef; onChange: (d: StepDef) => void; n: number; choices?: TargetChoice[] }) {
  const c = choiceOf(def.target);
  const v = targetValue(def.target);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <select aria-label={t("builder.target", { n })} value={c} className={cn(selectCls, "min-w-0 flex-1")}
        onChange={(e) => onChange(withTarget(def, e.target.value as TargetChoice))}>
        {choices.map((x) => <option key={x} value={x}>{t(`builder.t.${x}` as MsgKey)}</option>)}
      </select>
      {c === "pace" && v != null && <PaceInput secPerKm={v} label={t("builder.targetValue", { n })} onCommit={(s) => onChange(withTarget(def, "pace", s))} />}
      {(c === "pct" || c === "hr") && v != null && (
        <span className="flex items-center gap-1">
          <NumberInput value={v} decimals={false} label={t("builder.targetValue", { n })} className="w-16" onCommit={(x) => onChange(withTarget(def, c, x))} />
          <span className="text-xs text-muted-foreground">{c === "pct" ? "%" : "bpm"}</span>
        </span>
      )}
    </div>
  );
}

/** "Target: pace 4:00–4:35/km · HR shown": what is judged first, the other as context (as the old text field showed it). */
function Goal({ def, refs, onJudge }: { def: StepDef; refs: StepRefs | null; onJudge?: (j: Judge) => void }) {
  const fmt = useFmt();
  if (!refs) return null;
  if (!def.target || def.target.kind === "jog" || def.target.kind === "strides") return <span className="text-xs text-muted-foreground">{t("steps.notJudged")}</span>;
  const r = resolveTarget(def, refs);
  if (!r.judge) return <span className="text-xs text-muted-foreground">{t("steps.noTarget")}</span>;
  const range = (x: [number, number], kind: Judge) => (kind === "pace" ? `${fmt.pace(x[0]).split("/")[0]}–${fmt.pace(x[1])}` : `${x[0]}–${x[1]}`);
  const parts = [r.judge === "pace" ? t("steps.goalPace", { range: range(r.pace!, "pace") }) : t("steps.goalHr", { range: range(r.hr!, "hr") })];
  if (r.judge === "pace") parts.push(r.hrRef ? `${t("steps.showHr")}, ${t("steps.hrRef", { hr: r.hrRef })}` : t("steps.showHr"));
  else parts.push(t("steps.showPace"));
  const other: Judge = r.judge === "pace" ? "hr" : "pace";
  const canFlip = other === "pace" ? !!r.pace : !!r.hr;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{parts.join(" · ")}</span>
      {onJudge && canFlip && (
        <button type="button" title={t("steps.switchJudge")} onClick={() => onJudge(other)}
          className="rounded-full border border-border bg-card px-2 py-0.5 text-[11px] text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
          {t("steps.judgedOn", { what: t(`steps.judge.${r.judge}`) })}
        </button>
      )}
    </span>
  );
}

/* ---------- Row menu ---------- */

function RowMenu({ n, first, last, onMove, onDuplicate, onRemove }: { n: number; first: boolean; last: boolean; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const item = (label: string, fn: () => void, disabled = false, danger = false) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={() => { fn(); setOpen(false); }}
      className={cn("block w-full rounded px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-40", danger && "text-danger")}>{label}</button>
  );
  return (
    <div ref={root} className="relative">
      <button type="button" aria-haspopup="menu" aria-expanded={open} aria-label={t("builder.menu", { n })} onClick={() => setOpen(!open)}
        className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden><circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-[calc(100%+4px)] z-30 w-44 rounded-lg border border-card-edge bg-card shadow-card p-1 shadow-lg">
          {item(t("builder.up"), () => onMove(-1), first)}
          {item(t("builder.down"), () => onMove(1), last)}
          {item(t("builder.duplicate"), onDuplicate)}
          {item(t("builder.remove"), onRemove, false, true)}
        </div>
      )}
    </div>
  );
}

function Badge({ n, color, light = false }: { n: ReactNode; color: string; light?: boolean }) {
  return (
    <span aria-hidden className="flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold"
      style={{ background: color, color: light ? "var(--accent-foreground)" : "#fff" }}>{n}</span>
  );
}

/* ---------- Rows ---------- */

interface RowProps {
  item: StepItem; index: number; count: number; role: StepRole; refs: StepRefs | null; open: boolean; narrow: boolean;
  onChange: (it: StepItem) => void; onOpen: () => void; onMove: (d: -1 | 1) => void; onDuplicate: () => void; onRemove: () => void;
}

function rowSummary(def: StepDef, units: "metric" | "imperial"): string {
  const a = amountOf(def, units);
  const amount = `${stepLang === "sv" ? String(a.value).replace(".", ",") : a.value} ${a.unit === "dist" ? (units === "imperial" ? "mi" : "km") : a.unit}`;
  const c = choiceOf(def.target);
  const v = targetValue(def.target);
  const word = t(`builder.t.${c}` as MsgKey).toLowerCase();
  if (c === "pace" && v != null) return `${amount} @ ${paceText(v, units)}`;
  if ((c === "pct" || c === "hr") && v != null) return `${amount} @ ${v}${c === "pct" ? " %" : " bpm"}`;
  return c === "none" ? amount : `${amount} ${word}`;
}

function StepRow({ item, index, count, role, refs, open, narrow, onChange, onOpen, onMove, onDuplicate, onRemove }: RowProps & { item: Extract<StepItem, { kind: "step" }> }) {
  const fmt = useFmt();
  const n = index + 1;
  const def = item.step;
  const segBand = refs ? bandOf(profile({ v: 1, items: [item] }, refs)[0]?.intensity ?? 0.7, def.target) : "easy";
  const color = BAND_COLOR[segBand];
  const menu = <RowMenu n={n} first={index === 0} last={index === count - 1} onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} />;
  if (narrow && !open) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card pr-1">
        <button type="button" onClick={onOpen} aria-label={t("builder.edit", { n })} className="flex min-h-12 flex-1 items-center gap-3 px-3 text-left">
          <span aria-hidden className="h-7 w-2.5 rounded-sm" style={{ background: color }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{rowSummary(def, fmt.units)}</span>
            <span className="text-xs text-muted-foreground">{t(ROLE_KEY[role])}</span>
          </span>
        </button>
        {menu}
      </div>
    );
  }
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-card p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge n={n} color={color} light={segBand === "easy" || segBand === "jog"} />
        <span className="w-24 text-sm font-medium">{t(ROLE_KEY[role])}</span>
        <AmountFields def={def} n={n} onChange={(d) => onChange({ kind: "step", step: d })} />
        <div className="min-w-[9rem] flex-1"><TargetFields def={def} n={n} onChange={(d) => onChange({ kind: "step", step: d })} /></div>
        {menu}
      </div>
      <div className="pl-8"><Goal def={def} refs={refs} onJudge={(j) => onChange(withJudge({ v: 1, items: [item] }, 0, "step", j).items[0])} /></div>
    </div>
  );
}

function RepeatRow({ item, index, count, refs, open, narrow, onChange, onOpen, onMove, onDuplicate, onRemove }: RowProps & { item: Extract<StepItem, { kind: "repeat" }> }) {
  const fmt = useFmt();
  const n = index + 1;
  const strides = item.work.target?.kind === "strides";
  const color = strides ? BAND_COLOR.fast : "var(--signature)";
  const set = (patch: Partial<Extract<StepItem, { kind: "repeat" }>>) => onChange({ ...item, ...patch });
  const flip = (part: "work" | "rest", j: Judge) => onChange(withJudge({ v: 1, items: [item] }, 0, part, j).items[0]);
  const menu = <RowMenu n={n} first={index === 0} last={index === count - 1} onMove={onMove} onDuplicate={onDuplicate} onRemove={onRemove} />;
  const title = `${item.times} × ${rowSummary(item.work, fmt.units)}`;
  if (narrow && !open) {
    return (
      <div className="flex items-center gap-2 rounded-md border pr-1" style={{ borderColor: color }}>
        <button type="button" onClick={onOpen} aria-label={t("builder.edit", { n })} className="flex min-h-12 flex-1 items-center gap-3 px-3 text-left">
          <span aria-hidden className="h-7 w-2.5 rounded-sm" style={{ background: color }} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-semibold">{title}</span>
            {item.rest && <span className="text-xs text-muted-foreground">{t("builder.rest")} {rowSummary(item.rest, fmt.units)}</span>}
          </span>
        </button>
        {menu}
      </div>
    );
  }
  return (
    <div className="space-y-2 rounded-md border p-2" style={{ borderColor: color, background: strides ? undefined : "color-mix(in srgb, var(--signature-soft) 35%, var(--card))" }}>
      <div className="flex flex-wrap items-center gap-2">
        <Badge n={n} color={color} />
        <label className="flex items-center gap-2 text-sm font-semibold">
          {t("builder.repeat")}
          <NumberInput value={item.times} decimals={false} label={t("builder.repeatTimes", { n })} className="w-14" onCommit={(x) => set({ times: Math.min(50, x) })} />
          <span className="font-normal">{t("builder.times")}</span>
        </label>
        <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">{item.rest ? t("builder.restNote") : ""}</span>
        {menu}
      </div>
      <div className="space-y-1.5 pl-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-16 text-sm font-medium">{t("builder.work")}</span>
          <AmountFields def={item.work} n={n} onChange={(d) => set({ work: d })} />
          <div className="min-w-[9rem] flex-1"><TargetFields def={item.work} n={n} onChange={(d) => set({ work: d })} /></div>
        </div>
        <Goal def={item.work} refs={refs} onJudge={(j) => flip("work", j)} />
        {item.rest ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-16 text-sm font-medium">{t("builder.rest")}</span>
            <AmountFields def={item.rest} n={n} rest onChange={(d) => set({ rest: d })} />
            <div className="min-w-[9rem] flex-1"><TargetFields def={item.rest} n={n} choices={["jog", "easy", "none", "z1", "z2", "pct", "pace", "hr"]} onChange={(d) => set({ rest: d })} /></div>
            <button type="button" onClick={() => set({ rest: null })} className="text-xs text-muted-foreground underline hover:text-foreground">{t("builder.noRest")}</button>
          </div>
        ) : (
          <button type="button" onClick={() => set({ rest: { min: 1, target: { kind: "jog" } } })} className="text-sm text-primary hover:underline">{t("builder.addRest")}</button>
        )}
      </div>
    </div>
  );
}

/* ---------- Session library: the runner's own templates ---------- */

export interface SessionTemplate { id: number; name: string; type: WorkoutType; stepsText: string }

/* ---------- The builder ---------- */

export interface SessionBuilderProps {
  /** Step text in the user's language and units; "" = no structure. */
  text: string;
  onText: (text: string) => void;
  /** The day the targets resolve on (today when left out). */
  date?: string;
  /** Called with a template's type when one is picked, so the session type follows. */
  onType?: (type: WorkoutType) => void;
  /** The session's type, for "Save as template". */
  type?: WorkoutType;
}

export function SessionBuilder({ text, onText, date, onType, type }: SessionBuilderProps) {
  const fmt = useFmt();
  const narrow = useNarrow();
  const parsed = useParsedSteps(text);
  const { data: refs } = useApi<StepRefs>(date ? `/workouts/step-refs?date=${date}` : "/workouts/step-refs");
  const lib = useApi<SessionTemplate[]>(`/templates?lang=${stepLang}`);
  const steps = parsed.steps;
  const [openRow, setOpenRow] = useState(0);
  const [asText, setAsText] = useState(parsed.errors.length > 0);
  const [saving, setSaving] = useState(false);
  const [mp, setMp] = useState(false);

  const write = (s: WorkoutSteps | null) => onText(stepsText(s, stepLang, fmt.units));
  const flat = useMemo(() => (steps ? flattenSteps(steps) : []), [steps]);
  const roleOf = (i: number) => flat.find((f) => f.item === i)?.role ?? "run";

  const pick = (id: TemplateId | "empty") => {
    setMp(id === "longMp");
    if (id === "empty") { onText(""); return; }
    const tpl = TEMPLATES.find((x) => x.id === id)!;
    write(tpl.steps);
    onType?.(tpl.type);
    setOpenRow(tpl.steps.items.findIndex((x) => x.kind === "repeat") >= 0 ? tpl.steps.items.findIndex((x) => x.kind === "repeat") : 0);
  };
  const add = (kind: NewItem) => {
    const next = addItem(steps, kind);
    write(next);
    setOpenRow(next.items.length - 1);
  };

  const totals = steps && refs ? stepTotals(steps, refs) : null;
  const segs = useMemo(() => (steps && refs ? profile(steps, refs) : []), [steps, refs]);
  const load = steps && refs ? stepsLoad(steps, refsThreshold(refs)) : null;
  const quality = qualityMin(segs);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <span className="text-xs font-medium text-muted-foreground">{t("builder.templates")}</span>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATES.map((tpl) => (
            <TemplateChip key={tpl.id} label={t(`builder.tpl.${tpl.id}` as MsgKey)} color={TYPE_COLOR[tpl.type]} onClick={() => pick(tpl.id)} />
          ))}
          {(lib.data ?? []).map((tpl) => (
            <TemplateChip key={`lib-${tpl.id}`} label={tpl.name} color={TYPE_COLOR[tpl.type]} mine
              onClick={() => { setMp(false); onText(tpl.stepsText); onType?.(tpl.type); setOpenRow(0); }}
              onRemove={() => void api(`/templates/${tpl.id}`, { method: "DELETE" }).then(() => lib.reload())} />
          ))}
          <TemplateChip label={t("builder.tpl.empty")} onClick={() => pick("empty")} />
        </div>
        {mp && <p className="text-xs text-muted-foreground">{t("builder.mpHint", { pct: MP_PCT })}</p>}
      </div>

      {segs.length > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-medium">{t("builder.profile")}</span>
            {totals && <span className="tabular-nums">0 → {minutesText(totals.min)}</span>}
          </div>
          <div className="rounded-md bg-muted p-1.5"><ProfileBars segs={segs} height={narrow ? 40 : 52} /></div>
        </div>
      )}

      <div data-tour="session-steps-preview" className="space-y-2">
        <span className="text-xs font-medium text-muted-foreground">{t("builder.steps")}</span>
        {!steps && !parsed.errors.length && <p className="rounded-md border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t("builder.empty")}</p>}
        {parsed.errors.length > 0 && (
          <ul role="alert" className="space-y-0.5 text-sm text-danger">{parsed.errors.map((e, i) => <li key={i}>{tm(e)}</li>)}</ul>
        )}
        {steps?.items.map((it, i) => {
          const common: RowProps = {
            item: it, index: i, count: steps.items.length, role: roleOf(i), refs, open: openRow === i, narrow,
            onChange: (x) => write(setItem(steps, i, x)), onOpen: () => setOpenRow(i),
            onMove: (d) => { write(moveItem(steps, i, d)); setOpenRow(i + d); },
            onDuplicate: () => { write(duplicateItem(steps, i)); setOpenRow(i + 1); },
            onRemove: () => write(removeItem(steps, i)),
          };
          return it.kind === "step" ? <StepRow key={i} {...common} item={it} /> : <RepeatRow key={i} {...common} item={it} />;
        })}
        <div className="flex flex-wrap gap-2">
          <AddButton onClick={() => add("step")}>{t("builder.addStep")}</AddButton>
          <AddButton onClick={() => add("repeat")}>{t("builder.addRepeat")}</AddButton>
          <AddButton onClick={() => add("strides")}>{t("builder.addStrides")}</AddButton>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 sm:grid-cols-4">
          <Total label={t("builder.distance")} value={fmt.dist(totals.km)} />
          <Total label={t("builder.time")} value={`≈ ${minutesText(totals.min)}`} />
          <Total label={t("builder.load")} value={load != null ? String(load) : "–"} />
          <Total label={t("builder.quality")} value={quality > 0 ? minutesText(quality) : "–"} title={t("builder.qualityInfo")} />
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2">
        <details open={asText} onToggle={(e) => setAsText((e.target as HTMLDetailsElement).open)} className="min-w-0 flex-1 text-sm">
          <summary className="cursor-pointer font-medium text-muted-foreground">{t("builder.asText")}</summary>
          <div className="mt-2 space-y-1">
            <Textarea rows={2} value={text} onChange={(e) => onText(e.target.value)} spellCheck={false} aria-label={t("steps.label")}
              aria-invalid={parsed.errors.length > 0} className={cn("font-mono text-xs", parsed.errors.length && "border-danger")}
              placeholder={stepLang === "sv" ? "2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt" : "2 km easy, 3x8 min @threshold / 2 min jog, 1.5 km easy"} />
            <p className="text-xs text-muted-foreground">{t("steps.help")}</p>
          </div>
        </details>
        {steps && <button type="button" onClick={() => setSaving(true)} className="text-sm text-primary hover:underline">{t("lib.save")}</button>}
      </div>
      {saving && steps && <SaveTemplate text={text} type={type ?? "easy"} onClose={() => setSaving(false)} onSaved={() => { setSaving(false); lib.reload(); }} />}
    </div>
  );
}

function TemplateChip({ label, color, onClick, mine, onRemove }: { label: string; color?: string; onClick: () => void; mine?: boolean; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-card">
      <button type="button" onClick={onClick} className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full pl-3 text-sm font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring", onRemove ? "pr-1.5" : "pr-3")}>
        {color && <span aria-hidden className="size-2 rounded-full" style={{ background: color }} />}
        {label}
        {mine && <span className="text-[11px] font-normal text-muted-foreground">· {t("lib.mine")}</span>}
      </button>
      {onRemove && (
        <button type="button" aria-label={t("lib.remove", { name: label })} onClick={onRemove}
          className="mr-0.5 inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted">×</button>
      )}
    </span>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      className="min-h-9 flex-1 whitespace-nowrap rounded-md border border-dashed border-border px-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring sm:flex-none">
      {children}
    </button>
  );
}

function Total({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div title={title}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function SaveTemplate({ text, type, onClose, onSaved }: { text: string; type: WorkoutType; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr(null);
    try { await api("/templates", { body: { name: name.trim(), type, stepsText: text, lang: stepLang } }); onSaved(); } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
      <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs font-medium text-muted-foreground">
        {t("lib.name")}
        <Input autoFocus value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) { e.preventDefault(); void save(); } }} />
      </label>
      <Button disabled={!name.trim() || busy} onClick={() => void save()}>{t("lib.save")}</Button>
      <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
      {err && <p className="w-full text-sm text-danger">{err}</p>}
    </div>
  );
}

/* ---------- A builder in its own dialog (block editor, week suggestion) ---------- */

export function BuilderDialog({ title, type, text, date, types, onClose, onDone, doneLabel }: {
  title: string; type: WorkoutType; text: string; date?: string; types: WorkoutType[];
  onClose: () => void; onDone: (type: WorkoutType, text: string) => void; doneLabel: string;
}) {
  const [kind, setKind] = useState<WorkoutType>(type);
  const [txt, setTxt] = useState(text);
  const parsed = useParsedSteps(txt);
  return (
    <Dialog open onClose={onClose} title={title} className="sm:max-w-2xl">
      <div className="space-y-4">
        <TypeChips value={kind} types={types} onChange={setKind} />
        <SessionBuilder text={txt} onText={setTxt} date={date} onType={(x) => types.includes(x) && setKind(x)} type={kind} />
        <div className="flex gap-2 border-t border-border pt-3">
          <Button disabled={parsed.errors.length > 0 || !parsed.steps} onClick={() => onDone(kind, txt)}>{doneLabel}</Button>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** The session type as chips with its colour dot (the mocks' "Typ" row). */
export function TypeChips({ value, types, onChange }: { value: WorkoutType; types: WorkoutType[]; onChange: (t: WorkoutType) => void }) {
  return (
    <div role="radiogroup" aria-label={t("session.type")} className="flex flex-wrap gap-1.5">
      {types.map((x) => (
        <button key={x} type="button" role="radio" aria-checked={value === x} onClick={() => onChange(x)}
          className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
            value === x ? "border-primary bg-accent text-accent-foreground" : "border-border bg-card hover:bg-accent")}>
          <span aria-hidden className="size-2 rounded-full" style={{ background: TYPE_COLOR[x] }} />
          {t(`workout.${x}` as MsgKey)}
        </button>
      ))}
    </div>
  );
}

/* ---------- Steps of a suggested session, edited beside the week ---------- */

/**
 * The builder for one day of a suggested week or block (the "Steps ›" link on a day): edits go
 * straight into the item, so the numbers and charts of the suggestion follow live.
 */
export function StepsPanel({ item, title, refs, onChange, onClose }: { item: SuggestItem; title: string; refs: StepRefs; onChange: (it: SuggestItem) => void; onClose: () => void }) {
  const fmt = useFmt();
  const [text, setText] = useState(() => stepsText(item.steps, stepLang, fmt.units));
  const set = (txt: string) => {
    setText(txt);
    const p = parseSteps(txt, fmt.units, stepLang);
    if (p.errors.length) return;
    onChange({ ...item, steps: p.steps, km: p.steps ? stepsKm(p.steps, refs) : item.km });
  };
  return (
    <section aria-label={title} className="space-y-3 rounded-lg border border-primary bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button variant="outline" className="h-8 px-3" onClick={onClose}>{t("builder.done")}</Button>
      </div>
      <SessionBuilder text={text} onText={set} date={item.date} type={item.type === "cross" ? "easy" : item.type} />
    </section>
  );
}

/* ---------- Block text parts ---------- */

/** A built session as one part of a block line (`9.8 tröskel (…)`, `8 lugnt + strides`). */
export function partFor(type: WorkoutType, text: string, refs: StepRefs, units: "metric" | "imperial"): string | null {
  const p = parseSteps(text, units, stepLang);
  if (p.errors.length || !p.steps) return null;
  const amount = plannedFromSteps(p.steps, refs);
  return sessionText({ type, zone2: false, steps: p.steps, ...amount }, units, stepLang);
}

/** What the builder opens with for a part of a block line: its type and its steps as text ("" when it has none). */
export function builderStart(part: string): { type: WorkoutType; text: string } | null {
  const w = parseWeekLine(part);
  const s = w.sessions[0];
  if (w.errors.length || w.sessions.length !== 1 || !s || s.type === "cross" || s.type === "rest" || s.type === "race") return null;
  // A plain run opens as one step of its amount, ready to build on.
  const plain = s.durationMin != null ? `${s.durationMin} min easy` : s.distance != null ? `${s.distance} easy` : "";
  return { type: s.type, text: s.stepsText ?? (s.type === "easy" || s.type === "long" ? plain : "") };
}
