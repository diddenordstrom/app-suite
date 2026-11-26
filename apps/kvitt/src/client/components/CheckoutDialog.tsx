import { useState, type FormEvent } from "react";
import type { CheckoutBody, EditTripBody, Trip } from "@/shared/api";
import { parseAmount } from "@/shared/balances";
import { useAction, useOnline } from "../hooks";
import { useHousehold } from "../household";
import { usePendingOps } from "../tripQueue";
import { t, tn } from "../i18n";
import { Button, Dialog, ErrorText, Field, Input } from "../ui";
import { toInput } from "./format";

export interface CheckoutSummary { tripId: number; allocations: { ownerId: number; amount: number }[]; boughtCount: number }

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
  const { run, busy, error, setError } = useAction();
  const rowIds = [...ownerIds, ...extra];
  /**
   * Adding or removing a person re-splits the shopper's own share equally between the shopper and everyone
   * added, so one extra person means 50/50. Other list owners keep their own amounts. Skipped when the
   * shopper has no row of their own or an amount isn't a number.
   */
  const changeExtra = (next: number[]) => {
    setExtra(next);
    const me = trip.shopperId;
    if (!ownerIds.includes(me)) return;
    const parts = [me, ...extra].map((id) => { const raw = (amounts[id] ?? "").trim(); return raw ? parseAmount(raw) : 0; });
    if (parts.some((p) => p === null)) return;
    const pool = parts.reduce<number>((s, p) => s + p!, 0);
    if (pool <= 0) return;
    const ids = [me, ...next];
    const each = Math.floor(pool / ids.length);
    const out = { ...amounts };
    ids.forEach((id, i) => { out[id] = toInput(i === 0 ? pool - each * (ids.length - 1) : each); });
    for (const id of extra) if (!next.includes(id)) delete out[id];
    setAmounts(out);
  };
  // Everyone who could be shared with: not the shopper, and not someone whose own list is in the trip.
  const pickable = h.members.filter((m) => m.id !== trip.shopperId && (extra.includes(m.id) || !ownerIds.includes(m.id)));
  const toggle = (id: number) => changeExtra(extra.includes(id) ? extra.filter((x) => x !== id) : [...extra, id]);

  const parsed = rowIds.map((id) => {
    const raw = (amounts[id] ?? "").trim();
    return { ownerId: id, raw, amount: raw ? parseAmount(raw) : null };
  });
  const total = parsed.reduce((s, p) => s + (p.amount ?? 0), 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const bad = parsed.find((p) => (p.raw && p.amount === null) || (!p.raw && p.ownerId !== trip.shopperId));
    if (bad) return setError(t("checkout.invalid", { name: h.name(bad.ownerId) }));
    const allocations = parsed.filter((p) => p.amount !== null).map((p) => ({ ownerId: p.ownerId, amount: p.amount! }));
    void run(async () => {
      if (edit) await h.call("PATCH", `/trips/${trip.id}`, { allocations } satisfies EditTripBody, ["trips", "balances"]);
      else await h.call("POST", `/trips/${trip.id}/checkout`, { allocations } satisfies CheckoutBody, ["trips", "lists", "balances"]);
      onDone({ tripId: trip.id, allocations, boughtCount });
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
      {pickable.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("checkout.splitOn")}</p>
          <div className="flex flex-wrap gap-2">
            {pickable.map((m) => (
              <Button key={m.id} type="button" variant={extra.includes(m.id) ? "primary" : "ghost"} aria-pressed={extra.includes(m.id)} className={extra.includes(m.id) ? undefined : "border border-border"} onClick={() => toggle(m.id)}>{m.name}</Button>
            ))}
            {extra.length > 0 && <Button type="button" variant="ghost" onClick={() => changeExtra(extra)}>{t("checkout.splitEqual")}</Button>}
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
