import { useNavigate } from "react-router-dom";
import { hasCoords } from "@/shared/geo";
import { sleepPoint, startPoint } from "@/shared/plan";
import { useTrip } from "../trip";
import { usePlan } from "../plan";
import { Card, ErrorText, Spinner } from "../ui";
import { PageHeader } from "../components/common";
import { pointLabel } from "../components/Leg";
import { t } from "../i18n";

type Pt = { kind: "start" | "stop" | "night"; n: number; label: string; lat: number; lon: number; target?: string };

/** Schematic route map: positions projected on a lat/lon grid, straight dotted lines between them. No base map. */
export function MapPage() {
  const { detail } = useTrip();
  const q = usePlan();
  const navigate = useNavigate();
  if (!q.data) return q.error ? <ErrorText>{q.error.message}</ErrorText> : <div className="grid place-items-center py-16"><Spinner /></div>;
  const plan = q.data;

  const seq: Pt[] = [], missing: string[] = [];
  const s0 = startPoint(plan, detail.home);
  if (hasCoords(s0)) seq.push({ kind: "start", n: 0, label: pointLabel(s0), lat: s0.lat, lon: s0.lon });
  let no = 1;
  plan.days.forEach((d, di) => {
    for (const st of d.stops) {
      const n = no++;
      if (hasCoords(st)) seq.push({ kind: "stop", n, label: st.name, lat: st.lat, lon: st.lon, target: `?stop=${st.id}` });
      else missing.push(st.name);
    }
    const night = sleepPoint(plan, d);
    if (night) {
      if (hasCoords(night)) seq.push({ kind: "night", n: di + 1, label: pointLabel(night), lat: night.lat, lon: night.lon, target: `?day=${d.id}` });
      else missing.push(t("night.label", { name: pointLabel(night), n: di + 1 }));
    }
  });

  return (
    <div className="space-y-4">
      <PageHeader title={t("nav.map")} />
      {seq.length < 2 ? (
        <Card className="text-sm text-muted-foreground">{t("map.needTwo")}</Card>
      ) : (
        <>
          <RouteSvg seq={seq} onPick={(target) => navigate(`/${target}`)} />
          <p className="text-xs text-muted-foreground">{t("map.legend")}</p>
        </>
      )}
      {missing.length > 0 && <p className="text-xs text-muted-foreground">{t("map.missing", { list: missing.join(", ") })}</p>}
    </div>
  );
}

function RouteSvg({ seq, onPick }: { seq: Pt[]; onPick: (target: string) => void }) {
  const W = 640, H = 560, P = 60, r = Math.PI / 180;
  const la = seq.map((p) => p.lat), lo = seq.map((p) => p.lon);
  const minLa = Math.min(...la), maxLa = Math.max(...la), minLo = Math.min(...lo), maxLo = Math.max(...lo);
  const kx = Math.cos(((minLa + maxLa) / 2) * r);
  const dx = Math.max((maxLo - minLo) * kx, 0.3), dy = Math.max(maxLa - minLa, 0.3);
  const sc = Math.min((W - 2 * P) / dx, (H - 2 * P) / dy), cLo = (minLo + maxLo) / 2, cLa = (minLa + maxLa) / 2;
  const X = (lon: number) => W / 2 + (lon - cLo) * kx * sc;
  const Y = (lat: number) => H / 2 - (lat - cLa) * sc;
  const span = Math.max(dy, dx), step = span > 12 ? 5 : span > 5 ? 2 : span > 2.5 ? 1 : 0.5;
  const lats: number[] = [], lons: number[] = [];
  for (let a = Math.floor((cLa - H / 2 / sc) / step) * step; a <= Math.ceil((cLa + H / 2 / sc) / step) * step; a += step) if (Y(a) >= 0 && Y(a) <= H) lats.push(a);
  for (let b = Math.floor((cLo - W / 2 / (kx * sc)) / step) * step; b <= Math.ceil((cLo + W / 2 / (kx * sc)) / step) * step; b += step) if (X(b) >= 0 && X(b) <= W) lons.push(b);
  const line = seq.map((p) => `${X(p.lon).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(" ");

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("map.title")} className="block h-auto w-full min-w-80">
        {lats.map((a) => (
          <g key={`la${a}`}>
            <line x1={0} x2={W} y1={Y(a)} y2={Y(a)} stroke="var(--border)" />
            <text x={6} y={Y(a) - 4} fontSize={11} fill="var(--muted-foreground)">{t("map.north", { v: a })}</text>
          </g>
        ))}
        {lons.map((b) => (
          <g key={`lo${b}`}>
            <line y1={0} y2={H} x1={X(b)} x2={X(b)} stroke="var(--border)" />
            <text x={X(b) + 4} y={H - 8} fontSize={11} fill="var(--muted-foreground)">{t("map.east", { v: b })}</text>
          </g>
        ))}
        <polyline points={line} fill="none" stroke="var(--primary)" strokeWidth={3} strokeLinecap="round" strokeDasharray="1 8" />
        {seq.map((p, i) => {
          const x = X(p.lon), y = Y(p.lat), right = x < W - 170;
          const lab = p.label.length > 26 ? `${p.label.slice(0, 25)}…` : p.label;
          const go = p.target ? () => onPick(p.target!) : undefined;
          return (
            <g
              key={i} onClick={go} onKeyDown={(e) => { if (go && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); go(); } }}
              tabIndex={go ? 0 : undefined} role={go ? "link" : undefined} aria-label={go ? t("map.goTo", { name: p.label }) : undefined}
              className={go ? "cursor-pointer" : undefined}
            >
              {p.kind === "start" && (
                <>
                  <circle cx={x} cy={y} r={9} fill="var(--primary)" stroke="var(--background)" strokeWidth={2} />
                  <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--primary-foreground)">S</text>
                </>
              )}
              {p.kind === "night" && (
                <>
                  <polygon points={`${x},${y - 13} ${x + 13},${y + 10} ${x - 13},${y + 10}`} fill="var(--tent)" stroke="var(--background)" strokeWidth={2} strokeLinejoin="round" />
                  <text x={x} y={y + 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="var(--background)">{p.n}</text>
                </>
              )}
              {p.kind === "stop" && (
                <>
                  <rect x={x - 14} y={y - 11} width={28} height={22} rx={4} fill="var(--sign)" stroke="var(--sign-foreground)" strokeWidth={1.5} />
                  <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={700} fill="var(--sign-foreground)" style={{ fontFamily: "var(--font-sign)" }}>{p.n}</text>
                </>
              )}
              <text
                x={right ? x + 22 : x - 22} y={y + 4} textAnchor={right ? "start" : "end"} fontSize={13} fontWeight={600}
                fill="var(--foreground)" stroke="var(--card)" strokeWidth={4} paintOrder="stroke"
              >{lab}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
