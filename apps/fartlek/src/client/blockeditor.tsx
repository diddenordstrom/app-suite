import { useMemo, useState, type ReactNode } from "react";
import { t, WEEKDAY_LONG, WEEKDAY_SHORT } from "./i18n";
import { useFmt } from "./prefs";
import { Badge, Button, Select, cn } from "./ui";
import { TYPE_COLOR } from "./bits";
import { StepsPanel } from "./sessionbuilder";
import { DayCell, editStep, editType, newEasy, signed, signedInt, SpikeInfo, useDayDrag, Warnings } from "./suggestweek";
import { addDays, daysBetween, weekNumber, weekday, type ISODate } from "@/shared/dates";
import { BLOCK, type BlockEval, type BlockSeed, type PlannedWeek, type WeekRole } from "@/shared/blockplan";
import { withStrides } from "@/shared/steps";
import type { SuggestItem, SuggestType } from "@/shared/nextweek";

/*
 * The block editor shared by "Skapa block" and "Räkna om resten": the weeks as columns with the days as rows
 * on wider screens (the same weekday lines up, so the block reads left to right like the volume chart), one week
 * at a time on phones. The numbers beside it are the caller's; this file only edits the weeks.
 */

const half = (n: number) => Math.round(n * 2) / 2;
/** A lighter week keeps this share of the build week's run km when a week's type is switched by hand. */
const LIGHTER_SHARE = 0.7;
/** A week added by hand copies the build week before it, this much bigger. */
const ADDED_GROWTH = 1.08;

const shiftItem = (x: SuggestItem, days: number): SuggestItem => ({ ...x, date: addDays(x.date, days) });
const scaleRun = (x: SuggestItem, f: number): SuggestItem =>
  x.type === "cross" || x.type === "threshold" ? x : { ...x, km: Math.max(1, half(x.km * f)), steps: x.steps && f !== 1 ? null : x.steps };

/** The block's weeks as the runner edits them: sessions per week and each week's role (build, lighter, taper, race). */
export function useBlockWeeks(seed: BlockSeed, start: SuggestItem[][], startRoles: WeekRole[]) {
  const [state, setState] = useState({ weeks: start, roles: startRoles });
  const { weeks, roles } = state;
  const lighter = useMemo(() => roles.map((r) => r !== "build"), [roles]);
  const n = weeks.length;
  const idx = (d: ISODate) => Math.floor(daysBetween(seed.startWeek, d) / 7);
  const all = weeks.flat();
  const setAll = (items: SuggestItem[]) => setState((s) => ({ ...s, weeks: Array.from({ length: s.weeks.length }, (_, i) =>
    items.filter((x) => idx(x.date) === i).sort((a, b) => a.date.localeCompare(b.date))) }));
  const update = (date: ISODate, fn: (it: SuggestItem) => SuggestItem | null) =>
    setAll(all.flatMap((x) => { if (x.date !== date) return [x]; const y = fn(x); return y ? [y] : []; }));
  // The seed the edited weeks are evaluated against: as many weeks as there are now, each with its role as set.
  const edited = useMemo(() => ({ ...seed, weeks: n, roles }), [seed, n, roles]);
  return {
    weeks, roles, lighter, n, seed: edited,
    changed: JSON.stringify(state) !== JSON.stringify({ weeks: start, roles: startRoles }),
    reset: () => setState({ weeks: start, roles: startRoles }),
    /** Put other weeks in (the engine's re-plan), keeping which weeks are lighter. */
    load: (w: SuggestItem[][]) => setState((s) => ({ ...s, weeks: w })),
    setType: (date: ISODate, type: SuggestType) => update(date, (x) => editType(x, type, seed.refs)),
    step: (date: ISODate, f: (x: SuggestItem) => SuggestItem) => update(date, f),
    remove: (date: ISODate) => update(date, () => null),
    set: (date: ISODate, it: SuggestItem) => update(date, () => it),
    add: (date: ISODate, it?: SuggestItem) => setAll([...all, it ?? newEasy(date)]),
    swap: (a: ISODate, b: ISODate) => setAll(all.map((x) => (x.date === a ? { ...x, date: b } : x.date === b ? { ...x, date: a } : x))),
    /** A build week before the closing lighter week (or last): the build week before it, a little bigger, or empty. */
    addWeek: (fill: boolean) => setState((s) => {
      const len = s.weeks.length;
      if (len >= BLOCK.maxEditWeeks) return s;
      const at = len > 1 && s.roles[len - 1] !== "build" ? len - 1 : len;
      let prev = -1;
      for (let i = at - 1; i >= 0; i--) if (s.roles[i] === "build") { prev = i; break; }
      const copy = fill && prev >= 0 ? s.weeks[prev].map((x) => shiftItem(scaleRun(x, ADDED_GROWTH), (at - prev) * 7)) : [];
      const moved = s.weeks.map((w, i) => (i >= at ? w.map((x) => shiftItem(x, 7)) : w));
      return { weeks: [...moved.slice(0, at), copy, ...moved.slice(at)], roles: [...s.roles.slice(0, at), "build" as WeekRole, ...s.roles.slice(at)] };
    }),
    removeWeek: (i: number) => setState((s) => {
      if (s.weeks.length <= BLOCK.minWeeks) return s;
      const weeks = s.weeks.filter((_, k) => k !== i).map((w, k) => (k >= i ? w.map((x) => shiftItem(x, -7)) : w));
      return { weeks, roles: s.roles.filter((_, k) => k !== i) };
    }),
    /** Switch a week between build, lighter and taper: going from build to an easier role scales its runs to the lighter share, and back. */
    setRole: (i: number, role: WeekRole) => setState((s) => {
      const was = s.roles[i];
      if (was === role || was === "race" || role === "race") return s;
      const f = was === "build" ? LIGHTER_SHARE : role === "build" ? 1 / LIGHTER_SHARE : 1;
      return { weeks: s.weeks.map((w, k) => (k === i ? w.map((x) => scaleRun(x, f)) : w)), roles: s.roles.map((v, k) => (k === i ? role : v)) };
    }),
  };
}
export type BlockWeeks = ReturnType<typeof useBlockWeeks>;

