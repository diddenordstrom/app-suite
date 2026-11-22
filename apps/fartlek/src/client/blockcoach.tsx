import { useEffect, useRef, useState, type ReactNode } from "react";
import { useApi } from "./http";
import { lang, locale, t, type MsgKey } from "./i18n";
import { useFmt } from "./prefs";
import { Button, Card, cn } from "./ui";
import { fmtDay } from "./bits";
import type { CoachData, CoachTip } from "./types";
import { addDays, weekNumber, type ISODate } from "@/shared/dates";
import { blockWord, type PlanItem, type WeekPreview } from "@/shared/blocktext";
import { COACH, lineParts, type CoachState, type TipId } from "@/shared/coach";
import { thresholdSteps } from "@/shared/nextweek";
import { FORM } from "@/shared/load";
import { STRIDES, stepTotals, stepsText, type StepRefs } from "@/shared/steps";
import { BuilderDialog, builderStart, partFor as builtPart } from "./sessionbuilder";
import type { WorkoutType } from "@/shared/types";

/*
 * The block editor's coach panel, other-sports habit, quick-add, list view and week calendar
 * (docs/decisions/fartlek-block-coach.md). Numbers and limits come from shared/coach.ts.
 */

const stepLang = lang === "sv" ? "sv" : "en";
export const wk = (weekStart: ISODate) => t("coach.wk", { n: weekNumber(weekStart) });
const weeksText = (ws: ISODate[]) => ws.map(wk).join(", ");
const one = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signedInt = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)}`;
export const signed = (v: number | null) => (v == null ? "–" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${one(Math.abs(v))}`);
const ratio = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function hm(min: number) {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
}

const TYPE_COLOR: Partial<Record<WorkoutType, string>> = {
  easy: "var(--chart-3)", long: "var(--chart-1)", threshold: "var(--chart-2)", intervals: "var(--chart-5)", race: "var(--chart-4)", cross: "var(--muted-foreground)",
};

/* ---------- Coach panel ---------- */

const STATE_STYLE: Record<CoachState, string> = {
  under: "bg-accent text-accent-foreground",
  ok: "bg-success/15 text-success",
  over: "bg-danger/15 text-danger",
  tired: "bg-warning/15 text-warning",
  flat: "bg-accent text-accent-foreground",
};

