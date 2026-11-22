import { useState } from "react";
import type { SettlementBody } from "@/shared/api";
import { parseAmount, swishLink, type PairBalance } from "@/shared/balances";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Button, Dialog, ErrorText, Field, Input } from "../ui";
import { toInput } from "./format";
import { Rich } from "./common";
import { t } from "../i18n";

export function SettleDialog({ pair, onClose }: { pair: PairBalance | null; onClose: () => void }) {
  return (
    <Dialog open={pair !== null} onClose={onClose} title={t("settle.title")}>
      {pair && <SettleForm key={`${pair.from}:${pair.to}`} pair={pair} onClose={onClose} />}
    </Dialog>
  );
}

function SettleForm({ pair, onClose }: { pair: PairBalance; onClose: () => void }) {
  const h = useHousehold();
  const [amount, setAmount] = useState(toInput(pair.amount));
  const [awaitingSwish, setAwaitingSwish] = useState(false);
  const { run, busy, error, setError } = useAction();
  const iPay = pair.from === h.myWallet;
  const otherId = iPay ? pair.to : pair.from;
  const other = { name: h.walletName(otherId) };
  const swish = iPay ? h.member(pair.to)?.swishNumber : null;
  const minor = parseAmount(amount);
  const valid = minor !== null && minor > 0;

  const record = () => {
    if (!valid) return setError(t("expense.invalidAmount"));
    void run(async () => {
      await h.call("POST", "/settlements", { fromId: pair.from, toId: pair.to, amount: minor, note: awaitingSwish ? "Swish" : null } satisfies SettlementBody, ["balances"]);
      onClose();
    });
  };

  const openSwish = () => {
    if (!valid || !swish) return setError(t("expense.invalidAmount"));
    setAwaitingSwish(true);
    window.location.href = swishLink(swish, minor, `Kvitt ${h.detail.name}`);
  };

  if (awaitingSwish)
    return (
      <div className="space-y-4">
        <p className="text-sm"><Rich text={t("settle.swishConfirm", { name: other?.name ?? "" })} values={{ amount: <span className="font-medium">{h.fmt(minor ?? 0)}</span> }} /></p>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => setAwaitingSwish(false)}>{t("settle.goBack")}</Button>
          <Button className="flex-1" onClick={record} disabled={busy}>{t("settle.yesRecord")}</Button>
        </div>
      </div>
    );

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {iPay ? t("settle.youOwe", { name: other?.name ?? "", amount: h.fmt(pair.amount) }) : t("settle.owesYou", { name: other?.name ?? "", amount: h.fmt(pair.amount) })}{" "}
        {t("settle.explain")}
      </p>
      <Field label={t("expense.amount", { currency: h.currency })}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <ErrorText>{error}</ErrorText>
      <div className="flex flex-col gap-2">
        {swish && <Button onClick={openSwish} disabled={!valid}>{t("settle.swishNow")}</Button>}
        <Button variant={swish ? "outline" : "primary"} onClick={record} disabled={busy || !valid}>{iPay ? t("settle.recordPayment") : t("settle.recordReceived")}</Button>
      </div>
      {iPay && !swish && <p className="text-xs text-muted-foreground">{t("settle.noSwish", { name: other?.name ?? "" })}</p>}
    </div>
  );
}