const ROLE_LABEL = { build: "be.build", lighter: "blk.b.lighter", taper: "be.taper", race: "be.raceWeek" } as const;

type Quick = "easy" | "strides" | "threshold" | "long" | "cross";
const QUICK: { kind: Quick; color: string }[] = [
  { kind: "easy", color: TYPE_COLOR.easy }, { kind: "strides", color: TYPE_COLOR.easy }, { kind: "threshold", color: TYPE_COLOR.threshold },
  { kind: "long", color: TYPE_COLOR.long }, { kind: "cross", color: TYPE_COLOR.cross },
];
/** Days to try, as offsets from the week's start: easy runs midweek first, threshold on the 4th or 2nd day, cross away from the long run. */
const ORDER: Record<Exclude<Quick, "long">, number[]> = { easy: [1, 2, 4, 3, 5, 0, 6], strides: [1, 2, 4, 3, 5, 0, 6], threshold: [3, 1, 2, 4], cross: [0, 2, 4, 5] };

/** The pills that put a session on the first free day that suits it in the chosen week. */
function QuickPills({ b, editable, longRunDay, longKm, onFull, isLocked }: { b: BlockWeeks; editable: number[]; longRunDay: number; longKm: number; onFull: (week: number) => void; isLocked: (d: ISODate) => boolean }) {
  const [target, setTarget] = useState(editable[0] ?? 0);
  const week = editable.includes(target) ? target : editable[0];
  if (week == null) return null;
  const ws = addDays(b.seed.startWeek, week * 7);
  const add = (kind: Quick) => {
    const taken = new Set(b.weeks[week].map((x) => x.date));
    const longOff = (longRunDay - weekday(ws) + 7) % 7;
    const order = kind === "long" ? [longOff, (longOff + 6) % 7, (longOff + 1) % 7] : ORDER[kind];
    const date = order.map((o) => addDays(ws, o)).find((d) => !taken.has(d) && !isLocked(d));
    if (!date) { onFull(week); return; }
    const easy = newEasy(date);
    const it: SuggestItem = kind === "easy" ? easy
      : kind === "strides" ? { ...easy, steps: withStrides({ km: easy.km }) }
      : kind === "long" ? { ...editType(easy, "long", b.seed.refs), km: Math.max(easy.km, half(longKm)) }
      : editType(easy, kind, b.seed.refs);
    b.add(date, it);
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-2 text-sm text-muted-foreground">
        {t("be.addTo")}
        <Select className="h-8 w-auto py-0" value={String(week)} onChange={(e) => setTarget(Number(e.target.value))}>
          {editable.map((i) => <option key={i} value={i}>{t("plan.weekShort", { week: weekNumber(addDays(b.seed.startWeek, i * 7)) })}</option>)}
        </Select>
      </label>
      {QUICK.map((q) => (
        <button key={q.kind} type="button" onClick={() => add(q.kind)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm hover:bg-accent">
          <span aria-hidden className="size-2 rounded-full" style={{ background: q.color }} />+ {t(`be.quick.${q.kind}` as "be.quick.easy")}
        </button>
      ))}
    </div>
  );
}

/** One week's heading: km, growth and form, its badges, its type and the long run against its cap. */
function WeekHead({ b, i, ev, plan, deepest, editable, onRemove, compact, label }: {
  b: BlockWeeks; i: number; ev: BlockEval; plan: PlannedWeek | undefined; deepest: boolean; editable: boolean; onRemove?: () => void; compact?: boolean;
  /** The block this week starts, when the weeks hold more than one (a race plan). */
  label?: string;
}) {
  const fmt = useFmt();
  const ws = addDays(b.seed.startWeek, i * 7);
  const e = ev.weeks[i];
  if (!e) return null;
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border border-card-edge bg-card shadow-card p-2.5", compact && "border-0 bg-transparent p-0")}>
      {label && <span className="text-[11px] font-semibold uppercase tracking-wide text-signature-foreground">{label}</span>}
      <div className="flex items-start justify-between gap-2">
        <h4 className={cn("font-semibold tabular-nums", compact ? "text-lg" : "text-sm")}>{t("blk.week", { week: weekNumber(ws), dist: fmt.dist(e.km) })}</h4>
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label={t("be.removeWeek", { week: weekNumber(ws) })}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        )}
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{t("blk.weekSub", { pct: e.growth == null ? "–" : `${signedInt(e.growth * 100)} %`, form: signed(e.low), end: signed(e.form) })}</span>
      <div className="flex flex-wrap items-center gap-1">
        {editable && b.roles[i] !== "race" ? (
          <select value={b.roles[i]} onChange={(x) => b.setRole(i, x.target.value as WeekRole)} aria-label={t("be.weekType", { week: weekNumber(ws) })}
            className="h-7 cursor-pointer rounded-full border border-border bg-muted px-2 text-xs text-foreground">
            <option value="build">{t("be.build")}</option>
            <option value="lighter">{t("blk.b.lighter")}</option>
            {(b.seed.race || b.roles.includes("taper")) && <option value="taper">{t("be.taper")}</option>}
          </select>
        ) : b.roles[i] !== "build" && <Badge className={b.roles[i] === "race" ? "bg-signature-soft text-signature-foreground" : undefined}>{t(ROLE_LABEL[b.roles[i]])}</Badge>}
        {deepest && <Badge className="bg-signature-soft text-signature-foreground">{t("blk.b.deepest")}</Badge>}
        {plan?.reentry && b.roles[i] === "build" && <Badge>{t("blk.b.reentry")}</Badge>}
      </div>
      {e.longKm > 0 && (
        <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
          {t("next.stat.long")} {fmt.dist(e.longKm)}{e.spikeMax != null && ` · ${t("next.stat.longSub", { max: fmt.dist(e.spikeMax) })}`}
          <SpikeInfo longestKm={e.longestKm} />
        </span>
      )}
    </div>
  );
}

