import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { api, useAction, useApi } from "../http";
import { useReloadOnSync, useSync } from "../garminSync";
import { useFmt, useSettings } from "../prefs";
import { Badge, BusyButton, Button, Card, CardTitle, ErrorText, Field, Input, Select, SegmentedControl, NewsList, ThemeField, useTour } from "../ui";
import { PushSettings } from "@homelab/ui";
import { onboardingTour } from "../guide";
import { DeveloperCard } from "../devsettings";
import { NEWS } from "../news";
import { tShared } from "@homelab/i18n";
import { SyncIcon, fmtAgo, fmtDay } from "../bits";
import type { CsTest, GarminInfo } from "../types";
import { addDays, todayIn } from "@/shared/dates";
import { lang, LANGS, setLang, t, tn, WEEKDAY_LONG, WEEKDAY_SHORT, type Lang } from "../i18n";
import { parsePace } from "@/shared/format";
import { parseClock } from "@/shared/criticalspeed";
import { zonesFromLthr, zonesFromMaxHr } from "@/shared/zones";
import type { Settings as SettingsT, Threshold, ZoneBounds } from "@/shared/types";

const numOrNull = (s: string) => (s.trim() === "" ? null : Math.round(Number(s)));

export function Settings() {
  const { user, demoMode, isAdmin } = useAuth();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
      <AppearanceCard />
      {demoMode ? <Card><CardTitle>Garmin</CardTitle><p className="text-sm text-muted-foreground">{t("demo.noGarmin")}</p></Card> : <><GarminCard /><AddOns /></>}
      {!demoMode && <NotificationsCard />}
      <PreferencesCard />
      <HeartRateCard />
      <ThresholdCard />
      <CriticalSpeedCard />
      <DataCard />
      {isAdmin && !demoMode && <DeveloperCard />}
      <Card className="text-sm text-muted-foreground">{t("settings.signedInAs", { name: user?.email ?? user?.name ?? user?.sub ?? "" })}</Card>
    </div>
  );
}

function AppearanceCard() {
  return (
    <Card className="space-y-3">
      <CardTitle>{t("settings.languageAndTheme")}</CardTitle>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t("settings.language")}>
          <Select value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </Select>
        </Field>
        <ThemeField />
      </div>
    </Card>
  );
}

/** Web Push (shared PushSettings) with the morning notification's time (docs/decisions/fartlek-morning-push.md). */
function NotificationsCard() {
  return (
    <PushSettings request={api} intro={t("morning.intro")}>
      <MorningTime />
    </PushSettings>
  );
}

function MorningTime() {
  const { data, reload } = useApi<{ time: string | null; defaultTime: string }>("/push/morning");
  const [time, setTime] = useState<string | null>(null);
  useEffect(() => { if (data) setTime(data.time); }, [data]);
  const save = useAction((next: string | null) => api("/push/morning", { method: "PUT", body: { time: next } }), reload);
  const preview = useAction(() => api("/push/morning/test", { method: "POST" }));
  if (!data) return null;
  const on = time != null;
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => { const next = e.target.checked ? data.time ?? data.defaultTime : null; setTime(next); void save.run(next); }} />
        {t("morning.enabled")}
      </label>
      {on && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("morning.time")}>
            <Input type="time" step={300} value={time ?? ""} onChange={(e) => setTime(e.target.value)} onBlur={() => { if (time && time !== data.time) void save.run(time); }} />
          </Field>
          <BusyButton variant="outline" busy={preview.busy} onClick={() => void preview.run()}>{t("morning.preview")}</BusyButton>
        </div>
      )}
      <ErrorText>{save.error ?? preview.error}</ErrorText>
    </div>
  );
}

function useSave() {
  const { settings, setSettings } = useSettings();
  const [saved, setSaved] = useState(false);
  const a = useAction(async (next: SettingsT) => {
    const s = await api<SettingsT>("/settings", { method: "PUT", body: next });
    setSettings(s);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  });
  return { settings, save: a.run, busy: a.busy, error: a.error, saved };
}

