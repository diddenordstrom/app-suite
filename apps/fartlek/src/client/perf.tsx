import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, LineChart, SegmentedControl, Stat, type LineSeries } from "./ui";
import { fmtDay } from "./bits";
import { locale, t } from "./i18n";
import { useFmt } from "./prefs";
import { LOW_D_PRIME_M, TABLE_DURATIONS, type CurvePoint } from "@/shared/bestefforts";
import { fmtClock } from "@/shared/format";
import type { BestEffortsData, CsTest, CsView, CurveCompare, RacePredictionData, Vo2maxData } from "./types";
import type { Estimate } from "@/shared/bestefforts";

/* Best efforts, automatic critical speed and the race prediction (docs/decisions/fartlek-best-efforts.md). */

type Fmt = ReturnType<typeof useFmt>;

/** "1 min", "20 min", "1 h", "1 h 30" for a duration in seconds. */
export function durationLabel(s: number): string {
  if (s < 3600) return t("best.min", { n: Math.round(s / 60) });
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return m ? t("best.hMin", { h, m }) : t("best.h", { h });
}
const paceOnly = (fmt: Fmt, s: number | null | undefined) => fmt.pace(s).split("/")[0];

function periodName(c: CurveCompare, which: "current" | "previous"): string {
  if (c.kind === "rolling") return which === "current" ? t("best.last6w") : t("best.prev6w");
  const name = which === "current" ? c.currentName : c.previousName;
  const kind = which === "current" ? c.currentKind : c.previousKind;
  return name || (kind ? t(`block.kind.${kind}` as never) : which === "current" ? t("best.thisBlock") : t("best.prevBlock"));
}