/**
 * The weeks to edit. `canResize`: weeks can be added and removed (not in a running block, whose length the block
 * settings own); `canRetype`: a week can switch between build and lighter; `fillAdded`: an added week copies the build
 * week before it (a suggested block) or starts empty (one built by hand). Days before `lockedBefore` are over: shown
 * with what was run (`doneKm`), never edited.
 */
export function WeekEditor({ b, ev, plan, canResize, canRetype, fillAdded, lockedBefore, doneKm, lockedDays, labels }: {
  b: BlockWeeks; ev: BlockEval; plan: PlannedWeek[]; canResize: boolean; canRetype: boolean; fillAdded: boolean;
  /** Block names over the weeks they start, when the weeks are more than one block. */
  labels?: Record<number, string>;
  lockedBefore?: ISODate; doneKm?: Record<ISODate, number>;
  /** Days kept as they are, with what is on them (a race): shown locked like days that are over. */
  lockedDays?: Record<ISODate, string>;
}) {
  const fmt = useFmt();
  const drag = useDayDrag((from, to) => b.swap(from, to));
  const [stepsOf, setStepsOf] = useState<ISODate | null>(null);
  const [full, setFull] = useState<number | null>(null);
  const [cur, setCur] = useState(0);
  const { seed, n } = b;
  const week = Math.min(cur, n - 1);
  const dayName = (d: ISODate) => WEEKDAY_LONG[weekday(d)].toLowerCase();
  const blockEnd = addDays(seed.startWeek, n * 7 - 1);
  const deepestAt = ev.deepest && n > 1 ? ev.weeks.findIndex((w) => w.weekStart === ev.deepest!.weekStart) : -1;
  const canAdd = canResize && n < BLOCK.maxEditWeeks;
  const canRemove = canResize && n > BLOCK.minWeeks;
  const locked = (d: ISODate) => (lockedBefore != null && d < lockedBefore) || !!lockedDays?.[d];
  const longKm = Math.max(seed.longestKm, ...b.weeks.flat().filter((x) => x.type === "long").map((x) => x.km), 8);
  const cell = (date: ISODate, items: SuggestItem[]) => {
    if (locked(date)) return <LockedDay key={date} date={date} km={doneKm?.[date] ?? null} label={lockedDays?.[date]} />;
    const item = items.find((x) => x.date === date) ?? null;
    return (
      <DayCell key={date} date={date} item={item} refsKm={(x) => fmt.dist(x)} first={date === seed.startWeek || locked(addDays(date, -1))} last={date === blockEnd}
        over={drag.over === date && drag.from !== date} dragged={drag.from === date} dayName={dayName(date)}
        onStart={(p) => drag.start(p, date)} onType={(v) => b.setType(date, v)}
        onStep={(dir) => b.step(date, (x) => stepItem(x, dir, seed))}
        onRemove={() => b.remove(date)} onAdd={() => b.add(date)}
        onLeft={() => b.swap(date, addDays(date, -1))} onRight={() => b.swap(date, addDays(date, 1))}
        onSteps={() => setStepsOf(stepsOf === date ? null : date)} stepsOpen={stepsOf === date} tall={false} />
    );
  };
  const head = (i: number, compact?: boolean) => (
    <WeekHead b={b} i={i} ev={ev} plan={plan[i]} deepest={i === deepestAt} editable={canRetype} compact={compact} label={labels?.[i]}
      onRemove={canRemove ? () => { b.removeWeek(i); setCur(Math.max(0, Math.min(i, n - 2))); } : undefined} />
  );
  const stepsItem = stepsOf ? b.weeks.flat().find((x) => x.date === stepsOf && x.type !== "cross") : undefined;
  const addWeekButton = (cls: string, label: string) => (
    <button type="button" onClick={() => { b.addWeek(fillAdded); setCur(n); }} className={cls}>{label}</button>
  );

  return (
    <div className="space-y-3">
      <QuickPills b={b} editable={Array.from({ length: n }, (_, i) => i)} longRunDay={seed.longRunDay} longKm={longKm} onFull={setFull} isLocked={locked} />
      {full != null && <p role="status" className="text-xs text-warning">{t("be.full", { week: weekNumber(addDays(seed.startWeek, full * 7)) })}</p>}

      {/* Wider screens: a column per week, a row per day. */}
      <div className="hidden overflow-x-auto pb-1 md:block">
        <div className="grid gap-1.5"
          style={{ gridTemplateColumns: `repeat(${n}, minmax(9.5rem, 1fr))${canAdd ? " 6.5rem" : ""}`, gridTemplateRows: "auto repeat(7, auto)", gridAutoFlow: "column" }}>
          {b.weeks.map((items, i) => {
            const ws = addDays(seed.startWeek, i * 7);
            return [
              <div key={`h${ws}`} className="min-w-0">{head(i)}</div>,
              ...Array.from({ length: 7 }, (_, d) => <div key={addDays(ws, d)} className="min-w-0">{cell(addDays(ws, d), items)}</div>),
            ];
          })}
          {canAdd && (
            <div style={{ gridRow: "1 / span 8" }} className="flex">
              {addWeekButton("flex flex-1 flex-col items-center gap-1 rounded-lg border border-dashed border-border pt-6 text-sm text-muted-foreground hover:bg-accent hover:text-foreground", `+ ${t("be.addWeek")}`)}
            </div>
          )}
        </div>
      </div>

      {/* Phones: one week at a time, picked from tabs that double as a small volume chart. */}
      <div className="space-y-3 md:hidden">
        <div className="flex items-end gap-1">
          <Button variant="ghost" className="h-11 w-8 shrink-0 p-0" aria-label={t("plan.previous")} disabled={week === 0} onClick={() => setCur(week - 1)}>‹</Button>
          <div role="tablist" aria-label={t("be.weeks")} className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {ev.weeks.map((w, i) => {
              const top = Math.max(1, ...ev.weeks.map((x) => x.km));
              return (
                <button key={w.weekStart} type="button" role="tab" aria-selected={i === week} onClick={() => setCur(i)}
                  className={cn("flex min-w-14 flex-1 flex-col items-center gap-0.5 rounded-md px-1 py-1", i === week ? "bg-accent text-foreground" : "text-muted-foreground")}>
                  <span className="flex h-9 items-end" aria-hidden>
                    <span className="w-4 rounded-t-sm bg-signature" style={{ height: `${Math.max(3, (w.km / top) * 36)}px`, opacity: b.lighter[i] ? 0.55 : 1 }} />
                  </span>
                  <span className="text-xs font-semibold">{t("plan.weekShort", { week: weekNumber(w.weekStart) })}</span>
                  <span className="text-[11px] tabular-nums">{fmt.dist(w.km)}</span>
                </button>
              );
            })}
            {canAdd && addWeekButton("w-10 shrink-0 rounded-md border border-dashed border-border text-lg text-muted-foreground", "+")}
          </div>
          <Button variant="ghost" className="h-11 w-8 shrink-0 p-0" aria-label={t("plan.next")} disabled={week >= n - 1} onClick={() => setCur(week + 1)}>›</Button>
        </div>
        {head(week, true)}
        <div className="grid gap-2">{Array.from({ length: 7 }, (_, d) => cell(addDays(seed.startWeek, week * 7 + d), b.weeks[week] ?? []))}</div>
      </div>

      {stepsItem && (
        <StepsPanel key={stepsItem.date} item={stepsItem} refs={seed.refs} title={t("builder.editing", { day: dayName(stepsItem.date) })}
          onChange={(x) => b.set(stepsItem.date, x)} onClose={() => setStepsOf(null)} />
      )}
      {drag.label && <div aria-hidden className="pointer-events-none fixed z-[60] rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background" style={{ left: drag.label.x + 12, top: drag.label.y + 12 }}>{drag.label.text}</div>}
    </div>
  );
}

