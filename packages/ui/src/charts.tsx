import { tShared } from "@homelab/i18n";
import { svgId } from "./components";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

/*
 * Hand-rolled SVG charts. One y-axis per chart (never dual axis), 2px lines, recessive grid,
 * crosshair tooltip on lines, per-mark tooltip on bars, legend for ≥ 2 series (opt-in direct labels).
 */

/** Width of an element in CSS px, so a chart draws at its real size (text stays 11 px on a phone). */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

export function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min -= 1; max += 1; }
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

const AXIS = "var(--muted-foreground)";
const GRID = "var(--border)";

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; band?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.band
            ? <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: i.color, opacity: 0.3 }} />
            : <svg width="16" height="8" aria-hidden><line x1="0" y1="4" x2="16" y2="4" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? "3 2" : undefined} /></svg>}
          {i.label}
        </span>
      ))}
    </div>
  );
}

function Tip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(x + 12, 0), Math.max(width - 180, 0));
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-36 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs shadow-md" style={{ left }}>
      {children}
    </div>
  );
}

/**
 * Smooth path through screen points using monotone cubic interpolation (Fritsch–Carlson):
 * passes through every point and never overshoots between two neighbours, so a 0–100 % series
 * stays inside its range and no false peaks appear.
 */
export function smoothPath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n < 3) return pts.map(([x, y], i) => `${i ? "L" : "M"}${f(x)},${f(y)}`).join("");
  const h: number[] = [], d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(pts[i + 1][0] - pts[i][0]);
    d.push(h[i] ? (pts[i + 1][1] - pts[i][1]) / h[i] : 0);
  }
  const m: number[] = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
    const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b;
    if (s > 9) { const tau = 3 / Math.sqrt(s); m[i] = tau * a * d[i]; m[i + 1] = tau * b * d[i]; }
  }
  let out = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    out += `C${f(x0 + h[i] / 3)},${f(y0 + (m[i] * h[i]) / 3)},${f(x1 - h[i] / 3)},${f(y1 - (m[i + 1] * h[i]) / 3)},${f(x1)},${f(y1)}`;
  }
  return out;
}

export interface LineSeries {
  key: string;
  label: string;
  color: string;
  points: { x: number; y: number | null }[];
  /** Points with x ≥ this are drawn dashed (e.g. projections). */
  dashedFrom?: number;
  /** Draw dots on each point (sparse data). */
  dots?: boolean;
  /** Fill the area under the solid part with the series colour fading out (the main line of a chart). */
  area?: boolean;
}