function PreferencesCard() {
  const { settings, save, busy, error, saved } = useSave();
  const [s, setS] = useState(settings);
  useEffect(() => setS(settings), [settings]);
  const zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  const order = settings.weekStart === "monday" ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
  return (
    <Card className="space-y-3">
      <CardTitle>{t("prefs.title")}</CardTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("prefs.units")}>
          <Select value={s.units} onChange={(e) => setS({ ...s, units: e.target.value as SettingsT["units"] })}>
            <option value="metric">{t("prefs.metric")}</option><option value="imperial">{t("prefs.imperial")}</option>
          </Select>
        </Field>
        <Field label={t("prefs.weekStart")}>
          <Select value={s.weekStart} onChange={(e) => setS({ ...s, weekStart: e.target.value as SettingsT["weekStart"] })}>
            <option value="monday">{t("prefs.monday")}</option><option value="sunday">{t("prefs.sunday")}</option>
          </Select>
        </Field>
        <Field label={t("prefs.timezone")}>
          <Select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>
            {[...new Set(["UTC", s.timezone, ...zones])].map((z) => <option key={z}>{z}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={t("prefs.runDays")} hint={t("prefs.runDaysHint")}>
        {/* One row of seven on phones too: the grid shares the width, wider screens keep fixed buttons. */}
        <div className="grid grid-cols-7 gap-1 sm:flex sm:flex-wrap">
          {order.map((d) => {
            const on = s.runDays.includes(d);
            return (
              <button key={d} type="button" aria-pressed={on} onClick={() => setS({ ...s, runDays: on ? s.runDays.filter((x) => x !== d) : [...s.runDays, d] })}
                className={`h-11 min-w-0 rounded-md text-sm sm:h-9 sm:w-12 ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{WEEKDAY_SHORT[d]}</button>
            );
          })}
        </div>
      </Field>
      <Field label={t("prefs.longRunDay")} hint={t("prefs.longRunDayHint")}>
        <div>
          <Select value={String(s.longRunDay)} onChange={(e) => setS({ ...s, longRunDay: Number(e.target.value) })} className="w-48">
            {order.map((d) => <option key={d} value={d}>{WEEKDAY_LONG[d]}{s.runDays.includes(d) ? "" : ` (${t("prefs.notRunDay")})`}</option>)}
          </Select>
        </div>
      </Field>
      <div className="flex items-center gap-3">
        <BusyButton busy={busy} onClick={() => save(s)}>{t("common.save")}</BusyButton>
        {saved && <Badge tone="success">{t("common.saved")}</Badge>}
        {s.timezone !== Intl.DateTimeFormat().resolvedOptions().timeZone && (
          <button className="text-xs text-muted-foreground underline" onClick={() => setS({ ...s, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })}>{t("prefs.useDeviceTz")}</button>
        )}
      </div>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

function HeartRateCard() {
  const { settings, save, busy, error, saved } = useSave();
  const [maxHr, setMaxHr] = useState("");
  const [lthr, setLthr] = useState("");
  const [zones, setZones] = useState<string[]>(["", "", "", ""]);
  const [easyLow, setEasyLow] = useState("");
  const [easyHigh, setEasyHigh] = useState("");
  useEffect(() => {
    setMaxHr(settings.maxHr?.toString() ?? "");
    setZones(settings.zones ? settings.zones.map(String) : ["", "", "", ""]);
    setEasyLow(settings.easyLow?.toString() ?? "");
    setEasyHigh(settings.easyHigh?.toString() ?? "");
  }, [settings]);
  const custom = zones.every((z) => z.trim() !== "");
  const onSave = (useWatch = false) => save({
    ...settings, maxHr: numOrNull(maxHr), easyLow: numOrNull(easyLow), easyHigh: numOrNull(easyHigh),
    zones: custom && !useWatch ? (zones.map(Number) as ZoneBounds) : null,
  });
  return (
    <Card className="space-y-3">
      <CardTitle>{t("stat.heartRate")}</CardTitle>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label={t("hr.max")}><Input inputMode="numeric" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} placeholder="190" /></Field>
        <Field label={t("hr.bandFrom")} hint={t("hr.bandHint")}><Input inputMode="numeric" value={easyLow} onChange={(e) => setEasyLow(e.target.value)} placeholder="135" /></Field>
        <Field label={t("hr.bandTo")}><Input inputMode="numeric" value={easyHigh} onChange={(e) => setEasyHigh(e.target.value)} placeholder="150" /></Field>
      </div>
      <div>
        <div className="mb-1 text-sm font-medium">{t("hr.zones")}</div>
        <p className="mb-2 text-xs text-muted-foreground">{t("hr.zonesHint")}</p>
        <div className="grid grid-cols-4 gap-2">
          {zones.map((z, i) => (
            <Field key={i} label={t("hr.zoneTop", { n: i + 1 })}><Input inputMode="numeric" value={z} onChange={(e) => setZones(zones.map((x, j) => (j === i ? e.target.value : x)))} /></Field>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <Button variant="outline" className="h-8 text-xs" disabled={!maxHr} onClick={() => setZones(zonesFromMaxHr(Number(maxHr)).map(String))}>{t("hr.fromMax")}</Button>
          <Input className="h-8 w-24 text-xs" inputMode="numeric" placeholder="LTHR" value={lthr} onChange={(e) => setLthr(e.target.value)} />
          <Button variant="outline" className="h-8 text-xs" disabled={!lthr} onClick={() => setZones(zonesFromLthr(Number(lthr)).map(String))}>{t("hr.fromLthr")}</Button>
          {/* Clears and saves in one go: clearing alone looked like nothing happened when the fields were already empty. */}
          {(settings.zones || zones.some((z) => z.trim())) && (
            <Button variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => { setZones(["", "", "", ""]); void onSave(true); }}>{t("hr.useWatch")}</Button>
          )}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{settings.zones ? t("hr.usingOwn", { zones: settings.zones.join(" / ") }) : t("hr.usingWatch")}</p>
      </div>
      <div className="flex items-center gap-3">
        <BusyButton busy={busy} onClick={() => onSave()}>{t("common.save")}</BusyButton>
        {saved && <Badge tone="success">{t("common.saved")}</Badge>}
      </div>
      <ErrorText>{error && t("hr.invalid")}</ErrorText>
    </Card>
  );
}

function ThresholdCard() {
  const fmt = useFmt();
  const { settings } = useSettings();
  const { data, reload } = useApi<Threshold[]>("/thresholds");
  const [date, setDate] = useState(todayIn(settings.timezone));
  const [pace, setPace] = useState("");
  const [hr, setHr] = useState("");
  const add = useAction(async () => {
    const p = pace ? parsePace(pace, fmt.units) : null;
    if (pace && p == null) throw new Error(t("threshold.paceFormat"));
    await api("/thresholds", { body: { effectiveDate: date, paceSecPerKm: p, hr: hr ? Number(hr) : null } });
    setPace(""); setHr("");
  }, reload);
  const del = useAction((id: number) => api(`/thresholds/${id}`, { method: "DELETE" }), reload);
  return (
    <Card id="thresholds" data-tour="settings-threshold" className="space-y-3">
      <CardTitle>{t("threshold.title")}</CardTitle>
      <p className="text-xs text-muted-foreground">{t("threshold.settingsHint")}</p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
        <Field label={t("common.from")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label={t("threshold.paceLabel", { unit: fmt.unit })}><Input value={pace} onChange={(e) => setPace(e.target.value)} placeholder="4:41" /></Field>
        <Field label={t("threshold.hrLabel")}><Input inputMode="numeric" value={hr} onChange={(e) => setHr(e.target.value)} placeholder={t("common.optional").toLowerCase()} /></Field>
        <BusyButton variant="outline" busy={add.busy} disabled={!pace && !hr} onClick={() => add.run()}>{t("common.add")}</BusyButton>
      </div>
      <ErrorText>{add.error ?? del.error}</ErrorText>
      {data && data.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {[...data].reverse().map((th) => (
            <li key={th.id} className="flex items-center justify-between py-1.5">
              <span>{fmtDay(th.effectiveDate, { day: "numeric", month: "short", year: "numeric" })} · {fmt.pace(th.paceSecPerKm)}{th.hr && ` · ${th.hr} bpm`}</span>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => del.run(th.id)}>{t("common.remove")}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function GarminCard() {
  const { settings } = useSettings();
  const { data, reload } = useApi<GarminInfo>("/garmin");
  const [key, setKey] = useState("");
  const [expiry, setExpiry] = useState("90");
  const today = todayIn(settings.timezone);
  const sync = useSync();
  const tour = useTour();
  const { result } = sync;
  useReloadOnSync(reload);
  const connect = useAction(async () => {
    await api("/garmin", { method: "PUT", body: { apiKey: key, keyExpiresOn: expiry === "unknown" ? null : addDays(today, Number(expiry)) } });
    setKey("");
  }, () => { reload(); void sync.run(); tour.signal("garmin-connected"); }); // the first sync starts right away
  const disconnect = useAction(() => api("/garmin", { method: "DELETE" }), reload);

  return (
    <Card data-tour="settings-garmin" className="space-y-3">
      <CardTitle action={data?.connected && <Badge tone="success">{t("garmin.connected")}</Badge>}>Garmin</CardTitle>
      {data?.connected ? (
        <>
          <div className="text-sm text-muted-foreground">
            {t("garmin.lastSync", { ago: fmtAgo(data.lastSyncAt) })}.
            {data.keyExpiresOn && <> {t("garmin.keyExpiresOn", { date: fmtDay(data.keyExpiresOn, { day: "numeric", month: "short", year: "numeric" }) })}{data.daysLeft != null && data.daysLeft <= 7 && <span className="text-warning"> ({data.daysLeft < 0 ? t("garmin.expired") : tn("garmin.daysLeft", data.daysLeft)})</span>}.</>}
          </div>
          {data.lastError && <ErrorText>{t("garmin.lastError", { error: data.lastError })}</ErrorText>}
          <div className="flex flex-wrap items-center gap-2">
            <BusyButton data-tour="settings-sync" busy={sync.busy} busyLabel={`${t("garmin.syncing")}…`} onClick={() => sync.run()}><SyncIcon />{t("garmin.syncNow")}</BusyButton>
            <Button variant="ghost" onClick={() => disconnect.run()}>{t("garmin.disconnect")}</Button>
          </div>
          {result && <p className="text-sm text-muted-foreground">{t("garmin.syncResult", { added: result.added, details: result.details })}{result.moreDetails > 0 && ` ${t("garmin.moreDetails", { count: result.moreDetails })}`}</p>}
          <ErrorText>{sync.error ?? disconnect.error}</ErrorText>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">{t("garmin.replaceKey")}</summary>
            <KeyForm keyVal={key} setKey={setKey} expiry={expiry} setExpiry={setExpiry} busy={connect.busy} onSubmit={() => connect.run()} error={connect.error} />
          </details>
        </>
      ) : (
        <>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>{t("garmin.step1a")} <a className="underline" href="https://connect.garmin.com/app/settings/personalApiToken" target="_blank" rel="noreferrer">Garmin Connect → Personal API key</a> {t("garmin.step1b")}</li>
            <li>{t("garmin.step2")}</li>
          </ol>
          <KeyForm keyVal={key} setKey={setKey} expiry={expiry} setExpiry={setExpiry} busy={connect.busy} onSubmit={() => connect.run()} error={connect.error} />
        </>
      )}
    </Card>
  );
}

interface IntervalsInfo { connected: boolean; athleteName?: string | null; lastPushAt?: number | null; lastError?: string | null; warnings?: string[]; sent?: number }
interface PushResult { sent: number; deleted: number; unchanged: number }

/**
 * Add-ons: optional links to other services, apart from Garmin (which every user needs). Each one is
 * a compact card that opens its setup on "Koppla"; links elsewhere point at #addon-<id>
 * (docs/decisions/fartlek-watch-push.md).
 */
function AddOns() {
  return (
    <section className="space-y-2" aria-labelledby="addons-title">
      <div className="px-1">
        <h2 id="addons-title" className="text-lg font-semibold">{t("addons.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("addons.intro")}</p>
      </div>
      <IntervalsAddOn />
    </section>
  );
}

/** intervals.icu as the way to the watch. */
function IntervalsAddOn() {
  const { data, reload } = useApi<IntervalsInfo>("/intervals");
  const [open, setOpen] = useState(() => location.hash === "#addon-intervals");
  const [key, setKey] = useState("");
  const [result, setResult] = useState<PushResult | null>(null);
  const connect = useAction(async () => {
    await api("/intervals", { method: "PUT", body: { apiKey: key, lang } });
    setKey("");
    setOpen(false);
  }, reload);
  const push = useAction(async () => {
    const r = await api<{ result: PushResult }>("/intervals/push", { method: "POST" });
    setResult(r.result);
  }, reload);
  const disconnect = useAction(() => api("/intervals", { method: "DELETE" }), () => { setResult(null); setOpen(false); reload(); });
  useEffect(() => {
    if (location.hash === "#addon-intervals") document.getElementById("addon-intervals")?.scrollIntoView({ block: "start" });
  }, []);

  const form = (
    <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); void connect.run(); }}>
      <Field label={t("intervals.apiKey")}><Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} /></Field>
      <BusyButton type="submit" busy={connect.busy} busyLabel={`${t("intervals.checking")}…`} disabled={!key.trim()}>{t("intervals.connect")}</BusyButton>
      <ErrorText>{connect.error}</ErrorText>
    </form>
  );
  const connected = !!data?.connected;
  const attention = connected && (!!data.lastError || !!data.warnings?.length);

  return (
    <Card id="addon-intervals" className="space-y-3 scroll-mt-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {t("intervals.title")}
            {connected && <Badge tone={attention ? "warning" : "success"}>{t(attention ? "addons.needsAttention" : "garmin.connected")}</Badge>}
          </h3>
          <p className="text-sm text-muted-foreground">{t("intervals.what")}</p>
          {!connected && <p className="text-xs text-muted-foreground">{t("intervals.needs")}</p>}
          {connected && (
            <p className="mt-1 text-sm">
              {data.athleteName && <>{t("intervals.connectedAs", { name: data.athleteName })} </>}
              {data.lastPushAt ? t("intervals.status", { count: data.sent ?? 0, ago: fmtAgo(data.lastPushAt) }) : t("intervals.never")}
            </p>
          )}
        </div>
        <Button variant={connected ? "ghost" : "outline"} className="h-8 shrink-0 text-xs" aria-expanded={open} aria-controls="addon-intervals-body" onClick={() => setOpen((o) => !o)}>
          {open ? t("addons.close") : connected ? t("addons.settings") : t("addons.connect")}
        </Button>
      </div>

      {connected && attention && !open && (
        <>
          {data.warnings?.map((w) => <p key={w} className="text-sm text-warning">{t(w as Parameters<typeof t>[0])}</p>)}
          {data.lastError && <ErrorText>{t("intervals.lastError", { error: data.lastError })}</ErrorText>}
        </>
      )}

      {open && (
        <div id="addon-intervals-body" className="space-y-3 border-t border-border pt-3">
          {connected ? (
            <>
              <p className="text-sm text-muted-foreground">{t("intervals.intro")}</p>
              {data.warnings?.map((w) => <p key={w} className="text-sm text-warning">{t(w as Parameters<typeof t>[0])}</p>)}
              {data.lastError && <ErrorText>{t("intervals.lastError", { error: data.lastError })}</ErrorText>}
              <div className="flex flex-wrap gap-2">
                <BusyButton busy={push.busy} busyLabel={`${t("intervals.sending")}…`} onClick={() => push.run()}>{t("intervals.sendNow")}</BusyButton>
                <BusyButton variant="ghost" busy={disconnect.busy} onClick={() => disconnect.run()} title={t("intervals.disconnectHint")}>{t("intervals.disconnect")}</BusyButton>
              </div>
              {result && <p className="text-sm text-muted-foreground">{t("intervals.result", { sent: result.sent, deleted: result.deleted, unchanged: result.unchanged })}</p>}
              <ErrorText>{push.error ?? disconnect.error}</ErrorText>
              <details className="text-sm">
                <summary className="cursor-pointer text-muted-foreground">{t("intervals.replaceKey")}</summary>
                <div className="mt-2">{form}</div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">{t("intervals.intro")}</p>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                <li>{t("intervals.step1")} <a className="underline" href="https://intervals.icu/settings" target="_blank" rel="noreferrer">intervals.icu/settings</a></li>
                <li>{t("intervals.step2")}</li>
                <li>{t("intervals.step3")}</li>
              </ol>
              {form}
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function KeyForm({ keyVal, setKey, expiry, setExpiry, busy, onSubmit, error }: {
  keyVal: string; setKey: (v: string) => void; expiry: string; setExpiry: (v: string) => void; busy: boolean; onSubmit: () => void; error: string | null;
}) {
  return (
    <form className="mt-2 space-y-2" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <div className="grid gap-2 sm:grid-cols-[1fr_10rem]">
        <Field label={t("garmin.apiKey")}><Input type="password" autoComplete="off" value={keyVal} onChange={(e) => setKey(e.target.value)} /></Field>
        <Field label={t("garmin.expiresAfter")}>
          <Select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
            <option value="30">{tn("garmin.days", 30)}</option><option value="90">{tn("garmin.days", 90)}</option><option value="180">{tn("garmin.days", 180)}</option><option value="365">{t("trends.year")}</option><option value="unknown">{t("garmin.notSure")}</option>
          </Select>
        </Field>
      </div>
      <BusyButton type="submit" busy={busy} busyLabel={`${t("garmin.checking")}…`} disabled={!keyVal.trim()}>{t("garmin.connectShort")}</BusyButton>
      <ErrorText>{error}</ErrorText>
    </form>
  );
}

function DataCard() {
  const demo = useAction(() => api("/demo", { method: "POST" }), () => location.assign("/"));
  const [confirm, setConfirm] = useState(false);
  const wipe = useAction(() => api("/data", { method: "DELETE" }), () => location.assign("/"));
  const tour = useTour();
  const { demoMode } = useAuth();
  const replay = useAction(async () => {
    const g = demoMode ? null : await api<GarminInfo>("/garmin");
    await api("/tours", { method: "DELETE" });
    tour.start(onboardingTour({ needsGarmin: !!g && !g.connected }));
  });
  return (
    <Card className="space-y-3">
      <CardTitle>{t("data.title")}</CardTitle>
      <div className="flex flex-wrap items-center gap-2">
        <BusyButton variant="outline" busy={demo.busy} busyLabel={`${t("demo.generating")}…`} onClick={() => demo.run()}>{t("demo.load")}</BusyButton>
        <span className="text-xs text-muted-foreground">{t("demo.hint")}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {confirm ? (
          <>
            <BusyButton variant="danger" busy={wipe.busy} onClick={() => wipe.run()}>{t("data.confirmWipe")}</BusyButton>
            <Button variant="ghost" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
          </>
        ) : <Button variant="outline" onClick={() => setConfirm(true)}>{t("data.wipe")}</Button>}
        <span className="text-xs text-muted-foreground">{t("data.wipeHint")}</span>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">{tShared("news.list")}</summary>
        <div className="pt-3"><NewsList entries={NEWS} /></div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <BusyButton variant="outline" busy={replay.busy} onClick={() => replay.run()}>{t("tour.replay")}</BusyButton>
        <span className="text-xs text-muted-foreground">{t("tour.replayHint")}</span>
      </div>
      <ErrorText>{demo.error ?? wipe.error ?? replay.error}</ErrorText>
    </Card>
  );
}

function CriticalSpeedCard() {
  const fmt = useFmt();
  const { settings } = useSettings();
  const { data, reload } = useApi<CsTest[]>("/cs-tests");
  const [kind, setKind] = useState<"trials" | "three_min">("trials");
  const [date, setDate] = useState(todayIn(settings.timezone));
  const [rows, setRows] = useState([{ d: "", t: "" }, { d: "", t: "" }, { d: "", t: "" }]);
  const [total, setTotal] = useState("");
  const [last30, setLast30] = useState("");
  const setRow = (i: number, k: "d" | "t", v: string) => setRows((r) => r.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const add = useAction(async () => {
    if (kind === "three_min") {
      await api("/cs-tests", { body: { date, kind, totalM: Number(total), last30M: Number(last30) } });
      setTotal(""); setLast30("");
      return;
    }
    const filled = rows.filter((r) => r.d.trim() || r.t.trim());
    const efforts = filled.map((r, i) => {
      const secs = parseClock(r.t);
      if (secs == null || !Number(r.d)) throw new Error(t("cs.effortInvalid", { n: i + 1 }));
      return { distanceM: Number(r.d), durationS: secs };
    });
    await api("/cs-tests", { body: { date, kind, efforts } });
    setRows([{ d: "", t: "" }, { d: "", t: "" }, { d: "", t: "" }]);
  }, reload);
  const del = useAction((id: number) => api(`/cs-tests/${id}`, { method: "DELETE" }), reload);
  return (
    <Card id="critical-speed" className="space-y-3">
      <CardTitle>{t("cs.title")}</CardTitle>
      <p className="text-xs text-muted-foreground">{t("cs.settingsHint")}</p>
      <SegmentedControl value={kind} onChange={setKind} options={[{ value: "trials", label: t("cs.trialsLabel") }, { value: "three_min", label: t("cs.threeMinLabel") }]} />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
        <Field label={t("common.date")}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
      </div>
      {kind === "trials" ? (
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
              <Field label={t("cs.effortDist", { n: i + 1 })}><Input inputMode="numeric" value={r.d} onChange={(e) => setRow(i, "d", e.target.value)} placeholder={["900", "1700", "3000"][i]} /></Field>
              <Field label={t("cs.time")}><Input value={r.t} onChange={(e) => setRow(i, "t", e.target.value)} placeholder={["3:00", "6:30", "12:00"][i]} /></Field>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:items-end">
          <Field label={t("cs.total")}><Input inputMode="numeric" value={total} onChange={(e) => setTotal(e.target.value)} placeholder="900" /></Field>
          <Field label={t("cs.last30")}><Input inputMode="numeric" value={last30} onChange={(e) => setLast30(e.target.value)} placeholder="115" /></Field>
        </div>
      )}
      <BusyButton variant="outline" busy={add.busy} onClick={() => add.run()}>{t("cs.calculate")}</BusyButton>
      <ErrorText>{add.error ?? del.error}</ErrorText>
      {data && data.length > 0 && (
        <ul className="divide-y divide-border text-sm">
          {[...data].reverse().map((c) => (
            <li key={c.id} className="flex items-center justify-between py-1.5">
              <span>{fmtDay(c.date, { day: "numeric", month: "short", year: "numeric" })} · CS {fmt.pace(c.paceSecPerKm)} · D′ {Math.round(c.dPrimeM)} m <span className="text-muted-foreground">({c.kind === "trials" ? t("cs.trials") : t("cs.threeMin")})</span></span>
              <Button variant="ghost" className="h-7 px-2 text-xs" onClick={() => del.run(c.id)}>{t("common.remove")}</Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