/** The warnings of every week, under its week number, for the panel beside the weeks. */
export function BlockWarnings({ ev }: { ev: BlockEval }) {
  return <>{ev.weeks.map((e) => <WarnBox key={e.weekStart} label={t("plan.weekShort", { week: weekNumber(e.weekStart) })}><Warnings ev={e} /></WarnBox>)}</>;
}
function WarnBox({ label, children }: { label: string; children: ReactNode }) {
  // Warnings renders nothing for a week without any; the box hides itself then with :has.
  return (
    <div className="hidden gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 [&:has(ul)]:flex">
      <span className="shrink-0 text-xs font-semibold text-warning">{label}</span>
      <div className="min-w-0 text-xs [&_ul]:space-y-0.5 [&_ul]:text-xs">{children}</div>
    </div>
  );
}

const stepItem = (x: SuggestItem, dir: 1 | -1, seed: BlockSeed) => editStep(x, dir, seed.refs);

/** A day that is over: what was run, never edited (and never a drop target: it has no `data-day`). */
function LockedDay({ date, km, label }: { date: ISODate; km: number | null; label?: string }) {
  const fmt = useFmt();
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-transparent bg-muted/60 p-2.5 text-xs text-muted-foreground md:min-h-24 md:flex-col md:items-start">
      <span><span className="font-semibold">{WEEKDAY_SHORT[weekday(date)]}</span> {Number(date.slice(8))}</span>
      <span className="flex items-center gap-1.5 md:mt-auto">
        <span className="rounded-full bg-muted px-2 py-0.5">{label ?? t("be.over")}</span>
        {km != null && km > 0 && <span className="tabular-nums">✓ {fmt.dist(km)}</span>}
      </span>
    </div>
  );
}
