/**
 * Fartlek's own screens, fed the demo snapshot. Components come from apps/fartlek where they are
 * exported; the cards that Fartlek writes inline in a page (Trends' load, km and fuel cards, Home's
 * week card) are copied here with the same props and classes. Keep those in step with the originals,
 * named on each one. All text is Fartlek's own (`ft` = Fartlek's t()).
 */
import { useState } from "react";
import { Score, Sessions } from "@fartlek/client/today";
import { SignalList, WeekList } from "@fartlek/client/pages/Home";
import { SeasonStrip } from "@fartlek/client/pages/Blocks";
import { BestPaceCard, PredictionBody } from "@fartlek/client/perf";
import { Curves } from "@fartlek/client/curves";
import { PlannedCard, stepBands } from "@fartlek/client/stepresults";
import { StatusBadge, fmtDay } from "@fartlek/client/bits";
import { useFmt } from "@fartlek/client/prefs";
import { locale, t as ft, tm, tn } from "@fartlek/client/i18n";
import type { Msg } from "@fartlek/shared/types";
import { toDate, weekNumber } from "@fartlek/shared/dates";
import { fmtDuration } from "@fartlek/shared/format";
import { FORM } from "@fartlek/shared/load";
import { Badge, BarChart, Card, CardTitle, InfoTip, LineChart, Ring, Stat } from "../../../ui";
import { SNAPSHOT } from "./snapshot";
import { ExerciseCard } from "@fartlek/client/pages/Gym";
import type { DraftEntry } from "@fartlek/client/gymlog";
import type { LastTime } from "@fartlek/shared/gymplan";

const ms = (d: string) => toDate(d).getTime();
const dayLabel = (x: number) => new Date(x).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
/** Trends.tsx `indexed`: scale a series so its mean is 100. */
const indexed = (pts: { x: number; y: number }[]) => {
  const mean = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : 0;
  return pts.map((p) => ({ x: p.x, y: mean ? (p.y / mean) * 100 : null }));
};

/** Trends.tsx `Titled`. */
function Titled({ title, info }: { title: string; info: string }) {
  return <span className="flex items-center gap-1">{title}<InfoTip label={title}>{info}</InfoTip></span>;
}

/** Home.tsx `useReason`. */
function useReason() {
  const fmt = useFmt();
  return (r: Msg) => r.key === "reason.kmOf" && r.params
    ? ft("reason.kmOf", { actual: fmt.num(Number(r.params.actual)), target: fmt.num(Number(r.params.target)), unit: fmt.unit, pct: r.params.pct })
    : tm(r);
}

/** Home: the date heading and the "Today" card (score, today's sessions, the signals behind the score). */
export function TodayScreen() {
  const data = SNAPSHOT.today.home;
  return (
    <>
      <div className="px-1">
        <div className="text-2xl font-semibold first-letter:uppercase">{fmtDay(data.today, { weekday: "long", day: "numeric", month: "long" })}</div>
        <p className="text-sm text-muted-foreground">
          {ft("plan.weekShort", { week: weekNumber(data.week.weekStart) })}
          {data.block && <> · {ft("home.block", { name: data.block.name ?? ft(`block.kind.${data.block.kind}`) })}</>}
        </p>
      </div>
      <Card className="flex flex-col gap-4">
        <CardTitle>{ft("today.title")}</CardTitle>
        <Score data={data} />
        <Sessions data={data} />
        <div className="border-t border-border pt-3"><SignalList data={data} /></div>
      </Card>
    </>
  );
}

