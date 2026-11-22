import { useState, type FormEvent } from "react";
import type { CheckoutBody, Trip } from "@/shared/api";
import { parseAmount } from "@/shared/balances";
import { useAction, useOnline } from "../hooks";
import { useHousehold } from "../household";
import { usePendingOps } from "../tripQueue";
import { t, tn } from "../i18n";
import { Button, Dialog, ErrorText, Field, Input } from "../ui";

export interface CheckoutSummary { tripId: number; allocations: { ownerId: number; amount: number }[]; boughtCount: number }

export function CheckoutDialog(props: { open: boolean; onClose: () => void; trip: Trip; ownerIds: number[]; boughtCount: number; onDone: (s: CheckoutSummary) => void }) {
  return (
    <Dialog open={props.open} onClose={props.onClose} title={t("checkout.title")}>
      {props.open && <CheckoutForm {...props} />}
    </Dialog>
  );
}

function CheckoutForm({ trip, ownerIds, boughtCount, onDone }: { trip: Trip; ownerIds: number[]; boughtCount: number; onDone: (s: CheckoutSummary) => void }) {
  const h = useHousehold();
  const online = useOnline();
  const { count: pending } = usePendingOps(h.hid);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const { run, busy, error, setError } = useAction();

  const parsed = ownerIds.map((id) => {
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
      await h.call("POST", `/trips/${trip.id}/checkout`, { allocations } satisfies CheckoutBody, ["trips", "lists", "balances"]);
      onDone({ tripId: trip.id, allocations, boughtCount });
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">{t("checkout.intro")}</p>
      {parsed.map((p) => {
        const self = p.ownerId === trip.shopperId;
        return (
          <Field key={p.ownerId} label={self ? t("checkout.self") : h.name(p.ownerId)} hint={self ? t("checkout.selfHint") : undefined}>
            <Input inputMode="decimal" placeholder={`0 ${h.currency}`} value={amounts[p.ownerId] ?? ""} onChange={(e) => setAmounts({ ...amounts, [p.ownerId]: e.target.value })} required={!self} />
          </Field>
        );
      })}
      <div className="flex justify-between border-t border-border pt-3 font-medium">
        <span>{t("checkout.total")}</span><span className="tabular-nums">{h.fmt(total)}</span>
      </div>
      {!online && <p className="text-sm text-warning">{t("checkout.offline")}</p>}
      {online && pending > 0 && <p className="text-sm text-muted-foreground">{tn("checkout.syncing", pending)}</p>}
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !online || pending > 0}>{t("checkout.submit", { amount: h.fmt(total) })}</Button>
    </form>
  );
}
