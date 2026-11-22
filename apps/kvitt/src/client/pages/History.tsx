import { useState, type ReactNode } from "react";
import type { Activity, Expense, Settlement, Trip } from "@/shared/api";
import { useQuery } from "../api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, cn, Dialog, EmptyState, ErrorText, SegmentedControl, Spinner } from "../ui";
import { PageHeader, Rich } from "../components/common";
import { ExpenseForm } from "../components/ExpenseForm";
import { categoryLabel } from "../components/treats";
import { fmtDate, fmtDay } from "../components/format";
import { CartIcon, PlusIcon, ReceiptIcon, ScaleIcon } from "../components/icons";
import { locale, t, tn, type MsgKey } from "../i18n";

type Filter = "all" | Activity["kind"];
type Open = { mode: "new" } | { mode: "activity"; a: Activity } | null;

/** One timeline for everything money-related: shopping trips, expenses and payments. */
export function History() {
  const h = useHousehold();
  const q = useQuery<Activity[]>(`${h.base}/activity`);
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Open>(null);
  const close = () => setOpen(null);
  const items = (q.data ?? []).filter((a) => filter === "all" || a.kind === filter);

  // Group by month, newest first (server already sorts by `at`).
  const groups: { label: string; items: Activity[] }[] = [];
  for (const a of items) {
    const raw = new Date(a.at).toLocaleDateString(locale, { month: "long", year: "numeric" });
    const label = raw.charAt(0).toUpperCase() + raw.slice(1);
    if (groups.at(-1)?.label !== label) groups.push({ label, items: [] });
    groups.at(-1)!.items.push(a);
  }

  return (
    <div className="space-y-4">
      <PageHeader title={t("history.title")}>
        <Button onClick={() => setOpen({ mode: "new" })}><PlusIcon className="size-4" />{t("expense.add")}</Button>
      </PageHeader>
      <SegmentedControl<Filter> value={filter} onChange={setFilter} options={[
        { value: "all", label: t("history.all") },
        { value: "trip", label: t("history.shopping") },
        { value: "expense", label: t("history.expenses") },
        { value: "settlement", label: t("history.payments") },
      ]} />
      {q.loading ? <Spinner /> : !q.data ? <ErrorText>{q.error?.message}</ErrorText> : items.length === 0 ? (
        <EmptyState title={t("history.emptyTitle")}>{t("history.emptyText")}</EmptyState>
      ) : groups.map((g) => (
        <section key={g.label} className="space-y-2">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase">{g.label}</h2>
          <ul className="divide-y divide-border rounded-lg border border-card-edge bg-card shadow-card">
            {g.items.map((a) => <Row key={`${a.kind}-${idOf(a)}`} a={a} onOpen={() => setOpen({ mode: "activity", a })} />)}
          </ul>
        </section>
      ))}
      <Dialog open={open !== null} onClose={close} title={open?.mode === "new" ? t("expense.add") : open ? titleOf(open.a) : ""}>
        {open?.mode === "new" && <ExpenseForm onDone={close} />}
        {open?.mode === "activity" && <Detail a={open.a} onDone={close} />}
      </Dialog>
    </div>
  );
}

const idOf = (a: Activity) => (a.kind === "trip" ? a.trip.id : a.kind === "expense" ? a.expense.id : a.settlement.id);
const titleOf = (a: Activity) => (a.kind === "trip" ? t("history.shoppingTrip") : a.kind === "expense" ? a.expense.title : t("history.payment"));
const SPLIT_LABEL: Record<Expense["splitMode"], MsgKey> = { equal: "expense.splitEqual", shares: "expense.splitShares", exact: "expense.splitExact" };
const tripTotal = (t: Trip) => t.allocations.reduce((s, x) => s + x.amount, 0);

function useNames() {
  const h = useHousehold();
  return { h, who: (id: number) => (id === h.me.id ? t("common.you") : h.name(id)) };
}

