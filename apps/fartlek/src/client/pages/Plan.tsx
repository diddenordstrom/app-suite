import { useEffect, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { api, useAction, useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { Badge, BusyButton, Button, Card, ErrorText, Field, Input, Dialog, SegmentedControl, Select, Spinner, cn } from "../ui";
import { BLOCK_COLOR, OutcomeBadge, StatusBadge, TYPE_COLOR, blockName, fmtDay, skipReason, workoutText } from "../bits";
import { BlockView } from "./Blocks";
import { blockOn } from "@/shared/blocks";
import { EASY_SHARE_FLAG } from "@/shared/compliance";
import type { PlanData, SessionView, WeekSummary } from "../types";
import { addDays, addMonths, monthEnd, monthStart, todayIn, weekNumber, weekStartOf, weekday } from "@/shared/dates";
import { t, tn, WEEKDAY_SHORT } from "../i18n";
import { RUN_WORKOUT_TYPES, SKIP_REASONS, WORKOUT_TYPES, type Activity, type Race, type Workout, type WorkoutType } from "@/shared/types";
import { stepsSummaryFor, stepsTextFor, useParsedSteps } from "../steps";
import { SessionBuilder, TypeChips } from "../sessionbuilder";
import { fmtDuration } from "@/shared/format";
import { SuggestWeekDialog, type Applied } from "../suggestweek";
import { ToWatch, WatchAddOnHint } from "../watch";
import { PUSH_DAYS } from "@/shared/intervalsdoc";
import { CreateBlockDialog, type BlockApplied } from "../suggestblock";
import { MoreMenu } from "../moremenu";

type Dialog =
  | { kind: "workout"; workout: Workout | null; date: string; week: WeekSummary }
  | { kind: "clear" }
  | { kind: "copyWeek"; weekStart: string }
  | { kind: "target"; week: WeekSummary }
  | { kind: "suggest"; weekStart: string }
  | { kind: "suggestBlock" };

export function Plan() {
  const { settings } = useSettings();
  const [view, setView] = useState<"week" | "month" | "block">(() => (window.innerWidth < 768 ? "week" : "month"));
  const [creating, setCreating] = useState(false);
  const [blockKey, setBlockKey] = useState(0);
  const [anchor, setAnchor] = useState(() => todayIn(settings.timezone));
  const ws = settings.weekStart;
  const from = view === "week" ? weekStartOf(anchor, ws) : weekStartOf(monthStart(anchor), ws);
  const to = view === "week" ? addDays(from, 6) : addDays(weekStartOf(monthEnd(anchor), ws), 6);
  const { data, error, reload, loading } = useApi<PlanData>(view === "block" ? null : `/plan?from=${from}&to=${to}`);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [dragError, setDragError] = useState<string | null>(null);
  const [applied, setApplied] = useState<(Applied & { weekStart: string }) | null>(null);
  const [blockApplied, setBlockApplied] = useState<BlockApplied | null>(null);
  const [selectBlock, setSelectBlock] = useState<number | null>(null);
  useEffect(() => {
    if (!blockApplied) return;
    const id = setTimeout(() => setBlockApplied(null), 10_000);
    return () => clearTimeout(id);
  }, [blockApplied]);
  const undoBlock = async () => {
    if (!blockApplied) return;
    const { id, blockIds, ids, removed, targetsBefore } = blockApplied;
    setBlockApplied(null);
    try {
      await api("/plan/block-suggest/undo", { body: { id, blockIds, ids, restore: removed, targetsBefore } });
    } catch (err) {
      setDragError((err as Error).message);
    }
    setSelectBlock(null);
    setBlockKey((k) => k + 1);
    void reload();
  };
  useEffect(() => {
    if (!applied) return;
    const id = setTimeout(() => setApplied(null), 10_000);
    return () => clearTimeout(id);
  }, [applied]);
  const undoApplied = async () => {
    if (!applied) return;
    const { ids, removed, weekStart } = applied;
    setApplied(null);
    try {
      await api("/plan/next-week/undo", { body: { weekStart, ids, restore: removed } });
    } catch (err) {
      setDragError((err as Error).message);
    }
    void reload();
  };

  const move = (n: number) => setAnchor(view === "week" ? addDays(anchor, n * 7) : addMonths(anchor, n));
  const title = view === "week"
    ? `${fmtDay(from, { day: "numeric", month: "short" })} – ${fmtDay(to, { day: "numeric", month: "short", year: "numeric" })}`
    : fmtDay(monthStart(anchor), { month: "long", year: "numeric" });

  /** Drop moves a workout; holding Alt/Ctrl/⌘ copies it. Moving never "breaks" the plan (D11). */
  const onDrop = async (e: DragEvent, date: string) => {
    e.preventDefault();
    const id = Number(e.dataTransfer.getData("text/workout"));
    if (!id) return;
    const copy = e.altKey || e.ctrlKey || e.metaKey;
    try {
      if (copy) await api(`/workouts/${id}/copy`, { body: { date } });
      else await api(`/workouts/${id}`, { method: "PATCH", body: { date } });
      setDragError(null);
      void reload();
    } catch (err) {
      setDragError((err as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold">{t("nav.plan")}</h1>
          {loading && <Spinner className="text-muted-foreground" />}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl value={view} onChange={(v) => { setView(v); setCreating(false); }} options={[{ value: "week", label: t("view.week") }, { value: "month", label: t("view.month") }, { value: "block", label: t("view.block") }]} />
          <Button className="h-8 gap-1 px-3" onClick={() => setDialog({ kind: "suggestBlock" })}>+ {t("be.title")}</Button>
          <MoreMenu items={[
            { label: t("races.title"), to: "/plan/races" },
            { label: `${t("plan.clear")}…`, onClick: () => setDialog({ kind: "clear" }) },
            { label: t("be.asText"), onClick: () => { setView("block"); setCreating(true); } },
          ]} />
        </div>
      </header>
      {view === "block" ? (
        <BlockView key={blockKey} initialSelected={selectBlock} creating={creating} onCreatingDone={() => setCreating(false)} onOpenWeek={(ws) => { setAnchor(ws); setView("week"); }} />
      ) : (<>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" className="h-8 px-2" aria-label={t("plan.previous")} onClick={() => move(-1)}>←</Button>
          <Button variant="ghost" className="h-8 px-2" onClick={() => setAnchor(todayIn(settings.timezone))}>{t("plan.today")}</Button>
          <Button variant="ghost" className="h-8 px-2" aria-label={t("plan.next")} onClick={() => move(1)}>→</Button>
        </div>
        <div className="text-sm font-medium">{title}</div>
      </div>
      <p className="hidden text-xs text-muted-foreground md:block">{t("plan.dragHint")}</p>
      <ErrorText>{error ?? dragError}</ErrorText>

      {data && (
        <div className="space-y-3">
          <div className="hidden grid-cols-7 gap-1 px-1 text-xs font-medium text-muted-foreground md:grid">
            {Array.from({ length: 7 }, (_, i) => <div key={i}>{WEEKDAY_SHORT[weekday(addDays(from, i))]}</div>)}
          </div>
          {data.weeks.map((w) => (
            <WeekRow key={w.weekStart} week={w} data={data} compact={view === "month"} month={view === "month" ? anchor.slice(0, 7) : null}
              onOpen={(workout, date) => setDialog({ kind: "workout", workout, date, week: w })}
              onDrop={onDrop}
              onCopy={() => setDialog({ kind: "copyWeek", weekStart: w.weekStart })}
              onTarget={() => setDialog({ kind: "target", week: w })}
              onSuggest={() => setDialog({ kind: "suggest", weekStart: w.weekStart })} />
          ))}
        </div>
      )}

      </>)}

      {dialog?.kind === "workout" && <WorkoutDialog {...dialog} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void reload(); }} />}
      {dialog?.kind === "clear" && <ClearDialog from={from} to={to} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); setBlockKey((k) => k + 1); void reload(); }} />}
      {dialog?.kind === "copyWeek" && <CopyWeekDialog weekStart={dialog.weekStart} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void reload(); }} />}
      {dialog?.kind === "target" && <TargetDialog week={dialog.week} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); void reload(); }} />}
      {dialog?.kind === "suggest" && (
        <SuggestWeekDialog weekStart={dialog.weekStart} onClose={() => setDialog(null)}
          onApplied={(a) => { setApplied({ ...a, weekStart: dialog.weekStart }); setDialog(null); void reload(); }} />
      )}
      {dialog?.kind === "suggestBlock" && (
        <CreateBlockDialog onClose={() => setDialog(null)}
          onApplied={(a) => { setBlockApplied(a); setDialog(null); setSelectBlock(a.id); setView("block"); setCreating(false); setBlockKey((k) => k + 1); void reload(); }} />
      )}
      {blockApplied && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background md:bottom-6">
          <span>{t("blk.applied", { from: weekNumber(blockApplied.from), to: weekNumber(addDays(blockApplied.to, -6)) })}</span>
          <button type="button" className="font-semibold underline" onClick={() => void undoBlock()}>{t("next.undo")}</button>
        </div>
      )}
      {applied && (
        <div role="status" className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center justify-between gap-3 rounded-lg bg-foreground px-4 py-3 text-sm text-background md:bottom-6">
          <span>{t("next.applied", { week: weekNumber(applied.weekStart) })}</span>
          <button type="button" className="font-semibold underline" onClick={() => void undoApplied()}>{t("next.undo")}</button>
        </div>
      )}
    </div>
  );
}

