import type { Activity } from "@/shared/api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { ErrorText, IconButton } from "../ui";
import { fmtDate } from "./format";
import { CartIcon, ReceiptIcon, ScaleIcon, TrashIcon } from "./icons";
import { t, tn } from "../i18n";

export function ActivityFeed({ items }: { items: Activity[] }) {
  const h = useHousehold();
  const { run, busy, error } = useAction();
  const who = (id: number) => (id === h.me.id ? t("common.you") : h.name(id));
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t("activity.nothingYet")}</p>;

  const undo = (id: number) => {
    if (confirm(t("activity.confirmDeletePayment"))) void run(() => h.call("DELETE", `/settlements/${id}`, undefined, ["balances"]));
  };

  return (
    <>
      <ErrorText>{error}</ErrorText>
      <ul className="divide-y divide-border rounded-lg border border-card-edge bg-card shadow-card">
        {items.map((a) => {
          let icon, text, amount: number, extra = null;
          const id = a.kind === "trip" ? a.trip.id : a.kind === "expense" ? a.expense.id : a.settlement.id;
          if (a.kind === "trip") {
            icon = <CartIcon className="size-4" />;
            amount = a.trip.allocations.reduce((s, x) => s + x.amount, 0);
            const w = who(a.trip.shopperId);
            text = `${a.trip.store ? t("activity.shoppedAt", { who: w, store: a.trip.store }) : t("activity.shopped", { who: w })} · ${tn("items", a.trip.boughtItems.length)}`;
          } else if (a.kind === "expense") {
            icon = <ReceiptIcon className="size-4" />;
            amount = a.expense.amount;
            text = a.expense.gift
              ? t("activity.treated", { who: who(a.expense.payerId), title: a.expense.title })
              : t("activity.paidFor", { who: who(a.expense.payerId), title: a.expense.title });
          } else {
            const s = a.settlement;
            icon = <ScaleIcon className="size-4" />;
            amount = s.amount;
            text = s.toId === h.me.id ? t("activity.paidYou", { who: who(s.fromId) }) : t("activity.paidName", { who: who(s.fromId), name: h.name(s.toId) });
            if (s.fromId === h.me.id || s.toId === h.me.id)
              extra = <IconButton label={t("activity.deletePayment")} onClick={() => undo(s.id)} disabled={busy}><TrashIcon className="size-4" /></IconButton>;
          }
          return (
            <li key={`${a.kind}-${id}`} className="flex items-center gap-3 p-3 text-sm">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block">{text}</span>
                <span className="block text-xs text-muted-foreground">{fmtDate(a.at)}</span>
              </span>
              {amount > 0 && <span className="tabular-nums">{h.fmt(amount)}</span>}
              {extra}
            </li>
          );
        })}
      </ul>
    </>
  );
}
