import type { Trip } from "@/shared/api";
import { useHousehold } from "../household";
import { t as tr, tn } from "../i18n";
import { fmtDate } from "./format";

export function TripHistory({ trips }: { trips: Trip[] }) {
  const h = useHousehold();
  const closed = trips.filter((t) => t.status === "closed").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0)).slice(0, 30);
  if (closed.length === 0) return <p className="text-sm text-muted-foreground">{tr("history.none")}</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card">
      {closed.map((t) => {
        const total = t.allocations.reduce((s, a) => s + a.amount, 0);
        return (
          <li key={t.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-3 p-3">
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{t.shopperId === h.me.id ? tr("history.you") : h.name(t.shopperId)}{t.store ? ` · ${t.store}` : ""}</span>
                  <span className="block text-xs text-muted-foreground">{fmtDate(t.closedAt ?? t.startedAt)} · {tn("history.items", t.boughtItems.length)}</span>
                </span>
                <span className="tabular-nums">{h.fmt(total)}</span>
              </summary>
              <div className="space-y-2 px-3 pb-3 text-sm">
                <ul className="text-muted-foreground">
                  {t.allocations.map((a) => <li key={a.ownerId}>{a.ownerId === h.me.id ? tr("history.you") : h.name(a.ownerId)}: {h.fmt(a.amount)}</li>)}
                </ul>
                {t.boughtItems.length > 0 && (
                  <ul className="list-disc pl-5">
                    {t.boughtItems.map((i) => <li key={i.id}>{i.text}{i.quantity ? ` · ${i.quantity}` : ""}</li>)}
                  </ul>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
