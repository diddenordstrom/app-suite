import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { compare, type SessionPoint } from "../shared/samesession";
import { amountText, targetText, type WorkoutSteps } from "../shared/steps";
import { toDate } from "../shared/dates";
import { fmtDay } from "./bits";
import { useApi } from "./http";
import { lang, locale, t } from "./i18n";
import { useFmt } from "./prefs";
import { Card, CardTitle, InfoTip, LineChart, SegmentedControl, Select, cn, niceTicks } from "./ui";

/*
 * The same session over time (docs/decisions/fartlek-same-session.md): a card on the activity page
 * for runs of a structured session, and one on Trends to pick an outline and follow it. The grouping
 * and numbers come from shared/samesession.ts, worked out on the server.
 */

const stepLang = lang === "sv" ? "sv" : "en";
export interface Outline { signature: string; work: WorkoutSteps; points: SessionPoint[] }

const ms = (d: string) => toDate(d).getTime();
const dayLabel = (x: number) => new Date(x).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });

/** "3×8 min tröskel", "2×15 min tröskel + 3 km z3": the outline as the runner reads it. */
export function outlineLabel(w: WorkoutSteps, units: "metric" | "imperial"): string {
  return w.items.map((it) => {
    const def = it.kind === "repeat" ? it.work : it.step;
    const word = targetText(def.target, stepLang, units).replace(/^@/, "");
    return `${it.kind === "repeat" && it.times > 1 ? `${it.times}×` : ""}${amountText(def, units)} ${word}`;
  }).join(" + ");
}