/** Home's week card (week view), then Trends' km-per-week chart. */
export function WeekScreen() {
  const data = SNAPSHOT.today.home;
  const { week } = data;
  const fmt = useFmt();
  const reason = useReason();
  const weekly = SNAPSHOT.load.weekly;
  const past = weekly.filter((w) => !w.future);
  const avg = past.length ? past.reduce((a, w) => a + w.actualKm, 0) / past.length : null;
  return (
    <>
      <Card className="flex flex-col gap-3">
        <CardTitle>{ft("home.week")}</CardTitle>
        <div className="flex flex-wrap items-center gap-5">
          <Ring value={week.actualKm} goal={data.ringGoal} size={116}>
            <div>
              <div className="font-display text-3xl leading-none font-medium tabular-nums">{fmt.num(week.actualKm)}</div>
              <div className="text-xs text-muted-foreground">{data.ringGoal ? ft("home.ofGoal", { goal: fmt.num(data.ringGoal), unit: fmt.unit }) : fmt.unit}</div>
            </div>
          </Ring>
          <WeekList data={data} />
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <StatusBadge status={week.status} />
          {week.reasons.map((r) => <span key={r.key}>{reason(r)}</span>)}
          {week.runs > 0 && <span>{tn("home.runs", week.runs)} · {fmtDuration(week.actualMin * 60)}</span>}
        </div>
      </Card>
      <Card>
        <CardTitle>{ft("trends.kmPerWeek")}</CardTitle>
        <BarChart
          yFormat={(v) => `${Math.round(v)}`}
          avg={avg != null ? fmt.distNum(avg) : null}
          markerLabel={ft("nav.plan")} valueLabel={ft("trends.run")}
          bars={weekly.slice(-8).map((w) => ({
            key: w.weekStart,
            label: ft("plan.weekShort", { week: weekNumber(w.weekStart) }),
            value: fmt.distNum(w.future ? w.plannedKm ?? 0 : w.actualKm),
            marker: w.future ? null : w.plannedKm != null ? fmt.distNum(w.plannedKm) : null,
            ghost: w.future,
            tip: (
              <>
                <div className="font-medium">{ft("plan.weekOf", { week: weekNumber(w.weekStart) })} · {fmtDay(w.weekStart, { day: "numeric", month: "short" })}{w.future && ` (${ft("trends.planned")})`}</div>
                {!w.future && <div>{fmt.dist(w.actualKm)} · {ft("home.runs_other", { count: w.runs })} · {fmtDuration(w.minutes * 60)}</div>}
                {w.plannedKm != null && <div className="text-muted-foreground">{ft("nav.plan")} {fmt.dist(w.plannedKm)}</div>}
              </>
            ),
          }))} />
      </Card>
    </>
  );
}

