import { useState, type FormEvent } from "react";
import type { CreateTripBody } from "@/shared/api";
import { api, fetchQuery } from "../api";
import { useAction } from "../hooks";
import { selectTrip } from "../trip";
import { Button, ErrorText, Field, Input } from "../ui";
import { t } from "../i18n";

export function CreateTripForm({ defaultName = "", onCreated }: { defaultName?: string; onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [adminName, setAdminName] = useState(defaultName);
  const { run, busy, error } = useAction();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const body: CreateTripBody = { name: name.trim(), adminName: adminName.trim() || undefined };
      const { id } = await api<{ id: number }>("POST", "/trips", body);
      selectTrip(id);
      await fetchQuery("/me");
      onCreated?.();
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3 text-left">
      <Field label={t("trip.name")}><Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("trip.namePlaceholder")} autoFocus /></Field>
      <Field label={t("trip.yourDisplayName")}><Input value={adminName} onChange={(e) => setAdminName(e.target.value)} placeholder="Anna" /></Field>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" className="w-full" disabled={busy || !name.trim()}>{t("trip.create")}</Button>
    </form>
  );
}
