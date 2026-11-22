import { useMemo, useState, type PointerEvent } from "react";
import { niceTicks } from "@homelab/ui";
import { fmtDuration } from "../shared/format";
import type { ActivityDetail } from "./types";
import { t } from "./i18n";
import { useFmt } from "./prefs";

/*
 * The activity's curves as stacked panels on one time axis (docs/decisions/fartlek-structured-workouts.md):
 * pace with elevation shaded behind it (elevation is what explains a slow stretch), heart rate, and
 * cadence. Each panel stays readable on its own; one crosshair runs through all of them, and the line
 * above reads out every value at that moment.
 */

type Point = ActivityDetail["series"][number];
type Key = "pace" | "hr" | "cad";

const H = 100; // viewBox height of every panel; the box itself sets the drawn height
/** Label column beside each panel: narrower on phones. */
const COLS = "grid grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4.5rem_minmax(0,1fr)]";

interface Panel { key: Key; label: string; color: string; height: number; invert: boolean; top: string; bottom: string; d: string; area: string | null; targets: { x: number; w: number; y: number; h: number }[] }

/** A planned step's time span (activity seconds) and, when it is judged on pace, its target (s/km). */
export interface CurveBand { from: number; to: number; pace: [number, number] | null }

/** Domain from the 2nd to 98th percentile, padded, so one GPS spike doesn't flatten the curve. */
function domain(vals: number[], pad = 0.08): [number, number] {
  const s = [...vals].sort((a, b) => a - b);
  let lo = s[Math.floor(s.length * 0.02)], hi = s[Math.min(s.length - 1, Math.ceil(s.length * 0.98) - 1)];
  if (hi - lo < 1) { lo -= 1; hi += 1; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

/** A line through the points, broken where a value is missing. */
function linePath(series: Point[], x: (t: number) => number, val: (p: Point) => number | null, y: (v: number) => number): string {
  let d = "", open = false;
  for (const p of series) {
    const v = val(p);
    if (v == null) { open = false; continue; }
    d += `${open ? "L" : "M"}${x(p.t).toFixed(1)} ${y(v).toFixed(1)} `;
    open = true;
  }
  return d.trim();
}

export function Curves({ series, bands: bandsIn = [] }: { series: Point[]; bands?: CurveBand[] }) {
  // The caller builds bands on every render; keep the same array while they are the same, so the
  // paths aren't rebuilt on every pointer move.
  const bandsKey = JSON.stringify(bandsIn);
  const bands = useMemo(() => JSON.parse(bandsKey) as CurveBand[], [bandsKey]);
  const fmt = useFmt();
  const [hover, setHover] = useState<number | null>(null);
  const imperial = fmt.units === "imperial";
  const elev = (m: number) => `${Math.round(imperial ? m * 3.28084 : m)} ${imperial ? "ft" : "m"}`;
  const paceOf = (p: Point) => (p.pace && p.pace < 900 ? p.pace : null);

  const view = useMemo(() => {
    const t0 = series[0]?.t ?? 0, t1 = series.at(-1)?.t ?? 1;
    const x = (tt: number) => ((tt - t0) / Math.max(1, t1 - t0)) * 1000;
    const scale = ([lo, hi]: [number, number], invert: boolean) => (v: number) => Math.min(H, Math.max(0, (invert ? (v - lo) / (hi - lo) : 1 - (v - lo) / (hi - lo)) * H));
    const panels: Panel[] = [];

    const paces = series.map(paceOf).filter((v): v is number => v != null);
    if (paces.length > 1) {
      const dom = domain(paces);
      const alts = series.map((p) => p.alt).filter((v): v is number => v != null);
      let area: string | null = null;
      if (alts.length > 1) {
        // Elevation gets the lower 60 % of the panel so it stays behind the pace line, not on it.
        const [alo, ahi] = domain(alts, 0);
        const ay = (v: number) => H - ((v - alo) / Math.max(1, ahi - alo)) * H * 0.6;
        const top = linePath(series, x, (p) => p.alt, ay);
        if (top) area = `${top} L1000 ${H} L0 ${H} Z`;
      }
      const y = scale(dom, true);
      const targets = bands.filter((b) => b.pace).map((b) => {
        const top = y(b.pace![0]), bottom = y(b.pace![1]);
        return { x: x(b.from), w: x(b.to) - x(b.from), y: Math.min(top, bottom), h: Math.max(1.5, Math.abs(bottom - top)) };
      });
      panels.push({ key: "pace", label: t("stat.pace"), color: "var(--chart-1)", height: 140, invert: true,
        top: fmt.pace(dom[0]).split("/")[0], bottom: fmt.pace(dom[1]).split("/")[0], d: linePath(series, x, paceOf, y), area, targets });
    }
    const hrs = series.map((p) => p.hr).filter((v): v is number => v != null);
    if (hrs.length > 1) {
      const dom = domain(hrs);
      panels.push({ key: "hr", label: t("stat.heartRate"), color: "var(--chart-2)", height: 96, invert: false,
        top: String(Math.round(dom[1])), bottom: String(Math.round(dom[0])), d: linePath(series, x, (p) => p.hr, scale(dom, false)), area: null, targets: [] });
    }
    // Cadence below 100 spm is standing or walking; leaving it out keeps the running range readable.
    const cadOf = (p: Point) => (p.cad != null && p.cad > 100 ? p.cad : null);
    const cads = series.map(cadOf).filter((v): v is number => v != null);
    if (cads.length > 1) {
      const dom = domain(cads);
      panels.push({ key: "cad", label: t("stat.cadence"), color: "var(--chart-4)", height: 72, invert: false,
        top: String(Math.round(dom[1])), bottom: String(Math.round(dom[0])), d: linePath(series, x, cadOf, scale(dom, false)), area: null, targets: [] });
    }
    const ticks = niceTicks(0, (t1 - t0) / 60, 5).filter((m) => m * 60 <= t1 - t0).map((m) => ({ left: (x(t0 + m * 60) / 10), label: fmtDuration(m * 60) }));
    const spans = bands.map((b) => ({ x: x(b.from), w: x(b.to) - x(b.from) }));
    return { panels, ticks, spans, hasAlt: panels[0]?.area != null };
  }, [series, fmt, bands]);

  if (!view.panels.length) return null;

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
  };
  const idx = hover == null ? null : Math.round(hover * (series.length - 1));
  const p = idx == null ? null : series[idx];
  const readout = p ? [
    fmtDuration(p.t),
    paceOf(p) != null ? `${t("stat.pace").toLowerCase()} ${fmt.pace(paceOf(p))}` : null,
    p.hr != null ? `${t("stat.hr").toLowerCase()} ${Math.round(p.hr)}` : null,
    p.cad != null && p.cad > 100 ? `${t("stat.cadence").toLowerCase()} ${Math.round(p.cad)}` : null,
    p.alt != null ? `${t("stat.elevation").toLowerCase()} ${elev(p.alt)}` : null,
  ].filter(Boolean).join(" · ") : null;

  return (
    <div className="space-y-1.5">
      <div className="text-xs sm:text-sm">
        <span aria-live="polite" className={`block min-h-5 tabular-nums ${readout ? "" : "text-muted-foreground"}`}>
          {readout ?? [t("activity.curvesHint"), view.hasAlt ? t("activity.elevationBehind") : null, bands.length ? t("pva.bandsLegend") : null].filter(Boolean).join(" ")}
        </span>
      </div>
      {view.panels.map((pn) => (
        <div key={pn.key} className={`${COLS} gap-2`}>
          <div className="flex flex-col justify-between py-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
            <span>{pn.top}</span>
            <span className="text-xs font-semibold" style={{ color: pn.color }}>{pn.label}</span>
            <span>{pn.bottom}</span>
          </div>
          <div className="relative cursor-crosshair touch-pan-y border-b border-border" style={{ height: pn.height }}
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)}>
            <svg role="img" aria-label={t("activity.curveOver", { metric: pn.label })} viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
              {view.spans.map((b, k) => <rect key={k} x={b.x} y={0} width={b.w} height={H} fill="var(--signature)" opacity={0.08} />)}
              {pn.area && <path d={pn.area} fill="var(--muted-foreground)" opacity={0.16} />}
              {pn.targets.map((b, k) => <rect key={k} x={b.x} y={b.y} width={b.w} height={b.h} fill="var(--signature)" opacity={0.22} />)}
              <path d={pn.d} fill="none" stroke={pn.color} strokeWidth={1.6} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </svg>
            {hover != null && <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-foreground/60" style={{ left: `${hover * 100}%` }} />}
          </div>
        </div>
      ))}
      <div className={`${COLS} gap-2 text-[11px] tabular-nums text-muted-foreground`}>
        <span />
        <div className="relative h-4">
          {view.ticks.map((tk) => <span key={tk.label} className="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full" style={{ left: `${tk.left}%` }}>{tk.label}</span>)}
        </div>
      </div>
    </div>
  );
}
