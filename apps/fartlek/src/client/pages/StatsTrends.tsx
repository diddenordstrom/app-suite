/**
 * Statistik's Trender view (docs/decisions/fartlek-period-stats.md): measures that change over months,
 * drawn over a window that follows the chosen period, with the period shaded. Load, threshold, HRV and
 * resting HR put a figure for the period on top; the rest is history with the period at most shaded.
 */
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useApi } from "../http";
import { useFmt, useSettings } from "../prefs";
import { TrendsSkeleton } from "../skeletons";
import { Badge, Card, CardTitle, ChartCard, ErrorText, InfoTip, LineChart, SegmentedControl, Sparkline, useAutoTour } from "../ui";
import { trendsTour } from "../guide";
import { SameSessionTrends } from "../samesession";
import { DurabilityCard } from "../durabilitycard";
import { BestPaceCard, CsBody, Vo2maxBody } from "../perf";
import { fmtDay, painArea } from "../bits";
import { locale, t, tm } from "../i18n";
import type { TrendsData } from "../types";
import { endsIn, meanIn, periodBands, trendWeeks } from "../trendperiod";
import { toDate, type ISODate } from "@/shared/dates";
import { FORM, formState } from "@/shared/load";
import type { Period } from "@/shared/periodstats";
import { READINESS } from "@/shared/recovery";
import { thresholdOn } from "@/shared/threshold";
import { EASY_GRADE } from "@/shared/zones";

const ms = (d: string) => toDate(d).getTime();
const dayLabel = (x: number) => new Date(x).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonth = (d: ISODate) => fmtDay(d, { day: "numeric", month: "short" });
/** Scale a series so its mean is 100, which makes two different units comparable. */
const indexed = (pts: { x: number; y: number }[]) => {
  const mean = pts.length ? pts.reduce((a, p) => a + p.y, 0) / pts.length : 0;
  return pts.map((p) => ({ x: p.x, y: mean ? (p.y / mean) * 100 : null }));
};
const pct = (v: number) => `${Math.round(v * 100)}%`;
const signedInt = (v: number) => Math.round(v).toLocaleString(locale, { signDisplay: "exceptZero" });
const FORM_BADGE = { fresh: "neutral", balanced: "neutral", building: "neutral", heavy: "danger" } as const;

export interface TrendsSides {
  a: Period;
  /** The other period, only while comparing. */
  b: Period | null;
  /** Short names for the shading and the key numbers ("v. 48", "nov."). */
  shortA: string;
  shortB: string;
}

