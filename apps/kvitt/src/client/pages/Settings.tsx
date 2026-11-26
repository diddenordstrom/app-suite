import { useState, type FormEvent, type ReactNode } from "react";
import type { Member, UpdateHouseholdBody, UpdateMeBody, WalletBody } from "@/shared/api";
import { api, clearCache } from "../api";
import { useAction } from "../hooks";
import { useHousehold } from "../household";
import { Badge, Button, Card, cn, Dialog, ErrorText, Field, Input, Select, ThemeField } from "../ui";
import { CopyField, PageHeader } from "../components/common";
import { categoryLabel, Stepper } from "../components/treats";
import { CATEGORY_KEYS, MAX_LABEL_LENGTH } from "@/shared/gifts";
import { CreateHouseholdForm } from "../components/CreateHouseholdForm";
import { lang, LANGS, setLang, t, tn, type Lang, type MsgKey } from "../i18n";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export function Settings() {
  const h = useHousehold();
  return (
    <div className="space-y-4">
      <PageHeader title={t("settings.title")} />
      <Profile />
      <Recovery />
      <Household />
      <Treats />
      {h.isAdmin && <Invite />}
      <Members />
      <Wallets />
      <Account />
    </div>
  );
}

function Profile() {
  const h = useHousehold();
  const [name, setName] = useState(h.me.name);
  const [swish, setSwish] = useState(h.me.swishNumber ?? "");
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await h.call("PATCH", "/me", { name: name.trim(), swishNumber: swish.trim() || null } satisfies UpdateMeBody, ["household"]);
      setSaved(true);
    });
  };
  return (
    <Section title={t("settings.you")}>
      <Field label={t("settings.language")}>
        <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
          {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </Select>
      </Field>
      <ThemeField />
      <form onSubmit={submit} className="space-y-3" onChange={() => setSaved(false)}>
        <Field label={t("settings.displayName")}><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("settings.swishNumber")} hint={t("settings.swishHint")}>
          <Input type="tel" value={swish} onChange={(e) => setSwish(e.target.value)} placeholder="070 123 45 67" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !name.trim()}>{saved ? t("common.saved") : t("common.save")}</Button>
      </form>
    </Section>
  );
}

function Recovery() {
  const h = useHousehold();
  const [url, setUrl] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const show = () => void run(async () => setUrl((await api<{ recoveryUrl: string }>("GET", `${h.base}/me/recovery`)).recoveryUrl));
  return (
    <Section title={t("settings.recoveryLink")}>
      <p className="text-sm text-muted-foreground">
        {t("settings.recoveryText")}
      </p>
      {url ? <CopyField value={url} /> : <Button variant="outline" onClick={show} disabled={busy}>{t("settings.showRecovery")}</Button>}
      <ErrorText>{error}</ErrorText>
    </Section>
  );
}

function Household() {
  const h = useHousehold();
  const [name, setName] = useState(h.detail.name);
  const [currency, setCurrency] = useState(h.detail.currency);
  const { run, busy, error } = useAction();
  if (!h.isAdmin)
    return (
      <Section title={t("settings.household")}>
        <p className="text-sm">{h.detail.name} · {h.currency}</p>
      </Section>
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => h.call("PATCH", "", { name: name.trim(), currency: currency.trim().toUpperCase() } satisfies UpdateHouseholdBody, ["household"]));
  };
  return (
    <Section title={t("settings.household")}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("settings.name")}><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label={t("settings.currency")} hint={t("settings.currencyHint")}>
          <Input required maxLength={3} value={currency} onChange={(e) => setCurrency(e.target.value)} className="uppercase" />
        </Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
      </form>
    </Section>
  );
}

