import { useState } from "react";
import { Link } from "react-router-dom";
import type { Activity, BalancesResponse } from "@/shared/api";
import type { PairBalance } from "@/shared/balances";
import { useQuery } from "../api";
import { useHousehold } from "../household";
import { Button, Card, cn, ErrorText, SegmentedControl, PageSkeleton, SkeletonRows } from "../ui";
import { PageHeader } from "../components/common";
import { ActivityFeed } from "../components/ActivityFeed";
import { GiftLog } from "../components/GiftLog";
import { SettleDialog } from "../components/SettleDialog";
import { SwishNudge } from "../components/SwishNudge";
import { Rich } from "../components/common";
import { locale, t } from "../i18n";

type Tab = "balances" | "gifts";

/** Saldon and the bjudningar log (docs/decisions/kvitt-bjudningar.md). */
export function Balances() {
  const [tab, setTab] = useState<Tab>("balances");
  return (
    <div className="space-y-6">
      <PageHeader title={t("balances.title")} />
      <SegmentedControl className="w-full" value={tab} onChange={setTab} options={[{ value: "balances", label: t("balances.tabBalances") }, { value: "gifts", label: t("balances.tabGifts") }]} />
      {tab === "balances" ? <BalancesTab /> : <GiftLog />}
    </div>
  );
}

function BalancesTab() {
  const h = useHousehold();
  const bal = useQuery<BalancesResponse>(`${h.base}/balances`);
  const activity = useQuery<Activity[]>(`${h.base}/activity`);
  const [settling, setSettling] = useState<PairBalance | null>(null);

  const data = bal.data;
  const involves = (p: PairBalance) => p.from === h.myWallet || p.to === h.myWallet;
  const signed = (net: number) => (net > 0 ? "+" : net < 0 ? "−" : "") + h.fmt(Math.abs(net));
  const zone = data ? h.fmt(data.zoneKr * 100) : "";

  return (
    <>
      {bal.loading ? <PageSkeleton header={false} rows={4} /> : !data ? <ErrorText>{bal.error?.message}</ErrorText> : (
        <>
          {data.plan.inside ? (
            <Card className="bg-signature-soft text-signature-foreground">
              <p className="text-base font-semibold">{t("balances.settled")}</p>
              <p className="text-xs">{t("balances.insideHint", { zone })}</p>
            </Card>
          ) : (
            <Card className="bg-accent text-accent-foreground">
              <p className="text-base font-semibold">{t("balances.timeToSettle")}</p>
              <p className="text-xs">{t("balances.outsideHint", { zone })}</p>
            </Card>
          )}
          <SwishNudge owedBy={data.plan.payments.filter((p) => p.to === h.myWallet && !p.optional).map((p) => p.from)} />

          <section className="space-y-2">
            <h2 className="text-sm font-semibold">{t("balances.netsTitle")}</h2>
            <ul className="divide-y divide-border rounded-lg border border-card-edge bg-card shadow-card">
              {[...data.totals].sort((a, b) => h.walletName(a.memberId).localeCompare(h.walletName(b.memberId), locale)).map((m) => {
                const outside = data.plan.outside.includes(m.memberId);
                return (
                  <li key={m.memberId} className="flex items-center gap-3 px-4 py-3 text-sm">
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-signature-soft font-semibold text-signature-foreground">{h.walletName(m.memberId).charAt(0).toUpperCase()}</span>
                    <span className="min-w-0 flex-1 font-medium">{m.memberId === h.myWallet ? t("common.nameYou", { name: h.walletName(m.memberId) }) : h.walletName(m.memberId)}</span>
                    {outside && <span className="text-xs text-muted-foreground">{t("balances.outsideZone")}</span>}
                    <span className={cn("min-w-16 text-right tabular-nums", outside ? "font-semibold" : "text-muted-foreground")}>{signed(m.net)}</span>
                  </li>
                );
              })}
            </ul>
            {data.plan.inside && <p className="text-xs text-muted-foreground">{t("balances.neverReset")}</p>}
          </section>

          {!data.plan.inside && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold">{t("balances.paymentsTitle")}</h2>
              <ul className="divide-y divide-border rounded-lg border border-card-edge bg-card shadow-card">
                {data.plan.payments.map((p) => (
                  <li key={`${p.from}:${p.to}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-medium">
                        {p.from === h.myWallet ? <Rich text={t("balances.youOweName")} values={{ name: <b>{h.walletName(p.to)}</b> }} /> : p.to === h.myWallet ? <Rich text={t("balances.owesYou")} values={{ name: <b>{h.walletName(p.from)}</b> }} /> : t("balances.owes", { from: h.walletName(p.from), to: h.walletName(p.to) })}
                      </span>
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <span className="tabular-nums">{h.fmt(p.amount)}</span>
                        {p.optional && <span className="rounded-full bg-muted px-2 text-xs">{t("balances.canWait")}</span>}
                      </span>
                    </span>
                    {involves(p) && <Button variant={p.optional ? "outline" : "primary"} className="h-10 px-4" onClick={() => setSettling(p)}>{p.optional ? t("balances.settleAnyway") : t("balances.settleUp")}</Button>}
                  </li>
                ))}
              </ul>
              {data.plan.payments.some((p) => p.optional) && <p className="text-xs text-muted-foreground">{t("balances.canWaitHint")}</p>}
            </section>
          )}

          {data.pairs.length > 0 && (
            <details className="rounded-lg border border-card-edge bg-card shadow-card">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium">{t("balances.allDebts")}</summary>
              <ul className="divide-y divide-border border-t border-border">
                {[...data.pairs].sort((a, b) => Number(involves(b)) - Number(involves(a))).map((p) => (
                  <li key={`${p.from}:${p.to}`} className="flex items-center gap-3 px-4 py-3">
                    <span className="min-w-0 flex-1 text-sm">
                      {p.from === h.myWallet ? <Rich text={t("balances.youOweName")} values={{ name: <b>{h.walletName(p.to)}</b> }} /> : p.to === h.myWallet ? <Rich text={t("balances.owesYou")} values={{ name: <b>{h.walletName(p.from)}</b> }} /> : t("balances.owes", { from: h.walletName(p.from), to: h.walletName(p.to) })}
                    </span>
                    <span className="tabular-nums text-muted-foreground">{h.fmt(p.amount)}</span>
                    {involves(p) && <Button variant="outline" className="h-8 px-3" onClick={() => setSettling(p)}>{t("balances.settleUp")}</Button>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
      <section className="space-y-2">
        <div className="flex items-baseline gap-4">
          <h2 className="mr-auto text-sm font-semibold text-muted-foreground uppercase">{t("balances.recent")}</h2>
          <Link to="/stats" className="text-sm text-muted-foreground hover:text-foreground">{t("balances.stats")}</Link>
          <Link to="/history" className="text-sm text-muted-foreground hover:text-foreground">{t("balances.fullHistory")}</Link>
        </div>
        {activity.loading ? <SkeletonRows rows={3} /> : <ActivityFeed items={(activity.data ?? []).slice(0, 5)} />}
      </section>
      <SettleDialog pair={settling} onClose={() => setSettling(null)} />
    </>
  );
}