function WeekRow({ week, data, compact, month, onOpen, onDrop, onCopy, onTarget, onSuggest }: {
  week: WeekSummary; data: PlanData; compact: boolean; month: string | null;
  onOpen: (w: Workout | null, date: string) => void; onDrop: (e: DragEvent, date: string) => void; onCopy: () => void; onTarget: () => void; onSuggest: () => void;
}) {
  // Any week that isn't over can be suggested (the running week from today on), its planned sessions replaced; race weeks are left alone (shared/nextweek.ts).
  const weekEnd = addDays(week.weekStart, 6);
  const canSuggest = weekEnd > data.today && !week.sessions.some((s) => s.workout.type === "race")
    && !data.races.some((r) => r.date >= week.weekStart && r.date <= weekEnd);
  const fmt = useFmt();
  const days = Array.from({ length: 7 }, (_, i) => addDays(week.weekStart, i));
  const block = blockOn(week.weekStart, data.blocks);
  const activities: Activity[] = [...week.sessions.flatMap((s) => (s.activity ? [s.activity] : [])), ...week.extras];
  const linked = new Map(week.sessions.filter((s) => s.activity).map((s) => [s.activity!.id, s]));

  return (
    <Card className="overflow-hidden p-0" style={block ? { borderLeft: `4px solid ${BLOCK_COLOR[block.kind]}` } : undefined}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{t("plan.weekOf", { week: weekNumber(week.weekStart) })}</span>
          <span className="text-xs text-muted-foreground">{fmtDay(week.weekStart, { day: "numeric", month: "short" })}–{fmtDay(addDays(week.weekStart, 6), { day: "numeric", month: "short" })}</span>
          {block ? <Badge>{blockName(block)}</Badge> : data.blocks.length > 0 && <span className="text-xs text-muted-foreground">{t("plan.noBlock")}</span>}
          {week.backoff && <Badge>{t("plan.backoff")}</Badge>}
          <StatusBadge status={week.status} />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {fmt.num(week.actualKm)}{week.targetKm ? ` / ${fmt.num(week.targetKm)}` : ""} {fmt.unit}
            {week.keyPlanned > 0 && ` · ${t("plan.key", { done: week.keyDone, planned: week.keyPlanned })}`}
          </span>
          {week.easyShare != null && (
            <span className={cn("tabular-nums", week.easyShare < EASY_SHARE_FLAG && "text-warning")}>{t("plan.easyShare", { pct: Math.round(week.easyShare * 100) })}</span>
          )}
          {canSuggest && (
            <button className="inline-flex items-center gap-1 rounded-full bg-signature-soft px-2 py-0.5 font-medium text-signature-foreground hover:underline" onClick={onSuggest}>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
              {t("next.button")}
            </button>
          )}
          <button className="hover:text-foreground hover:underline" onClick={onTarget}>{t("plan.target")}</button>
          <button className="hover:text-foreground hover:underline" onClick={onCopy}>{t("common.copy")}</button>
        </div>
      </div>
      <div className="grid md:grid-cols-7">
        {days.map((d) => {
          const sessions = week.sessions.filter((s) => s.workout.date === d);
          const acts = activities.filter((a) => a.date === d);
          const races = data.races.filter((r) => r.date === d);
          const out = month && d.slice(0, 7) !== month;
          return (
            <div key={d} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onDrop(e, d)}
              className={cn("group flex min-h-12 gap-2 border-b border-border p-1.5 last:border-b-0 md:block md:min-h-28 md:border-b-0 md:border-r md:last:border-r-0",
                out && "bg-muted/40", d === data.today && "bg-signature-soft/60")}>
              <div className="flex w-14 shrink-0 items-start justify-between md:mb-1 md:w-auto">
                <span className={cn("text-xs", d === data.today ? "font-semibold text-signature-foreground" : "text-muted-foreground")}>
                  <span className="md:hidden">{WEEKDAY_SHORT[weekday(d)]} </span>{Number(d.slice(8))}
                </span>
                <button onClick={() => onOpen(null, d)} aria-label={t("plan.addOn", { date: d })}
                  className="hidden rounded px-1 text-xs text-muted-foreground hover:bg-accent group-hover:inline md:inline md:opacity-0 md:group-hover:opacity-100">+</button>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                {races.map((r) => <RaceChip key={r.id} race={r} />)}
                {sessions.map((s) => <SessionChip key={s.workout.id} s={s} compact={compact} tourPick={s.workout.id === tourSessionId(data)} onOpen={() => onOpen(s.workout, d)} />)}
                {acts.map((a) => {
                  const l = linked.get(a.id);
                  return (
                    <Link key={a.id} to={`/activities/${encodeURIComponent(a.id)}`}
                      className="block truncate rounded px-1 text-xs text-muted-foreground hover:bg-accent"
                      title={l ? t("plan.countsFor", { workout: workoutText(l.workout, (km) => fmt.dist(km)), how: t(`matchedBy.${l.match!.matchedBy}`) }) : t("plan.extraActivity")}>
                      {l ? "✓" : "+"} {a.isRun ? fmt.dist(a.distanceM / 1000) : a.typeKey.replace(/_/g, " ")} {!compact && <span>· {fmtDuration(a.durationS)}</span>}
                    </Link>
                  );
                })}
                {!sessions.length && !acts.length && !races.length && (
                  <button onClick={() => onOpen(null, d)} className="text-xs text-muted-foreground md:hidden">+ {t("plan.add")}</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function RaceChip({ race }: { race: Race }) {
  return (
    <Link to={`/plan/races?edit=${race.id}`} className="block truncate rounded bg-chart-4/15 px-1.5 py-0.5 text-xs font-medium hover:underline"
      title={t("races.openEdit", { name: race.name })}>⚑ {race.name}</Link>
  );
}

/**
 * The session a "show me" tour points at: the next running workout still to do, one with steps
 * if there is one. Workouts are in date order across the loaded weeks.
 */
const tourPicks = new WeakMap<PlanData, number | null>();
function tourSessionId(data: PlanData): number | null {
  if (!tourPicks.has(data)) {
    const open = data.weeks.flatMap((w) => w.sessions)
      .filter((s) => (s.outcome === "to_do" || s.outcome === "upcoming") && RUN_WORKOUT_TYPES.includes(s.workout.type) && s.workout.type !== "race");
    tourPicks.set(data, (open.find((s) => s.workout.steps) ?? open[0])?.workout.id ?? null);
  }
  return tourPicks.get(data)!;
}

function SessionChip({ s, compact, tourPick, onOpen }: { s: SessionView; compact: boolean; tourPick: boolean; onOpen: () => void }) {
  const fmt = useFmt();
  const faded = s.outcome === "dropped" || s.outcome === "skipped";
  return (
    <button draggable onDragStart={(e) => { e.dataTransfer.setData("text/workout", String(s.workout.id)); e.dataTransfer.effectAllowed = "copyMove"; }}
      onClick={onOpen}
      data-tour={tourPick ? "plan-session" : undefined}
      className={cn("block w-full cursor-grab rounded border border-border bg-background px-1.5 py-1 text-left text-xs hover:bg-accent active:cursor-grabbing", faded && "opacity-60 line-through decoration-muted-foreground")}
      style={{ borderLeft: `3px solid ${TYPE_COLOR[s.workout.type]}` }}>
      <div className="truncate font-medium">
        {s.spike && <span className="mr-1 text-warning" title={t("plan.spike", { pct: Math.round(s.spike.pct * 100), ref: fmt.dist(s.spike.refKm) })} aria-label={t("plan.spike", { pct: Math.round(s.spike.pct * 100), ref: fmt.dist(s.spike.refKm) })}>▲</span>}
        {workoutText(s.workout, (km) => fmt.dist(km, km % 1 ? 1 : 0))}
      </div>
      {s.workout.steps && <div className="truncate text-muted-foreground">{stepsSummaryFor(s.workout.steps, fmt.units) ?? t("steps.label")}</div>}
      {s.stepSummary && s.stepSummary.workJudged > 0 && (
        <span className={cn("mt-0.5 inline-block rounded-full px-1.5 text-[11px] font-medium",
          s.stepSummary.workIn === s.stepSummary.workTotal ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
          {t("pva.summary", { in: s.stepSummary.workIn, total: s.stepSummary.workTotal })}
        </span>
      )}
      {(!compact || s.outcome === "done" || s.outcome === "short" || s.outcome === "missed") && s.outcome !== "upcoming" && s.outcome !== "rest" && (
        <div className="mt-0.5 flex items-center gap-1"><OutcomeBadge outcome={s.outcome} />{s.workout.skipReason && <span className="text-muted-foreground">{skipReason(s.workout.skipReason)}</span>}</div>
      )}
      {!compact && s.workout.notes && <div className="mt-0.5 truncate text-muted-foreground">{s.workout.notes}</div>}
    </button>
  );
}

function WorkoutDialog({ workout, date, week, onClose, onSaved }: { workout: Workout | null; date: string; week: WeekSummary; onClose: () => void; onSaved: () => void }) {
  const fmt = useFmt();
  const [type, setType] = useState<WorkoutType>(workout?.type ?? "easy");
  const [dist, setDist] = useState(workout?.distanceKm != null ? String(fmt.distNum(workout.distanceKm)) : "");
  const [dur, setDur] = useState(workout?.durationMin != null ? String(workout.durationMin) : "");
  const [zone2, setZone2] = useState(workout?.zone2 ?? false);
  const [notes, setNotes] = useState(workout?.notes ?? "");
  const [day, setDay] = useState(workout?.date ?? date);
  const [copyTo, setCopyTo] = useState("");
  const [skipReason, setSkipReason] = useState(workout?.skipReason ?? "");
  const initialSteps = stepsTextFor(workout?.steps ?? null, fmt.units);
  const [stepsTxt, setStepsTxt] = useState(initialSteps);
  const parsedSteps = useParsedSteps(stepsTxt);
  const canHaveSteps = RUN_WORKOUT_TYPES.includes(type) && type !== "race";
  const hasSteps = canHaveSteps && !!parsedSteps.steps;
  const session = workout ? week.sessions.find((s) => s.workout.id === workout.id) : undefined;
  // The intervals.icu add-on: a saved, unchanged upcoming workout with steps can be sent to the watch.
  const { settings } = useSettings();
  const watch = useApi<{ connected: boolean; sentIds?: number[] }>("/intervals");
  const todayDate = todayIn(settings.timezone);
  const canSendToWatch = !!(watch.data?.connected && workout?.steps && workout.status === "planned" && canHaveSteps
    && workout.date >= todayDate && workout.date <= addDays(todayDate, PUSH_DAYS - 1)
    && stepsTxt === initialSteps && type === workout.type && day === workout.date && notes === (workout.notes ?? ""));
  const weekActs: Activity[] = [...week.sessions.flatMap((s) => (s.activity ? [s.activity] : [])), ...week.extras];

  const save = useAction(async () => {
    const body: Record<string, unknown> = {
      date: day, type, zone2: type === "long" && zone2, notes: notes || null,
      distanceKm: dist ? fmt.fromUser(Number(dist.replace(",", "."))) : null, durationMin: dur ? Number(dur) : null,
    };
    // The server derives the amount from the steps; only send them when they changed or must go.
    if (canHaveSteps ? stepsTxt !== initialSteps : !!workout?.steps) body.stepsText = canHaveSteps ? stepsTxt : "";
    if (workout) await api(`/workouts/${workout.id}`, { method: "PATCH", body });
    else await api("/workouts", { body });
  }, onSaved);
  const patch = useAction((body: Record<string, unknown>) => api(`/workouts/${workout!.id}`, { method: "PATCH", body }), onSaved);
  const del = useAction(() => api(`/workouts/${workout!.id}`, { method: "DELETE" }), onSaved);
  const copy = useAction(() => api(`/workouts/${workout!.id}/copy`, { body: { date: copyTo } }), onSaved);
  const err = save.error ?? patch.error ?? del.error ?? copy.error;
  const weekEnd = addDays(week.weekStart, 6);
  const tomorrow = addDays(date, 1);

  return (
    <Dialog open onClose={onClose} title={workout ? t("session.title") : t("session.new", { date: fmtDay(date) })} className="sm:max-w-2xl">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-end">
          <Field label={t("session.type")}>
            <TypeChips value={type} types={[...WORKOUT_TYPES]} onChange={setType} />
          </Field>
          <Field label={t("session.day")} hint={t("session.dayHint")}>
            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          </Field>
        </div>
        {!hasSteps && (
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("session.distance", { unit: fmt.unit })}>
              <Input inputMode="decimal" value={dist} onChange={(e) => setDist(e.target.value)} placeholder="10" />
            </Field>
            <Field label={t("session.duration")}>
              <Input inputMode="numeric" value={dur} onChange={(e) => setDur(e.target.value)} placeholder={t("common.optional").toLowerCase()} />
            </Field>
          </div>
        )}
        {canHaveSteps && (
          <div data-tour="session-steps">
            <SessionBuilder text={stepsTxt} onText={setStepsTxt} date={day} type={type}
              onType={setType} />
          </div>
        )}
        {type === "long" && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={zone2} onChange={(e) => setZone2(e.target.checked)} /> {t("session.zone2")}</label>
        )}
        <Field label={t("session.notes")} hint={t("session.notesHint")}>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
        </Field>
        <div className="flex flex-wrap gap-2">
          <BusyButton busy={save.busy} disabled={canHaveSteps && parsedSteps.errors.length > 0} onClick={() => save.run()}>{workout ? t("common.save") : t("session.add")}</BusyButton>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        </div>

        {workout && session && (
          <div className="space-y-3 border-t border-border pt-3">
            <div className="flex items-center gap-2 text-sm">
              <OutcomeBadge outcome={session.outcome} />
              {session.activity
                ? <span className="text-muted-foreground">{t("session.counts", { name: session.activity.name, dist: fmt.dist(session.activity.distanceM / 1000), how: t(`matchedBy.${session.match!.matchedBy}`) })}</span>
                : <span className="text-muted-foreground">{t("session.noRunLinked")}</span>}
            </div>

            <div className="flex flex-wrap gap-2">
              {workout.status === "planned" ? (
                <>
                  {tomorrow <= weekEnd && !session.activity && (
                    <Button variant="outline" className="h-8 text-xs" onClick={() => patch.run({ date: tomorrow })}>{t("session.moveTomorrow")}</Button>
                  )}
                  <Button variant="outline" className="h-8 text-xs" onClick={() => patch.run({ status: "dropped" })}>{t("session.drop")}</Button>
                  {watch.data && !watch.data.connected && workout.steps && canHaveSteps && workout.date >= todayDate && <WatchAddOnHint className="self-center" />}
                  {canSendToWatch && <ToWatch key={String(watch.data?.sentIds?.includes(workout.id))} inline id={workout.id} sent={!!watch.data?.sentIds?.includes(workout.id)} />}
                </>
              ) : (
                <Button variant="outline" className="h-8 text-xs" onClick={() => patch.run({ status: "planned" })}>{t("session.restore")}</Button>
              )}
            </div>

            {(session.outcome === "missed" || workout.status === "skipped") && (
              <div className="flex items-end gap-2">
                <Field label={t("session.skipReason")} className="flex-1">
                  <Select value={skipReason} onChange={(e) => setSkipReason(e.target.value)}>
                    <option value="">–</option>
                    {SKIP_REASONS.map((r) => <option key={r} value={r}>{t(`skip.${r}`)}</option>)}
                  </Select>
                </Field>
                <Button variant="outline" className="h-10" onClick={() => patch.run(skipReason ? { status: "skipped", skipReason } : { status: "planned" })}>{t("session.saveReason")}</Button>
              </div>
            )}

            {weekActs.length > 0 && (
              <Field label={t("session.whichRun")} hint={t("session.whichRunHint")}>
                <Select
                  value={workout.manualUnlinked ? "__none" : workout.manualActivityId ?? "__auto"}
                  onChange={(e) => {
                    const v = e.target.value;
                    void patch.run(v === "__auto" ? { manualActivityId: null, manualUnlinked: false } : v === "__none" ? { manualUnlinked: true } : { manualActivityId: v });
                  }}>
                  <option value="__auto">{t("session.auto")}</option>
                  <option value="__none">{t("session.none")}</option>
                  {weekActs.map((a) => <option key={a.id} value={a.id}>{fmtDay(a.date)} · {a.name} · {a.isRun ? fmt.dist(a.distanceM / 1000) : a.typeKey}</option>)}
                </Select>
              </Field>
            )}

            <div className="flex items-end gap-2">
              <Field label={t("session.copyTo")} className="flex-1"><Input type="date" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} /></Field>
              <BusyButton variant="outline" busy={copy.busy} disabled={!copyTo} onClick={() => copy.run()}>{t("common.copy")}</BusyButton>
            </div>
            <BusyButton variant="danger" className="h-8 text-xs" busy={del.busy} onClick={() => del.run()}>{t("session.delete")}</BusyButton>
          </div>
        )}
        <ErrorText>{err}</ErrorText>
      </div>
    </Dialog>
  );
}

function CopyWeekDialog({ weekStart, onClose, onSaved }: { weekStart: string; onClose: () => void; onSaved: () => void }) {
  const [to, setTo] = useState(addDays(weekStart, 7));
  const [count, setCount] = useState("1");
  const save = useAction(() => api("/weeks/copy", { body: { from: weekStart, to, count: Number(count) } }), onSaved);
  return (
    <Dialog open onClose={onClose} title={t("copyWeek.title", { week: weekNumber(weekStart) })}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("copyWeek.count")}><Input type="number" min={1} max={12} value={count} onChange={(e) => setCount(e.target.value)} /></Field>
          <Field label={t("copyWeek.to")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        <p className="text-xs text-muted-foreground">{t("copyWeek.hint")}</p>
        <div className="flex gap-2">
          <BusyButton busy={save.busy} onClick={() => save.run()}>{t("common.copy")}</BusyButton>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        </div>
        <ErrorText>{save.error}</ErrorText>
      </div>
    </Dialog>
  );
}

function TargetDialog({ week, onClose, onSaved }: { week: WeekSummary; onClose: () => void; onSaved: () => void }) {
  const fmt = useFmt();
  const [km, setKm] = useState("");
  const [note, setNote] = useState(week.backoff ? "backoff" : "");
  const save = useAction(() => api(`/targets/${week.weekStart}`, { method: "PUT", body: { km: km ? Number(km.replace(",", ".")) : null, note: note || null } }), onSaved);
  return (
    <Dialog open onClose={onClose} title={`${t("plan.target")} · ${t("plan.weekOf", { week: weekNumber(week.weekStart) }).toLowerCase()}`}>
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("target.hint", { dist: fmt.dist(week.plannedKm) })}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("target.weekly", { unit: fmt.unit })}><Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder={String(fmt.distNum(week.targetKm ?? week.plannedKm))} /></Field>
          <Field label={t("target.note")} hint={t("target.noteHint")}><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        <div className="flex gap-2">
          <BusyButton busy={save.busy} onClick={() => save.run()}>{t("common.save")}</BusyButton>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        </div>
        <ErrorText>{save.error}</ErrorText>
      </div>
    </Dialog>
  );
}

function ClearDialog({ from: f, to: toDate, onClose, onSaved }: { from: string; to: string; onClose: () => void; onSaved: () => void }) {
  const [from, setFrom] = useState(f);
  const [to, setTo] = useState(toDate);
  const [targets, setTargets] = useState(true);
  const [result, setResult] = useState<{ deleted: number; targets: number } | null>(null);
  const clear = useAction(async () => setResult(await api<{ deleted: number; targets: number }>("/plan/clear", { body: { from, to, targets } })));
  return (
    <Dialog open onClose={result ? onSaved : onClose} title={t("clear.title")}>
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">{tn("clear.deleted", result.deleted)}{result.targets ? ` ${tn("clear.andTargets", result.targets)}` : ""}.</p>
          <Button onClick={onSaved}>{t("common.done")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("clear.hint")}</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("common.from")}><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <Field label={t("common.to")}><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={targets} onChange={(e) => setTargets(e.target.checked)} /> {t("clear.targets")}</label>
          <div className="flex gap-2">
            <BusyButton variant="danger" busy={clear.busy} disabled={!from || !to} onClick={() => clear.run()}>{t("clear.delete")}</BusyButton>
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          </div>
          <ErrorText>{clear.error}</ErrorText>
        </div>
      )}
    </Dialog>
  );
}
