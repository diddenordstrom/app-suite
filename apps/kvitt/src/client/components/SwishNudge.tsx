import { useState, type FormEvent } from "react";
import type { UpdateMeBody } from "@/shared/api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, Card, ErrorText, Input } from "../ui";
import { t } from "../i18n";

const dismissKey = (hid: number) => `kvitt:swish-nudge-dismissed:${hid}`;
const readDismissed = (hid: number) => { try { return localStorage.getItem(dismissKey(hid)) === "1"; } catch { return false; } };

/** Shown when someone owes you but you have no Swish number, so their "Swish now" button can't appear. */
export function SwishNudge({ owedBy }: { owedBy: number[] }) {
  const h = useHousehold();
  const [dismissed, setDismissed] = useState(() => readDismissed(h.hid));
  const [number, setNumber] = useState("");
  const { run, busy, error } = useAction();
  // In a wallet the lead receives the Swish, so only the lead is nudged.
  if (h.me.swishNumber || h.myWallet !== h.me.id || owedBy.length === 0 || dismissed) return null;

  const [a, b] = owedBy.slice(0, 2).map((id) => h.name(id));
  const names = owedBy.length === 1 ? a : t(owedBy.length > 2 ? "swish.namesMore" : "swish.names2", { a, b });
  const save = (e: FormEvent) => {
    e.preventDefault();
    const digits = number.replace(/[^\d+]/g, "");
    if (digits.length < 8) return;
    void run(() => h.call("PATCH", "/me", { swishNumber: number.trim() } satisfies UpdateMeBody, ["household"]));
  };
  const dismiss = () => { try { localStorage.setItem(dismissKey(h.hid), "1"); } catch { /* ignore */ } setDismissed(true); };

  return (
    <Card className="space-y-3 border-signature/40 bg-signature-soft">
      <div>
        <p className="font-semibold text-accent-foreground">{t("swish.nudgeTitle")}</p>
        <p className="text-sm text-muted-foreground">{t("swish.nudgeText", { names })}</p>
      </div>
      <form onSubmit={save} className="flex gap-2">
        <Input type="tel" inputMode="tel" autoComplete="tel" placeholder="070 123 45 67" value={number} onChange={(e) => setNumber(e.target.value)} className="bg-card" />
        <Button type="submit" disabled={busy || number.replace(/[^\d]/g, "").length < 8}>{t("common.save")}</Button>
      </form>
      <ErrorText>{error}</ErrorText>
      <button type="button" onClick={dismiss} className="text-xs text-muted-foreground underline-offset-2 hover:underline">{t("swish.notNow")}</button>
    </Card>
  );
}
