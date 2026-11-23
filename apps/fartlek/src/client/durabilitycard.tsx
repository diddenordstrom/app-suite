import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFmt } from "./prefs";
import { Card, CardTitle, InfoTip, Stat, niceTicks } from "./ui";
import { fmtDay } from "./bits";
import { locale, t } from "./i18n";
import type { DurabilityRow } from "./types";
import { DRIFT } from "@/shared/activitylog";
import { toDate } from "@/shared/dates";

const signed = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 1, signDisplay: "exceptZero" });
const day = (d: string) => fmtDay(d, { day: "numeric", month: "short" });

/**
 * Durability in one card: today's drift as the big number, the drift per long run over time on a
 * quiet plot with the zones named at the edge, and the three thirds of the chosen run underneath.
 */
export function DurabilityCard({ rows: unsorted, info, className }: { rows: DurabilityRow[]; info: string; className?: string }) {
  const rows = useMemo(() => [...unsorted].sort((a, b) => a.date.localeCompare(b.date)), [unsorted]);
  const fmt = useFmt();
  const [picked, setPicked] = useState<string | null>(null);
  const title = t("durability.title");
  const head = (
    <CardTitle className="mb-0"><span className="flex items-center gap-1">{title}<InfoTip label={title}>{info}</InfoTip></span></CardTitle>
  );
  if (rows.length < 2) {
    return <Card className={className}>{head}<p className="py-8 text-center text-sm text-muted-foreground">{t("durability.empty")}</p></Card>;
  }

  const last = rows[rows.length - 1];
  const sel = rows.find((r) => r.id === picked) ?? last;
  const W = 600, H = 190, L = 40, R = 92, T = 10, B = 24;
  const xs = rows.map((r) => toDate(r.date).getTime());
  const x0 = xs[0], x1 = xs[xs.length - 1];
  const top = Math.max(DRIFT.high + 2, Math.ceil(Math.max(...rows.map((r) => r.driftPct)) + 1));
  const bottom = Math.min(0, Math.floor(Math.min(...rows.map((r) => r.driftPct)) - 1));
  const X = (ms: number) => L + (x1 === x0 ? (W - L - R) / 2 : ((ms - x0) / (x1 - x0)) * (W - L - R));
  const Y = (v: number) => T + ((top - Math.max(bottom, Math.min(top, v))) / (top - bottom)) * (H - T - B);
  const ticks = niceTicks(bottom, top, 3);
  const zones = ([["high", (top + DRIFT.high) / 2], ["fading", (DRIFT.stable + DRIFT.high) / 2], ["stable", DRIFT.stable / 2]] as const);
  const pick = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = rows[0], bd = Infinity;
    rows.forEach((r, i) => { const d = Math.abs(X(xs[i]) - px); if (d < bd) { bd = d; best = r; } });
    setPicked(best.id);
  };
  type XLabel = { ms: number; d: string; a: "start" | "middle" | "end" };
  const mid = Math.floor(rows.length / 2);
  const xLabels: XLabel[] = [
    { ms: x0, d: rows[0].date, a: "start" },
    ...(rows.length > 2 ? [{ ms: xs[mid], d: rows[mid].date, a: "middle" } as XLabel] : []),
    { ms: x1, d: last.date, a: "end" },
  ];

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {head}
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("durability.sub")}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="font-display text-4xl leading-none font-medium tabular-nums">{signed(last.driftPct)} %</div>
          <div className="mt-1.5 text-sm text-muted-foreground">{t("durability.latest", { date: day(last.date) })}</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title} onPointerDown={pick} onPointerMove={pick} className="mt-2 block h-auto w-full touch-pan-y select-none">
        {[...new Set([...ticks, DRIFT.stable, DRIFT.high])].filter((v) => v !== 0 && v <= top).map((v) => (
          <g key={v}><line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} stroke="var(--border)" strokeWidth={1} strokeOpacity={0.6} />
            <text x={L - 6} y={Y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{v} %</text></g>
        ))}
        <line x1={L} x2={W - R} y1={Y(0)} y2={Y(0)} stroke="var(--muted-foreground)" strokeDasharray="4 3" strokeWidth={1} />
        <text x={L - 6} y={Y(0)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">0 %</text>
        <text x={W - R - 4} y={Y(0) - 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">{t("durability.noDrift")}</text>
        {zones.map(([z, mid]) => (
          <text key={z} x={W - R + 8} y={Y(mid)} textAnchor="start" dominantBaseline="middle" fontSize={11} fill="var(--muted-foreground)">{t(`durability.zone.${z}`)}</text>
        ))}
        <polyline points={rows.map((r, i) => `${X(xs[i]).toFixed(1)},${Y(r.driftPct).toFixed(1)}`).join(" ")} fill="none" stroke="var(--muted-foreground)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {rows.map((r, i) => {
          const on = r.id === sel.id;
          return (
            <g key={r.id}>
              {on && <circle cx={X(xs[i])} cy={Y(r.driftPct)} r={9} style={{ fill: "var(--foreground)", fillOpacity: 0.12 }} />}
              <circle cx={X(xs[i])} cy={Y(r.driftPct)} r={on ? 5.5 : 4} style={{ fill: on ? "var(--foreground)" : "var(--card)", stroke: on ? "var(--card)" : "var(--muted-foreground)" }} strokeWidth={2} />
            </g>
          );
        })}
        {xLabels.map((l) => <text key={l.ms} x={X(l.ms)} y={H - 6} textAnchor={l.a} fontSize={11} fill="var(--muted-foreground)">{day(l.d)}</text>)}
      </svg>

      <div className="mt-2 grid grid-cols-2 items-end gap-x-6 gap-y-3 border-t border-border pt-3 sm:grid-cols-4">
        <div className="col-span-2 sm:col-span-1">
          <Link to={`/activities/${encodeURIComponent(sel.id)}`} className="block truncate text-sm font-medium hover:underline">{day(sel.date)} · {sel.name}</Link>
          <div className="text-xs text-muted-foreground">{sel.id === last.id && picked == null ? t("durability.pick") : `${signed(sel.driftPct)} % · ${fmt.dist(sel.km)}`}</div>
        </div>
        {sel.thirds.map((third, i) => (
          <Stat key={i} label={[t("durability.first"), t("durability.middle"), t("durability.last")][i]} value={fmt.pace(third.pace)} sub={`${third.hr} bpm`} />
        ))}
      </div>
    </Card>
  );
}