function Invite() {
  const h = useHousehold();
  const { run, busy, error } = useAction();
  const rotate = () => {
    if (confirm(t("settings.confirmRotate"))) void run(() => h.call("POST", "/invite/rotate", undefined, ["household"]));
  };
  return (
    <Section title={t("settings.inviteLink")}>
      <p className="text-sm text-muted-foreground">{t("settings.inviteText", { name: h.detail.name })}</p>
      {h.detail.inviteCode ? <CopyField value={`${location.origin}/join/${h.detail.inviteCode}`} /> : <p className="text-sm text-muted-foreground">{t("settings.noInvite")}</p>}
      <ErrorText>{error}</ErrorText>
      <Button variant="outline" onClick={rotate} disabled={busy}>{h.detail.inviteCode ? t("settings.replaceLink") : t("settings.createLink")}</Button>
    </Section>
  );
}

function Members() {
  const h = useHousehold();
  return (
    <Section title={t("settings.members")}>
      <ul className="divide-y divide-border">
        {h.members.map((m) => <MemberRow key={m.id} m={m} />)}
      </ul>
      {h.isAdmin && <AddManaged />}
    </Section>
  );
}

/** Someone who is not in the app but pays their share: a normal member in balances and splits, with no sign-in. */
function AddManaged() {
  const h = useHousehold();
  const [name, setName] = useState("");
  const { run, busy, error } = useAction();
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    void run(async () => { await h.call("POST", "/members", { name: name.trim() }, ["household"]); setName(""); });
  };
  return (
    <form onSubmit={add} className="mt-3 space-y-1">
      <div className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.addManagedName")} aria-label={t("settings.addManaged")} />
        <Button type="submit" variant="outline" disabled={busy || !name.trim()} className="shrink-0">{t("settings.addManagedBtn")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("settings.addManagedHint")}</p>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function MemberRow({ m }: { m: Member }) {
  const h = useHousehold();
  const [url, setUrl] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const self = m.id === h.me.id;
  const recover = () => void run(async () => setUrl((await h.call<{ recoveryUrl: string }>("POST", `/members/${m.id}/recovery`)).recoveryUrl));
  const remove = () => {
    if (confirm(t("settings.confirmRemove", { name: m.name }))) void run(() => h.call("DELETE", `/members/${m.id}`, undefined, ["household", "balances"]));
  };
  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm">{m.name}{self && <span className="text-muted-foreground">{t("settings.youSuffix")}</span>}</span>
        {m.role === "admin" && <Badge>{t("role.admin")}</Badge>}
        {m.managed && <Badge>{t("role.managed")}</Badge>}
        {h.isAdmin && !self && (
          <>
            <Button variant="outline" className="h-8 px-3 text-xs" onClick={recover} disabled={busy}>{t("settings.newRecovery")}</Button>
            <Button variant="ghost" className="h-8 px-3 text-xs text-danger" onClick={remove} disabled={busy}>{t("common.remove")}</Button>
          </>
        )}
      </div>
      {url && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("settings.sendRecovery", { name: m.name })}</p>
          <CopyField value={url} />
        </div>
      )}
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

/** Plånböcker: members who share money (e.g. a couple) count as one in balances (docs/decisions/kvitt-wallets-and-car.md). */
function Wallets() {
  const h = useHousehold();
  const rows = h.isAdmin ? h.members : h.members.filter((m) => m.id === h.me.id);
  const leads = h.members.filter((m) => h.members.some((f) => f.walletId === m.id));
  return (
    <Section title={t("wallet.title")}>
      <p className="text-sm text-muted-foreground">{t("wallet.hint")}</p>
      {leads.length > 0 && (
        <ul className="space-y-1">
          {leads.map((l) => (
            <li key={l.id} className="rounded-md bg-signature-soft px-3 py-2 text-sm text-signature-foreground">
              <span className="font-semibold">{h.walletName(l.id)}</span> · {t("wallet.paysFor", { name: l.name })}
            </li>
          ))}
        </ul>
      )}
      <ul className="divide-y divide-border">
        {rows.map((m) => <WalletRow key={m.id} m={m} />)}
      </ul>
    </Section>
  );
}