/** "6:e", "1:a" / "6th", "1st". */
function ordinal(n: number): string {
  if (stepLang === "sv") return `${n}:${n % 10 === 1 || n % 10 === 2 ? (n % 100 === 11 || n % 100 === 12 ? "e" : "a") : "e"}`;
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${s}`;
}

const sign = (v: number, d = 0) => `${v > 0 ? "+" : v < 0 ? "−" : "±"}${Math.abs(v).toFixed(d).replace(".", stepLang === "sv" ? "," : ".")}`;
/** Faster and lower HR are better: green, else muted (never red: one slow day is not a verdict). */
const good = (v: number | null) => (v != null && v < 0 ? "text-success" : "text-muted-foreground");

function useOutlinePace() {
  const fmt = useFmt();
  return (s: number | null) => (s == null ? "–" : fmt.pace(s).split("/")[0]);
}

/* ---------- Pace and HR in one chart ---------- */

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/**
 * GAP pace on the left axis and HR on the right, both turned so that up is better (faster, lower HR),
 * x by real date so gaps between runs show. Hover (or tap) a run for its numbers and context.
 */
export function PaceHrChart({ points, height = 220 }: { points: SessionPoint[]; height?: number }) {
  const fmt = useFmt();
  const pace = useOutlinePace();
  const [ref, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const m = { l: 44, r: 40, t: 10, b: 22 };
  const w = Math.max(0, width - m.l - m.r), h = height - m.t - m.b;
  const xs = points.map((p) => ms(p.date));
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const X = (x: number) => m.l + (x1 > x0 ? ((x - x0) / (x1 - x0)) * w : w / 2);
  const gaps = points.map((p) => p.gap);
  const hrs = points.map((p) => p.hr).filter((v): v is number => v != null);
  const pt = niceTicks(Math.min(...gaps) - 1, Math.max(...gaps) + 1, 4);
  const ht = hrs.length ? niceTicks(Math.min(...hrs) - 1, Math.max(...hrs) + 1, 4) : [];
  // Inverted: the low end (fast pace, low HR) at the top.
  const Yp = (v: number) => m.t + ((v - pt[0]) / (pt.at(-1)! - pt[0] || 1)) * h;
  const Yh = (v: number) => m.t + ((v - ht[0]) / ((ht.at(-1) ?? 1) - (ht[0] ?? 0) || 1)) * h;
  const line = (f: (p: SessionPoint) => number | null, Y: (v: number) => number) =>
    points.map((p, i) => [X(xs[i]), f(p)] as const).filter(([, v]) => v != null).map(([x, v], i) => `${i ? "L" : "M"}${x.toFixed(1)},${Y(v!).toFixed(1)}`).join(" ");
  const first = points[0], last = points.at(-1)!;
  const summary = t("same.chartAria", { n: points.length, from: pace(first.gap), to: pace(last.gap), hrFrom: first.hr != null ? Math.round(first.hr) : "–", hrTo: last.hr != null ? Math.round(last.hr) : "–" });
  const hp = hover != null ? points[hover] : null;
  return (
    <div className="space-y-1.5">
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        {width > 0 && (
          <svg role="img" aria-label={summary} width={width} height={height} className="block"
            onMouseMove={(e) => {
              const r = e.currentTarget.getBoundingClientRect(); const px = e.clientX - r.left;
              let best = 0; xs.forEach((x, i) => { if (Math.abs(X(x) - px) < Math.abs(X(xs[best]) - px)) best = i; }); setHover(best);
            }}>
            {pt.map((v) => <line key={v} x1={m.l} x2={m.l + w} y1={Yp(v)} y2={Yp(v)} stroke="var(--border)" />)}
            {pt.map((v) => <text key={`p${v}`} x={m.l - 6} y={Yp(v) + 4} textAnchor="end" fontSize={11} fill="var(--muted-foreground)">{pace(v)}</text>)}
            {ht.map((v) => <text key={`h${v}`} x={m.l + w + 6} y={Yh(v) + 4} fontSize={11} fill="var(--muted-foreground)">{Math.round(v)}</text>)}
            <path d={line((p) => p.hr, Yh)} fill="none" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 4" />
            {points.map((p, i) => p.hr != null && <rect key={`hr${i}`} x={X(xs[i]) - 4} y={Yh(p.hr) - 4} width={8} height={8} fill="var(--chart-4)" />)}
            <path d={line((p) => p.gap, Yp)} fill="none" stroke="var(--signature)" strokeWidth={2.5} />
            {points.map((p, i) => <circle key={`g${i}`} cx={X(xs[i])} cy={Yp(p.gap)} r={i === points.length - 1 ? 5.5 : 4} fill="var(--signature)" stroke="var(--card)" strokeWidth={i === points.length - 1 ? 2 : 0} />)}
            {[0, points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => (
              <text key={`x${i}`} x={X(xs[i])} y={height - 6} textAnchor={i === 0 ? "start" : "end"} fontSize={11} fill="var(--muted-foreground)">{dayLabel(xs[i])}</text>
            ))}
            {hover != null && <line x1={X(xs[hover])} x2={X(xs[hover])} y1={m.t} y2={m.t + h} stroke="var(--muted-foreground)" strokeDasharray="2 3" />}
          </svg>
        )}
        {hp && (
          <div className="pointer-events-none absolute top-1 z-10 rounded-md bg-foreground px-2.5 py-1.5 text-xs text-background shadow-lg"
            style={{ left: Math.min(Math.max(0, X(xs[hover!]) - 80), Math.max(0, width - 170)) }}>
            <div className="font-semibold">{fmtDay(hp.date, { day: "numeric", month: "short" })} · {t("same.nth", { nth: ordinal(hover! + 1) })}</div>
            <div>{t("same.gap")}: {pace(hp.gap)}/{fmt.unit}</div>
            <div>{t("same.hr")}: {hp.hr != null ? Math.round(hp.hr) : "–"}{hp.tsb != null && ` · ${t("same.form", { tsb: sign(Math.round(hp.tsb)) })}`}</div>
            {hp.elevGain != null && <div>{t("same.elev", { m: Math.round(hp.elevGain) })}</div>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-[3px] w-3.5 bg-signature" />{t("same.legendPace")}</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden className="w-3.5 border-t-2 border-dashed" style={{ borderColor: "var(--chart-4)" }} />{t("same.legendHr")}</span>
      </div>
    </div>
  );
}

/* ---------- Activity page ---------- */

export function SameSessionCard({ activityId }: { activityId: string }) {
  const fmt = useFmt();
  const pace = useOutlinePace();
  const { data } = useApi<{ outline: Outline | null; minTimes: number }>(`/activities/${encodeURIComponent(activityId)}/same-session`);
  const o = data?.outline;
  if (!o) return null;
  const label = outlineLabel(o.work, fmt.units);
  const n = o.points.length;
  const p = o.points[n - 1];
  if (n < data.minTimes) {
    return (
      <Card className="space-y-1">
        <CardTitle>{t("same.title")}</CardTitle>
        <p className="text-sm text-muted-foreground">{t("same.tooEarly", { label, nth: ordinal(n), left: data.minTimes - n })}</p>
      </Card>
    );
  }
  const c = compare(o.points, n - 1);
  const prev = o.points[n - 2];
  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("same.title")}</CardTitle>
        <span className="rounded-full bg-signature-soft px-2.5 py-0.5 text-xs font-medium text-signature-foreground">
          {t("same.chip", { label, nth: ordinal(n), date: fmtDay(o.points[0].date, { day: "numeric", month: "short" }) })}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label={t("same.gap")} value={pace(p.gap)} unit={`/${fmt.unit}`}
          note={c.prev ? t(c.prev.gap <= 0 ? "same.fasterPrev" : "same.slowerPrev", { s: Math.abs(Math.round(c.prev.gap)) }) : null} tone={good(c.prev?.gap ?? null)} />
        <Figure label={t("same.hr")} value={p.hr != null ? String(Math.round(p.hr)) : "–"} unit={t("same.bpm")}
          note={c.prev?.hr != null ? t(c.prev.hr <= 0 ? "same.lowerPrev" : "same.higherPrev", { n: Math.abs(Math.round(c.prev.hr)) }) : null} tone={good(c.prev?.hr ?? null)} />
        <Figure label={t("same.eff")} value={c.first?.eff != null ? sign(c.first.eff * 100, 1) : "–"} unit={t("same.sinceFirst")}
          note={t("same.effUnit")} tone="text-muted-foreground" info={t("same.effInfo")} />
      </div>
      <PaceHrChart points={o.points} height={160} />
      {c.prev && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">{t("same.repsVsPrev", { date: fmtDay(prev.date, { day: "numeric", month: "short" }) })}</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {p.reps.map((r, k) => (
              <div key={k} className="rounded-md border border-border px-2.5 py-2 tabular-nums">
                <div className="text-xs text-muted-foreground">{t("same.rep", { n: k + 1 })}</div>
                <div className="text-sm font-semibold">{pace(r.gap)}{r.hr != null && ` · ${Math.round(r.hr)}`}</div>
                {c.prev!.reps[k] != null && <div className={cn("text-xs", good(c.prev!.reps[k]))}>{t("same.sPerKm", { v: sign(Math.round(c.prev!.reps[k]!)) })}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          {p.tsb != null && t("same.formThatDay", { tsb: sign(Math.round(p.tsb)), prev: prev.tsb != null ? sign(Math.round(prev.tsb)) : "–" })}
          {p.elevGain != null && ` · ${t("same.elev", { m: Math.round(p.elevGain) })}`}
        </span>
        <Link to="/trends#same" className="text-sm font-semibold text-primary hover:underline">{t("same.allOnTrends")}</Link>
      </div>
    </Card>
  );
}

function Figure({ label, value, unit, note, tone, info }: { label: string; value: string; unit: string; note: string | null; tone: string; info?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">{label}{info && <InfoTip label={label}>{info}</InfoTip>}</div>
      <div className="text-2xl font-semibold tabular-nums">{value} <span className="text-xs font-normal text-muted-foreground">{unit}</span></div>
      {note && <div className={cn("text-xs font-medium", tone)}>{note}</div>}
    </div>
  );
}

/* ---------- Trends ---------- */

type View = "both" | "eff";

export function SameSessionTrends() {
  const fmt = useFmt();
  const pace = useOutlinePace();
  const { data } = useApi<{ outlines: Outline[]; minTimes: number }>("/trends/same-sessions");
  const [sig, setSig] = useState<string | null>(null);
  const [view, setView] = useState<View>("both");
  const list = data?.outlines ?? [];
  const o = list.find((x) => x.signature === sig) ?? list[0];
  const enough = !!o && o.points.length >= (data?.minTimes ?? 3);
  const c = enough ? compare(o.points, o.points.length - 1) : null;
  return (
    <Card id="same" data-tour="trends-same" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>{t("same.title")}</CardTitle>
        {list.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <Select aria-label={t("same.outline")} value={o?.signature} onChange={(e) => setSig(e.target.value)} className="h-9 w-auto text-sm">
              {list.map((x) => <option key={x.signature} value={x.signature}>{`${outlineLabel(x.work, fmt.units)} (${x.points.length})`}</option>)}
            </Select>
            <SegmentedControl aria-label={t("same.view")} value={view} onChange={setView}
              options={[{ value: "both", label: t("same.v.both") }, { value: "eff", label: t("same.v.eff") }]} />
          </div>
        )}
      </div>
      {!o && <p className="text-sm text-muted-foreground">{t("same.none")}</p>}
      {o && !enough && <p className="text-sm text-muted-foreground">{t("same.tooEarlyTrends", { left: (data?.minTimes ?? 3) - o.points.length })}</p>}
      {o && enough && (
        <>
          {view === "both" ? <PaceHrChart points={o.points} /> : (
            <LineChart height={220} xFormat={dayLabel} yFormat={(v) => v.toFixed(2)}
              series={[{ key: "eff", label: t("same.effUnit"), color: "var(--signature)", dots: true, points: o.points.map((x) => ({ x: ms(x.date), y: x.eff })) }]} />
          )}
          <div className="grid grid-cols-3 gap-2 rounded-md bg-muted p-3 tabular-nums">
            <div><div className="text-xs text-muted-foreground">{t("same.gapSince", { date: fmtDay(c!.first!.date, { day: "numeric", month: "short" }) })}</div><div className="text-lg font-semibold">{t("same.sPerKm", { v: sign(Math.round(c!.first!.gap)) })}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("same.hrSince")}</div><div className="text-lg font-semibold">{c!.first!.hr != null ? `${sign(Math.round(c!.first!.hr))} ${t("same.bpm")}` : "–"}</div></div>
            <div><div className="text-xs text-muted-foreground">{t("same.eff")}</div><div className="text-lg font-semibold">{c!.first!.eff != null ? `${sign(c!.first!.eff * 100, 1)} %` : "–"}</div></div>
          </div>
          <ul className="space-y-0.5 text-xs text-muted-foreground">
            {o.points.slice(-4).reverse().map((x) => (
              <li key={x.activityId}>
                <Link className="hover:underline" to={`/activities/${encodeURIComponent(x.activityId)}`}>{fmtDay(x.date)}</Link>
                {` · ${pace(x.gap)}/${fmt.unit}`}{x.hr != null && ` · ${Math.round(x.hr)} ${t("same.bpm")}`}
                {x.tsb != null && ` · ${t("same.form", { tsb: sign(Math.round(x.tsb)) })}`}{x.elevGain != null && ` · ${t("same.elev", { m: Math.round(x.elevGain) })}`}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="text-xs text-muted-foreground">{t("same.how")}</p>
    </Card>
  );
}
