import { useState } from "react";
import type { Item, ItemStatus, List, Trip } from "@/shared/api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { queueOp, usePendingOps } from "../tripQueue";
import { Button, Card, cn, ErrorText, IconButton } from "../ui";
import { t } from "../i18n";
import { CheckoutDialog, type CheckoutSummary } from "./CheckoutDialog";
import { fmtDateTime } from "./format";
import { CheckIcon, SkipIcon, UndoIcon } from "./icons";
import { SwipeRow } from "./SwipeRow";
import { useFlip } from "./useFlip";

type OpStatus = "open" | "checked" | "skipped";

export function ActiveTrip({ trip, lists, onCheckedOut }: { trip: Trip; lists: List[]; onCheckedOut: (s: CheckoutSummary) => void }) {
  const h = useHousehold();
  const { statuses } = usePendingOps(h.hid);
  const [checkout, setCheckout] = useState(false);
  const { run, busy, error } = useAction();
  const isShopper = trip.shopperId === h.me.id;
  const canCancel = isShopper || h.isAdmin; // admins can cancel any active trip

  const tripLists = lists.filter((l) => trip.listIds.includes(l.id));
  const statusOf = (i: Item): ItemStatus => statuses.get(i.id) ?? i.status;
  const items = tripLists.flatMap((l) => l.items).filter((i) => statusOf(i) !== "bought");
  const checked = items.filter((i) => statusOf(i) === "checked").length;
  const skipped = items.filter((i) => statusOf(i) === "skipped").length;

  // Group by owner; the shopper's own lists last.
  const owners = [...new Set(tripLists.map((l) => l.ownerId))].sort(
    (a, b) => Number(a === trip.shopperId) - Number(b === trip.shopperId) || h.name(a).localeCompare(h.name(b)),
  );

  const set = (item: Item, status: OpStatus) => queueOp(h.hid, trip.id, { itemId: item.id, status });
  const flip = useFlip<number>();

  const cancel = () => {
    if (!confirm(t("trip.confirmCancel"))) return;
    void run(() => h.call("POST", `/trips/${trip.id}/cancel`, undefined, ["trips", "lists"]));
  };

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="font-medium">{isShopper ? t("trip.youShopping") : t("trip.theyShopping", { name: h.name(trip.shopperId) })}</span>
          <span className="text-sm text-muted-foreground">{trip.store ? t("trip.startedAtStore", { store: trip.store, time: fmtDateTime(trip.startedAt) }) : t("trip.startedAt", { time: fmtDateTime(trip.startedAt) })}</span>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-success transition-all" style={{ width: `${items.length ? ((checked + skipped) / items.length) * 100 : 0}%` }} />
          </div>
          <span className="tabular-nums text-muted-foreground">{checked}/{items.length}{skipped ? ` · ${t("trip.skipped", { count: skipped })}` : ""}</span>
        </div>
      </Card>

      {items.length > 0 && <p className="px-1 text-xs text-muted-foreground">{t("trip.hint")}</p>}

      {owners.map((ownerId) => {
        // Open items keep their original order on top; checked/skipped sink below a divider.
        const own = tripLists.filter((l) => l.ownerId === ownerId).flatMap((l) => l.items.filter((i) => statusOf(i) !== "bought"));
        const open = own.filter((i) => statusOf(i) === "open");
        const done = own.filter((i) => statusOf(i) !== "open");
        if (!own.length) return null;
        return (
          <section key={ownerId} className="space-y-2">
            <h2 className="px-1 text-sm font-semibold text-muted-foreground uppercase">{ownerId === h.me.id ? t("trip.yoursGroup") : h.name(ownerId)}</h2>
            <ul className="relative divide-y divide-border overflow-hidden rounded-lg border border-card-edge bg-card shadow-card">
              {open.map((i) => <Row key={i.id} item={i} status="open" set={set} flipRef={flip(i.id)} />)}
              {done.length > 0 && (
                <li key="done" ref={flip(-ownerId - 1)} className="bg-muted px-4 py-1.5 text-xs font-semibold text-muted-foreground">
                  {t("trip.doneCount", { count: done.length })}
                </li>
              )}
              {done.map((i) => <Row key={i.id} item={i} status={statusOf(i)} set={set} flipRef={flip(i.id)} />)}
            </ul>
          </section>
        );
      })}
      {items.length === 0 && <p className="text-sm text-muted-foreground">{t("trip.noItems")}</p>}

      <ErrorText>{error}</ErrorText>
      {!isShopper && <p className="text-sm text-muted-foreground">{t("trip.helper", { name: h.name(trip.shopperId) })}</p>}
      {(isShopper || canCancel) && (
        <div className="flex flex-wrap gap-2">
          {isShopper && <Button className="flex-1" onClick={() => setCheckout(true)}>{t("trip.checkout")}</Button>}
          {canCancel && <Button variant="ghost" className="text-danger" onClick={cancel} disabled={busy}>{t("trip.cancel")}</Button>}
        </div>
      )}
      <CheckoutDialog open={checkout} onClose={() => setCheckout(false)} trip={trip} ownerIds={owners} boughtCount={checked} onDone={(s) => { setCheckout(false); onCheckedOut(s); }} />
    </div>
  );
}

function Row({ item: i, status: s, set, flipRef }: { item: Item; status: ItemStatus; set: (i: Item, s: OpStatus) => void; flipRef: (el: HTMLElement | null) => void }) {
  const checked = s === "checked";
  const skipped = s === "skipped";
  const sub = [i.quantity, i.note].filter(Boolean).join(" · ");
  return (
    <li ref={flipRef}>
      <SwipeRow
        right={checked
          ? { label: t("trip.uncheck"), icon: <UndoIcon />, className: "bg-muted text-muted-foreground", run: () => set(i, "open") }
          : { label: t("trip.gotIt"), icon: <CheckIcon />, className: "bg-success/20 text-success", run: () => set(i, "checked") }}
        left={skipped
          ? { label: t("trip.backToList"), icon: <UndoIcon />, className: "bg-muted text-muted-foreground", run: () => set(i, "open") }
          : { label: t("trip.notFound"), icon: <SkipIcon />, className: "bg-warning/20 text-warning", run: () => set(i, "skipped") }}
      >
        <div className="flex min-h-14 items-center gap-1 pr-2">
          <button type="button" aria-pressed={checked} onClick={() => set(i, checked ? "open" : "checked")}
            className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
            <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
              checked ? "border-success bg-success text-background" : skipped ? "border-warning text-warning" : "border-border")}>
              {checked && <CheckIcon className="size-4" />}
              {skipped && <SkipIcon className="size-4" />}
            </span>
            <span className="min-w-0">
              <span className={cn("block text-lg leading-snug break-words", s !== "open" && "text-muted-foreground line-through")}>{i.text}</span>
              {(sub || skipped) && (
                <span className="block text-sm text-muted-foreground">
                  {sub}{sub && skipped ? " · " : ""}{skipped && <span className="text-warning">{t("trip.notFoundLower")}</span>}
                </span>
              )}
            </span>
          </button>
          <IconButton label={skipped ? t("trip.backToList") : t("trip.notFound")} onClick={() => set(i, skipped ? "open" : "skipped")} className={cn("size-11", skipped && "text-warning")}>
            {skipped ? <UndoIcon className="size-4" /> : <SkipIcon className="size-4" />}
          </IconButton>
        </div>
      </SwipeRow>
    </li>
  );
}
