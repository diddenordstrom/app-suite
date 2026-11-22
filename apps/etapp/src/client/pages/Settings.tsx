import { useState, type FormEvent, type ReactNode } from "react";
import type { Member, PlanResponse, UpdateMeBody, UpdatePlanBody, UpdateTripBody } from "@/shared/api";
import { formatLatLon } from "@/shared/geo";
import { readPosition } from "../components/StopItem";
import { usePlan } from "../plan";
import { api, clearCache } from "../api";
import { useAction } from "../hooks";
import { useTrip } from "../trip";
import { Badge, Button, Card, Dialog, ErrorText, Field, Input, Select, ThemeField } from "../ui";
import { CopyField, PageHeader } from "../components/common";
import { CreateTripForm } from "../components/CreateTripForm";
import { lang, LANGS, setLang, t, type Lang } from "../i18n";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="space-y-3">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

export function Settings() {
  const h = useTrip();
  return (
    <div className="space-y-4">
      <PageHeader title={t("settings.title")} />
      <Profile />
      <HomeSection />
      <Recovery />
      <TripSection />
      {h.isAdmin && <Invite />}
      <Members />
      <Account />
    </div>
  );
}

function Profile() {
  const h = useTrip();
  const [name, setName] = useState(h.me.name);
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      await h.call("PATCH", "/me", { name: name.trim() } satisfies UpdateMeBody, ["trip"]);
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
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy || !name.trim()}>{saved ? t("common.saved") : t("common.save")}</Button>
      </form>
    </Section>
  );
}

/** The viewer's own home on this trip: where "Start: Home" begins. */
function HomeSection() {
  const h = useTrip();
  const [label, setLabel] = useState(h.detail.home.label);
  const [pos, setPos] = useState(formatLatLon(h.detail.home));
  const [saved, setSaved] = useState(false);
  const { run, busy, error, setError } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const p = readPosition(pos);
    if (p === "invalid") return setError(t("pos.invalid"));
    void run(async () => {
      await h.call("PATCH", "/me", { homeLabel: label.trim(), homeLat: p.lat, homeLon: p.lon } satisfies UpdateMeBody, ["trip"]);
      setSaved(true);
    });
  };
  return (
    <Section title={t("settings.home")}>
      <p className="text-sm text-muted-foreground">{t("settings.homeText")}</p>
      <form onSubmit={submit} className="space-y-3" onChange={() => setSaved(false)}>
        <Field label={t("settings.homeLabel")}><Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Jönköping" /></Field>
        <Field label={t("settings.homePosition")}><Input value={pos} onChange={(e) => setPos(e.target.value)} placeholder="57.7826, 14.1618" inputMode="decimal" /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{saved ? t("common.saved") : t("common.save")}</Button>
      </form>
    </Section>
  );
}

function Recovery() {
  const h = useTrip();
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

function TripSection() {
  const plan = usePlan();
  return (
    <>
      <TripName />
      {plan.data && <AreaSection plan={plan.data} />}
    </>
  );
}

/** Search area is part of the plan, so every traveller can change it. */
function AreaSection({ plan }: { plan: PlanResponse }) {
  const h = useTrip();
  const [area, setArea] = useState(plan.area);
  const [saved, setSaved] = useState(false);
  const { run, busy, error } = useAction();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => { await h.call("PATCH", "/plan", { area: area.trim() } satisfies UpdatePlanBody, ["plan"]); setSaved(true); });
  };
  return (
    <Section title={t("settings.area")}>
      <form onSubmit={submit} className="space-y-3" onChange={() => setSaved(false)}>
        <Field label={t("settings.area")} hint={t("settings.areaHint")}><Input value={area} onChange={(e) => setArea(e.target.value)} placeholder={t("settings.areaPlaceholder")} /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{saved ? t("common.saved") : t("common.save")}</Button>
      </form>
    </Section>
  );
}

function TripName() {
  const h = useTrip();
  const [name, setName] = useState(h.detail.name);
  const { run, busy, error } = useAction();
  if (!h.isAdmin)
    return (
      <Section title={t("settings.trip")}>
        <p className="text-sm">{h.detail.name}</p>
      </Section>
    );
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(() => h.call("PATCH", "", { name: name.trim() } satisfies UpdateTripBody, ["trip"]));
  };
  return (
    <Section title={t("settings.trip")}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t("settings.name")}><Input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <ErrorText>{error}</ErrorText>
        <Button type="submit" disabled={busy}>{t("common.save")}</Button>
      </form>
    </Section>
  );
}

function Invite() {
  const h = useTrip();
  const { run, busy, error } = useAction();
  const rotate = () => {
    if (confirm(t("settings.confirmRotate"))) void run(() => h.call("POST", "/invite/rotate", undefined, ["trip"]));
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
  const h = useTrip();
  return (
    <Section title={t("settings.members")}>
      <ul className="divide-y divide-border">
        {h.members.map((m) => <MemberRow key={m.id} m={m} />)}
      </ul>
    </Section>
  );
}

function MemberRow({ m }: { m: Member }) {
  const h = useTrip();
  const [url, setUrl] = useState<string | null>(null);
  const { run, busy, error } = useAction();
  const self = m.id === h.me.id;
  const recover = () => void run(async () => setUrl((await h.call<{ recoveryUrl: string }>("POST", `/members/${m.id}/recovery`)).recoveryUrl));
  const remove = () => {
    if (confirm(t("settings.confirmRemove", { name: m.name }))) void run(() => h.call("DELETE", `/members/${m.id}`, undefined, ["trip"]));
  };
  return (
    <li className="space-y-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm">{m.name}{self && <span className="text-muted-foreground">{t("settings.youSuffix")}</span>}</span>
        {m.role === "admin" && <Badge>{t("role.admin")}</Badge>}
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

function Account() {
  const h = useTrip();
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
      <Dialog open={creating} onClose={() => setCreating(false)} title={t("settings.newTrip")}>
        <CreateTripForm defaultName={h.me.name} onCreated={() => setCreating(false)} />
      </Dialog>
    </Section>
  );
}
