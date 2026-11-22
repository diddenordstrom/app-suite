import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, Card, Input, Select as NativeSelect } from "../ui";
import { ApiError, api, get, useLoad } from "../api";
import { inviteUrl, useHousehold } from "../household";
import { LANGS, lang, setLang, t, type Lang, type MsgKey } from "../i18n";
import { reportError, showError } from "../toast";
import { Select } from "../components/Select";
import { Combobox } from "../components/Combobox";
import { EmptyState, FormError, Label, PageTitle, PlusIcon, SectionTitle, Separator, Skeleton, UnitInput } from "../components/common";

interface MacroPreset { id: number; name: string; kcalPerPerson: number; proteinG: number; carbsG: number; fatG: number; activityLevel: string }
interface MacroTarget { id: number; householdId: number; name: string; dailyKcal: number; dailyProteinG: number; dailyCarbsG: number; dailyFatG: number; active: boolean }
interface Household { id: number; name: string; persons: number; defaultPlantingUnit: "area" | "count"; growingZone: number | null }
interface WishlistEntry { id: number; householdId: number; cropId: number; kgPerWeek: number | null; kgPerYear: number | null }
interface Crop { id: number; name: string; category: string }
interface CropPriceEntry { id: number; householdId: number; cropId: number; pricePerKg: number }
interface MacroAdvisory {
  totalWishlistEntries: number;
  entriesWithDemand: number;
  weakestMacro: "protein" | "carbs" | "fat" | null;
  weakestPct: number | null;
  suggestions: { cropId: number; cropName: string; valuePerKg: number }[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A positive decimal typed with either separator, or null for empty/invalid. */
function parsePositive(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (normalized === "") return null;
  const num = Number(normalized);
  return Number.isFinite(num) && num > 0 ? num : null;
}

const zoneOptions = [1, 2, 3, 4, 5, 6, 7, 8].map((z) => ({ id: z, name: t(`settings.household.zone.options.${z}` as MsgKey) }));

export function Settings() {
  const { current, isOwner } = useHousehold();
  const [gen, setGen] = useState(0);
  const { data, loading, reload } = useLoad(async () => {
    const [household, presets, stats, crops, targets, wishlist, prices] = await Promise.all([
      get<Household>("/household/current"),
      get<MacroPreset[]>("/macro-preset"),
      get<{ totalBytes: number; imageBytes: number }>("/db-stats").catch(() => null),
      get<Crop[]>("/crops"),
      get<MacroTarget[]>("/macro-target", { householdId: current.id }),
      get<WishlistEntry[]>("/wishlist", { householdId: current.id }),
      get<CropPriceEntry[]>("/crop-prices", { householdId: current.id }),
    ]);
    return { household, presets, stats, crops, targets, wishlist, prices };
  }, [current.id]);

  return (
    <div>
      <header className="mb-6 flex items-baseline gap-3">
        <PageTitle className="mb-0">{t("settings.title")}</PageTitle>
        <span data-testid="app-version" className="text-xs text-muted-foreground">build: {__COMMIT_SHA__.slice(0, 7)}</span>
      </header>
      {loading && !data ? <SettingsSkeleton /> : data && (
        <>
          <HouseholdSection household={data.household} />
          <Separator className="my-8" />
          <HouseholdMembers />
          <Separator className="my-8" />
          <NutritionSection key={`n${gen}`} household={data.household} presets={data.presets} initial={data.targets} />
          <Separator className="my-8" />
          <WishlistSection key={`w${gen}`} crops={data.crops} initial={data.wishlist} />
          <Separator className="my-8" />
          <CropPricesSection key={`p${gen}`} crops={data.crops} initial={data.prices} />
          <Separator className="my-8" />
          <section aria-labelledby="storage-heading" data-testid="storage-section" className="mb-8">
            <SectionTitle id="storage-heading" className="mb-2">{t("settings.sections.storage")}</SectionTitle>
            <Card className="text-sm">
              {data.stats
                ? <p data-testid="db-size-line">{t("settings.storage.line", { total: formatBytes(data.stats.totalBytes), images: formatBytes(data.stats.imageBytes) })}</p>
                : <p className="text-muted-foreground">{t("common.loading")}</p>}
            </Card>
          </section>
          {isOwner && <><Separator className="my-8" /><DangerZone onReset={async () => { await reload(); setGen((g) => g + 1); }} /></>}
        </>
      )}
    </div>
  );
}

function SettingsSkeleton() {
  return (
    <>
      <Skeleton className="mb-4 h-5 w-32" />
      <Card className="space-y-5">
        {[0, 1, 2, 3].map((i) => <div key={i} className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-9 w-full" /></div>)}
      </Card>
      <Separator className="my-8" />
      <Skeleton className="mb-4 h-5 w-40" />
      <div className="grid gap-3">{[0, 1].map((i) => <Card key={i}><Skeleton className="mb-2 h-5 w-32" /><Skeleton className="h-16 w-full" /></Card>)}</div>
    </>
  );
}

function HouseholdSection({ household }: { household: Household }) {
  const { refresh } = useHousehold();
  const [form, setForm] = useState({ name: household.name, persons: String(household.persons ?? ""), defaultPlantingUnit: household.defaultPlantingUnit ?? "area", growingZone: household.growingZone ?? null });
  const [error, setError] = useState<string | null>(null);
  const [zoneBusy, setZoneBusy] = useState(false);
  const [zoneMsg, setZoneMsg] = useState<{ text: string; error: boolean } | null>(null);

  const save = async (next = form) => {
    setError(null);
    if (!next.name.trim()) return setError(t("household.errors.nameRequired"));
    const persons = Number(next.persons);
    if (!next.persons || !(persons > 0)) return setError(t("household.errors.minPersons"));
    try {
      await api("PUT", `/household/${household.id}`, { name: next.name.trim(), persons, defaultPlantingUnit: next.defaultPlantingUnit, growingZone: next.growingZone });
      if (next.name.trim() !== household.name) {
        household.name = next.name.trim();
        void refresh();
      }
    } catch {
      setError(t("household.errors.saveFailed"));
    }
  };
  /** Selects save as soon as they change; text fields save on blur. */
  const change = (patch: Partial<typeof form>) => {
    const next = { ...form, ...patch };
    setForm(next);
    void save(next);
  };

  const detectZone = async () => {
    setZoneBusy(true);
    setZoneMsg(null);
    try {
      if (!window.isSecureContext) return setZoneMsg({ text: t("settings.household.zone.requiresHttps"), error: true });
      const position = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000, maximumAge: 300_000 }));
      const { zone } = await get<{ zone: number }>("/zone-detect", { latitude: position.coords.latitude, longitude: position.coords.longitude });
      change({ growingZone: zone });
      setZoneMsg({ text: t("settings.household.zone.detected", { zone }), error: false });
    } catch (err) {
      const code = (err as { code?: number }).code;
      const text =
        err instanceof ApiError && err.status === 422 ? t("settings.household.zone.outsideSweden")
        : code === 1 ? t("settings.household.zone.permissionDenied")
        : code === 2 || code === 3 ? t("settings.household.zone.detectError")
        : t("settings.household.zone.detectError") + ((err as Error).message ? `: ${(err as Error).message}` : "");
      setZoneMsg({ text, error: true });
    } finally {
      setZoneBusy(false);
    }
  };

  return (
    <section aria-labelledby="household-heading">
      <SectionTitle id="household-heading" className="mb-4">{t("settings.sections.household")}</SectionTitle>
      <Card className="space-y-5 pt-6">
        <FormError>{error}</FormError>
        <div className="space-y-2">
          <Label htmlFor="household-name">{t("household.form.name.label")}</Label>
          <Input id="household-name" value={form.name} placeholder={t("household.form.name.placeholder")}
            onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => void save()} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="household-persons">{t("household.form.persons.label")}</Label>
          <Input id="household-persons" type="number" min={1} placeholder="4" value={form.persons}
            onChange={(e) => setForm({ ...form, persons: e.target.value })} onBlur={() => void save()} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="default-planting-unit">{t("settings.household.defaultUnit.label")}</Label>
          <Select id="default-planting-unit" value={form.defaultPlantingUnit}
            options={[{ value: "area", label: t("settings.household.defaultUnit.area") }, { value: "count", label: t("settings.household.defaultUnit.count") }]}
            onChange={(v) => change({ defaultPlantingUnit: v })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="growing-zone">{t("settings.household.zone.label")}</Label>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div data-testid="growing-zone-select" className="flex-1">
              <Combobox id="growing-zone" value={form.growingZone} options={zoneOptions} placeholder={t("settings.household.zone.placeholder")} clearable
                onChange={(v) => change({ growingZone: v ?? null })} />
            </div>
            <Button type="button" variant="outline" className="h-10 shrink-0" data-testid="detect-zone-btn" disabled={zoneBusy} onClick={() => void detectZone()}>
              <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
              {zoneBusy ? t("settings.household.zone.detecting") : t("settings.household.zone.detect")}
            </Button>
          </div>
          {zoneMsg && <p data-testid="zone-detect-message" className={zoneMsg.error ? "text-xs text-danger" : "text-xs text-muted-foreground"}>{zoneMsg.text}</p>}
          <p className="text-xs text-muted-foreground">{t("settings.household.zone.hint")}</p>
        </div>
        <Separator />
        <div className="space-y-2">
          <Label htmlFor="language">{t("settings.language.label")}</Label>
          <NativeSelect id="language" value={lang} onChange={(e) => setLang(e.target.value as Lang)}>
            {LANGS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
          </NativeSelect>
        </div>
      </Card>
    </section>
  );
}

interface Member { userId: number; name: string | null; email: string | null; role: "owner" | "member" }

function HouseholdMembers() {
  const { current, isOwner, user, me } = useHousehold();
  const [members, setMembers] = useState<Member[]>([]);
  const [code, setCode] = useState(current.inviteCode);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const link = code ? inviteUrl(location.origin, code) : "";

  useEffect(() => {
    get<Member[]>("/household/current/members").then(setMembers, () => showError(t("members.errors.load")));
  }, []);

  const run = async (action: () => Promise<unknown>, errorKey: MsgKey) => {
    setBusy(true);
    try { await action(); } catch { showError(t(errorKey)); } finally { setBusy(false); }
  };
  const rotate = () => run(async () => setCode((await api<{ inviteCode: string }>("POST", "/household/current/invite")).inviteCode), "members.errors.rotate");
  const remove = (userId: number) => run(async () => {
    await api("DELETE", `/household/current/members/${userId}`);
    if (userId === user.id) location.href = "/";
    else setMembers((m) => m.filter((x) => x.userId !== userId));
  }, "members.errors.remove");
  const deleteHousehold = () => run(async () => {
    await api("DELETE", `/household/${current.id}`);
    location.href = "/";
  }, "members.errors.delete");
  const logout = async () => {
    try { await api("POST", "/auth/logout"); } catch { /* ignore */ }
    location.href = "/";
  };
  const copy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section aria-labelledby="members-heading" data-testid="household-members">
      <SectionTitle id="members-heading" className="mb-4">{t("members.title")}</SectionTitle>
      <Card className="space-y-5 pt-6">
        <div className="space-y-2">
          <p className="text-sm font-medium">{t("members.invite.label")}</p>
          <p className="text-xs text-muted-foreground">{t("members.invite.hint")}</p>
          <div className="flex gap-2">
            <Input value={link} readOnly data-testid="invite-link" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" className="shrink-0" onClick={() => void copy()}>
              {copied ? t("members.invite.copied") : t("members.invite.copy")}
            </Button>
          </div>
          {isOwner && (
            <button type="button" data-testid="rotate-invite" disabled={busy} onClick={() => void rotate()} className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
              {t("members.invite.rotate")}
            </button>
          )}
        </div>
        <Separator />
        <ul className="divide-y divide-border" data-testid="member-list">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name || m.email || t("members.unnamed")}
                  {m.userId === user.id && <span className="font-normal text-muted-foreground"> ({t("members.you")})</span>}
                </p>
                {m.name && m.email && <p className="truncate text-xs text-muted-foreground">{m.email}</p>}
              </div>
              <Badge tone={m.role === "owner" ? "signature" : "neutral"}>{t(`members.roles.${m.role}` as MsgKey)}</Badge>
              {m.role === "member" && (isOwner || m.userId === user.id) && (
                <Button type="button" variant="ghost" className="h-8 text-danger" disabled={busy}
                  data-testid={m.userId === user.id ? "leave-household" : "remove-member"} onClick={() => void remove(m.userId)}>
                  {m.userId === user.id ? t("members.leave") : t("members.remove")}
                </Button>
              )}
            </li>
          ))}
        </ul>
        {isOwner && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">{t("members.delete.hint")}</p>
              <div className="flex flex-wrap gap-2">
                {!confirmDelete ? (
                  <Button type="button" variant="outline" className="h-8 text-danger" data-testid="delete-household" onClick={() => setConfirmDelete(true)}>
                    {t("members.delete.button")}
                  </Button>
                ) : (
                  <>
                    <Button type="button" variant="danger" className="h-8" data-testid="confirm-delete-household" disabled={busy} onClick={() => void deleteHousehold()}>
                      {t("members.delete.confirm", { name: current.name })}
                    </Button>
                    <Button type="button" variant="ghost" className="h-8" onClick={() => setConfirmDelete(false)}>{t("members.delete.cancel")}</Button>
                  </>
                )}
              </div>
            </div>
          </>
        )}
        {me.authMode === "oidc" && (
          <>
            <Separator />
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-xs text-muted-foreground">{t("members.signedInAs", { name: user.name || user.email || "" })}</p>
              <Button type="button" variant="outline" className="h-8" data-testid="logout" onClick={() => void logout()}>{t("members.logout")}</Button>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

const emptyTarget = { name: "", dailyKcal: "", dailyProteinG: "", dailyCarbsG: "", dailyFatG: "", presetId: undefined as number | undefined };

function NutritionSection({ household, presets, initial }: { household: Household; presets: MacroPreset[]; initial: MacroTarget[] }) {
  const [targets, setTargets] = useState(initial);
  const [form, setForm] = useState(emptyTarget);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = async () => setTargets(await get<MacroTarget[]>("/macro-target", { householdId: household.id }));
  const open = (target?: MacroTarget) => {
    setError(null);
    setEditingId(target?.id ?? null);
    setForm(target
      ? { name: target.name, dailyKcal: String(target.dailyKcal), dailyProteinG: String(target.dailyProteinG), dailyCarbsG: String(target.dailyCarbsG), dailyFatG: String(target.dailyFatG), presetId: undefined }
      : emptyTarget);
    setShowForm(true);
  };
  const applyPreset = (presetId: number | undefined) => {
    const p = presets.find((x) => x.id === presetId);
    const persons = household.persons || 1;
    setForm((f) => p
      ? { ...f, presetId, dailyKcal: String(p.kcalPerPerson * persons), dailyProteinG: String(p.proteinG * persons), dailyCarbsG: String(p.carbsG * persons), dailyFatG: String(p.fatG * persons) }
      : { ...f, presetId });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) return setError(t("settings.nutrition.errors.nameRequired"));
    const checks: [string, MsgKey][] = [
      [form.dailyKcal, "settings.nutrition.errors.kcalRequired"],
      [form.dailyProteinG, "settings.nutrition.errors.proteinRequired"],
      [form.dailyCarbsG, "settings.nutrition.errors.carbsRequired"],
      [form.dailyFatG, "settings.nutrition.errors.fatRequired"],
    ];
    for (const [v, key] of checks) if (!(Number(v) > 0)) return setError(t(key));
    setSaving(true);
    try {
      const body = { name: form.name.trim(), dailyKcal: Number(form.dailyKcal), dailyProteinG: Number(form.dailyProteinG), dailyCarbsG: Number(form.dailyCarbsG), dailyFatG: Number(form.dailyFatG), householdId: household.id };
      if (editingId) await api("PUT", `/macro-target/${editingId}`, body);
      else await api("POST", "/macro-target", body);
      setShowForm(false);
      setEditingId(null);
      await reload();
    } catch {
      setError(t("settings.nutrition.errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    if (!confirm(t("settings.nutrition.confirm.delete"))) return;
    await api("DELETE", `/macro-target/${id}`).catch(reportError);
    await reload();
  };
  const activate = async (id: number) => {
    await api("POST", `/macro-target/${id}/activate`).catch(reportError);
    await reload();
  };

  const macroField = (key: "dailyKcal" | "dailyProteinG" | "dailyCarbsG" | "dailyFatG", id: string, labelKey: MsgKey, phKey: MsgKey, unit: string) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{t(labelKey)}</Label>
      <UnitInput id={id} type="number" min={1} unit={unit} placeholder={t(phKey)} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <section aria-labelledby="nutrition-heading">
      <div className="mb-4 flex items-center justify-between">
        <SectionTitle id="nutrition-heading" className="mb-0">{t("settings.sections.nutrition")}</SectionTitle>
        {!showForm && <Button className="size-10 px-0" aria-label={t("settings.nutrition.addButton.ariaLabel")} onClick={() => open()}><PlusIcon /></Button>}
      </div>
      {showForm && (
        <Card className="mb-6 pt-6" data-testid="macro-target-form">
          <form className="space-y-4" onSubmit={(e) => void save(e)}>
            <FormError>{error}</FormError>
            {!editingId && (
              <div className="space-y-2">
                <Label htmlFor="preset">{t("settings.nutrition.preset.label")}</Label>
                <Combobox id="preset" value={form.presetId} options={presets} placeholder={t("settings.nutrition.preset.placeholder")} clearable onChange={applyPreset} />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="target-name">{t("settings.nutrition.form.name.label")}</Label>
              <Input id="target-name" value={form.name} placeholder={t("settings.nutrition.form.name.placeholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            {macroField("dailyKcal", "target-kcal", "settings.nutrition.form.kcal.label", "settings.nutrition.form.kcal.placeholder", "kcal")}
            {macroField("dailyProteinG", "target-protein", "settings.nutrition.form.protein.label", "settings.nutrition.form.protein.placeholder", "g")}
            {macroField("dailyCarbsG", "target-carbs", "settings.nutrition.form.carbs.label", "settings.nutrition.form.carbs.placeholder", "g")}
            {macroField("dailyFatG", "target-fat", "settings.nutrition.form.fat.label", "settings.nutrition.form.fat.placeholder", "g")}
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={saving}>
                {saving ? t("settings.nutrition.button.saving") : editingId ? t("settings.nutrition.button.update") : t("settings.nutrition.button.create")}
              </Button>
              <Button type="button" variant="outline" onClick={() => { setShowForm(false); setEditingId(null); }}>{t("settings.nutrition.button.cancel")}</Button>
            </div>
          </form>
        </Card>
      )}
      {targets.length > 0 ? (
        <div className="grid gap-3">
          {targets.map((target) => (
            <Card key={target.id} data-testid="macro-target-card">
              <div className="mb-2 flex items-start justify-between">
                <h3 className="font-semibold">{target.name}</h3>
                {target.active && <Badge tone="signature">{t("settings.nutrition.badge.active")}</Badge>}
              </div>
              <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <div><span className="text-muted-foreground">{t("settings.nutrition.card.kcal")}</span><p className="font-medium tabular-nums">{target.dailyKcal}</p></div>
                <div><span className="text-muted-foreground">{t("settings.nutrition.card.protein")}</span><p className="font-medium tabular-nums">{target.dailyProteinG} g</p></div>
                <div><span className="text-muted-foreground">{t("settings.nutrition.card.carbs")}</span><p className="font-medium tabular-nums">{target.dailyCarbsG} g</p></div>
                <div><span className="text-muted-foreground">{t("settings.nutrition.card.fat")}</span><p className="font-medium tabular-nums">{target.dailyFatG} g</p></div>
              </div>
              <div className="flex gap-2">
                {!target.active && <Button variant="outline" className="h-8 flex-1" onClick={() => void activate(target.id)}>{t("settings.nutrition.button.activate")}</Button>}
                <Button variant="outline" className="h-8" onClick={() => open(target)}>{t("settings.nutrition.button.update")}</Button>
                <Button variant="outline" className="h-8" onClick={() => void remove(target.id)}>{t("settings.nutrition.button.delete")}</Button>
              </div>
            </Card>
          ))}
        </div>
      ) : !showForm && <EmptyState title={t("settings.nutrition.empty.title")} description={t("settings.nutrition.empty.description")} />}
    </section>
  );
}

const xIcon = (
  <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const rowClass = "flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-sm";

function WishlistSection({ crops, initial }: { crops: Crop[]; initial: WishlistEntry[] }) {
  const { current } = useHousehold();
  const [wishlist, setWishlist] = useState(initial);
  const [cropId, setCropId] = useState<number | undefined>();
  const [perWeek, setPerWeek] = useState("");
  const [perYear, setPerYear] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [advisory, setAdvisory] = useState<MacroAdvisory | null>(null);

  const loadAdvisory = () => get<MacroAdvisory>("/macro-advisory", { householdId: current.id }).then(setAdvisory, () => setAdvisory(null));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void loadAdvisory(); }, []);

  const cropName = (id: number) => crops.find((c) => c.id === id)?.name ?? "?";
  const available = crops.filter((c) => !wishlist.some((w) => w.cropId === c.id));

  /** With `suggested` (a macro-advisory chip) the inline inputs are unrelated, so a small weekly demand is seeded. */
  const add = async (suggested?: number) => {
    const cid = suggested ?? cropId;
    if (!cid) return;
    let kgPerWeek = parsePositive(perWeek);
    const kgPerYear = parsePositive(perYear);
    if (suggested !== undefined && kgPerWeek === null && kgPerYear === null) kgPerWeek = 0.5;
    if (kgPerWeek === null && kgPerYear === null) return setAddError(t("settings.demandPattern.requiredError"));
    setAddError(null);
    setSaving(true);
    try {
      const entry = await api<WishlistEntry>("POST", "/wishlist", { householdId: current.id, cropId: cid, kgPerWeek, kgPerYear });
      setWishlist((w) => [...w, entry]);
      if (suggested === undefined) { setCropId(undefined); setPerWeek(""); setPerYear(""); }
      await loadAdvisory();
    } catch (e) {
      reportError(e);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (id: number) => {
    await api("DELETE", `/wishlist/${id}`);
    setWishlist((w) => w.filter((x) => x.id !== id));
    await loadAdvisory();
  };
  const saveDemand = async (entry: WishlistEntry, field: "kgPerWeek" | "kgPerYear", value: string) => {
    const parsed = parsePositive(value);
    const other = field === "kgPerWeek" ? entry.kgPerYear : entry.kgPerWeek;
    // The server wants at least one demand field: clearing the last one is ignored.
    if (parsed === null && other === null) return;
    const body = { kgPerWeek: entry.kgPerWeek, kgPerYear: entry.kgPerYear, [field]: parsed };
    await api("PUT", `/wishlist/${entry.id}`, body);
    setWishlist((w) => w.map((x) => (x.id === entry.id ? { ...x, ...body } : x)));
    await loadAdvisory();
  };

  return (
    <section aria-labelledby="wishlist-heading" data-testid="wishlist-section">
      <SectionTitle id="wishlist-heading" className="mb-4">{t("settings.sections.wishlist")}</SectionTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.wishlist.description")}</p>
      <Card className="pt-6">
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <div data-testid="wishlist-crop-select" className="flex-1">
              <Combobox value={cropId} options={available} placeholder={t("settings.wishlist.addPlaceholder")} onChange={setCropId} onSubmit={() => void add()} />
            </div>
            <Button className="h-10" data-testid="wishlist-add-btn" disabled={!cropId || saving} onClick={() => void add()}>{t("common.add")}</Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Input value={perWeek} onChange={(e) => setPerWeek(e.target.value)} inputMode="decimal" placeholder={t("settings.wishlist.kgPerWeekPlaceholder")} data-testid="wishlist-add-kg-per-week" className="h-8 w-20 px-2 text-right tabular-nums" />
            <span className="whitespace-nowrap">{t("settings.wishlist.kgPerWeekUnit")}</span>
            <span className="px-1">·</span>
            <Input value={perYear} onChange={(e) => setPerYear(e.target.value)} inputMode="decimal" placeholder={t("settings.wishlist.kgPerYearPlaceholder")} data-testid="wishlist-add-kg-per-year" className="h-8 w-20 px-2 text-right tabular-nums" />
            <span className="whitespace-nowrap">{t("settings.wishlist.kgPerYearUnit")}</span>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">{t("settings.demandPattern.bothHelp")}</p>
          {addError && <p className="text-xs text-danger" data-testid="wishlist-add-error">{addError}</p>}
        </div>
        {wishlist.length > 0 ? (
          <div className="space-y-2">
            {wishlist.map((entry) => (
              <div key={entry.id} data-testid="wishlist-chip" className={rowClass}>
                <span className="flex-1 font-medium">{cropName(entry.cropId)}</span>
                {entry.kgPerWeek == null && entry.kgPerYear == null && (
                  <Badge tone="warning" data-testid="wishlist-missing-demand-badge" className="text-[10px] uppercase tracking-wide">{t("settings.demandPattern.missingBadge")}</Badge>
                )}
                <DemandInput testId="wishlist-kg-per-week" value={entry.kgPerWeek} placeholder={t("settings.wishlist.kgPerWeekPlaceholder")} unit={t("settings.wishlist.kgPerWeekUnit")} onCommit={(v) => void saveDemand(entry, "kgPerWeek", v).catch(reportError)} />
                <DemandInput testId="wishlist-kg-per-year" value={entry.kgPerYear} placeholder={t("settings.wishlist.kgPerYearPlaceholder")} unit={t("settings.wishlist.kgPerYearUnit")} onCommit={(v) => void saveDemand(entry, "kgPerYear", v).catch(reportError)} />
                <button type="button" className="ml-1 text-muted-foreground transition hover:text-foreground" aria-label={t("settings.wishlist.removeAriaLabel", { name: cropName(entry.cropId) })} onClick={() => void remove(entry.id).catch(reportError)}>
                  {xIcon}
                </button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">{t("settings.wishlist.empty")}</p>}
      </Card>

      {advisory && advisory.totalWishlistEntries > 0 && (
        <div className="mt-4" data-testid="macro-advisory">
          {advisory.entriesWithDemand < advisory.totalWishlistEntries ? (
            <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning" data-testid="macro-advisory-nudge">
              {t("settings.macroAdvisory.incompleteNudge", { filled: advisory.entriesWithDemand, total: advisory.totalWishlistEntries })}
            </div>
          ) : advisory.weakestMacro && (
            <div className="rounded-lg border border-border bg-accent p-3 text-sm text-accent-foreground" data-testid="macro-advisory-gap">
              <p>{t("settings.macroAdvisory.weakestGap", { pct: advisory.weakestPct ?? 0, macro: t(`settings.macroAdvisory.macroNames.${advisory.weakestMacro}` as MsgKey) })}</p>
              {advisory.suggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {advisory.suggestions.map((s) => (
                    <button key={s.cropId} type="button" data-testid="macro-advisory-suggestion" onClick={() => void add(s.cropId)}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium transition hover:bg-muted">
                      {s.cropName}<span className="text-primary">+</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** A small inline number that saves on change (blur/enter), like the old `@change` inputs. */
function DemandInput({ value, onCommit, placeholder, unit, testId, width = "w-16" }: { value: number | null; onCommit: (v: string) => void; placeholder: string; unit: string; testId: string; width?: string }) {
  const shown = value != null ? String(value) : "";
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  return (
    <div className="flex items-center gap-1">
      <Input value={text} inputMode="decimal" placeholder={placeholder} data-testid={testId} className={`h-7 ${width} px-2 text-right text-xs tabular-nums`}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== shown) onCommit(text); }}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      <span className="whitespace-nowrap text-[10px] text-muted-foreground">{unit}</span>
    </div>
  );
}

function CropPricesSection({ crops, initial }: { crops: Crop[]; initial: CropPriceEntry[] }) {
  const { current } = useHousehold();
  const [prices, setPrices] = useState(initial);
  const [cropId, setCropId] = useState<number | undefined>();
  const [price, setPrice] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cropName = (id: number) => crops.find((c) => c.id === id)?.name ?? "?";
  const available = crops.filter((c) => !prices.some((p) => p.cropId === c.id));

  const add = async () => {
    if (!cropId) return;
    const parsed = parsePositive(price);
    if (parsed === null) return setAddError(t("settings.cropPrices.validationError"));
    setAddError(null);
    setSaving(true);
    try {
      const entry = await api<CropPriceEntry>("POST", "/crop-prices", { householdId: current.id, cropId, pricePerKg: parsed });
      setPrices((p) => [...p, entry]);
      setCropId(undefined);
      setPrice("");
    } catch {
      setAddError(t("settings.cropPrices.saveError"));
    } finally {
      setSaving(false);
    }
  };
  const save = async (entry: CropPriceEntry, value: string) => {
    const parsed = parsePositive(value);
    if (parsed === null) return;
    try {
      const updated = await api<CropPriceEntry>("PATCH", `/crop-prices/${entry.cropId}`, { householdId: current.id, pricePerKg: parsed });
      setPrices((p) => p.map((x) => (x.id === entry.id ? { ...x, pricePerKg: updated.pricePerKg } : x)));
    } catch { /* keep the shown value */ }
  };
  const remove = async (entry: CropPriceEntry) => {
    await api("DELETE", `/crop-prices/${entry.cropId}`, undefined, { householdId: current.id });
    setPrices((p) => p.filter((x) => x.id !== entry.id));
  };

  return (
    <section aria-labelledby="crop-prices-heading" data-testid="crop-prices-section">
      <SectionTitle id="crop-prices-heading" className="mb-4">{t("settings.sections.cropPrices")}</SectionTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.cropPrices.description")}</p>
      <Card className="pt-6">
        <div className="mb-4 space-y-2">
          <div className="flex gap-2">
            <div data-testid="crop-price-crop-select" className="flex-1">
              <Combobox value={cropId} options={available} placeholder={t("settings.cropPrices.addPlaceholder")} onChange={setCropId} onSubmit={() => void add()} />
            </div>
            <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" placeholder={t("settings.cropPrices.pricePerKgPlaceholder")} data-testid="crop-price-add-price" className="w-24 px-2 text-right tabular-nums" />
            <Button className="h-10" data-testid="crop-price-add-btn" disabled={!cropId || saving} onClick={() => void add()}>{t("common.add")}</Button>
          </div>
          {addError && <p className="text-xs text-danger" data-testid="crop-price-add-error">{addError}</p>}
        </div>
        {prices.length > 0 ? (
          <div className="space-y-2">
            {prices.map((entry) => (
              <div key={entry.id} data-testid="crop-price-row" className={rowClass}>
                <span className="flex-1 font-medium">{cropName(entry.cropId)}</span>
                <DemandInput testId="crop-price-input" width="w-20" value={entry.pricePerKg} placeholder={t("settings.cropPrices.pricePerKgPlaceholder")} unit={t("settings.cropPrices.unit")} onCommit={(v) => void save(entry, v)} />
                <button type="button" className="ml-1 text-muted-foreground transition hover:text-foreground" data-testid="crop-price-remove" aria-label={t("settings.cropPrices.removeAriaLabel", { name: cropName(entry.cropId) })} onClick={() => void remove(entry).catch(reportError)}>
                  {xIcon}
                </button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-muted-foreground">{t("settings.cropPrices.empty")}</p>}
      </Card>
    </section>
  );
}

function DangerZone({ onReset }: { onReset: () => Promise<void> }) {
  const { current } = useHousehold();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const phrase = t("settings.dangerZone.confirmPhrase");
  const confirmed = confirmText.trim() === phrase;

  const reset = async () => {
    if (!confirmed) return;
    setBusy(true);
    setMessage(null);
    try {
      await api("POST", "/reset", { householdId: current.id });
      setMessage({ text: t("settings.dangerZone.success"), error: false });
      setConfirmText("");
      await onReset();
    } catch (e) {
      const detail = e instanceof Error ? e.message : "";
      setMessage({ text: t("settings.dangerZone.error") + (detail ? `: ${detail}` : ""), error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="danger-zone-heading" data-testid="danger-zone-section">
      <SectionTitle id="danger-zone-heading" className="mb-2 text-danger">{t("settings.sections.dangerZone")}</SectionTitle>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.dangerZone.description")}</p>
      <Card className="space-y-4 border-danger/50 pt-6">
        <Label htmlFor="reset-confirm" className="block">{t("settings.dangerZone.confirmLabel", { phrase })}</Label>
        <Input id="reset-confirm" value={confirmText} onChange={(e) => setConfirmText(e.target.value)} data-testid="reset-confirm-input" placeholder={t("settings.dangerZone.placeholder")} />
        <Button variant="danger" data-testid="reset-confirm-btn" disabled={!confirmed || busy} onClick={() => void reset()}>{t("settings.dangerZone.button")}</Button>
        {message && <p data-testid="reset-message" className={message.error ? "text-sm text-danger" : "text-sm text-muted-foreground"}>{message.text}</p>}
      </Card>
    </section>
  );
}
