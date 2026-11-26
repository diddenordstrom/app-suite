import { useState, type FormEvent } from "react";
import type { CheckoutBody, EditTripBody, Trip } from "@/shared/api";
import { parseAmount } from "@/shared/balances";
import { MAX_GUESTS } from "@/shared/gifts";
import { useAction, useOnline } from "../hooks";
import { useHousehold } from "../household";
import { usePendingOps } from "../tripQueue";
import { t, tn } from "../i18n";
import { Button, Dialog, ErrorText, Field, Input } from "../ui";
import { toInput } from "./format";
import { Stepper } from "./treats";

export interface CheckoutSummary { tripId: number; allocations: { ownerId: number; amount: number }[]; guests: number; guestAmount: number; boughtCount: number }

export function CheckoutDialog(props: { open: boolean; onClose: () => void; trip: Trip; ownerIds: number[]; prefill: Record<number, number>; boughtCount: number; onDone: (s: CheckoutSummary) => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={t("checkout.title")}>
      {props.open && <CheckoutForm {...props} />}
    </Dialog>
  );
}

/** Redo the split of a closed trip (History): the same form, starting from what was saved. */
export function EditSplitForm({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  return (
    <CheckoutForm trip={trip} ownerIds={trip.allocations.map((a) => a.ownerId)} prefill={Object.fromEntries(trip.allocations.map((a) => [a.ownerId, a.amount]))}
      boughtCount={trip.boughtItems.length} onDone={() => onDone()} edit />
  );
}

function CheckoutForm({ trip, ownerIds, prefill, boughtCount, onDone, edit }: { trip: Trip; ownerIds: number[]; prefill: Record<number, number>; boughtCount: number; onDone: (s: CheckoutSummary) => void; edit?: boolean }) {
  const h = useHousehold();
  const online = useOnline();
  const { count: livePending } = usePendingOps(h.hid);
  const pending = edit ? 0 : livePending; // a closed trip has no check-offs left to sync
  // Amounts start from the prices on the checked items, so a priced list needs no typing.
  const [amounts, setAmounts] = useState<Record<number, string>>(() =>
    Object.fromEntries(Object.entries(prefill).filter(([, v]) => v > 0 || edit).map(([id, v]) => [id, toInput(v)])));
  // Other members the shopper splits the bill on, even if none of their lists is in the trip.
  const [extra, setExtra] = useState<number[]>([]);
  // What the trip came to when this form opened: "Dela lika" falls back to it when every field has been cleared.
  const [openTotal] = useState(() => Object.values(prefill).reduce((s, v) => s + v, 0) + trip.guestAmount);
  // Anonymous guests (no account, no debt): a count and their combined share.
  const [guests, setGuests] = useState(trip.guests);
  const [guestAmt, setGuestAmt] = useState(trip.guests > 0 ? toInput(trip.guestAmount) : "");
  const { run, busy, error, setError } = useAction();
  const rowIds = [...ownerIds, ...extra];
  /**
   * Adding or removing a person or a guest re-splits the shopper's own share equally between the shopper, everyone
   * added and the guests, so one extra person means 50/50. Other list owners keep their own amounts, and the
   * guests' combined share is what's left for them. Skipped when the shopper has no row of their own or an
   * amount isn't a number.
   */
  const resplit = (nextExtra: number[], nextGuests: number) => {
    setExtra(nextExtra);
    setGuests(nextGuests);
    const me = trip.shopperId;
    if (nextGuests === 0) setGuestAmt("");
    if (!ownerIds.includes(me)) return;
    const raw = (id: number) => (amounts[id] ?? "").trim();
    const parts = [...[me, ...extra].map((id) => (raw(id) ? parseAmount(raw(id)) : 0)), guestAmt.trim() ? parseAmount(guestAmt) : 0];
    if (parts.some((p) => p === null)) return;
    const pool = parts.reduce<number>((s, p) => s + p!, 0);
    if (pool <= 0) return;
    const slots = 1 + nextExtra.length + nextGuests;
    const each = Math.floor(pool / slots);
    const out = { ...amounts };
    out[me] = toInput(pool - each * (slots - 1));
    for (const id of nextExtra) out[id] = toInput(each);
    for (const id of extra) if (!nextExtra.includes(id)) delete out[id];
    setAmounts(out);
    setGuestAmt(nextGuests > 0 ? toInput(each * nextGuests) : "");
  };
  // Everyone who could be shared with: not the shopper, and not someone whose own list is in the trip.
  const pickable = h.members.filter((m) => m.id !== trip.shopperId && (extra.includes(m.id) || !ownerIds.includes(m.id)));
  const toggle = (id: number) => resplit(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id], guests);

  const parsed = rowIds.map((id) => {
    const raw = (amounts[id] ?? "").trim();
    return { ownerId: id, raw, amount: raw ? parseAmount(raw) : null };
  });
  const guestAmount = guests > 0 && guestAmt.trim() ? parseAmount(guestAmt) : 0;
  const total = parsed.reduce((s, p) => s + (p.amount ?? 0), 0) + (guestAmount ?? 0);

  /** "Dela lika": the whole total, split equally over every person on the form and the guests. */
  const splitAll = () => {
    const sum = total > 0 ? total : openTotal;
    const slots = rowIds.length + guests;
    if (sum <= 0 || slots === 0) return;
    const each = Math.floor(sum / slots);
    const first = rowIds.includes(trip.shopperId) ? trip.shopperId : rowIds[0]!; // the remainder öre
    setAmounts(Object.fromEntries(rowIds.map((id) => [id, toInput(id === first ? sum - each * (slots - 1) : each)])));
    if (guests > 0) setGuestAmt(toInput(each * guests));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = parsed.find((p) => (p.raw && p.amount === null) || (!p.raw && p.ownerId !== trip.shopperId));
    if (bad) return setError(t("checkout.invalid", { name: h.name(bad.ownerId) }));
    if (guestAmount === null) return setError(t("checkout.invalidGuests"));
    const allocations = parsed.filter((p) => p.amount !== null).map((p) => ({ ownerId: p.ownerId, amount: p.amount! }));
    void run(async () => {
      const body = { allocations, guests, guestAmount } satisfies CheckoutBody;
      if (edit) await h.call("PATCH", `/trips/${trip.id}`, body satisfies EditTripBody, ["trips", "balances"]);
      else await h.call("POST", `/trips/${trip.id}/checkout`, body, ["trips", "lists", "balances"]);
      onDone({ tripId: trip.id, allocations, guests, guestAmount: guestAmount ?? 0, boughtCount });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t(edit ? "checkout.editIntro" : "checkout.intro")}</p>
      {parsed.map((p) => {
        const self = p.ownerId === trip.shopperId;
        return (
          <Field key={p.ownerId} label={self ? (h.me.id === trip.shopperId ? t("checkout.self") : t("history.ownItems", { name: h.name(p.ownerId) })) : h.name(p.ownerId)} hint={self ? t("checkout.selfHint") : undefined}>
            <Input inputMode="decimal" placeholder={`0 ${h.currency}`} value={amounts[p.ownerId] ?? ""} onChange={(e) => setAmounts({ ...amounts, [p.ownerId]: e.target.value })} required={!self} />
          </Field>
        );
      })}
      {guests > 0 && (
        <Field label={t(guests === 1 ? "checkout.guestRow1" : "checkout.guestRow", { count: guests })} hint={t("checkout.guestHint")}>
          <Input inputMode="decimal" placeholder={`0 ${h.currency}`} value={guestAmt} onChange={(e) => setGuestAmt(e.target.value)} />
        </Field>
      )}
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t("expense.guests")}</span>
          <span className="block text-xs text-muted-foreground">{t("expense.guestsHint")}</span>
        </span>
        <Stepper value={guests} max={MAX_GUESTS} onChange={(n) => resplit(extra, n)} lessLabel={t("expense.guestsFewer")} moreLabel={t("expense.guestsMore")} />
      </div>
      {pickable.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("checkout.splitOn")}</p>
          <div className="flex flex-wrap gap-2">
            {pickable.map((m) => (
              <Button key={m.id} type="button" variant={extra.includes(m.id) ? "primary" : "ghost"} aria-pressed={extra.includes(m.id)} className={extra.includes(m.id) ? undefined : "border border-border"} onClick={() => toggle(m.id)}>{m.name}</Button>
            ))}
            {(rowIds.length + guests > 1) && <Button type="button" variant="ghost" onClick={splitAll}>{t("checkout.splitEqual")}</Button>}
          </div>
        </div>
      )}
      <div className="flex justify-between border-t border-border pt-3 font-medium">
        <span>{t("checkout.total")}</span><span className="tabular-nums">{h.fmt(total)}</span>
      </div>
      {!online && <p className="text-sm text-warning">{t("checkout.offline")}</p>}
      {online && pending > 0 && <p className="text-sm text-muted-foreground">{tn("checkout.syncing", pending)}</p>}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !online || pending > 0}>{t(edit ? "checkout.save" : "checkout.submit", { amount: h.fmt(total) })}</Button>
    </form>
  );
}
