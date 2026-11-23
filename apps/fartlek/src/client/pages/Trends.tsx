import { useState } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { TrendsSkeleton } from "../skeletons";
import { Badge, BarChart, Button, Card, CardTitle, ChartCard, ErrorText, InfoTip, LineChart, SegmentedControl, Sparkline, Spinner, StackedBars, useAutoTour, useTour } from "../ui";
import { trendsTour } from "../guide";
import { SameSessionTrends } from "../samesession";
import { DurabilityCard } from "../durabilitycard";
import { BestPaceCard, CsBody, Vo2maxBody } from "../perf";
import { fmtDay, painArea } from "../bits";
import { locale, t, tm } from "../i18n";
import type { TrendsData } from "../types";
import { toDate, weekNumber } from "@/shared/dates";
import { fmtDuration } from "@/shared/format";
import { FORM, formState } from "@/shared/load";
import { READINESS } from "@/shared/recovery";
import { EASY_GRADE } from "@/shared/zones";

const ms = (d: string) => toDate(d).getTime();
const dayLabel = (x: number) => new Date(x).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
/** Scale a series so its mean is 100, which makes two different units comparable. */
const indexed = (pts: { x: number; y: number }[]) => {
  const mean = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : 0;
  return pts.map((p) => ({ x: p.x, y: mean ? (p.y / mean) * 100 : null }));
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedInt = (v: number) => Math.round(v).toLocaleString(locale, { signDisplay: "exceptZero" });
const FORM_BADGE = { fresh: "neutral", balanced: "neutral", building: "neutral", heavy: "danger" } as const;

export function Trends() {
  const [weeks, setWeeks] = useState<"12" | "26" | "52">("12");
  const { data, error, loading } = useApi<TrendsData>(`/trends?weeks=${weeks}`);
  const fmt = useFmt();
  const { settings } = useSettings();
  const tour = useTour();
  const [easyTab, setEasyTab] = useState<"pace" | "score">("pace");
  useAutoTour(data ? trendsTour() : null, { after: "onboarding" });

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <TrendsSkeleton />;

  const past = data.weekly.filter((w) => !w.future);
  const avg = past.length ? past.reduce((a, w) => a + w.actualKm, 0) / past.length : null;
  const ramps = data.weekly.map((w, i) => {
    // Compare with the bigger of the two weeks before, so the week after a backoff isn't flagged.
    const base = Math.max(data.weekly[i - 1]?.plannedKm ?? 0, data.weekly[i - 2]?.plannedKm ?? 0);
    const p = base > 0 && w.plannedKm ? w.plannedKm / base : null;
    return p && p > 1.1 ? { weekStart: w.weekStart, ramp: p } : null;
  }).filter((x): x is { weekStart: string; ramp: number } => !!x);

  const series = data.load.series;
  const projFrom = series.find((p) => p.projected) ? ms(series.find((p) => p.projected)!.date) : undefined;
  const planEnd = data.load.planEnd ? series.find((p) => p.date === data.load.planEnd) : null;
  const raceDay = data.load.race ? series.find((p) => p.date === data.load.race!.date) : null;
  const showRace = !!(raceDay && data.load.race && raceDay.projected && raceDay.date !== planEnd?.date);

  // This week: the last week that isn't in the future. Plan followed = run ÷ planned over the weeks before it.
  const week = past.at(-1);
  const before = past.slice(0, -1);
  const planned = before.filter((w) => w.plannedKm);
  const followed = planned.length ? planned.reduce((a, w) => a + w.actualKm, 0) / planned.reduce((a, w) => a + w.plannedKm!, 0) : null;
  const avgBefore = before.length ? before.reduce((a, w) => a + w.actualKm, 0) / before.length : null;
  const biggest = before.length ? Math.max(...before.map((w) => w.actualKm)) : null;

  const done = series.filter((p) => !p.projected);
  const today = done.at(-1);
  const monthAgo = done.at(-29);
  const hard = done.filter((p) => p.formPct < FORM.building);
  const inZone = hard.filter((p) => p.formPct >= FORM.heavy).length;
  const endPoint = showRace ? raceDay : planEnd;

  const easyGood = data.easy.filter((r) => r.score != null && r.score >= 0.9 && r.pace);
  const band = data.easy.filter((r) => r.bandPace);
  const thr = data.threshold;
  const wellness = data.wellness;
  const cs = data.cs.latest;
  const thrPace = thr.current?.paceSecPerKm ?? null;
  const thrStart = thr.points[0]?.date;
  const thrThen = thrStart ? thr.estimates.filter((e) => e.paceSecPerKm && e.effectiveDate <= thrStart).sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate)).at(-1) : undefined;
  const thrDelta = thrPace && thrThen?.paceSecPerKm && thrThen.id !== thr.current?.id ? Math.round(thrThen.paceSecPerKm - thrPace) : null;
  const thrLast = thr.points.at(-1);
  const thrRanged = thr.points.filter((p) => p.inRange != null);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><h1 className="text-2xl font-semibold">{t("nav.trends")}</h1>{loading && <Spinner className="text-muted-foreground" />}</div>
        <div className="flex items-center gap-2">
        <Button variant="ghost" className="h-9 px-3 text-muted-foreground" onClick={() => tour.start(trendsTour())}>{t("tour.replay")}</Button>
        <SegmentedControl value={weeks} onChange={setWeeks} options={[{ value: "12", label: t("trends.weeks", { count: 12 }) }, { value: "26", label: t("trends.weeks", { count: 26 }) }, { value: "52", label: t("trends.year") }]} />
        </div>
      </header>

      <ChartCard data-tour="trends-km" title={fmt.unit === "km" ? t("trends.kmPerWeek") : t("trends.miPerWeek")} sub={t("trends.kmSub")}
        headline={week ? {
          value: Math.round(fmt.distNum(week.actualKm)),
          unit: fmt.unit,
          context: <>{week.plannedKm ? <span className="block text-sm text-foreground">{t("trends.ofPlanned", { km: Math.round(fmt.distNum(week.plannedKm)) })}</span> : null}{t("trends.thisWeek", { week: weekNumber(week.weekStart) })}</>,
          progress: week.plannedKm ? week.actualKm / week.plannedKm : undefined,
        } : undefined}
        stats={[
          ...(avgBefore != null ? [{ label: t("trends.avgWeeks", { count: before.length }), value: fmt.dist(avgBefore) }] : []),
          ...(biggest != null ? [{ label: t("trends.biggest"), value: fmt.dist(biggest) }] : []),
          ...(followed != null ? [{ label: t("trends.followed"), value: pct(followed) }] : []),
        ]}>
        <BarChart
          yFormat={(v) => `${Math.round(v)}`}
          avg={avg != null ? fmt.distNum(avg) : null}
          markerLabel={t("nav.plan")} valueLabel={t("trends.run")}
          bars={data.weekly.map((w) => ({
            key: w.weekStart,
            label: t("plan.weekShort", { week: weekNumber(w.weekStart) }),
            value: fmt.distNum(w.future ? w.plannedKm ?? 0 : w.actualKm),
            marker: w.future ? null : w.plannedKm != null ? fmt.distNum(w.plannedKm) : null,
            ghost: w.future,
            current: w === week,
            tip: (
              <>
                <div className="font-medium">{t("plan.weekOf", { week: weekNumber(w.weekStart) })} · {fmtDay(w.weekStart, { day: "numeric", month: "short" })}{w.future && ` (${t("trends.planned")})`}</div>
                {!w.future && <div>{fmt.dist(w.actualKm)} · {t("home.runs_other", { count: w.runs })} · {fmtDuration(w.minutes * 60)}</div>}
                {w.plannedKm != null && <div className="text-muted-foreground">{t("nav.plan")} {fmt.dist(w.plannedKm)}</div>}
              </>
            ),
          }))} />
        {ramps.length > 0 && (
          <p className="mt-2 text-xs text-warning">
            {t("trends.ramps")}: {ramps.map((r) => `${t("plan.weekShort", { week: weekNumber(r.weekStart) })} (+${Math.round((r.ramp - 1) * 100)}%)`).join(", ")}
          </p>
        )}
      </ChartCard>

      <ChartCard data-tour="trends-load" title={t("trends.loadTitle")} sub={t("trends.loadSub")}
        info={t("chartInfo.load", { building: FORM.building, heavy: FORM.heavy, fresh: FORM.fresh })}
        headline={today ? {
          label: t("trends.formToday"),
          value: <>{signedInt(today.formPct)}<span className="ml-1 text-2xl">%</span></>,
          tone: formState(today.tsb, today.ctl) === "heavy" ? "danger" : undefined,
          badge: { label: t(`load.state.${formState(today.tsb, today.ctl)}`), tone: FORM_BADGE[formState(today.tsb, today.ctl)] },
          context: t("trends.fitFat", { ctl: Math.round(today.ctl), atl: Math.round(today.atl) }),
        } : undefined}
        stats={today ? [
          ...(hard.length ? [{ label: t("trends.inZone"), value: t("trends.inZoneOf", { n: inZone, of: hard.length }), sub: t("trends.hardDays"), tone: inZone === hard.length ? "success" as const : undefined }] : []),
          { label: t("load.fitness"), value: Math.round(today.ctl), sub: monthAgo ? t("trends.fitnessChange", { change: signedInt(today.ctl - monthAgo.ctl) }) : undefined },
          ...(endPoint ? [{ label: showRace ? data.load.race!.name : t("trends.planEnd"), value: `${Math.round(endPoint.ctl)} · ${signedInt(endPoint.formPct)} %`, sub: t("trends.fitForm") }] : []),
        ] : undefined}>
        <LineChart height={220}
          xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`}
          bands={[{ from: FORM.heavy, to: FORM.building, color: "var(--success)", label: t("trends.buildZone", { heavy: FORM.heavy, building: FORM.building }) }]}
          xLines={projFrom && today ? [{ x: ms(today.date), label: t("trends.today"), color: "var(--signature)" }] : []}
          series={[
            { key: "ctl", label: t("load.fitness"), color: "var(--chart-1)", area: true, points: series.map((p) => ({ x: ms(p.date), y: p.ctl })), dashedFrom: projFrom },
            { key: "atl", label: t("load.fatigue"), color: "var(--chart-2)", points: series.map((p) => ({ x: ms(p.date), y: p.atl })), dashedFrom: projFrom },
            { key: "form", label: t("trends.formPct"), color: "var(--chart-3)", points: series.map((p) => ({ x: ms(p.date), y: p.formPct })), dashedFrom: projFrom },
          ]} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle><Titled title={t("fuel.title")} info={t("chartInfo.fuel")} /></CardTitle>
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("fuel.empty")}
            series={[{ key: "gph", label: t("fuel.carbsGh"), color: "var(--chart-1)", dots: true, points: data.log.fuel.map((f) => ({ x: ms(f.date), y: f.gPerH })) }]} />
          <p className="mt-2 text-sm">
            <b>{t("fuel.next", { g: data.log.fuelAdvice.gPerH })}</b> <span className="text-muted-foreground">{tm(data.log.fuelAdvice.reason)}</span>
          </p>
          {data.log.fuel.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs">
              {data.log.fuel.slice(-5).reverse().map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-2">
                  <Link to={`/activities/${encodeURIComponent(f.id)}`} className="truncate hover:underline">{fmtDay(f.date, { day: "numeric", month: "short" })} · {f.name}</Link>
                  <span className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    {f.gPerH} g/h
                    {f.gi != null && <Badge tone={f.gi >= 6 ? "danger" : f.gi > 3 ? "warning" : "success"}>{t("fuel.stomach", { gi: f.gi })}</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardTitle><Titled title={t("srpe.title")} info={t("chartInfo.srpe")} /></CardTitle>
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("srpe.empty")}
            series={[
              { key: "srpe", label: t("srpe.felt"), color: "var(--chart-1)", dots: true, points: indexed(data.log.srpe.map((r) => ({ x: ms(r.date), y: r.srpe }))) },
              { key: "load", label: t("srpe.measured"), color: "var(--chart-2)", dots: true, points: indexed(data.log.srpe.map((r) => ({ x: ms(r.date), y: r.load }))) },
              { key: "trimp", label: t("srpe.trimp"), color: "var(--chart-3)", dots: true, points: indexed(data.log.srpe.flatMap((r) => (r.trimp == null ? [] : [{ x: ms(r.date), y: r.trimp }]))) },
            ]} />
        </Card>

        <DurabilityCard className="lg:col-span-2" rows={data.log.durability} info={t("chartInfo.durability")} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-tour="trends-best">
          <CardTitle><Titled title={t("best.title")} info={t("chartInfo.best")} /></CardTitle>
          <BestPaceCard best={data.best} />
        </Card>
        <Card data-tour="trends-cs">
          <CardTitle><Titled title={t("cs.title")} info={t("chartInfo.cs")} /></CardTitle>
          {cs
            ? <CsBody cs={cs} olderTest={data.cs.olderTest} thresholdPace={data.threshold.current?.paceSecPerKm} />
            : <p className="py-6 text-center text-sm text-muted-foreground">{t("cs.emptyAuto")}</p>}
        </Card>
        <Card data-tour="trends-vo2">
          <CardTitle><Titled title={t("vo2.title")} info={t("chartInfo.vo2")} /></CardTitle>
          <Vo2maxBody data={data.vo2max} />
        </Card>
      </div>

      <SameSessionTrends />

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard data-tour="trends-threshold" title={t("threshold.pace")} info={t("chartInfo.thresholdPace")} sub={t("threshold.sub")}
          headline={thrPace ? {
            label: t("threshold.estimated"),
            value: fmt.pace(thrPace).split("/")[0],
            unit: `/${fmt.pace(thrPace).split("/")[1]}`,
            context: thrDelta ? <><span className="block text-sm text-foreground">{t(thrDelta > 0 ? "threshold.faster" : "threshold.slower", { s: Math.abs(thrDelta) })}</span>{t("threshold.since", { date: fmtDay(thrStart!, { day: "numeric", month: "short" }) })}</> : thr.current ? t("threshold.since", { date: fmtDay(thr.current.effectiveDate, { day: "numeric", month: "short" }) }) : undefined,
          } : undefined}
          stats={thrLast ? [
            { label: t("threshold.lastSession"), value: fmt.pace(thrLast.pace).split("/")[0], sub: <Link className="hover:underline" to={`/activities/${encodeURIComponent(thrLast.activityId)}`}>{fmtDay(thrLast.date, { day: "numeric", month: "short" })}{thrLast.hr && ` · ${thrLast.hr} bpm`}</Link> },
            ...(thr.current?.hr ? [{ label: t("threshold.hrStat"), value: `${thr.current.hr} bpm` }] : []),
            { label: t("threshold.basis"), value: t("threshold.sessions", { n: thr.points.length }), sub: thrRanged.length ? t("threshold.inRangeCount", { n: thrRanged.filter((p) => p.inRange! > 0 && p.inRange === p.intervals).length }) : undefined },
          ] : undefined}>
          <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]}
            emptyText={t("threshold.paceEmpty")}
            refLines={thrPace ? [{ y: thrPace, label: t("threshold.estimate", { pace: fmt.pace(thrPace) }) }] : []}
            series={[{ key: "pace", label: t("threshold.intervalPace"), color: "var(--chart-1)", dots: true, points: thr.points.map((p) => ({ x: ms(p.date), y: p.pace })) }]} />
        </ChartCard>
        <Card>
          <CardTitle><Titled title={t("threshold.hrTitle")} info={t("chartInfo.thresholdHr")} /></CardTitle>
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`}
            emptyText={t("threshold.hrEmpty")}
            series={[{ key: "hr", label: t("threshold.intervalHr"), color: "var(--chart-2)", dots: true, points: thr.points.map((p) => ({ x: ms(p.date), y: p.hr })) }]} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle action={<SegmentedControl aria-label={t("easy.title")} value={easyTab} onChange={setEasyTab} options={[{ value: "pace", label: t("stat.pace") }, { value: "score", label: t("easy.score") }]} />}>
            <Titled title={t("easy.title")} info={easyTab === "score"
              ? t("chartInfo.easyScore", { good: EASY_GRADE.good * 100, ok: EASY_GRADE.ok * 100, range: settings.easyHigh ? `≤ ${settings.easyHigh} bpm` : t("easy.zones12") })
              : t(settings.easyLow && settings.easyHigh ? "chartInfo.easyPaceBand" : "chartInfo.easyPace", { low: settings.easyLow ?? "", high: settings.easyHigh ?? "" })} />
          </CardTitle>
          {easyTab === "score" ? (
            <LineChart height={190} xFormat={dayLabel} yFormat={pct} yPad={0.02}
              refLines={[{ y: EASY_GRADE.good, label: pct(EASY_GRADE.good) }]}
              series={[{ key: "score", label: t("easy.score"), color: "var(--chart-1)", dots: true, points: data.easy.filter((r) => r.score != null).map((r) => ({ x: ms(r.date), y: r.score })) }]} />
          ) : settings.easyLow && settings.easyHigh ? (
            <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]} emptyText={t("easy.bandEmpty")}
              series={[{ key: "band", label: t("easy.paceInBandShort"), color: "var(--chart-3)", dots: true, points: band.map((r) => ({ x: ms(r.date), y: r.bandPace })) }]} />
          ) : (
            <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]} emptyText={t("easy.paceEmpty")}
              series={[{ key: "pace", label: t("easy.pace"), color: "var(--chart-3)", dots: true, points: easyGood.map((r) => ({ x: ms(r.date), y: r.pace })) }]} />
          )}
          {easyTab === "pace" && !settings.easyHigh && <p className="mt-2 text-xs text-muted-foreground">{t("easy.setBand")} <Link className="underline" to="/settings">{t("nav.settings")}</Link>.</p>}
        </Card>
        <Card data-tour="trends-intensity">
          <CardTitle><Titled title={t("intensity.title")} info={t("chartInfo.intensity")} /></CardTitle>
          <StackedBars
            parts={[{ label: `${t("intensity.easy")} (Z1–2)`, color: "var(--seq-1)" }, { label: `${t("intensity.moderate")} (Z3)`, color: "var(--seq-2)" }, { label: `${t("intensity.hard")} (Z4–5)`, color: "var(--seq-3)" }]}
            bars={data.distribution.map((d) => ({
              key: d.weekStart, label: t("plan.weekShort", { week: weekNumber(d.weekStart) }), values: [d.low, d.mid, d.high],
              tip: d.total ? <><div className="font-medium">{t("plan.weekOf", { week: weekNumber(d.weekStart) })} · {fmtDay(d.weekStart, { day: "numeric", month: "short" })}</div><div>{t("intensity.tip", { easy: pct(d.low), moderate: pct(d.mid), hard: pct(d.high) })}</div></> : t("intensity.noHr"),
            }))} />
        </Card>
        <Card className="lg:col-span-2">
          <CardTitle>{t("pain.last5")}</CardTitle>
          {data.pain.trends.length ? (
            <ul className="space-y-2">
              {data.pain.trends.map((p) => (
                <li key={p.area} className="flex items-center justify-between gap-3 text-sm">
                  <span className="w-24">{painArea(p.area)}</span>
                  <Sparkline values={p.levels} width={96} />
                  <span className="text-xs tabular-nums text-muted-foreground">{p.levels.join(" · ")}</span>
                  <span className={`w-16 text-right text-xs ${p.trend === "rising" ? "text-warning" : "text-muted-foreground"}`}>{t(`trend.${p.trend}`)}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted-foreground">{t("pain.noneRecent")}</p>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card data-tour="trends-hrv">
          <CardTitle><Titled title={t("hrv.title")} info={t("chartInfo.hrv", { nights: READINESS.hrv.nights })} /></CardTitle>
          <LineChart height={170} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("hrv.empty")}
            refLines={wellness.findLast((w) => w.hrvBaselineLow != null) ? [{ y: wellness.findLast((w) => w.hrvBaselineLow != null)!.hrvBaselineLow!, label: t("hrv.baselineLow") }] : []}
            series={[{ key: "hrv", label: "HRV (ms)", color: "var(--chart-1)", points: wellness.map((w) => ({ x: ms(w.date), y: w.hrvWeeklyAvg })) }]} />
        </Card>
        <Card>
          <CardTitle><Titled title={t("rhr.title")} info={t("chartInfo.rhr", { per: READINESS.rhr.perBeat.toLocaleString(locale) })} /></CardTitle>
          <LineChart height={170} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("rhr.empty")}
            series={[{ key: "rhr", label: t("signal.rhr"), color: "var(--chart-2)", points: wellness.map((w) => ({ x: ms(w.date), y: w.restingHr })) }]} />
        </Card>
      </div>
    </div>
  );
}

/** A chart title with an ⓘ saying how to read the chart (docs/decisions/metric-info-tips.md). */
function Titled({ title, info }: { title: string; info: string }) {
  return <span className="flex items-center gap-1">{title}<InfoTip label={title}>{info}</InfoTip></span>;
}