export function CoachPanel({ coach, baseValue, onApply, undo, onUndo }: {
  coach: CoachData; baseValue: number | null; onApply: (tip: CoachTip) => void; undo: TipId | null; onUndo: () => void;
}) {
  const race = coach.mode === "race";
  const stateText = t(coach.state === "ok" && race ? "coach.st.okRace" : `coach.st.${coach.state}`);
  const explain = coach.value == null ? t("coach.explain.none")
    : race ? t("coach.explain.race", { day: fmtDay(coach.at!, { weekday: "short", day: "numeric", month: "short" }), low: COACH.race.low, high: COACH.race.high })
    : coach.risk ? t("coach.explain.risk", { week: wk(coach.risk.weekStart), acwr: ratio(coach.risk.acwr), risk: ratio(COACH.rampRisk), at: wk(coach.at!), value: signed(coach.value) })
    : t("coach.explain.base", { week: wk(coach.at!), goal: signedInt(COACH.goal), heavy: signedInt(FORM.heavy) });
  const inBand = coach.state === "ok" && coach.value != null;
  const firstOpen = inBand ? null : coach.tips[0]?.id ?? null;
  return (
    <div className="space-y-3">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{t("coach.title")}</h3>
          <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-accent-foreground">
            {race ? t("coach.mode.race", { name: coach.race!.name, day: fmtDay(coach.race!.date, { day: "numeric", month: "short" }) }) : t("coach.mode.base")}
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-4xl font-semibold tabular-nums">{signed(coach.value)}</span>
          {coach.value != null && <span className={cn("rounded-full px-2.5 py-0.5 text-sm font-semibold", STATE_STYLE[coach.state])}>{stateText}</span>}
          {baseValue != null && baseValue !== coach.value && <span className="text-sm tabular-nums text-muted-foreground">{t("coach.from", { value: signed(baseValue) })}</span>}
        </div>
        <p className="text-sm text-muted-foreground">{explain}</p>
        <FormChart coach={coach} />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {coach.weeks.map((w) => {
            const hot = w.acwr != null && w.acwr > COACH.rampRisk, warm = w.acwr != null && w.acwr > COACH.rampCap;
            return (
              <div key={w.weekStart} className={cn("space-y-0.5 rounded-md border border-border bg-background px-2.5 py-2 text-xs tabular-nums", w.locked && "opacity-70")}>
                <div className="flex justify-between gap-1"><strong className="text-sm">{wk(w.weekStart)}</strong><span className="text-muted-foreground">{w.backoff ? t("coach.backoff") : ""}</span></div>
                <div>{one(w.km)} km {w.growth != null && <span className="text-muted-foreground">{w.growth >= 0 ? "+" : "−"}{Math.abs(Math.round(w.growth * 100))} %</span>}</div>
                {w.acwr != null && (
                  <span className={cn("inline-block rounded-full px-1.5 font-medium", hot ? "bg-danger/15 text-danger" : warm ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
                    {t("coach.ramp", { acwr: ratio(w.acwr) })}
                  </span>
                )}
                <div className="text-muted-foreground">{t("coach.form", { value: signed(w.low) })}</div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="space-y-2.5">
        <h3 className="text-sm font-semibold">{inBand && !coach.tips.length ? t("coach.allGood") : t("coach.tips")}</h3>
        {undo && (
          <p className="flex flex-wrap items-center gap-2 text-sm text-success">
            {t("coach.applied", { name: tipTitle(undo, {}) })}
            <Button variant="ghost" className="h-8 px-2 text-sm" onClick={onUndo}>{t("coach.undo")}</Button>
          </p>
        )}
        {inBand && <p className="text-sm text-success">{t(race ? "coach.inBandRace" : "coach.inBand")}</p>}
        {coach.state === "flat" && <p className="text-sm text-muted-foreground">{t("coach.flatHint")}</p>}
        {coach.tips.map((tip, i) => (
          <div key={tip.id} className={cn("grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-start gap-2.5 rounded-md border p-3", tip.id === firstOpen ? "border-signature" : "border-border", inBand && "opacity-75")}>
            <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
            <div className="min-w-0 space-y-0.5">
              <div className="text-sm font-semibold">
                {tipTitle(tip.id, tip.params)}
                {tip.id === firstOpen && <span className="ml-1.5 rounded-full bg-signature-soft px-1.5 py-px text-xs font-medium text-signature-foreground">{t("coach.startHere")}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{t(`coach.tip.${tip.id}D`, { weeks: weeksText(tip.weeks), ...tip.params })}</div>
              <div className="text-xs tabular-nums">{t("coach.effect", { from: signed(tip.before), to: signed(tip.after) })}</div>
            </div>
            <Button className="h-9 px-3 text-sm" onClick={() => onApply(tip)}>{t("coach.apply")}</Button>
          </div>
        ))}
        <p className="text-xs text-muted-foreground">
          {coach.state === "over" ? t("coach.rules.over", { risk: ratio(COACH.rampRisk), floor: signedInt(COACH.floor) })
            : race ? t("coach.rules.race")
            : t("coach.rules.under", { pct: Math.round((COACH.weekGrowth - 1) * 100), cap: ratio(COACH.rampCap) })}
        </p>
      </Card>
    </div>
  );
}

const tipTitle = (id: TipId, params: Record<string, number | string>) => t(`coach.tip.${id}`, {
  pct: id === "raceCut" ? Math.round((1 - COACH.taper.weekBefore) * 100) : Math.round((COACH.weekGrowth - 1) * 100), min: COACH.cross.tipMin, ...params,
});

/** Daily form from two weeks before the block, the goal band shaded, done and planned in two colours. */
function FormChart({ coach }: { coach: CoachData }) {
  const pts = coach.series;
  if (pts.length < 2) return null;
  const W = 600, H = 170, yMin = -35, yMax = 20;
  const band: [number, number] = coach.mode === "race" ? [COACH.race.low, COACH.race.high] : [FORM.heavy, COACH.goal];
  const X = (i: number) => (i / (pts.length - 1)) * W;
  const Y = (v: number) => ((yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin)) * H;
  const path = (from: number, to: number) => pts.slice(from, to).map((p, k) => `${k ? "L" : "M"}${X(from + k).toFixed(1)} ${Y(p.formPct).toFixed(1)}`).join(" ");
  const split = Math.max(0, pts.findIndex((p) => p.projected));
  const todayAt = pts.findIndex((p) => p.projected);
  const mondays = pts.map((p, i) => ({ i, d: p.date })).filter((x) => x.i > 0 && x.d === weekStartOf(x.d, pts[0].date));
  const raceIdx = coach.mode === "race" ? pts.findIndex((p) => p.date === coach.at) : -1;
  return (
    <figure className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("coach.chart")} className="block h-auto w-full">
        <rect x={0} y={Y(band[1])} width={W} height={Y(band[0]) - Y(band[1])} fill="var(--success)" fillOpacity={0.12} />
        <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--border)" />
        {mondays.map((m) => <line key={m.i} x1={X(m.i)} x2={X(m.i)} y1={0} y2={H} stroke="var(--border)" strokeDasharray="2 3" />)}
        {todayAt > 0 && <line x1={X(todayAt - 0.5)} x2={X(todayAt - 0.5)} y1={0} y2={H} stroke="var(--muted-foreground)" />}
        {todayAt > 0 && <text x={X(todayAt - 0.5) + 4} y={12} fontSize={11} fill="var(--muted-foreground)">{t("coach.today")}</text>}
        {split > 0 && <path d={path(0, split + 1)} stroke="var(--chart-1)" strokeWidth={2} fill="none" />}
        <path d={path(split, pts.length)} stroke="var(--signature)" strokeWidth={2.5} fill="none" />
        {raceIdx >= 0 && <circle cx={X(raceIdx)} cy={Y(pts[raceIdx].formPct)} r={5} fill="var(--signature)" stroke="var(--card)" strokeWidth={2} />}
        <text x={4} y={Y(band[1]) + 13} fontSize={11} fill="var(--success)">{`${signedInt(band[1])} … ${signedInt(band[0])} %`}</text>
      </svg>
      <div className="relative h-4 text-xs text-muted-foreground" aria-hidden>
        {[{ i: 0, d: pts[0].date }, ...mondays].map((m) => (
          <span key={m.i} className="absolute -translate-x-0" style={{ left: `${(X(m.i) / W) * 100}%` }}>{wk(m.d)}</span>
        ))}
      </div>
      <figcaption className="flex flex-wrap gap-3.5 text-xs text-muted-foreground">
        <span><span aria-hidden className="mr-1 inline-block h-0.5 w-3.5 bg-chart-1 align-middle" />{t("coach.done")}</span>
        <span><span aria-hidden className="mr-1 inline-block h-[3px] w-3.5 bg-signature align-middle" />{t("coach.planned")}</span>
        <span><span aria-hidden className="mr-1 inline-block size-2.5 bg-success/20 align-middle" />{t("coach.goal")}</span>
      </figcaption>
    </figure>
  );
}

/** Week start of `d`, with weeks aligned to `anchor` (the chart starts on a week start). */
function weekStartOf(d: ISODate, anchor: ISODate): ISODate {
  const days = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${anchor}T00:00:00Z`)) / 864e5);
  return addDays(anchor, Math.floor(days / 7) * 7);
}

/* ---------- Other sports a week ---------- */

export function CrossHabit({ coach, onChange }: { coach: CoachData; onChange: (min: number | null) => void }) {
  const v = coach.crossMin, habit = coach.habitMin;
  const set = (m: number) => onChange(Math.max(0, Math.min(1500, m)));
  return (
    <section className="space-y-2 rounded-lg border border-border bg-card px-4 py-3" aria-labelledby="cross-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="cross-h" className="text-sm font-semibold">{t("cross.title")}</h3>
          <p className="text-xs text-muted-foreground">{t("cross.sub")}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" className="size-9 p-0 text-base" aria-label={t("cross.less")} onClick={() => set(v - 15)}>−</Button>
          <output aria-live="polite" className="min-w-24 text-center text-base font-semibold tabular-nums">{hm(v)}</output>
          <Button variant="outline" className="size-9 p-0 text-base" aria-label={t("cross.more")} onClick={() => set(v + 15)}>+</Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("cross.history", { weeks: COACH.cross.historyWeeks, time: hm(habit) })}{" "}
        {coach.crossSet && v !== habit && <button type="button" className="font-semibold text-primary underline" onClick={() => onChange(null)}>{t("cross.reset")}</button>}
      </p>
      {habit > 0 && v < habit * 0.6 && <p role="status" className="rounded bg-warning/15 px-2 py-1.5 text-xs text-warning">{t("cross.low")}</p>}
    </section>
  );
}

/* ---------- Quick-add ---------- */

type QuickKind = "easy" | "strides" | "threshold" | "long" | "cross";
const QUICK: { kind: QuickKind; label: MsgKey; color: string }[] = [
  { kind: "easy", label: "quick.easy", color: TYPE_COLOR.easy! },
  { kind: "strides", label: "quick.strides", color: TYPE_COLOR.easy! },
  { kind: "threshold", label: "quick.threshold", color: TYPE_COLOR.threshold! },
  { kind: "long", label: "quick.long", color: TYPE_COLOR.long! },
  { kind: "cross", label: "quick.cross", color: TYPE_COLOR.cross! },
];
const DEFAULTS = { easy: 5, strides: 7, stridesReps: STRIDES.reps, long: 12, reps: 3, repMin: 8, cross: 45 };

export function QuickAdd({ weekLabel, onAdd }: { weekLabel: string; onAdd: (part: string) => void }) {
  const fmt = useFmt();
  const refs = useApi<StepRefs>("/workouts/step-refs").data;
  const [open, setOpen] = useState<QuickKind | null>(null);
  const [building, setBuilding] = useState(false);
  const [v, setV] = useState({ ...DEFAULTS });
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(null); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const partFor = (k: QuickKind) => {
    if (k === "easy") return `${v.easy} ${blockWord("easy", stepLang)}`;
    if (k === "strides") return `${v.strides} ${blockWord("easy", stepLang)} + ${v.stridesReps === STRIDES.reps ? "" : `${v.stridesReps} `}strides`;
    if (k === "long") return `${v.long} ${blockWord("longZone2", stepLang)}`;
    if (k === "cross") return `${v.cross}min ${blockWord("cross", stepLang)}`;
    return `${blockWord("threshold", stepLang)} (${stepsText(thresholdSteps(v.reps, v.repMin), stepLang, fmt.units)})`;
  };
  const valid = (k: QuickKind) => (k === "threshold" ? v.reps > 0 && v.repMin > 0
    : k === "strides" ? v.strides > 0 && v.stridesReps >= STRIDES.minReps && v.stridesReps <= STRIDES.maxReps
    : (k === "cross" ? v.cross : v[k]) > 0);
  const add = (k: QuickKind) => { if (!valid(k)) return; onAdd(partFor(k)); setOpen(null); };
  const keys = (k: QuickKind) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); add(k); } else if (e.key === "Escape") setOpen(null);
  };
  const num = (key: keyof typeof DEFAULTS, k: QuickKind, label: string, step = 1, autoFocus = false) => (
    <input type="number" inputMode="decimal" min={0} step={step} value={v[key]} aria-label={label} autoFocus={autoFocus}
      onChange={(e) => setV({ ...v, [key]: Number(e.target.value) || 0 })} onKeyDown={keys(k)}
      className="h-9 w-16 rounded-md border border-border bg-background px-2 text-sm tabular-nums" />
  );
  const thrKm = refs ? stepTotals(thresholdSteps(v.reps, v.repMin), refs).km : null;

  return (
    <div ref={root} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">{t("quick.addTo", { week: weekLabel })}</span>
      {QUICK.map((q) => (
        <span key={q.kind} className="relative inline-flex">
          <button type="button" aria-haspopup="dialog" aria-expanded={open === q.kind} onClick={() => setOpen(open === q.kind ? null : q.kind)}
            className={cn("inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 text-sm font-medium", open === q.kind ? "border-primary bg-accent" : "border-border bg-card")}>
            <span aria-hidden className="size-2 rounded-full" style={{ background: q.color }} />+ {t(q.label)}
          </button>
          {open === q.kind && (
            <div role="dialog" aria-label={t(q.label)} className="absolute left-0 top-[calc(100%+6px)] z-20 w-72 space-y-2.5 rounded-lg border border-border bg-card p-3 text-sm shadow-lg">
              <div className="text-xs font-semibold text-muted-foreground">{t(q.label)} · {weekLabel}</div>
              <div className="flex flex-wrap items-center gap-2">
                {q.kind === "easy" && <>{num("easy", "easy", t("quick.dist", { unit: fmt.unit }), 0.5, true)}<span>{t("quick.dist", { unit: fmt.unit })}</span></>}
                {q.kind === "strides" && <>{num("strides", "strides", t("quick.dist", { unit: fmt.unit }), 0.5, true)}<span>{t("quick.dist", { unit: fmt.unit })} +</span>{num("stridesReps", "strides", t("quick.stridesReps"))}<span>{t("quick.stridesReps")}</span></>}
                {q.kind === "long" && <>{num("long", "long", t("quick.distLong", { unit: fmt.unit }), 0.5, true)}<span>{t("quick.distLong", { unit: fmt.unit })}</span></>}
                {q.kind === "threshold" && <>{num("reps", "threshold", t("quick.reps"), 1, true)}<span>×</span>{num("repMin", "threshold", t("quick.repMin"))}<span>{t("quick.minThr")}</span></>}
                {q.kind === "cross" && <>{num("cross", "cross", t("quick.minCross"), 5, true)}<span>{t("quick.minCross")}</span></>}
              </div>
              {q.kind === "threshold" && thrKm != null && <p className="text-xs tabular-nums text-muted-foreground">{t("quick.thrHint", { dist: fmt.dist(thrKm) })}</p>}
              {q.kind === "cross" && <p className="text-xs text-muted-foreground">{t("quick.crossHint")}</p>}
              <div className="flex justify-end gap-1.5">
                <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => setOpen(null)}>{t("common.cancel")}</Button>
                <Button className="h-9 px-3 text-sm" disabled={!valid(q.kind)} onClick={() => add(q.kind)}>{t("quick.add")}</Button>
              </div>
            </div>
          )}
        </span>
      ))}
      <button type="button" onClick={() => { setOpen(null); setBuilding(true); }}
        className="inline-flex min-h-8 items-center rounded-full border border-primary bg-card px-2.5 text-sm font-medium text-primary hover:bg-accent">
        + {t("quick.build")}
      </button>
      {building && refs && (
        <BuilderDialog title={t("builder.newSession")} type="threshold" text="" types={BUILD_TYPES} doneLabel={t("builder.addToWeek", { week: weekLabel })}
          onClose={() => setBuilding(false)}
          onDone={(type, txt) => { const part = builtPart(type, txt, refs, fmt.units); if (part) onAdd(part); setBuilding(false); }} />
      )}
    </div>
  );
}

/* ---------- List view ---------- */

/** Types the builder can make for a block (cross, rest and races have no steps). */
const BUILD_TYPES: WorkoutType[] = ["easy", "threshold", "intervals", "long"];

export function ListEditor({ lines, start, sel, onSel, onRemove, onEdit }: {
  lines: string[]; start: ISODate; sel: number; onSel: (i: number) => void; onRemove: (i: number, k: number) => void;
  /** Replace the `k`-th session of week `i` with one built in the session builder. */
  onEdit?: (i: number, k: number, part: string) => void;
}) {
  const fmt = useFmt();
  const refs = useApi<StepRefs>("/workouts/step-refs").data;
  const [editing, setEditing] = useState<{ i: number; k: number; part: string } | null>(null);
  const start0 = editing ? builderStart(editing.part) : null;
  return (
    <div className="space-y-2">
      {lines.map((line, i) => {
        const ws = addDays(start, i * 7), locked = line.trim().startsWith("✓");
        const parts = lineParts(line);
        return (
          <div key={i} className={cn("space-y-2 rounded-md border bg-card px-3 py-2.5", i === sel ? "border-primary" : "border-border", locked && "opacity-70")}>
            <div className="flex items-center justify-between gap-2">
              <button type="button" disabled={locked} aria-pressed={i === sel} aria-label={t("edit.pick", { week: wk(ws) })} onClick={() => onSel(i)} className="text-sm font-semibold">
                {locked ? "✓ " : ""}{wk(ws)}
              </button>
              <span className="text-xs text-muted-foreground">{fmtDay(ws, { day: "numeric", month: "short" })}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {parts.map((p, k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border bg-background py-0.5 pl-2.5 pr-1 text-sm">
                  {onEdit && !locked && builderStart(p) ? (
                    <button type="button" onClick={() => setEditing({ i, k, part: p })} aria-label={t("builder.editPart", { name: p })} className="hover:underline">{p}</button>
                  ) : p}
                  {!locked && <button type="button" aria-label={t("edit.remove", { name: p })} onClick={() => onRemove(i, k)} className="size-7 rounded-full text-muted-foreground hover:bg-muted">×</button>}
                </span>
              ))}
              {!parts.length && <span className="text-sm text-muted-foreground">–</span>}
            </div>
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("edit.listHint")}</p>
      {editing && start0 && refs && onEdit && (
        <BuilderDialog title={t("builder.editPart", { name: editing.part })} type={start0.type} text={start0.text} types={BUILD_TYPES} doneLabel={t("builder.update")}
          onClose={() => setEditing(null)}
          onDone={(type, txt) => { const part = builtPart(type, txt, refs, fmt.units); if (part) onEdit(editing.i, editing.k, part); setEditing(null); }} />
      )}
    </div>
  );
}

/* ---------- Week calendar ---------- */

const short = (it: PlanItem, distNum: (km: number) => number) => {
  if (it.type === "cross" || it.type === "rest") return it.durationMin != null ? `${Math.round(it.durationMin)}′` : "";
  return one(distNum(it.km));
};

export function WeekCalendar({ weeks, crossMin }: { weeks: WeekPreview[]; crossMin: number | null }) {
  const fmt = useFmt();
  const shown = weeks.filter((w) => w.state !== "removed");
  if (!shown.length) return null;
  const total = shown.reduce((a, w) => a + w.afterKm, 0);
  const runs = shown.reduce((a, w) => a + w.plan.filter((p) => p.type !== "cross" && p.type !== "rest").length, 0);
  const dayNames = Array.from({ length: 7 }, (_, i) => fmtDay(addDays(shown[0].weekStart, i), { weekday: "short" }));
  return (
    <section className="space-y-1.5" aria-labelledby="cal-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="cal-h" className="text-sm font-semibold">{t("cal.title")}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{t("cal.summary", { weeks: shown.length, dist: fmt.dist(total), runs })}</span>
      </div>
      <div aria-hidden className="grid grid-cols-7 gap-1 px-2.5 text-center text-xs text-muted-foreground">{dayNames.map((d, i) => <span key={i}>{d}</span>)}</div>
      {shown.map((w) => {
        const changed = new Set(w.changes.filter((c) => c.op === "create" || c.op === "update").map((c) => c.date));
        const dropped = new Set(w.changes.filter((c) => c.op === "delete").map((c) => c.date));
        const touched = w.state === "changed" || w.state === "added";
        return (
          <div key={w.weekStart} className={cn("space-y-1.5 rounded-md border bg-card p-2", touched ? "border-signature" : "border-border", w.state === "locked" && "opacity-75")}>
            <div className="flex justify-between gap-2 text-xs">
              <span>
                <strong className="text-sm">{wk(w.weekStart)}</strong> · <span className="tabular-nums">{w.state === "changed" && w.beforeKm !== w.afterKm ? `${fmt.num(w.beforeKm)} → ${fmt.dist(w.afterKm)}` : fmt.dist(w.afterKm)}</span>
                {crossMin ? <span className="text-muted-foreground"> {t("cal.other", { time: hm(crossMin) })}</span> : null}
              </span>
              <span className={cn("font-medium", touched ? "text-signature-foreground" : "text-muted-foreground")}>
                {w.backoff ? `${t("plan.backoff")} · ` : ""}{t(`block.st.${w.state}`)}
              </span>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 7 }, (_, d) => {
                const date = addDays(w.weekStart, d);
                const items = w.plan.filter((p) => p.date === date);
                const it = items[0];
                const mark = changed.has(date) ? "outline outline-2 -outline-offset-2 outline-signature" : dropped.has(date) && !it ? "outline-dashed outline-2 -outline-offset-2 outline-signature" : "";
                return (
                  <Day key={d} className={mark} color={it ? TYPE_COLOR[it.type] : undefined}>
                    {it ? (
                      <>
                        <span className="text-xs font-semibold tabular-nums">{short(it, fmt.distNum)}{items.length > 1 ? ` +${items.length - 1}` : ""}</span>
                        <span className="text-[10px] leading-tight text-muted-foreground">{dayWord(it)}</span>
                      </>
                    ) : dropped.has(date) ? <span className="text-[10px] text-muted-foreground">{t("cal.dropped")}</span> : null}
                  </Day>
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {(["easy", "long", "threshold"] as const).map((k) => (
          <span key={k}><span aria-hidden className="mr-1 inline-block size-2 rounded-full align-middle" style={{ background: TYPE_COLOR[k] }} />{t(`workout.${k}`)}</span>
        ))}
        <span><span aria-hidden className="mr-1 inline-block size-2.5 rounded-sm outline outline-2 -outline-offset-2 outline-signature align-middle" />{t("cal.changed")}</span>
      </div>
    </section>
  );
}

function Day({ color, className, children }: { color?: string; className?: string; children: ReactNode }) {
  return (
    <div className={cn("flex min-h-11 flex-col gap-px overflow-hidden rounded px-1.5 py-1", className)}
      style={color ? { background: `color-mix(in srgb, ${color} 16%, transparent)` } : undefined}>
      {children}
    </div>
  );
}

function dayWord(it: PlanItem): string {
  if (it.steps) {
    const rep = it.steps.items.find((x) => x.kind === "repeat");
    if (rep && rep.kind === "repeat" && rep.work.min != null) return `${t(`workout.${it.type}`)} ${rep.times}×${Math.round(rep.work.min)}`;
  }
  return it.type === "long" && it.zone2 ? t("workout.longEasy") : t(`workout.${it.type}`);
}