function WalletRow({ m }: { m: Member }) {
  const h = useHousehold();
  const { run, busy, error } = useAction();
  const followers = h.members.filter((f) => f.walletId === m.id);
  // Possible leads: anyone else who is not already in someone else's wallet.
  const options = h.members.filter((x) => x.id !== m.id && x.walletId === null);
  const set = (walletId: number | null) =>
    void run(() => h.call("PATCH", `/members/${m.id}/wallet`, { walletId } satisfies WalletBody, ["household", "balances"]));
  return (
    <li className="space-y-1 py-2">
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-sm">{m.name}{m.id === h.me.id && <span className="text-muted-foreground">{t("settings.youSuffix")}</span>}</span>
        {followers.length > 0 ? (
          <span className="text-xs text-muted-foreground">{t("wallet.leads", { names: followers.map((f) => f.name).join(", ") })}</span>
        ) : (
          <Select aria-label={t("wallet.selectLabel", { name: m.name })} className="w-44" value={m.walletId ?? ""} disabled={busy}
            onChange={(e) => set(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{t("wallet.own")}</option>
            {options.map((x) => <option key={x.id} value={x.id}>{t("wallet.with", { name: x.name })}</option>)}
          </Select>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </li>
  );
}

function Account() {
  const h = useHousehold();
  const [creating, setCreating] = useState(false);
  const user = h.meResponse.user;
  const signOut = async () => {
    try { await api("POST", "/auth/logout"); } catch { /* ignore */ }
    clearCache();
    location.href = "/";
  };
  if (!user)
    return (
      <Section title={t("settings.account")}>
        <p className="text-sm text-muted-foreground">{t("settings.inviteSession")}</p>
        {h.meResponse.authMode === "dev" && <Button variant="outline" onClick={() => (location.href = "/api/auth/login")}>{t("settings.devSignIn")}</Button>}
      </Section>
    );
  return (
    <Section title={t("settings.account")}>
      <p className="text-sm text-muted-foreground">{t(h.meResponse.authMode === "dev" ? "settings.signedInAsDev" : "settings.signedInAs", { name: user.name ?? user.email ?? "" })}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setCreating(true)}>{t("settings.createAnother")}</Button>
        <Button variant="ghost" onClick={signOut}>{h.meResponse.authMode === "demo" ? t("demo.end") : t("settings.signOut")}</Button>
      </div>
      <Dialog open={creating} onClose={() => setCreating(false)} title={t("settings.newHousehold")}>
        <CreateHouseholdForm defaultName={h.me.name} onCreated={() => setCreating(false)} />
      </Dialog>
    </Section>
  );
}

/** Green zone, treat/share defaults and the hosting hint (docs/decisions/kvitt-bjudningar.md). Admins edit; members see them. */
function Treats() {
  const h = useHousehold();
  const settings = h.detail.settings;
  const [zone, setZone] = useState(String(settings.zoneKr));
  const { run, busy, error } = useAction();
  const save = (body: UpdateHouseholdBody) => run(() => h.call("PATCH", "", body, ["household", "balances"]));
  const zoneKr = /^\d{1,6}$/.test(zone.trim()) ? Number(zone.trim()) : null;
  const toggleDefault = (key: string, gift: boolean) => {
    const set = new Set(settings.giftCategories);
    if (gift) set.add(key); else set.delete(key);
    void save({ giftCategories: [...set] });
  };
  const readOnly = !h.isAdmin;
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(CATEGORY_KEYS.map((k) => [k, settings.categoryLabels[k] ?? ""])));
  const namesBody = Object.fromEntries(Object.entries(names).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  const namesChanged = JSON.stringify(namesBody) !== JSON.stringify(settings.categoryLabels);
  return (
    <Section title={t("settings.treats")}>
      {readOnly && <p className="text-sm text-muted-foreground">{t("settings.adminOnly")}</p>}

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (zoneKr !== null) void save({ zoneKr }); }}>
        <Field label={t("settings.zoneLimit", { currency: h.currency })} hint={t("settings.zoneHint", { zone: h.fmt(settings.zoneKr * 100) })}>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">±</span>
            <Input inputMode="numeric" className="w-24 text-right" value={zone} disabled={readOnly} onChange={(e) => setZone(e.target.value)} aria-invalid={zoneKr === null} />
            {!readOnly && <Button type="submit" variant="outline" disabled={busy || zoneKr === null || zoneKr === settings.zoneKr}>{t("common.save")}</Button>}
          </div>
        </Field>
      </form>

      <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void save({ categoryLabels: namesBody }); }}>
        <h3 className="text-sm font-medium">{t("settings.categoryNames")}</h3>
        <p className="text-xs text-muted-foreground">{t("settings.categoryNamesHint")}</p>
        <ul className="space-y-2">
          {CATEGORY_KEYS.map((key) => (
            <li key={key}>
              <Input
                aria-label={t("settings.categoryName", { name: t(`category.${key}` as MsgKey) })}
                placeholder={t(`category.${key}` as MsgKey)}
                maxLength={MAX_LABEL_LENGTH}
                value={names[key]}
                disabled={readOnly}
                onChange={(e) => setNames({ ...names, [key]: e.target.value })}
              />
            </li>
          ))}
        </ul>
        {!readOnly && <Button type="submit" variant="outline" disabled={busy || !namesChanged}>{t("common.save")}</Button>}
      </form>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("settings.defaults")}</h3>
        <ul className="divide-y divide-border rounded-md border border-border">
          {CATEGORY_KEYS.map((key) => {
            const gift = settings.giftCategories.includes(key);
            return (
              <li key={key} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="text-sm font-medium">{categoryLabel(key, settings.categoryLabels)}</span>
                <div role="radiogroup" aria-label={categoryLabel(key, settings.categoryLabels)} className="inline-flex rounded-md bg-muted p-0.5">
                  {([true, false] as const).map((isGift) => (
                    <button
                      key={String(isGift)}
                      type="button"
                      role="radio"
                      aria-checked={gift === isGift}
                      disabled={readOnly || busy}
                      onClick={() => gift !== isGift && toggleDefault(key, isGift)}
                      className={cn("min-h-9 min-w-16 rounded px-3 text-xs transition focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60", gift === isGift ? "border border-signature bg-signature-soft font-semibold text-signature-foreground" : "font-medium text-muted-foreground")}
                    >
                      {t(isGift ? "expense.modeGift" : "expense.modeShared")}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium">{t("settings.hintTitle")}</h3>
        <div className="divide-y divide-border rounded-md border border-border">
          <div className="flex items-center justify-between gap-3 px-3 py-2">
            <span id="hint-switch" className="text-sm font-medium">{t("settings.hintShow")}</span>
            <button
              type="button"
              role="switch"
              aria-checked={settings.hintEnabled}
              aria-labelledby="hint-switch"
              disabled={readOnly || busy}
              onClick={() => void save({ hintEnabled: !settings.hintEnabled })}
              className={cn("relative h-7 w-12 shrink-0 rounded-full transition focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60", settings.hintEnabled ? "bg-signature" : "bg-muted")}
            >
              <span aria-hidden="true" className={cn("absolute top-0.5 size-6 rounded-full bg-white transition-all", settings.hintEnabled ? "left-[22px]" : "left-0.5 border border-border")} />
            </button>
          </div>
          {settings.hintEnabled && (
            <div className="flex items-center justify-between gap-3 py-1 pr-1 pl-3">
              <span className="text-sm font-medium">{t("settings.hintAfter")}</span>
              {readOnly
                ? <span className="pr-2 text-sm">{tn("months", settings.hintMonths)}</span>
                : (
                  <span className="flex items-center">
                    <Stepper value={settings.hintMonths} min={1} max={24} onChange={(n) => void save({ hintMonths: n })} lessLabel={t("settings.shorter")} moreLabel={t("settings.longer")} />
                    <span className="min-w-20 pr-2 text-sm">{tn("months", settings.hintMonths)}</span>
                  </span>
                )}
            </div>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{t("settings.hintHint")}</p>
      </div>
      <ErrorText>{error}</ErrorText>
    </Section>
  );
}
