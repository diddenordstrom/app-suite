import { useMemo, useState } from "react";
import type { StatsEntry } from "@/shared/api";
import { buildStats, type GroupStat, type StatsRange } from "@/shared/stats";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { BarChart, Card, cn, ErrorText, SegmentedControl, Spinner, Stat } from "../ui";
import { PageHeader } from "../components/common";
import { CartIcon, ReceiptIcon } from "../components/icons";
import { locale, t, tn } from "../i18n";

const RANGE_KEY = "ss:statsRange";
function readRange(): StatsRange {
  try {
    const v = localStorage.getItem(RANGE_KEY);
    if (v === "3m" || v === "12m" || v === "all") return v;
  } catch { /* storage blocked */ }
  return "12m";
}

const monthDate = (m: string) => new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1);
const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });

export function Stats() {
  const h = useHousehold();
  const q = useQuery<StatsEntry[]>(`${h.base}/stats`);
  const [range, setRange] = useState<StatsRange>(readRange);
  const pick = (r: StatsRange) => { setRange(r); try { localStorage.setItem(RANGE_KEY, r); } catch { /* storage blocked */ } };
  const s = useMemo(() => buildStats(q.data ?? [], h.me.id, range), [q.data, h.me.id, range]);

  const multiYear = s.months.length > 12 || s.months[0]?.month.slice(0, 4) !== s.months.at(-1)?.month.slice(0, 4);
  const monthShort = (m: string) => monthDate(m).toLocaleDateString(locale, multiYear ? { month: "short", year: "2-digit" } : { month: "short" });
  const monthLong = (m: string) => monthDate(m).toLocaleDateString(locale, { month: "long", year: "numeric" });
  const groupLabel = (g: GroupStat) => g.kind === "trip"
    ? (g.label ? t("stats.shoppingAt", { store: g.label }) : t("stats.shopping"))
    : (g.label ?? t("stats.uncategorized"));

  return (
    <div className="space-y-6">
      <PageHeader title={t("stats.title")}>
        <SegmentedControl value={range} onChange={pick} options={[
          { value: "3m", label: t("stats.range3m") },
          { value: "12m", label: t("stats.range12m") },
          { value: "all", label: t("stats.rangeAll") },
        ]} />
      </PageHeader>
      {q.loading ? <Spinner /> : !q.data ? <ErrorText>{q.error?.message}</ErrorText> : (
        <>
          <Card className="grid grid-cols-3 gap-3">
            <Stat label={t("stats.household")} value={h.fmt(s.total)} />
            <Stat label={t("stats.mine")} value={h.fmt(s.mine)} sub={s.total > 0 ? t("stats.ofTotal", { pct: pct.format(s.mine / s.total) }) : undefined} />
            <Stat label={t("stats.avgMonth")} value={h.fmt(Math.round(s.total / s.months.length / 100) * 100)} />
          </Card>
          {s.total === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">{t("stats.empty")}</p> : (
            <>
              <Card className="space-y-2">
                <h2 className="text-sm font-semibold">{t("stats.perMonth")}</h2>
                <BarChart
                  valueLabel={t("stats.household")}
                  markerLabel={t("stats.mine")}
                  yFormat={(v) => compact.format(v / 100)}
                  bars={s.months.map((m) => ({
                    key: m.month, label: monthShort(m.month), value: m.total, marker: m.mine,
                    tip: (
                      <div className="space-y-0.5">
                        <div className="mb-1 font-medium">{monthLong(m.month)}</div>
                        <TipRow label={t("stats.household")} value={h.fmt(m.total)} />
                        <TipRow label={t("stats.mine")} value={h.fmt(m.mine)} />
                      </div>
                    ),
                  }))}
                />
              </Card>
              <Card className="space-y-3">
                <h2 className="text-sm font-semibold">{t("stats.where")}</h2>
                <ul className="space-y-3">
                  {s.groups.map((g) => (
                    <MeterRow key={`${g.kind}:${g.label}`} max={s.groups[0].total} value={g.total}
                      icon={g.kind === "trip" ? <CartIcon className="size-4" /> : <ReceiptIcon className="size-4" />}
                      label={groupLabel(g)} amount={h.fmt(g.total)}
                      sub={`${tn("stats.count", g.count)}${g.mine > 0 ? ` · ${t("stats.yourPart", { amount: h.fmt(g.mine) })}` : ""}`} />
                  ))}
                </ul>
              </Card>
              <Card className="space-y-3">
                <h2 className="text-sm font-semibold">{t("stats.perPerson")}</h2>
                <ul className="space-y-3">
                  {s.members.map((m) => (
                    <MeterRow key={m.memberId} max={s.members[0].amount} value={m.amount} highlight={m.memberId === h.me.id}
                      label={m.memberId === h.me.id ? t("stats.you", { name: h.name(m.memberId) }) : h.name(m.memberId)}
                      amount={h.fmt(m.amount)} sub={pct.format(m.amount / s.total)} />
                  ))}
                </ul>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TipRow({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="tabular-nums">{value}</span></div>;
}

/** Ranked row with a single-hue magnitude bar; text stays in ink colors, the bar carries the value. */
function MeterRow({ label, sub, amount, value, max, icon, highlight }: {
  label: string; sub: string; amount: string; value: number; max: number; icon?: React.ReactNode; highlight?: boolean;
}) {
  return (
    <li className="space-y-1">
      <div className="flex items-baseline gap-2 text-sm">
        {icon && <span className="self-center text-muted-foreground">{icon}</span>}
        <span className={cn("min-w-0 flex-1 truncate", highlight && "font-semibold")}>{label}</span>
        <span className="tabular-nums">{amount}</span>
      </div>
      <div className="h-2 rounded-full bg-muted" aria-hidden>
        <div className="h-2 rounded-full" style={{ width: `${Math.max((value / max) * 100, 1)}%`, background: "var(--chart-1)" }} />
      </div>
      <p className="text-xs text-muted-foreground">{sub}</p>
    </li>
  );
}