/** Trends' load card: fitness, fatigue and form, dashed where it is projected from the plan. */
export function LoadScreen() {
  const { load } = SNAPSHOT.load;
  const series = load.series;
  const first = series.find((p) => p.projected);
  const projFrom = first ? ms(first.date) : undefined;
  const planEnd = load.planEnd ? series.find((p) => p.date === load.planEnd) : null;
  const raceDay = load.race ? series.find((p) => p.date === load.race!.date) : null;
  const showRace = !!(raceDay && load.race && raceDay.projected && raceDay.date !== planEnd?.date);
  return (
    <Card>
      <CardTitle><Titled title={ft("trends.loadTitle")} info={ft("chartInfo.load", { building: FORM.building, heavy: FORM.heavy, fresh: FORM.fresh })} /></CardTitle>
      <LineChart height={220}
        xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`}
        series={[
          { key: "ctl", label: ft("load.fitness"), color: "var(--chart-1)", points: series.map((p) => ({ x: ms(p.date), y: p.ctl })), dashedFrom: projFrom },
          { key: "atl", label: ft("load.fatigue"), color: "var(--chart-2)", points: series.map((p) => ({ x: ms(p.date), y: p.atl })), dashedFrom: projFrom },
          { key: "tsb", label: ft("load.form"), color: "var(--chart-3)", points: series.map((p) => ({ x: ms(p.date), y: p.tsb })), dashedFrom: projFrom },
        ]} />
      {(planEnd || showRace) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {planEnd && <>{ft("trends.projected", { date: fmtDay(planEnd.date, { day: "numeric", month: "short" }) })} <b>{Math.round(planEnd.ctl)}</b>, {ft("trends.formApprox", { form: Math.round(planEnd.tsb) })}</>}
          {showRace && <> {ft("trends.onRace", { race: load.race!.name })} <b>{Math.round(raceDay!.ctl)}</b>, {ft("trends.formApprox", { form: Math.round(raceDay!.tsb) })}</>}
        </p>
      )}
    </Card>
  );
}

/** Trends' best-pace card. */
export function PaceScreen() {
  const { best } = SNAPSHOT.pace;
  return (
    <Card>
      <CardTitle><Titled title={ft("best.title")} info={ft("chartInfo.best")} /></CardTitle>
      <BestPaceCard best={best} />
    </Card>
  );
}

/** Races: the prediction for the A race (the marathon in the demo). */
export function RaceScreen() {
  const { races, predictions } = SNAPSHOT.race;
  const race = races.find((r) => r.priority === "A") ?? races[0];
  const pred = race && predictions.find((p) => p.raceId === race.id);
  if (!race || !pred) return null;
  return (
    <Card>
      <CardTitle><span className="flex items-center gap-2">{race.name} <Badge>{race.priority}</Badge></span></CardTitle>
      <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">{ft("pred.title")}<InfoTip label={ft("pred.title")}>{ft("chartInfo.pred")}</InfoTip></div>
      <PredictionBody pred={pred} goalSeconds={race.goalSeconds} distanceKm={race.distanceKm} />
    </Card>
  );
}

/** Plan → Blocks: the season strip. Clicking a block selects it, as in the app. */
export function BlockScreen() {
  const data = SNAPSHOT.block;
  const [selected, setSelected] = useState<number | null>(data.blocks.find((b) => b.summary.start <= data.today && b.summary.end >= data.today)?.id ?? null);
  return <SeasonStrip data={data} selected={selected} onSelect={setSelected} />;
}

/** An activity page: the stats row, planned vs done step by step, and the curves with step bands. */
export function ActivityScreen() {
  const data = SNAPSHOT.activity.detail;
  const a = data.activity;
  const fmt = useFmt();
  const pace = a.distanceM ? a.durationS / (a.distanceM / 1000) : null;
  return (
    <div className="space-y-3">
      <div className="px-1">
        <div className="text-2xl font-semibold">{a.name}</div>
        <p className="text-sm text-muted-foreground">{fmtDay(a.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · {a.startTimeLocal.slice(11, 16)}</p>
      </div>
      <Card className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={ft("stat.distance")} value={a.distanceM ? fmt.dist(a.distanceM / 1000, 2) : "–"} />
        <Stat label={ft("stat.time")} value={fmtDuration(a.durationS)} />
        <Stat label={ft("stat.pace")} value={a.isRun ? fmt.pace(pace) : "–"} sub={data.avgCadence != null ? ft("activity.cadenceSub", { spm: data.avgCadence }) : undefined} />
        <Stat label={ft("load.title")} value={data.metrics.load.load} sub={data.metrics.trimp != null ? `${ft(`load.method.${data.metrics.load.method}`)} · TRIMP ${data.metrics.trimp}` : ft(`load.method.${data.metrics.load.method}`)} />
      </Card>
      {data.planned?.match && (
        <PlannedCard activityId={a.id} planned={data.planned} lapStarts={data.laps.map((l) => l.startS ?? null)} onChange={() => {}} />
      )}
      {data.series.length > 0 && (
        <Card>
          <CardTitle>{ft("activity.curves")}</CardTitle>
          <Curves series={data.series} bands={stepBands(data.planned?.match)} />
        </Card>
      )}
    </div>
  );
}

/** Trends' fuelling card and felt-vs-measured card. */
export function FuelScreen() {
  const { log } = SNAPSHOT.fuel;
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardTitle><Titled title={ft("fuel.title")} info={ft("chartInfo.fuel")} /></CardTitle>
        <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={ft("fuel.empty")}
          series={[{ key: "gph", label: ft("fuel.carbsGh"), color: "var(--chart-1)", dots: true, points: log.fuel.map((f) => ({ x: ms(f.date), y: f.gPerH })) }]} />
        <p className="mt-2 text-sm">
          <b>{ft("fuel.next", { g: log.fuelAdvice.gPerH })}</b> <span className="text-muted-foreground">{tm(log.fuelAdvice.reason)}</span>
        </p>
        {log.fuel.length > 0 && (
          <ul className="mt-2 space-y-1 text-xs">
            {log.fuel.slice(-5).reverse().map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{fmtDay(f.date, { day: "numeric", month: "short" })} · {f.name}</span>
                <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  {f.gPerH} g/h
                  {f.gi != null && <Badge tone={f.gi >= 6 ? "danger" : f.gi > 3 ? "warning" : "success"}>{ft("fuel.stomach", { gi: f.gi })}</Badge>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card>
        <CardTitle><Titled title={ft("srpe.title")} info={ft("chartInfo.srpe")} /></CardTitle>
        <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={ft("srpe.empty")}
          series={[
            { key: "srpe", label: ft("srpe.felt"), color: "var(--chart-1)", dots: true, points: indexed(log.srpe.map((r) => ({ x: ms(r.date), y: r.srpe }))) },
            { key: "load", label: ft("srpe.measured"), color: "var(--chart-2)", dots: true, points: indexed(log.srpe.map((r) => ({ x: ms(r.date), y: r.load }))) },
            { key: "trimp", label: ft("srpe.trimp"), color: "var(--chart-3)", dots: true, points: indexed(log.srpe.flatMap((r) => (r.trimp == null ? [] : [{ x: ms(r.date), y: r.trimp }]))) },
          ]} />
      </Card>
    </div>
  );
}

/** The gym session (Gym.tsx): one exercise card with last time and the set being logged; the steppers and ticks work. */
export function GymScreen() {
  const kg = 57.5;
  const last: LastTime = { date: "2026-11-16", sets: [1, 2, 3].map(() => ({ kind: "work" as const, kg: 55, reps: 10, seconds: null })) };
  const [entry, setEntry] = useState<DraftEntry>({
    exercise: "stiff_leg_deadlift", slot: "hinge", scheme: { sets: 3, low: 8, high: 10 },
    sets: [{ kind: "work", kg, reps: 8, seconds: null, done: true }, { kind: "work", kg, reps: 8, seconds: null, done: false }, { kind: "work", kg, reps: 8, seconds: null, done: false }],
  });
  const [focus, setFocus] = useState<number | null>(1);
  const tick = (j: number) => {
    const sets = entry.sets.map((s, i) => (i === j ? { ...s, done: !s.done } : s));
    setEntry({ ...entry, sets });
    if (!entry.sets[j].done) { const next = sets.findIndex((s) => !s.done); setFocus(next >= 0 ? next : null); }
  };
  return (
    <>
      <div className="px-1">
        <div className="font-semibold">{ft("gym.template.A")} · {ft("gym.templateAbout.A")}</div>
        <div className="text-xs text-muted-foreground">{ft("gym.exerciseOf", { n: 2, total: 6 })}</div>
      </div>
      <ExerciseCard entry={entry} last={last} focus={focus} onFocus={setFocus} onTick={tick} onSwap={() => {}}
        onChange={(j, patch) => setEntry({ ...entry, sets: entry.sets.map((s, i) => (i === j ? { ...s, ...patch } : s)) })}
        onAddSet={() => { setEntry({ ...entry, sets: [...entry.sets, { ...entry.sets[entry.sets.length - 1], done: false }] }); setFocus(entry.sets.length); }} />
    </>
  );
}
