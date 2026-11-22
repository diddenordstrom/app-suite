import { useState, type FormEvent } from "react";
import type { CreateHouseholdBody } from "@/shared/api";
import { api, fetchQuery } from "../api";
import { useAction } from "../hooks";
import { selectHousehold } from "../household";
import { Button, ErrorText, Field, Input } from "../ui";
import { t } from "../i18n";

export function CreateHouseholdForm({ defaultName = "", onCreated }: { defaultName?: string; onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("SEK");
  const [adminName, setAdminName] = useState(defaultName);
  const { run, busy, error } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body: CreateHouseholdBody = { name: name.trim(), currency: currency.trim().toUpperCase() || "SEK", adminName: adminName.trim() || undefined };
      const { id } = await api<{ id: number }>("POST", "/households", body);
      selectHousehold(id);
      await fetchQuery("/me");
      onCreated?.();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <Field label={t("household.name")}><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("household.namePlaceholder")} autoFocus /></Field>
      <Field label={t("household.currency")} hint={t("household.currencyHint")}>
        <Input required value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className="uppercase" />
      </Field>
      <Field label={t("household.yourDisplayName")}><Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Anna" /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>{t("household.create")}</Button>
    </form>
  );
}