export function BestPaceCard({ best }: { best: BestEffortsData }) {
  const fmt = useFmt();
  const [kind, setKind] = useState<"block" | "rolling">(best.block ? "block" : "rolling");
  const cmp = kind === "block" && best.block ? best.block : best.rolling;
  const lx = (p: CurvePoint) => Math.log(p.durationS);
  const pts = (c: CurvePoint[]) => c.map((p) => ({ x: lx(p), y: p.paceSecPerKm }));
  const xs = best.allTime.map(lx);
  const series: LineSeries[] = [
    { key: "all", label: t("best.allTime"), color: "var(--muted-foreground)", points: pts(best.allTime), dashedFrom: xs[0] },
    { key: "prev", label: periodName(cmp, "previous"), color: "var(--chart-3)", points: pts(cmp.previousCurve), dashedFrom: cmp.previousCurve.length ? lx(cmp.previousCurve[0]) : undefined },
    { key: "cur", label: periodName(cmp, "current"), color: "var(--chart-1)", dots: true, points: pts(cmp.currentCurve) },
  ];
  // The static GAP explanation lives in the ⓘ; only say something when this data is the exception.
  const gapNote = best.gapShare == null || best.gapShare === 1 ? null : best.gapShare === 0 ? t("best.gapNone") : t("best.gapSome", { pct: Math.round(best.gapShare * 100) });
  const at = (c: CurvePoint[], d: number) => c.find((p) => p.durationS === d) ?? null;

  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {periodName(cmp, "current")} · {fmtDay(cmp.current.from, { day: "numeric", month: "short" })}–{fmtDay(cmp.current.to, { day: "numeric", month: "short" })}
          {" "}{t("best.vs")} {periodName(cmp, "previous")} · {fmtDay(cmp.previous.from, { day: "numeric", month: "short" })}–{fmtDay(cmp.previous.to, { day: "numeric", month: "short" })}
        </p>
        {best.block && (
          <SegmentedControl aria-label={t("best.compareWith")} value={kind} onChange={setKind}
            options={[{ value: "block", label: t("best.prevBlock") }, { value: "rolling", label: t("best.prev6w") }]} />
        )}
      </div>
      {best.allTime.length ? (
        <>
          <LineChart height={200} invert directLabels={false} xFormat={(x) => durationLabel(Math.exp(x))} yFormat={(v) => paceOnly(fmt, v)} series={series} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="py-1 pr-2 text-left font-medium">{t("best.duration")}</th>
                  <th className="px-2 py-1 text-right font-medium">{periodName(cmp, "current")}</th>
                  <th className="px-2 py-1 text-right font-medium">{periodName(cmp, "previous")}</th>
                  <th className="px-2 py-1 text-right font-medium">{t("best.diff")}</th>
                  <th className="py-1 pl-2 text-right font-medium">{t("best.allTime")}</th>
                </tr>
              </thead>
              <tbody>
                {TABLE_DURATIONS.map((d) => {
                  const c = at(cmp.currentCurve, d), p = at(cmp.previousCurve, d), a = at(best.allTime, d);
                  const diff = c && p ? c.paceSecPerKm - p.paceSecPerKm : null;
                  const pb = c && a && c.paceSecPerKm <= a.paceSecPerKm;
                  return (
                    <tr key={d} className="border-b border-border last:border-0">
                      <td className="py-1 pr-2">{durationLabel(d)}</td>
                      <td className="px-2 py-1 text-right font-medium">
                        {c ? <Link className="hover:underline" to={`/activities/${encodeURIComponent(c.activityId)}`} title={fmtDay(c.date)}>{paceOnly(fmt, c.paceSecPerKm)}</Link> : "–"}
                      </td>
                      <td className="px-2 py-1 text-right">{p ? paceOnly(fmt, p.paceSecPerKm) : "–"}</td>
                      <td className={`px-2 py-1 text-right ${diff != null && diff < 0 ? "text-success" : diff ? "text-muted-foreground" : ""}`}>{diff == null ? "–" : `${diff > 0 ? "+" : diff < 0 ? "−" : "±"}${Math.abs(diff)} s`}</td>
                      <td className="py-1 pl-2 text-right">{pb ? <Badge>{t("best.pb")}</Badge> : a ? <span className="text-muted-foreground">{paceOnly(fmt, a.paceSecPerKm)}</span> : "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="py-6 text-center text-sm text-muted-foreground">{best.pending ? t("best.extracting") : t("best.empty")}</p>}
      {(gapNote || best.pending > 0) && (
        <p className="mt-2 text-xs text-muted-foreground">
          {gapNote}
          {best.pending > 0 && ` ${t("best.pending", { n: best.pending })}`}
        </p>
      )}
    </>
  );
}

export function CsBody({ cs, olderTest, thresholdPace }: { cs: CsView; olderTest: CsTest | null; thresholdPace: number | null | undefined }) {
  const fmt = useFmt();
  const since = cs.before ? cs.paceSecPerKm - cs.before.paceSecPerKm : null;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge>{cs.source === "auto" ? t("cs.auto") : t("cs.fromTest")}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("cs.title")} value={fmt.pace(cs.paceSecPerKm)} sub={`D′ ${Math.round(cs.dPrimeM)} m`} />
        <Stat label={t("cs.firstThreshold")} value={fmt.pace(cs.zones.firstThreshold.pace)} sub={`${paceOnly(fmt, cs.zones.firstThreshold.paceFast)}–${paceOnly(fmt, cs.zones.firstThreshold.paceSlow)}`} />
        <Stat label={t("cs.window")} value={`${paceOnly(fmt, cs.zones.firstThreshold.pace)} → ${paceOnly(fmt, cs.zones.cs)}`} sub={t("cs.windowSub")} />
        {cs.before
          ? <Stat label={t("cs.before")} value={fmt.pace(cs.before.paceSecPerKm)} sub={since ? t("cs.sinceThen", { s: `${since < 0 ? "−" : "+"}${Math.abs(since)}` }) : t("cs.unchanged")} />
          : cs.testDate && <Stat label={t("cs.tested")} value={fmtDay(cs.testDate, { day: "numeric", month: "short" })} sub={t("cs.testWins")} />}
      </div>
      {cs.source === "auto" && cs.auto && (
        <div className="mt-3 rounded-md bg-muted p-3 text-sm">
          <div className="font-medium">{t("cs.fromEfforts", { n: cs.auto.efforts.length })}</div>
          <ul className="mt-1 space-y-0.5">
            {cs.auto.efforts.map((e) => (
              <li key={e.durationS}>
                {durationLabel(e.durationS)} · {fmt.pace(e.paceSecPerKm)} · <Link className="hover:underline" to={`/activities/${encodeURIComponent(e.activityId)}`}>{fmtDay(e.date)}</Link>
              </li>
            ))}
          </ul>
          {cs.auto.dPrimeM < LOW_D_PRIME_M && <div className="mt-1 text-xs text-warning">{t("cs.lowDPrime", { d: Math.round(cs.auto.dPrimeM), min: LOW_D_PRIME_M })}</div>}
          <div className="mt-1 text-xs text-muted-foreground">{cs.auto.r2 != null ? t("cs.fit", { r2: cs.auto.r2.toLocaleString(locale, { minimumFractionDigits: 3 }) }) : null} {t("cs.hardEfforts")}</div>
        </div>
      )}
      {cs.source === "test" && cs.auto && (
        <p className="mt-3 text-sm text-muted-foreground">{t("cs.autoWouldBe", { pace: fmt.pace(cs.auto.paceSecPerKm), date: fmtDay(cs.auto.newest, { day: "numeric", month: "short" }) })}</p>
      )}
      {olderTest && (
        <p className="mt-3 text-sm text-muted-foreground">{t("cs.olderTest", { date: fmtDay(olderTest.date, { day: "numeric", month: "short" }), pace: fmt.pace(olderTest.paceSecPerKm) })} <Link className="text-primary hover:underline" to="/settings">{t("cs.addTest")}</Link></p>
      )}
      <p className={`mt-3 text-sm ${cs.comparison?.status === "above_cs" ? "text-warning" : "text-muted-foreground"}`}>
        {!cs.comparison
          ? t("cs.noThreshold")
          : cs.comparison.status === "above_cs"
            ? t("cs.aboveCs", { pace: fmt.pace(thresholdPace), s: Math.abs(cs.comparison.gapSecPerKm) })
            : cs.comparison.gapSecPerKm <= 0 ? t("cs.aboutCs") : t("cs.belowCs", { s: cs.comparison.gapSecPerKm })}
      </p>
    </>
  );
}

export function PredictionBody({ pred, goalSeconds, distanceKm }: { pred: RacePredictionData; goalSeconds: number | null; distanceKm: number }) {
  const fmt = useFmt();
  const cur = pred.current;
  const perKm = (s: number) => s / distanceKm;
  const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  // The line starts at the first week with a prediction.
  const first = pred.history.findIndex((h) => h.seconds != null);
  const hist = first < 0 ? [] : pred.history.slice(first);
  const series: LineSeries[] = [
    { key: "fartlek", label: t("pred.fartlek"), color: "var(--chart-1)", dots: true, points: hist.map((h) => ({ x: ms(h.date), y: h.seconds })) },
  ];
  /** Axis labels to the minute: 1:48 for a half, 19:30 for a 5 km. */
  const axis = (v: number) => (v >= 3600 ? `${Math.floor(v / 3600)}:${String(Math.round((v % 3600) / 60)).padStart(2, "0")}` : fmtClock(Math.round(v / 30) * 30));
  const gap = cur && goalSeconds ? cur.seconds - goalSeconds : null;
  return (
    <div className="mt-2 space-y-3">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label={t("pred.prediction")} value={cur ? fmtClock(cur.seconds) : "–"} sub={cur ? fmt.pace(perKm(cur.seconds)) : t("pred.noData")} />
        {goalSeconds != null && <Stat label={t("pred.goal")} value={fmtClock(goalSeconds)} sub={fmt.pace(perKm(goalSeconds))} />}
        {gap != null && <Stat label={gap > 0 ? t("pred.toGoal") : t("pred.underGoal")} value={fmtClock(Math.abs(gap))} sub={pred.trendPerWeek ? t("pred.perWeek", { s: `${pred.trendPerWeek < 0 ? "−" : "+"}${Math.abs(pred.trendPerWeek)}` }) : undefined} />}
        {pred.training.weeklyKm != null && <Stat label={t("pred.volume")} value={fmt.dist(pred.training.weeklyKm)} sub={t("pred.volumeSub")} />}
      </div>
      {hist.filter((h) => h.seconds != null).length > 1 && (
        <LineChart height={180} invert xFormat={(x) => new Date(x).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" })} yFormat={axis}
          refLines={goalSeconds ? [{ y: goalSeconds, label: t("races.goal", { time: fmtClock(goalSeconds) }) }] : []} series={series} />
      )}
      {cur?.estimates && <Estimates estimates={cur.estimates} chosen={cur.seconds} />}
      {cur && (
        <p className="text-xs text-muted-foreground">
          {cur.model === "cs" ? t("pred.modelCs")
            : cur.model === "marathon" ? t("pred.modelMarathon")
            : cur.model === "between" ? t("pred.modelBetween")
            : cur.from ? t("pred.modelRiegel", { duration: durationLabel(cur.from.durationS), km: (cur.from.distanceM / 1000).toLocaleString(locale, { maximumFractionDigits: 2 }), date: fmtDay(cur.from.date, { day: "numeric", month: "short" }) }) : null}
        </p>
      )}
    </div>
  );
}

/** The marathon's estimates, each with what it rests on, so the median can be checked by hand. */
function Estimates({ estimates, chosen }: { estimates: Estimate[]; chosen: number }) {
  const fmt = useFmt();
  const detail = (e: Estimate) => {
    if (e.model === "vickers") return t("pred.est.vickers", { km: fmt.dist(e.weeklyKm) });
    if (e.model === "durability") return t("pred.est.durability", { ratio: e.ratio.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), group: t(`pred.group.${e.group}`), pct: { low: 88, moderate: 86, high: 82 }[e.group], n: e.longRuns });
    return t("pred.est.tanda", { km: fmt.dist(e.weeklyKm), pace: fmt.pace(e.meanPaceSecPerKm) }) + (e.outsideValidated ? ` ${t("pred.est.tandaOutside")}` : "");
  };
  return (
    <div className="rounded-md bg-muted p-3 text-sm">
      <div className="font-medium">{t("pred.estimates", { time: fmtClock(chosen) })}</div>
      <ul className="mt-1 space-y-1">
        {estimates.map((e) => (
          <li key={e.model}>
            <span className="font-medium tabular-nums">{fmtClock(e.seconds)}</span> · {t(`pred.est.${e.model}.name`)}
            <div className="text-xs text-muted-foreground">{detail(e)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Garmin's running VO2max: the latest value, its change over 8 weeks and a year's trend. */
export function Vo2maxBody({ data }: { data: Vo2maxData }) {
  if (!data.latest) return <p className="py-6 text-center text-sm text-muted-foreground">{t("vo2.empty")}</p>;
  const ms = (d: string) => new Date(`${d}T00:00:00Z`).getTime();
  const c = data.change8w;
  return (
    <>
      <div className="mb-2 flex items-end gap-6">
        <Stat label={t("vo2.latest")} value={data.latest.value.toLocaleString(locale, { maximumFractionDigits: 1 })} sub={fmtDay(data.latest.date, { day: "numeric", month: "short" })} />
        {c != null && <Stat label={t("vo2.change")} value={`${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(c).toLocaleString(locale, { maximumFractionDigits: 1 })}`} sub={t("vo2.changeSub")} />}
      </div>
      {data.points.length > 1 && (
        <LineChart height={140} directLabels={false} xFormat={(x) => new Date(x).toLocaleDateString(locale, { month: "short", timeZone: "UTC" })} yFormat={(v) => v.toLocaleString(locale, { maximumFractionDigits: 1 })}
          series={[{ key: "vo2", label: "VO2max", color: "var(--chart-1)", points: data.points.map((p) => ({ x: ms(p.date), y: p.value })) }]} />
      )}
    </>
  );
}