export function LineChart({
  series, height = 200, xFormat, yFormat, invert = false, yPad = 0.08, refLines = [], xLines = [], xBands = [], bands = [], legend, directLabels = false, emptyText = tShared("chart.notEnough"),
}: {
  series: LineSeries[];
  height?: number;
  xFormat: (x: number) => string;
  yFormat: (y: number) => string;
  /** Lower values at the top (pace: faster is higher). */
  invert?: boolean;
  yPad?: number;
  refLines?: { y: number; label: string }[];
  /** Vertical markers (events on the x axis), labelled at the top. Dashed and muted unless given a colour ("idag" in signature). */
  xLines?: { x: number; label: string; color?: string }[];
  /** Shaded x ranges behind the lines (a chosen period), clipped to the data and labelled at the top left. Muted unless given a colour. */
  xBands?: { from: number; to: number; label?: string; color?: string }[];
  /** Shaded y ranges behind the lines (a goal zone), named in the legend. */
  bands?: { from: number; to: number; color: string; label?: string }[];
  legend?: boolean;
  /** Label each line at its end (≥ 2 series). Off by default: end labels collide when lines finish close together or have a single point, so the legend carries the names. */
  directLabels?: boolean;
  emptyText?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const areaId = svgId(useId());
  const all = series.flatMap((s) => s.points.filter((p) => p.y != null)) as { x: number; y: number }[];
  const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort((a, b) => a - b);
  const m = { l: 44, r: series.length > 1 && directLabels ? 52 : 12, t: 8, b: 22 };
  const geo = useMemo(() => {
    if (!all.length) return null;
    const ys = [...all.map((p) => p.y), ...refLines.map((r) => r.y), ...bands.flatMap((b) => [b.from, b.to])];
    let lo = Math.min(...ys), hi = Math.max(...ys);
    const pad = (hi - lo || Math.abs(hi) || 1) * yPad;
    lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi);
    lo = Math.min(lo, ticks[0]); hi = Math.max(hi, ticks.at(-1)!);
    const x0 = xs[0], x1 = xs.at(-1)!;
    const iw = Math.max(width - m.l - m.r, 10), ih = height - m.t - m.b;
    const sx = (x: number) => m.l + (x1 === x0 ? iw / 2 : ((x - x0) / (x1 - x0)) * iw);
    const sy = (y: number) => m.t + (invert ? (y - lo) / (hi - lo) : 1 - (y - lo) / (hi - lo)) * ih;
    return { sx, sy, ticks, iw, x0, x1 };
  }, [all, xs, width, height, invert, yPad, refLines, bands, m.l, m.r, m.t, m.b]);

  if (!all.length || (all.length < 2 && xs.length < 2)) return <p className="py-8 text-center text-sm text-muted-foreground">{emptyText}</p>;
  const showLegend = legend ?? series.length > 1;
  const wantTicks = xs.length <= 6 ? xs : [...new Set([0, 0.25, 0.5, 0.75, 1].map((f) => xs[Math.round(f * (xs.length - 1))]))];
  // Drop x labels that would overlap a neighbour (data can be unevenly spaced). First and last win.
  const xTicks = (() => {
    if (!geo || wantTicks.length < 3) return wantTicks;
    const gap = 8;
    const span = (x: number, i: number, n: number) => {
      const w = xFormat(x).length * 6.2, c = geo.sx(x);
      return i === 0 ? [c, c + w] : i === n - 1 ? [c - w, c] : [c - w / 2, c + w / 2];
    };
    const keep = [wantTicks[0]];
    for (let i = 1; i < wantTicks.length - 1; i++) {
      const [l] = span(wantTicks[i], i, wantTicks.length);
      const [, pr] = span(keep.at(-1)!, keep.length - 1, wantTicks.length);
      if (l >= pr + gap) keep.push(wantTicks[i]);
    }
    const last = wantTicks.at(-1)!;
    const [ll] = span(last, wantTicks.length - 1, wantTicks.length);
    while (keep.length > 1 && span(keep.at(-1)!, keep.length - 1, wantTicks.length)[1] + gap > ll) keep.pop();
    if (keep.length === 1 && span(keep[0], 0, wantTicks.length)[1] + gap > ll) return [last];
    return [...keep, last];
  })();

  const path = (pts: { x: number; y: number | null }[]) => {
    // Gaps (null) break the line; each run is smoothed on its own.
    let d = "";
    let run: [number, number][] = [];
    const flush = () => { d += smoothPath(run); run = []; };
    for (const p of pts) {
      if (p.y == null) { flush(); continue; }
      run.push([geo!.sx(p.x), geo!.sy(p.y)]);
    }
    flush();
    return d;
  };

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!geo) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = xs[0], bd = Infinity;
    for (const x of xs) { const d = Math.abs(geo.sx(x) - px); if (d < bd) { bd = d; best = x; } }
    setHover(best);
  };

  return (
    <div>
      {(showLegend || bands.some((b) => b.label)) && <Legend items={[...series.map((s) => ({ label: s.label, color: s.color })), ...bands.flatMap((b) => (b.label ? [{ label: b.label, color: b.color, band: true }] : []))]} />}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {geo && width > 0 && (
          <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
            aria-label={series.map((s) => s.label).join(", ")} className="touch-pan-y select-none">
            {geo.ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={geo.sy(t)} y2={geo.sy(t)} stroke={GRID} strokeWidth={1} />
                <text x={m.l - 6} y={geo.sy(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS}>{yFormat(t)}</text>
              </g>
            ))}
            {bands.map((b) => {
              const y0 = geo.sy(Math.max(b.from, b.to)), y1 = geo.sy(Math.min(b.from, b.to));
              const top = Math.min(y0, y1), h = Math.abs(y1 - y0);
              return (
                <rect key={`${b.from}-${b.to}`} x={m.l} y={top} width={Math.max(width - m.l - m.r, 0)} height={h} fill={b.color} fillOpacity={0.14} />
              );
            })}
            {xBands.map((b) => {
              const lo = Math.max(Math.min(b.from, b.to), geo.x0), hi = Math.min(Math.max(b.from, b.to), geo.x1);
              if (lo > hi) return null;
              const x = geo.sx(lo), w = Math.max(geo.sx(hi) - x, 2);
              return (
                <g key={`${b.from}-${b.to}`}>
                  <rect x={x} y={m.t} width={w} height={height - m.t - m.b} fill={b.color ?? "var(--foreground)"} fillOpacity={b.color ? 0.14 : 0.06} />
                  {b.label && w > 40 && <text x={x + 4} y={m.t + 10} fontSize={10} fill={AXIS}>{b.label}</text>}
                </g>
              );
            })}
            {xTicks.map((x, i) => (
              <text key={x} x={geo.sx(x)} y={height - 6} fontSize={11} fill={AXIS} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}>{xFormat(x)}</text>
            ))}
            {refLines.map((r) => (
              <g key={r.label}>
                <line x1={m.l} x2={width - m.r} y1={geo.sy(r.y)} y2={geo.sy(r.y)} stroke={AXIS} strokeDasharray="4 3" strokeWidth={1} />
                <text x={width - m.r} y={geo.sy(r.y) - 4} textAnchor="end" fontSize={10} fill={AXIS}>{r.label}</text>
              </g>
            ))}
            {xLines.filter((l) => l.x >= geo.x0 && l.x <= geo.x1).map((l, i) => {
              const x = geo.sx(l.x);
              const right = x > width - m.r - 90;
              return (
                <g key={`${l.label}-${l.x}`}>
                  <line x1={x} x2={x} y1={m.t} y2={height - m.b} stroke={l.color ?? AXIS} strokeDasharray={l.color ? undefined : "4 3"} strokeWidth={l.color ? 1.5 : 1} />
                  <text x={right ? x - 4 : x + 4} y={m.t + 10 + i * 13} textAnchor={right ? "end" : "start"} fontSize={10} fontWeight={l.color ? 600 : undefined} fill={l.color ?? "var(--foreground)"}>{l.label}</text>
                </g>
              );
            })}
            {series.map((s) => {
              const solid = s.dashedFrom != null ? s.points.filter((p) => p.x <= s.dashedFrom!) : s.points;
              const dashed = s.dashedFrom != null ? s.points.filter((p) => p.x >= s.dashedFrom!) : [];
              const last = [...s.points].reverse().find((p) => p.y != null);
              return (
                <g key={s.key}>
                  {s.area && (() => {
                    const pts = solid.filter((p) => p.y != null);
                    if (pts.length < 2) return null;
                    const gid = `${areaId}-${s.key}`;
                    const base = height - m.b;
                    return (
                      <>
                        <defs><linearGradient id={gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={s.color} stopOpacity={0.28} /><stop offset="1" stopColor={s.color} stopOpacity={0} /></linearGradient></defs>
                        <path d={`${path(pts)} L${geo.sx(pts.at(-1)!.x)},${base} L${geo.sx(pts[0].x)},${base} Z`} fill={`url(#${gid})`} />
                      </>
                    );
                  })()}
                  <path d={path(solid)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  {dashed.length > 1 && <path d={path(dashed)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray="4 4" />}
                  {s.dots && s.points.map((p, i) => p.y != null && (
                    <circle key={`${p.x}-${i}`} cx={geo.sx(p.x)} cy={geo.sy(p.y)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                  ))}
                  {series.length > 1 && directLabels && last && last.y != null && (
                    <text x={geo.sx(last.x) + 6} y={geo.sy(last.y)} dominantBaseline="middle" fontSize={11} fill="var(--foreground)">{s.label}</text>
                  )}
                </g>
              );
            })}
            {hover != null && (
              <g>
                <line x1={geo.sx(hover)} x2={geo.sx(hover)} y1={m.t} y2={height - m.b} stroke={AXIS} strokeWidth={1} />
                {series.map((s) => {
                  const p = s.points.find((q) => q.x === hover);
                  return p?.y != null ? <circle key={s.key} cx={geo.sx(hover)} cy={geo.sy(p.y)} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} /> : null;
                })}
              </g>
            )}
          </svg>
        )}
        {hover != null && geo && (
          <Tip x={geo.sx(hover)} width={width}>
            <div className="mb-1 font-medium">{xFormat(hover)}</div>
            {series.map((s) => {
              const p = s.points.find((q) => q.x === hover);
              return p?.y != null ? (
                <div key={s.key} className="flex items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-full" style={{ background: s.color }} />{s.label}</span>
                  <span className="tabular-nums">{yFormat(p.y)}</span>
                </div>
              ) : null;
            })}
          </Tip>
        )}
      </div>
    </div>
  );
}