/** My change in balance from one entry: positive = I'm owed more, negative = I owe more. */
function myDelta(a: Activity, me: number): number {
  if (a.kind === "trip") {
    const t = a.trip;
    return t.shopperId === me
      ? t.allocations.filter((x) => x.ownerId !== me).reduce((s, x) => s + x.amount, 0)
      : -(t.allocations.find((x) => x.ownerId === me)?.amount ?? 0);
  }
  if (a.kind === "expense") {
    const e = a.expense;
    if (e.gift) return 0; // a treat never creates a debt
    const mine = e.shares.find((s) => s.memberId === me)?.amount ?? 0;
    // A guest's share is paid for out of the payer's pocket and asked for outside the app: it is not lent.
    return e.payerId === me ? e.amount - mine - e.guestAmount : -mine;
  }
  return 0;
}

function Row({ a, onOpen }: { a: Activity; onOpen: () => void }) {
  const { h, who } = useNames();
  let icon: ReactNode, title: string, sub: string, amount: number;
  if (a.kind === "trip") {
    const tr = a.trip;
    icon = <CartIcon className="size-4" />;
    title = tr.store ? t("history.shoppingAt", { store: tr.store }) : t("history.shoppingTrip");
    sub = `${t("activity.shopped", { who: who(tr.shopperId) })} · ${tn("items", tr.boughtItems.length)}`;
    amount = tripTotal(tr);
  } else if (a.kind === "expense") {
    const e = a.expense;
    icon = <ReceiptIcon className="size-4" />;
    title = e.title;
    sub = `${e.gift ? t("expense.modeGift") : t("activity.paid", { who: who(e.payerId) })}${e.category ? ` · ${categoryLabel(e.category, h.detail.settings.categoryLabels)}` : ""}`;
    amount = e.amount;
  } else {
    const s = a.settlement;
    icon = <ScaleIcon className="size-4" />;
    title = s.toId === h.me.id ? t("activity.paidYou", { who: who(s.fromId) }) : t("activity.paidName", { who: who(s.fromId), name: h.name(s.toId) });
    sub = s.note ?? t("history.settleUp");
    amount = s.amount;
  }
  const delta = myDelta(a, h.me.id);
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-3 p-3 text-left hover:bg-accent">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{title}</span>
          <span className="block truncate text-xs text-muted-foreground">{sub} · {fmtDate(a.at)}</span>
        </span>
        <span className="text-right">
          {amount > 0 && <span className="block tabular-nums">{h.fmt(amount)}</span>}
          {delta !== 0 && <span className={cn("block text-xs", delta > 0 ? "text-success" : "text-danger")}>{delta > 0 ? t("history.youLent", { amount: h.fmt(delta) }) : t("history.youOwe", { amount: h.fmt(-delta) })}</span>}
        </span>
      </button>
    </li>
  );
}

function Detail({ a, onDone }: { a: Activity; onDone: () => void }) {
  const { h } = useNames();
  if (a.kind === "expense")
    return a.expense.createdById === h.me.id ? <ExpenseForm key={a.expense.id} expense={a.expense} onDone={onDone} /> : <ExpenseDetail expense={a.expense} />;
  if (a.kind === "trip") return <TripDetail trip={a.trip} />;
  return <SettlementDetail settlement={a.settlement} onDone={onDone} />;
}

function Lines({ rows }: { rows: { key: number; label: string; amount: number }[] }) {
  const { h } = useNames();
  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((r) => (
        <li key={r.key} className="flex justify-between px-3 py-2"><span>{r.label}</span><span className="tabular-nums">{h.fmt(r.amount)}</span></li>
      ))}
    </ul>
  );
}

