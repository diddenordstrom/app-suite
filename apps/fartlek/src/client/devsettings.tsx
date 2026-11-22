import { useEffect, useState } from "react";
import { api, useAction, useApi } from "./http";
import { Badge, BusyButton, Button, Card, CardTitle, ErrorText, Field, Input } from "./ui";
import { t, type MsgKey } from "./i18n";
import { TUNE_FIELDS, type TuneField, type TuningOverrides } from "@/shared/tuning";

/*
 * Developer settings: the planning engine's tuning table (shared/tuning.ts) as inputs, for admins only (the
 * server checks the admin group; the page shows the card only to those it would let in). Every row shows its
 * default and range; a row left at its default is not stored, so a later change of a default reaches it.
 */

type Draft = Record<string, string>;
const key = (prefix: string, path: string) => `dev.${prefix}.${path}` as MsgKey;
/** "daysFromKm.d4" → { n: 4 } is not needed: the label text carries the number. */
const groupOf = (f: TuneField) => (f.group === "shortKm" ? "daysFromKm" : f.group);
const GROUPS = [...new Set(TUNE_FIELDS.map(groupOf))];

const read = (values: TuningOverrides, path: string): number | undefined =>
  path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], values) as number | undefined;

/** The draft as overrides: only rows that differ from their default. Null when a row isn't a number in its range. */
function toOverrides(draft: Draft): TuningOverrides | null {
  const out: Record<string, unknown> = {};
  for (const f of TUNE_FIELDS) {
    const raw = (draft[f.path] ?? "").trim().replace(",", ".");
    if (raw === "") continue;
    const v = Number(raw);
    if (!Number.isFinite(v) || v < f.min || v > f.max) return null;
    if (v === f.def) continue;
    const parts = f.path.split(".");
    let at = out;
    for (const p of parts.slice(0, -1)) at = (at[p] ??= {}) as Record<string, unknown>;
    at[parts.at(-1)!] = v;
  }
  return out as TuningOverrides;
}

export function DeveloperCard() {
  const { data, error, reload } = useApi<{ values: TuningOverrides }>("/admin/tuning");
  const [draft, setDraft] = useState<Draft>({});
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!data) return;
    setDraft(Object.fromEntries(TUNE_FIELDS.map((f) => [f.path, String(read(data.values, f.path) ?? f.def)])));
  }, [data]);

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };
  const save = useAction(async () => {
    const values = toOverrides(draft);
    if (!values) throw new Error("invalid");
    await api("/admin/tuning", { method: "PUT", body: { values } });
    flash();
  }, () => void reload());
  const reset = useAction(async () => { await api("/admin/tuning", { method: "DELETE" }); flash(); }, () => void reload());

  const valid = toOverrides(draft) != null;
  const changed = (f: TuneField) => Number((draft[f.path] ?? "").replace(",", ".")) !== f.def;
  const num = (v: number) => v.toLocaleString(undefined, { maximumFractionDigits: 3 });

  return (
    <Card className="space-y-4" data-testid="developer-settings">
      <CardTitle>{t("dev.title")}</CardTitle>
      <p className="text-xs text-muted-foreground">{t("dev.intro")}</p>
      <ErrorText>{error}</ErrorText>
      {GROUPS.map((g) => (
        <section key={g} className="space-y-2">
          <h3 className="text-sm font-semibold">{t(`dev.group.${g}` as MsgKey)}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {TUNE_FIELDS.filter((f) => groupOf(f) === g).map((f) => (
              <Field key={f.path} label={t(key("f", f.path))} hint={[t(key("h", f.path)) === key("h", f.path) ? "" : t(key("h", f.path)), t("dev.range", { min: num(f.min), max: num(f.max) })].filter(Boolean).join(" ")}>
                <div className="flex items-center gap-2">
                  <Input
                    inputMode="decimal" className="w-28" value={draft[f.path] ?? ""} aria-label={t(key("f", f.path))}
                    onChange={(e) => setDraft({ ...draft, [f.path]: e.target.value })}
                  />
                  <span className="text-xs text-muted-foreground">{t("dev.default", { v: num(f.def) })}</span>
                  {changed(f) && (
                    <>
                      <Badge tone="warning">{t("dev.changed")}</Badge>
                      <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => setDraft({ ...draft, [f.path]: String(f.def) })}>{t("dev.reset")}</Button>
                    </>
                  )}
                </div>
              </Field>
            ))}
          </div>
        </section>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <BusyButton busy={save.busy} disabled={!valid} onClick={() => void save.run()}>{t("common.save")}</BusyButton>
        <Button variant="outline" disabled={reset.busy} onClick={() => void reset.run()}>{t("dev.resetAll")}</Button>
        {saved && <Badge tone="success">{t("common.saved")}</Badge>}
      </div>
      {!valid && <ErrorText>{t("dev.invalid")}</ErrorText>}
      <ErrorText>{save.error && save.error !== "invalid" ? save.error : reset.error}</ErrorText>
    </Card>
  );
}