export interface Bar {
  key: string;
  label: string;
  value: number;
  /** Plan tick drawn across the bar. */
  marker?: number | null;
  /** Drawn as an outline (e.g. future planned weeks). */
  ghost?: boolean;
  /** The bar in progress (this week): signature colour, with what is left to the marker as a dashed outline. */
  current?: boolean;
  tip: ReactNode;
}

export function BarChart({ bars, height = 200, yFormat, color = "var(--chart-1)", avg, markerLabel = tShared("chart.plan"), valueLabel = tShared("chart.actual") }: {
  bars: Bar[];
  height?: number;
  yFormat: (y: number) => string;
  color?: string;
  avg?: number | null;
  markerLabel?: string;
  valueLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <p className="py-8 text-center text-sm text-muted-foreground">{tShared("chart.noData")}</p>;
  const m = { l: 40, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...bars.map((b) => Math.max(b.value, b.marker ?? 0)), avg ?? 0);
  const ticks = niceTicks(0, max);
  const top = Math.max(max, ticks.at(-1)!);
  const iw = Math.max(width - m.l - m.r, 10), ih = height - m.t - m.b;
  const slot = iw / bars.length;
  const bw = Math.max(Math.min(slot - 2, 28), 2);
  const sy = (v: number) => m.t + ih - (v / top) * ih;
  const every = Math.ceil(bars.length / Math.max(Math.floor(iw / 48), 1));
  const hasMarkers = bars.some((b) => b.marker != null);

  return (
    <div>
      {(hasMarkers || avg != null) && (
        <div className="mb-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: color }} />{valueLabel}</span>
          {hasMarkers && <span className="inline-flex items-center gap-1.5"><span className="inline-block h-0.5 w-3 bg-foreground" />{markerLabel}</span>}
          {avg != null && <span className="inline-flex items-center gap-1.5"><svg width="14" height="4" aria-hidden><line x1="0" y1="2" x2="14" y2="2" stroke={AXIS} strokeDasharray="3 2" /></svg>{tShared("chart.average")}</span>}
        </div>
      )}
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} onPointerLeave={() => setHover(null)} role="img" aria-label={valueLabel} className="touch-pan-y select-none">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={width - m.r} y1={sy(t)} y2={sy(t)} stroke={GRID} />
                <text x={m.l - 6} y={sy(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS}>{yFormat(t)}</text>
              </g>
            ))}
            {bars.map((b, i) => {
              const cx = m.l + slot * i + slot / 2;
              const h = Math.max(ih - (sy(b.value) - m.t), b.value > 0 ? 2 : 0);
              const y = m.t + ih - h;
              const r = Math.min(4, bw / 2, h);
              const d = h > 0 ? `M${cx - bw / 2},${m.t + ih} V${y + r} Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y} H${cx + bw / 2 - r} Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r} V${m.t + ih} Z` : "";
              return (
                <g key={b.key} onPointerEnter={() => setHover(i)}>
                  <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
                  {b.current && b.marker != null && b.marker > b.value && (
                    <rect x={cx - bw / 2} y={sy(b.marker)} width={bw} height={Math.max(sy(b.value) - sy(b.marker), 0)} rx={Math.min(4, bw / 2)} fill="none" stroke="var(--signature)" strokeWidth={1.5} strokeDasharray="3 2" />
                  )}
                  {d && <path d={d} fill={b.ghost ? "none" : b.current ? "var(--signature)" : color} stroke={b.ghost ? (b.current ? "var(--signature)" : color) : "none"} strokeWidth={b.ghost ? 1.5 : 0} strokeDasharray={b.ghost ? "3 2" : undefined} opacity={hover != null && hover !== i ? 0.55 : 1} />}
                  {b.marker != null && b.marker > 0 && (!b.current || b.value >= b.marker) && <line x1={cx - bw / 2 - 2} x2={cx + bw / 2 + 2} y1={sy(b.marker)} y2={sy(b.marker)} stroke="var(--foreground)" strokeWidth={2} strokeLinecap="round" />}
                  {i % every === 0 && <text x={cx} y={height - 6} fontSize={11} fill={AXIS} textAnchor="middle">{b.label}</text>}
                </g>
              );
            })}
            {avg != null && avg > 0 && <line x1={m.l} x2={width - m.r} y1={sy(avg)} y2={sy(avg)} stroke={AXIS} strokeDasharray="4 3" />}
          </svg>
        )}
        {hover != null && width > 0 && <Tip x={m.l + slot * hover + slot / 2} width={width}>{bars[hover].tip}</Tip>}
      </div>
    </div>
  );
}

