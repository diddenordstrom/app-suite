import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFmt } from "./prefs";
import { Card, CardTitle, ChartCard, InfoTip, cn, useWidth } from "./ui";
import { fmtDay } from "./bits";
import { locale, t } from "./i18n";
import type { DurabilityRow } from "./types";
import { DRIFT, driftZone, type DriftZone } from "@/shared/activitylog";
import { toDate } from "@/shared/dates";

const TONE = { stable: "var(--success)", fading: "var(--warning)", high: "var(--danger)" } as const;
/** Colour only says something when there is something to watch: holding up stays neutral. */
const INK = { stable: "var(--foreground)", fading: "var(--warning)", high: "var(--danger)" } as const;
const HEAD = { stable: undefined, fading: "warning", high: "danger" } as const;
const BADGE = { stable: "neutral", fading: "warning", high: "danger" } as const;
const ZONES: DriftZone[] = ["stable", "fading", "high"];
const signed = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const day = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

/**
 * Durability in one card: the latest drift as the big number, the drift per long run on zone bands
 * (named in a small scale under the chart, so the plot keeps the card's full width on a phone) and the
 * three thirds of the picked run underneath.
 */
export function DurabilityCard({ rows: unsorted, info, className }: { rows: DurabilityRow[]; info: string; className?: string }) {
  const rows = useMemo(() => [...unsorted].sort((a, b) => a.date.localeCompare(b.date)), [unsorted]);
  const fmt = useFmt();
  const [picked, setPicked] = useState<string | null>(null);
  const title = t("durability.title");
  if (rows.length < 2) {
    return (
      <Card className={className}>
        <CardTitle className="mb-0"><span className="flex items-center gap-1">{title}<InfoTip label={title}>{info}</InfoTip></span></CardTitle>
        <p className="py-8 text-center text-sm text-muted-foreground">{t("durability.empty")}</p>
      </Card>
    );
  }

  const last = rows[rows.length - 1];
  const sel = rows.find((r) => r.id === picked) ?? last;
  const zone = driftZone(last.driftPct);
  const first = sel.thirds[0];

  return (
    <ChartCard className={className} title={title} info={info} sub={t("durability.sub")}
      headline={{
        value: <>{signed(last.driftPct)}<span className="ml-1 text-2xl">%</span></>,
        tone: HEAD[zone],
        badge: { label: t(`durability.zone.${zone}`), tone: BADGE[zone] },
        context: t("durability.latest", { date: day(last.date) }),
      }}>
      <DriftChart rows={rows} sel={sel} onPick={setPicked} />
      <div className="mt-2 grid grid-cols-3 gap-1 pl-7" role="img" aria-label={ZONES.map((z) => `${t(`durability.zone.${z}`)} ${range(z)}`).join(", ")}>
        {ZONES.map((z) => (
          <div key={z} className="flex flex-col gap-1">
            <span className={cn("h-1 rounded-full", z !== zone && "opacity-60")} style={{ background: TONE[z] }} />
            <span className={cn("text-[11px] leading-tight", z === zone ? "font-semibold" : "text-muted-foreground")} style={z === zone ? { color: INK[z] } : undefined}>
              {t(`durability.zone.${z}`)}<br />{range(z)}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{t("durability.pick")}</p>

      <div className="mt-3 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-2">
          <Link to={`/activities/${encodeURIComponent(sel.id)}`} className="truncate text-sm font-medium hover:underline">{day(sel.date)} · {sel.name}</Link>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{signed(sel.driftPct)} % · {fmt.dist(sel.km)}</span>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {sel.thirds.map((third, i) => {
            const dPace = Math.round(third.pace - first.pace), dHr = third.hr - first.hr;
            const worse = i === 2 && driftZone(sel.driftPct) !== "stable";
            return (
              <div key={i} className="min-w-0">
                <div className="text-xs text-muted-foreground">{[t("durability.firstShort"), t("durability.middleShort"), t("durability.lastShort")][i]}</div>
                <div className="font-display text-2xl leading-tight font-medium tabular-nums" style={worse ? { color: INK[driftZone(sel.driftPct)] } : undefined}>
                  {fmt.pace(third.pace).split("/")[0]}<span className="ml-0.5 font-sans text-xs text-muted-foreground">/{fmt.pace(third.pace).split("/")[1]}</span>
                </div>
                <div className="truncate text-xs text-muted-foreground tabular-nums" style={worse ? { color: INK[driftZone(sel.driftPct)] } : undefined}>
                  {i === 0 ? `${third.hr} bpm` : t("durability.vsFirst", { pace: signed(dPace), hr: signed(dHr) })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ChartCard>
  );
}

function range(z: DriftZone) {
  return z === "stable" ? t("durability.range.below", { n: DRIFT.stable })
    : z === "fading" ? t("durability.range.between", { a: DRIFT.stable, b: DRIFT.high })
    : t("durability.range.above", { n: DRIFT.high });
}

/** Drift per long run on the three zone bands, drawn at the card's real width. */
function DriftChart({ rows, sel, onPick }: { rows: DurabilityRow[]; sel: DurabilityRow; onPick: (id: string) => void }) {
  const [ref, W] = useWidth<HTMLDivElement>();
  const H = 172, L = 28, R = 4, T = 8, B = 22, pad = 8;
  const xs = rows.map((r) => toDate(r.date).getTime());
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const top = Math.max(DRIFT.high + 4, Math.ceil(Math.max(...rows.map((r) => r.driftPct)) + 1));
  const bottom = Math.min(0, Math.floor(Math.min(...rows.map((r) => r.driftPct)) - 1));
  const X = (ms: number) => L + pad + (x1 === x0 ? (W - L - R - 2 * pad) / 2 : ((ms - x0) / (x1 - x0)) * (W - L - R - 2 * pad));
  const Y = (v: number) => T + ((top - Math.max(bottom, Math.min(top, v))) / (top - bottom)) * (H - T - B);
  const bands = [["high", top, DRIFT.high], ["fading", DRIFT.high, DRIFT.stable], ["stable", DRIFT.stable, bottom]] as const;
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
    let best = rows[0], bd = Infinity;
    rows.forEach((r, i) => { const d = Math.abs(X(xs[i]) - px); if (d < bd) { bd = d; best = r; } });
    onPick(best.id);
  };
  const mid = Math.floor(rows.length / 2);
  const xLabels = [
    { i: 0, a: "start" as const },
    ...(rows.length > 2 ? [{ i: mid, a: "middle" as const }] : []),
    { i: rows.length - 1, a: "end" as const },
  ];

  return (
    <div ref={ref} className="w-full" style={{ height: H }}>
      {W > 0 && (
        <svg width={W} height={H} role="img" aria-label={t("durability.title")} onPointerDown={pick} onPointerMove={pick} className="block touch-pan-y select-none">
          {bands.map(([z, hi, lo]) => (
            <rect key={z} x={L} y={Y(hi)} width={W - L - R} height={Y(lo) - Y(hi)} fill={TONE[z]} fillOpacity={z === "high" ? 0.08 : z === "fading" ? 0.06 : 0.05} />
          ))}
          {[DRIFT.high, DRIFT.stable].map((v) => (
            <g key={v}>
              <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth={1} />
              <text x={L - 6} y={Y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{v}</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="var(--muted-foreground)" strokeDasharray="3 3" strokeWidth={1} />
          <text x={L - 6} y={Y(0)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">0 %</text>
          <polyline points={rows.map((r, i) => `${X(xs[i]).toFixed(1)},${Y(r.driftPct).toFixed(1)}`).join(" ")} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {rows.map((r, i) => {
            const on = r.id === sel.id;
            const ink = INK[driftZone(r.driftPct)];
            return (
              <g key={r.id}>
                {on && <circle cx={X(xs[i])} cy={Y(r.driftPct)} r={10} style={{ fill: ink, fillOpacity: 0.2 }} />}
                <circle cx={X(xs[i])} cy={Y(r.driftPct)} r={on ? 5.5 : 4} style={{ fill: on ? ink : "var(--card)", stroke: on ? "var(--card)" : "var(--muted-foreground)" }} strokeWidth={2} />
              </g>
            );
          })}
          {xLabels.map((l) => (
            <text key={l.i} x={l.a === "start" ? L + pad : l.a === "end" ? W - R : X(xs[l.i])} y={H - 6} textAnchor={l.a} fontSize={11} fill="var(--muted-foreground)">{day(rows[l.i].date)}</text>
          ))}
        </svg>
      )}
    </div>
  );
}
