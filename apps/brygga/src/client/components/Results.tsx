import type { Candidate, PathResult } from "@/shared/engine";
import { reason } from "@/shared/engine";
import { activePeople, type Scenario } from "@/shared/scenario";
import { age, kr, mkr, pct } from "../format";
import { t, type MsgKey } from "../i18n";
import { Card, LineChart, cn, type LineSeries } from "../ui";

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

export interface Projection {
  chosen: PathResult;
  /** Candidate stop ages per active person (the others at their chosen age). */
  candidates: Candidate[][];
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className={cn("w-9 shrink-0 font-semibold", ok ? "text-success" : "text-danger")}>{ok ? t("status.yes") : t("status.no")}</span>
      <span>{children}</span>
    </li>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-md border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-base font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

export function NetWorthToday({ scenario: s }: { scenario: Scenario }) {
  const people = activePeople(s);
  const rows: [MsgKey, number][] = [
    ["nw.stocks", sum(people.map((p) => p.stocks))],
    ["nw.house", s.household.house],
    ["nw.loan", -s.household.loan],
    ["nw.priv", sum(people.map((p) => p.priv))],
    ["nw.tjanst", sum(people.map((p) => p.tjanst))],
    ["nw.allm", sum(people.map((p) => p.allm))],
  ];
  const total = sum(rows.map(([, v]) => v));
  return (
    <Card className="p-5">
      <div className="text-sm text-muted-foreground">{t("nw.today")}</div>
      <div className={cn("mt-1 mb-3 text-3xl font-extrabold tabular-nums", total < 0 && "text-danger")}>{kr(total)}</div>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-t border-border">
              <td className="py-1.5">{t(k)}</td>
              <td className={cn("py-1.5 text-right tabular-nums", v < 0 && "text-danger")}>{kr(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function Prognosis({ scenario: s, projection: pr }: { scenario: Scenario; projection: Projection }) {
  const people = activePeople(s);
  const r = pr.chosen;
  const p0 = people[0];
  // The timeline is on the first person's ages: now → first stop → last public pension → 100.
  const total = Math.max(1, 100 - p0.age);
  const from = Math.max(0, Math.min(r.bridgeFrom, total));
  const to = Math.max(from, Math.min(r.bridgeTo, total));
  const w = [from / total, (to - from) / total, (total - to) / total].map((x) => x * 100);
  const phases = [
    { label: t("phase.work"), cls: "bg-phase-work text-phase-work-foreground" },
    { label: t("phase.bridge"), cls: "bg-phase-bridge text-phase-bridge-foreground" },
    { label: t("phase.pension"), cls: "bg-phase-pension text-phase-pension-foreground" },
  ];
  const names = [t("person.you"), t("person.partner")];

  return (
    <Card className="p-5">
      <div className="mb-2 text-sm text-muted-foreground">{t("timeline.title")}</div>
      <div className="mb-2 flex h-8 overflow-hidden rounded-md text-xs font-semibold" aria-hidden>
        {phases.map((ph, i) => (
          <div key={ph.label} className={cn("flex items-center justify-center overflow-hidden whitespace-nowrap", ph.cls)} style={{ width: `${w[i]}%` }}>
            {w[i] > 9 ? ph.label : ""}
          </div>
        ))}
      </div>
      <div className="mb-4 space-y-0.5 text-xs text-muted-foreground">
        {people.length === 1
          ? <p>{t("timeline.labels", { now: p0.age, stop: p0.retAge, pub: p0.allmStart, tj: p0.tjStart })}</p>
          : people.map((p, k) => <p key={k}>{t("timeline.labelsDuo", { name: names[k], now: p.age, stop: p.retAge, pub: p.allmStart, tj: p.tjStart })}</p>)}
      </div>

      <div className="mb-4 text-lg leading-snug font-bold">
        {people.length === 1 ? (
          earliestOf(pr.candidates[0]) != null
            ? <p>{t("prognosis.earliest")} <span className="text-success">{age(earliestOf(pr.candidates[0])!)}</span></p>
            : <p className="text-base font-semibold">{t("prognosis.none", { from: Math.floor(p0.age) + 1 })}</p>
        ) : (
          <div className="space-y-1 text-base">
            {people.map((_, k) => {
              const e = earliestOf(pr.candidates[k]);
              const other = people[1 - k].retAge;
              const key = (k === 0 ? (e != null ? "prognosis.duoYou" : "prognosis.duoYouNone") : (e != null ? "prognosis.duoPartner" : "prognosis.duoPartnerNone")) as MsgKey;
              return <p key={k} className={e == null ? "font-semibold text-muted-foreground" : undefined}>{t(key, { age: e ?? "", other })}</p>;
            })}
          </div>
        )}
      </div>

      <ul className="space-y-1.5 text-sm">
        <li className="text-muted-foreground">{t("status.expenses", { now: kr(s.household.expensesNow), after: kr(s.household.expensesAfter) })}</li>
        <Check ok={!r.bridgeShort}>{t("status.bridge")}</Check>
        <Check ok={r.marginOk}>{t("status.margin", { pct: pct(s.assumptions.margin) })}</Check>
        <Check ok={!r.shortfall}>{t("status.lasts")}</Check>
        <Check ok={r.fire4}>{t("status.fire", { pct: pct(s.assumptions.swr) })}</Check>
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        {people.length === 1 ? t("status.for", { age: p0.retAge }) : t("status.forDuo", { a: people[0].retAge, b: people[1].retAge })}
      </p>
    </Card>
  );
}

const earliestOf = (c: Candidate[]) => c.find((x) => x.ok)?.a ?? null;

export function Kpis({ scenario: s, projection: { chosen: r } }: { scenario: Scenario; projection: Projection }) {
  return (
    <Card className="grid grid-cols-1 gap-2 p-5 min-[420px]:grid-cols-2">
      <Kpi label={t("kpi.nwAtStop")} value={kr(r.nwAtStop)} sub={t("sub.today")} />
      <Kpi label={t("kpi.liquidAtStop")} value={kr(r.liqRealA)} sub={t("sub.liquid")} />
      <Kpi label={t("kpi.need")} value={kr(r.need)} sub={t("sub.margin", { amount: kr(r.need / Math.max(0.01, 1 - s.assumptions.margin / 100)) })} />
      <Kpi label={t("kpi.minBridge")} value={kr(r.minBridge)} sub={t("sub.today")} />
      <Kpi label={t("kpi.pension")} value={kr(r.pensionNet)} sub={t("sub.pension", { gross: kr(r.pensionGross) })} />
      <Kpi label={t("kpi.tax")} value={kr(r.incomeTaxPaid + r.iskTaxPaid)} sub={t("sub.tax", { isk: kr(r.iskTaxPaid), income: kr(r.incomeTaxPaid) })} />
    </Card>
  );
}

export function ProjectionChart({ scenario: s, projection: pr }: { scenario: Scenario; projection: Projection }) {
  const people = activePeople(s);
  const r = pr.chosen;
  const series: LineSeries[] = [
    { key: "nw", label: t("series.nw"), color: "var(--chart-1)", points: r.pts.map((p) => ({ x: p.t, y: p.nw })) },
    { key: "liquid", label: t("series.liquid"), color: "var(--chart-3)", points: r.pts.map((p) => ({ x: p.t, y: p.liquid })) },
    { key: "pension", label: t("series.pension"), color: "var(--chart-2)", points: r.pts.map((p) => ({ x: p.t, y: p.pension })) },
  ];
  const xFormat = (x: number) => people.length === 1
    ? age(people[0].age + x)
    : t("ageDuo", { a: Math.round(people[0].age + x), b: Math.round(people[1].age + x) });
  const names = [t("person.you"), t("person.partner")];
  const xLines = people.length === 1
    ? [{ x: people[0].retAge - people[0].age, label: t("marker.stop") }, { x: people[0].allmStart - people[0].age, label: t("marker.public") }]
    : [
        ...people.map((p, k) => ({ x: p.retAge - p.age, label: t("marker.stopName", { name: names[k] }) })),
        { x: r.bridgeTo, label: t("marker.public") },
      ];

  return (
    <Card className="p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">{t("chart.title")}</h2>
        <span className="text-xs text-muted-foreground">{t("chart.unit")}</span>
      </div>
      <LineChart series={series} height={320} xFormat={xFormat} yFormat={mkr} xLines={xLines} yPad={0.04} directLabels={false} />
      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-primary">{t("candidates.title")}</summary>
        <div className={cn("mt-3 grid gap-6", people.length > 1 && "sm:grid-cols-2")}>
          {pr.candidates.map((cands, k) => (
            <table key={k} className="w-full text-sm">
              <thead>
                {people.length > 1 && <tr><th colSpan={2} className="pb-1 text-left text-xs font-bold tracking-wide text-muted-foreground uppercase">{names[k]}</th></tr>}
                <tr className="text-left">
                  <th className="py-1 font-semibold">{t("candidates.age")}</th>
                  <th className="py-1 text-right font-semibold">{t("candidates.result")}</th>
                </tr>
              </thead>
              <tbody>
                {cands.map((c) => (
                  <tr key={c.a} className="border-t border-border">
                    <td className="py-1 tabular-nums">{age(c.a)}</td>
                    <td className={cn("py-1 text-right", c.ok ? "text-success" : "text-danger")}>{c.ok ? `✓ ${t("candidates.ok")}` : `✗ ${t(reason(c))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>
      </details>
    </Card>
  );
}

/** Phones: the answer above the long form, so a change shows its effect without scrolling. */
export function Summary({ scenario: s, projection: pr }: { scenario: Scenario; projection: Projection }) {
  const people = activePeople(s);
  const r = pr.chosen;
  const checks = [!r.bridgeShort, r.marginOk, !r.shortfall, r.fire4];
  const passed = checks.filter(Boolean).length;
  const names = [t("person.you"), t("person.partner")];
  return (
    <Card className="flex items-center justify-between gap-3 p-4 lg:hidden" aria-live="polite">
      <div className="text-sm">
        <div className="text-xs text-muted-foreground">{t("summary.earliest")}</div>
        <div className="font-bold">
          {people.map((_, k) => {
            const e = earliestOf(pr.candidates[k]);
            return <span key={k} className="mr-3 inline-block">{people.length > 1 && `${names[k]}: `}{e != null ? <span className="text-success">{age(e)}</span> : <span className="text-danger">{t("summary.none")}</span>}</span>;
          })}
        </div>
      </div>
      <div className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", passed === checks.length ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
        {t("summary.checks", { n: passed, total: checks.length })}
      </div>
    </Card>
  );
}