/** 100 % stacked bars with a 2px surface gap between segments. */
export function StackedBars({ bars, parts, height = 160 }: {
  bars: { key: string; label: string; values: number[]; tip: ReactNode }[];
  parts: { label: string; color: string }[];
  height?: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (!bars.length) return <p className="py-8 text-center text-sm text-muted-foreground">{tShared("chart.noData")}</p>;
  const m = { l: 36, r: 8, t: 4, b: 22 };
  const iw = Math.max(width - m.l - m.r, 10), ih = height - m.t - m.b;
  const slot = iw / bars.length;
  const bw = Math.max(Math.min(slot - 2, 28), 2);
  const every = Math.ceil(bars.length / Math.max(Math.floor(iw / 48), 1));
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 text-xs text-muted-foreground">
        {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}
      </div>
      <div ref={ref} className="relative w-full" style={{ height }}>
        {width > 0 && (
          <svg width={width} height={height} onPointerLeave={() => setHover(null)} role="img" aria-label={parts.map((p) => p.label).join(", ")} className="touch-pan-y select-none">
            {[0, 50, 100].map((t) => (
              <text key={t} x={m.l - 6} y={m.t + ih - (t / 100) * ih} textAnchor="end" dominantBaseline="middle" fontSize={11} fill={AXIS}>{t}%</text>
            ))}
            {bars.map((b, i) => {
              const total = b.values.reduce((a, v) => a + v, 0);
              const x = m.l + slot * i + (slot - bw) / 2;
              let y = m.t + ih;
              return (
                <g key={b.key} onPointerEnter={() => setHover(i)} opacity={hover != null && hover !== i ? 0.55 : 1}>
                  <rect x={m.l + slot * i} y={m.t} width={slot} height={ih} fill="transparent" />
                  {total > 0 ? b.values.map((v, j) => {
                    const h = (v / total) * ih;
                    y -= h;
                    return h > 0 ? <rect key={j} x={x} y={y + 1} width={bw} height={Math.max(h - 2, 0.5)} rx={2} fill={parts[j].color} /> : null;
                  }) : <rect x={x} y={m.t + ih - 1} width={bw} height={1} fill={GRID} />}
                  {i % every === 0 && <text x={x + bw / 2} y={height - 6} fontSize={11} fill={AXIS} textAnchor="middle">{b.label}</text>}
                </g>
              );
            })}
          </svg>
        )}
        {hover != null && width > 0 && <Tip x={m.l + slot * hover + slot / 2} width={width}>{bars[hover].tip}</Tip>}
      </div>
    </div>
  );
}

/** Tiny inline trend line for pain levels etc. */
export function Sparkline({ values, max = 10, width = 64, height = 20, color = "var(--chart-2)" }: { values: number[]; max?: number; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * (width - 4) + 2},${height - 2 - (v / max) * (height - 4)}`).join(" ");
  return <svg width={width} height={height} aria-hidden><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /></svg>;
}