function TripDetail({ trip }: { trip: Trip }) {
  const { h, who } = useNames();
  return (
    <div className="space-y-3 text-sm">
      <p><Rich text={trip.store ? t("history.tripDetailAt", { who: who(trip.shopperId), store: trip.store, date: fmtDate(trip.closedAt ?? trip.startedAt) }) : t("history.tripDetail", { who: who(trip.shopperId), date: fmtDate(trip.closedAt ?? trip.startedAt) })} values={{ amount: <span className="font-medium">{h.fmt(tripTotal(trip))}</span> }} /></p>
      <Lines rows={trip.allocations.map((x) => ({ key: x.ownerId, label: x.ownerId === trip.shopperId ? t("history.ownItems", { name: who(x.ownerId) }) : who(x.ownerId), amount: x.amount }))} />
      {trip.boughtItems.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-muted-foreground uppercase">{t("history.bought")}</p>
          <ul className="list-disc pl-5">{trip.boughtItems.map((i) => <li key={i.id}>{i.text}{i.quantity ? ` · ${i.quantity}` : ""}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

function ExpenseDetail({ expense: e }: { expense: Expense }) {
  const { h, who } = useNames();
  const category = e.category && <p className="text-muted-foreground">{t("history.category", { category: categoryLabel(e.category, h.detail.settings.categoryLabels) })}</p>;
  if (e.gift)
    return (
      <div className="space-y-3 text-sm">
        <p>{t("history.giftDetail", { who: who(e.payerId), date: fmtDay(e.date) })}</p>
        {e.shares.length > 0 && <p className="text-muted-foreground">{e.shares.map((s) => who(s.memberId)).join(", ")}</p>}
        {e.guests > 0 && <p className="text-muted-foreground">{t("history.giftGuests", { count: e.guests })}</p>}
        {category}
        {e.note && <p className="whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
        <p className="text-xs text-muted-foreground">{t("history.addedBy", { name: h.name(e.createdById) })}</p>
      </div>
    );
  return (
    <div className="space-y-3 text-sm">
      <p><Rich text={t("history.expenseDetail", { who: who(e.payerId), date: fmtDay(e.date), mode: t(SPLIT_LABEL[e.splitMode]) })} values={{ amount: <span className="font-medium">{h.fmt(e.amount)}</span> }} /></p>
      <Lines rows={e.shares.map((s) => ({ key: s.memberId, label: who(s.memberId), amount: s.amount }))} />
      {e.guests > 0 && e.guestAmount > 0 && <p className="text-muted-foreground">{t(e.guests === 1 ? "expense.guestNote" : "expense.guestsNote", { amount: h.fmt(e.guestAmount) })}</p>}
      {category}
      {e.note && <p className="whitespace-pre-wrap text-muted-foreground">{e.note}</p>}
      <p className="text-xs text-muted-foreground">{t("history.addedBy", { name: h.name(e.createdById) })}</p>
    </div>
  );
}

function SettlementDetail({ settlement: s, onDone }: { settlement: Settlement; onDone: () => void }) {
  const { h, who } = useNames();
  const { run, busy, error } = useAction();
  const mine = s.fromId === h.me.id || s.toId === h.me.id;
  const del = () => {
    if (confirm(t("activity.confirmDeletePayment"))) void run(async () => { await h.call("DELETE", `/settlements/${s.id}`, undefined, ["balances"]); onDone(); });
  };
  return (
    <div className="space-y-3 text-sm">
      <p><Rich text={s.toId === h.me.id ? t("history.paidYouDetail", { who: who(s.fromId), date: fmtDate(s.createdAt) }) : t("history.paidNameDetail", { who: who(s.fromId), name: h.name(s.toId), date: fmtDate(s.createdAt) })} values={{ amount: <span className="font-medium">{h.fmt(s.amount)}</span> }} /></p>
      {s.note && <p className="text-muted-foreground">{s.note}</p>}
      <ErrorText>{error}</ErrorText>
      {mine && <Button variant="danger" className="w-full" disabled={busy} onClick={del}>{t("activity.deletePayment")}</Button>}
    </div>
  );
}