export function TrendsView({ sides, today }: { sides: TrendsSides; today: ISODate }) {
  const weeks = trendWeeks(sides.b ? [sides.a, sides.b] : [sides.a], today);
  const { data, error } = useApi<TrendsData>(`/trends?weeks=${weeks}`);
  useAutoTour(data ? trendsTour() : null, { after: "onboarding" });
  // A link to a card (#same from an activity) scrolls there once the cards exist.
  const { hash } = useLocation();
  useEffect(() => {
    if (data && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [data, hash]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <TrendsSkeleton />;
  return <TrendsCards data={data} sides={sides} />;
}

export function TrendsCards({ data, sides }: { data: TrendsData; sides: TrendsSides }) {
  const fmt = useFmt();
  const { settings } = useSettings();
  const [easyTab, setEasyTab] = useState<"pace" | "score">("pace");
  const { a, b, shortA, shortB } = sides;
  const shade = periodBands(a, b, shortA, shortB);
  /** The period's end, or today while it runs. */
  const endOf = (p: Period) => (p.to > data.today ? data.today : p.to);

  // ---- Load: form at the end of the period, fitness over it.
  const series = data.load.series;
  const projFrom = series.find((p) => p.projected) ? ms(series.find((p) => p.projected)!.date) : undefined;
  const planEnd = data.load.planEnd ? series.find((p) => p.date === data.load.planEnd) : null;
  const raceDay = data.load.race ? series.find((p) => p.date === data.load.race!.date) : null;
  const showRace = !!(raceDay && data.load.race && raceDay.projected && raceDay.date !== planEnd?.date);
  const endPoint = showRace ? raceDay : planEnd;
  const done = series.filter((p) => !p.projected);
  const at = (d: ISODate) => done.findLast((p) => p.date <= d);
  const formEnd = at(endOf(a));
  const fitA = endsIn(done.map((p) => ({ date: p.date, value: p.ctl })), a);
  const fitB = b ? at(endOf(b)) : undefined;
  const hard = done.filter((p) => p.date >= a.from && p.date <= a.to && p.formPct < FORM.building);
  const inZone = hard.filter((p) => p.formPct >= FORM.heavy).length;
  const endsToday = endOf(a) === data.today;

  // ---- Threshold: the estimate at the period's end, and how it moved over the period.
  const thr = data.threshold;
  const thrPoints = thr.points.filter((p) => p.date >= data.from);
  const thrEnd = thresholdOn(thr.estimates, endOf(a));
  const thrStart = thresholdOn(thr.estimates, a.from);
  const thrPace = thrEnd?.paceSecPerKm ?? null;
  const thrDelta = thrPace && thrStart?.paceSecPerKm && thrStart.id !== thrEnd?.id ? Math.round(thrStart.paceSecPerKm - thrPace) : null;
  const thrInA = thrPoints.filter((p) => p.date >= a.from && p.date <= a.to);
  const thrLast = thrInA.at(-1);
  const thrRanged = thrInA.filter((p) => p.inRange != null);
  const thrB = b ? thresholdOn(thr.estimates, endOf(b))?.paceSecPerKm ?? null : null;

  // ---- HRV and resting HR: the period's mean against the other period's.
  const wellness = data.wellness;
  const hrvPts = wellness.map((w) => ({ date: w.date, value: w.hrvWeeklyAvg }));
  const rhrPts = wellness.map((w) => ({ date: w.date, value: w.restingHr }));
  const meanHeadline = (pts: { date: ISODate; value: number | null }[], unit: string) => {
    const va = meanIn(pts, a);
    if (va == null) return undefined;
    const vb = b ? meanIn(pts, b) : null;
    return {
      label: t("trends.meanIn", { name: shortA }),
      value: Math.round(va),
      unit,
      context: vb != null ? t("trends.versus", { change: signedInt(va - vb), name: shortB }) : t("trends.days", { n: pts.filter((p) => p.value != null && p.date >= a.from && p.date <= a.to).length }),
    };
  };

  const cs = data.cs.latest;
  const easyGood = data.easy.filter((r) => r.score != null && r.score >= 0.9 && r.pace);
  const band = data.easy.filter((r) => r.bandPace);

  return (
    <div className="space-y-4">
      <ChartCard data-tour="trends-load" title={t("trends.loadTitle")} sub={t("trends.loadSub")}
        info={t("chartInfo.load", { building: FORM.building, heavy: FORM.heavy, fresh: FORM.fresh })}
        headline={formEnd ? {
          label: endsToday ? t("trends.formToday") : t("trends.formOn", { date: dayMonth(formEnd.date) }),
          value: <>{signedInt(formEnd.formPct)}<span className="ml-1 text-2xl">%</span></>,
          tone: formState(formEnd.tsb, formEnd.ctl) === "heavy" ? "danger" : undefined,
          badge: { label: t(`load.state.${formState(formEnd.tsb, formEnd.ctl)}`), tone: FORM_BADGE[formState(formEnd.tsb, formEnd.ctl)] },
          context: t("trends.fitFat", { ctl: Math.round(formEnd.ctl), atl: Math.round(formEnd.atl) }),
        } : undefined}
        stats={formEnd ? [
          ...(hard.length ? [{ label: t("trends.inZone"), value: t("trends.inZoneOf", { n: inZone, of: hard.length }), sub: t("trends.hardDays"), tone: inZone === hard.length ? "success" as const : undefined }] : []),
          { label: t("load.fitness"), value: Math.round(formEnd.ctl), sub: fitA ? t("trends.changeIn", { change: signedInt(fitA.last - fitA.first), name: shortA }) : undefined },
          ...(fitB ? [{ label: t("trends.fitnessOf", { name: shortB }), value: Math.round(fitB.ctl), sub: t("trends.formValue", { form: signedInt(fitB.formPct) }) }]
            : endPoint ? [{ label: showRace ? data.load.race!.name : t("trends.planEnd"), value: `${Math.round(endPoint.ctl)} · ${signedInt(endPoint.formPct)} %`, sub: t("trends.fitForm") }] : []),
        ] : undefined}>
        <LineChart height={220}
          xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`}
          bands={[{ from: FORM.heavy, to: FORM.building, color: "var(--success)", label: t("trends.buildZone", { heavy: FORM.heavy, building: FORM.building }) }]}
          xBands={shade}
          xLines={projFrom ? [{ x: ms(data.today), label: t("trends.today"), color: "var(--signature)" }] : []}
          series={[
            { key: "ctl", label: t("load.fitness"), color: "var(--chart-1)", area: true, points: series.map((p) => ({ x: ms(p.date), y: p.ctl })), dashedFrom: projFrom },
            { key: "atl", label: t("load.fatigue"), color: "var(--chart-2)", points: series.map((p) => ({ x: ms(p.date), y: p.atl })), dashedFrom: projFrom },
            { key: "form", label: t("trends.formPct"), color: "var(--chart-3)", points: series.map((p) => ({ x: ms(p.date), y: p.formPct })), dashedFrom: projFrom },
          ]} />
      </ChartCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard data-tour="trends-threshold" title={t("threshold.pace")} info={t("chartInfo.thresholdPace")} sub={t("threshold.sub")}
          headline={thrPace ? {
            label: t("threshold.estimated"),
            value: fmt.pace(thrPace).split("/")[0],
            unit: `/${fmt.pace(thrPace).split("/")[1]}`,
            context: thrDelta
              ? <><span className="block text-sm text-foreground">{t(thrDelta > 0 ? "threshold.faster" : "threshold.slower", { s: Math.abs(thrDelta) })}</span>{t("trends.during", { name: shortA })}</>
              : thrEnd ? t("threshold.since", { date: dayMonth(thrEnd.effectiveDate) }) : undefined,
          } : undefined}
          stats={[
            ...(thrLast ? [{ label: t("threshold.lastSession"), value: fmt.pace(thrLast.pace).split("/")[0], sub: <Link className="hover:underline" to={`/activities/${encodeURIComponent(thrLast.activityId)}`}>{dayMonth(thrLast.date)}{thrLast.hr && ` · ${thrLast.hr} bpm`}</Link> }] : []),
            ...(thrB ? [{ label: t("trends.thresholdOf", { name: shortB }), value: fmt.pace(thrB).split("/")[0] }] : thrEnd?.hr ? [{ label: t("threshold.hrStat"), value: `${thrEnd.hr} bpm` }] : []),
            { label: t("threshold.basis"), value: t("threshold.sessions", { n: thrInA.length }), sub: thrRanged.length ? t("threshold.inRangeCount", { n: thrRanged.filter((p) => p.inRange! > 0 && p.inRange === p.intervals).length }) : shortA },
          ]}>
          <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]}
            emptyText={t("threshold.paceEmpty")} xBands={shade}
            refLines={thrPace ? [{ y: thrPace, label: t("threshold.estimate", { pace: fmt.pace(thrPace) }) }] : []}
            series={[{ key: "pace", label: t("threshold.intervalPace"), color: "var(--chart-1)", dots: true, points: thrPoints.map((p) => ({ x: ms(p.date), y: p.pace })) }]} />
        </ChartCard>
        <Card>
          <CardTitle><Titled title={t("threshold.hrTitle")} info={t("chartInfo.thresholdHr")} /></CardTitle>
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`}
            emptyText={t("threshold.hrEmpty")} xBands={shade}
            series={[{ key: "hr", label: t("threshold.intervalHr"), color: "var(--chart-2)", dots: true, points: thrPoints.map((p) => ({ x: ms(p.date), y: p.hr })) }]} />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard data-tour="trends-hrv" title={t("hrv.title")} info={t("chartInfo.hrv", { nights: READINESS.hrv.nights })} headline={meanHeadline(hrvPts, "ms")}>
          <LineChart height={170} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("hrv.empty")} xBands={shade}
            refLines={wellness.findLast((w) => w.hrvBaselineLow != null) ? [{ y: wellness.findLast((w) => w.hrvBaselineLow != null)!.hrvBaselineLow!, label: t("hrv.baselineLow") }] : []}
            series={[{ key: "hrv", label: "HRV (ms)", color: "var(--chart-1)", points: wellness.map((w) => ({ x: ms(w.date), y: w.hrvWeeklyAvg })) }]} />
        </ChartCard>
        <ChartCard title={t("rhr.title")} info={t("chartInfo.rhr", { per: READINESS.rhr.perBeat.toLocaleString(locale) })} headline={meanHeadline(rhrPts, "bpm")}>
          <LineChart height={170} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("rhr.empty")} xBands={shade}
            series={[{ key: "rhr", label: t("signal.rhr"), color: "var(--chart-2)", points: wellness.map((w) => ({ x: ms(w.date), y: w.restingHr })) }]} />
        </ChartCard>
      </div>

      <h2 className="pt-2 text-sm font-semibold text-muted-foreground">{t("trends.history")}</h2>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardTitle><Titled title={t("fuel.title")} info={t("chartInfo.fuel")} /></CardTitle>
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("fuel.empty")} xBands={shade}
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
          <LineChart height={190} xFormat={dayLabel} yFormat={(v) => `${Math.round(v)}`} emptyText={t("srpe.empty")} xBands={shade}
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
        <Card>
          <CardTitle action={<SegmentedControl aria-label={t("easy.title")} value={easyTab} onChange={setEasyTab} options={[{ value: "pace", label: t("stat.pace") }, { value: "score", label: t("easy.score") }]} />}>
            <Titled title={t("easy.title")} info={easyTab === "score"
              ? t("chartInfo.easyScore", { good: EASY_GRADE.good * 100, ok: EASY_GRADE.ok * 100, range: settings.easyHigh ? `≤ ${settings.easyHigh} bpm` : t("easy.zones12") })
              : t(settings.easyLow && settings.easyHigh ? "chartInfo.easyPaceBand" : "chartInfo.easyPace", { low: settings.easyLow ?? "", high: settings.easyHigh ?? "" })} />
          </CardTitle>
          {easyTab === "score" ? (
            <LineChart height={190} xFormat={dayLabel} yFormat={pct} yPad={0.02} xBands={shade}
              refLines={[{ y: EASY_GRADE.good, label: pct(EASY_GRADE.good) }]}
              series={[{ key: "score", label: t("easy.score"), color: "var(--chart-1)", dots: true, points: data.easy.filter((r) => r.score != null).map((r) => ({ x: ms(r.date), y: r.score })) }]} />
          ) : settings.easyLow && settings.easyHigh ? (
            <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]} emptyText={t("easy.bandEmpty")} xBands={shade}
              series={[{ key: "band", label: t("easy.paceInBandShort"), color: "var(--chart-3)", dots: true, points: band.map((r) => ({ x: ms(r.date), y: r.bandPace })) }]} />
          ) : (
            <LineChart height={190} invert xFormat={dayLabel} yFormat={(v) => fmt.pace(v).split("/")[0]} emptyText={t("easy.paceEmpty")} xBands={shade}
              series={[{ key: "pace", label: t("easy.pace"), color: "var(--chart-3)", dots: true, points: easyGood.map((r) => ({ x: ms(r.date), y: r.pace })) }]} />
          )}
          {easyTab === "pace" && !settings.easyHigh && <p className="mt-2 text-xs text-muted-foreground">{t("easy.setBand")} <Link className="underline" to="/settings">{t("nav.settings")}</Link>.</p>}
        </Card>
        <Card>
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
    </div>
  );
}

/** A chart title with an ⓘ saying how to read the chart (docs/decisions/metric-info-tips.md). */
function Titled({ title, info }: { title: string; info: string }) {
  return <span className="flex items-center gap-1">{title}<InfoTip label={title}>{info}</InfoTip></span>;
}
