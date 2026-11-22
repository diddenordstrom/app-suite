import { useState, type FormEvent } from "react";
import { Badge, Button, Card, Input } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { reportError } from "../toast";
import { Combobox } from "../components/Combobox";
import { EmptyState, FormError, Label, PageTitle, PlusIcon, SectionTitle, Skeleton, UnitInput } from "../components/common";
import { formatQuantity, today } from "../lib/format";

interface Crop { id: number; name: string }
interface Planting { id: number; cropId: number; plantedDate: string }
interface StorageItem { id: number; cropId: number; plantingId: number | null; quantityKg: number; harvestedDate: string }
interface WishlistEntry { id: number; cropId: number; kgPerWeek: number | null; kgPerYear: number | null }
interface DepletionResult { storageItemId: number; cropId: number; depletionDate: string | null; weeksRemaining: number | null }
interface StorageBatch { id: number; quantityKg: number; harvestedDate: string; expiresAt: string | null }
interface StorageGroup { cropId: number; cropName: string; totalKg: number; defaultConsumeKg: number; expiresAt: string | null; daysUntilExpiry: number | null; batches: StorageBatch[] }

const emptyForm = { cropId: undefined as number | undefined, quantityKg: "", harvestedDate: "", plantingId: undefined as number | undefined };

export function Storage() {
  const { current } = useHousehold();
  const hid = current.id;
  const { data, loading, reload } = useLoad(async () => {
    const [items, crops, plantings, wishlist, depletion, groups] = await Promise.all([
      get<StorageItem[]>("/storage"),
      get<Crop[]>("/crops"),
      get<Planting[]>("/planting"),
      get<WishlistEntry[]>("/wishlist", { householdId: hid }),
      get<DepletionResult[]>("/storage/depletion", { householdId: hid }),
      get<StorageGroup[]>("/storage/grouped", { householdId: hid }),
    ]);
    return { items, crops, plantings, wishlist, depletion, groups };
  }, [hid]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [manualKg, setManualKg] = useState<Record<number, string>>({});
  const [burnInputs, setBurnInputs] = useState<Record<number, string>>({});
  const [consuming, setConsuming] = useState(false);

  const items = data?.items ?? [];
  const crops = data?.crops ?? [];
  const groups = data?.groups ?? [];
  const cropName = (id: number) => crops.find((c) => c.id === id)?.name ?? `#${id}`;
  const totalKg = items.reduce((s, i) => s + i.quantityKg, 0);
  const storageCropIds = [...new Set(items.map((i) => i.cropId))];
  const burnRate = (cropId: number) => data?.wishlist.find((w) => w.cropId === cropId && w.kgPerWeek != null);
  const depletion = (cropId: number) => data?.depletion.find((d) => d.cropId === cropId && d.depletionDate);
  const urgent = groups.filter((g) => g.daysUntilExpiry !== null && g.daysUntilExpiry >= 0 && g.daysUntilExpiry <= 7);
  const soon = groups.filter((g) => g.daysUntilExpiry !== null && g.daysUntilExpiry > 7 && g.daysUntilExpiry <= 30);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const qty = Number(form.quantityKg);
    if (!form.cropId) return setError(t("storage.errors.cropRequired"));
    if (!(qty > 0)) return setError(t("storage.errors.quantityRequired"));
    if (!form.harvestedDate) return setError(t("storage.errors.harvestedDateRequired"));
    setSaving(true);
    try {
      await api("POST", "/storage", { cropId: form.cropId, householdId: hid, quantityKg: qty, harvestedDate: form.harvestedDate, ...(form.plantingId !== undefined && { plantingId: form.plantingId }) });
      setShowForm(false);
      setForm(emptyForm);
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const consume = async (group: StorageGroup, kg: number) => {
    if (consuming || !(kg > 0)) return;
    setConsuming(true);
    try {
      await api("POST", "/storage/consume", { cropId: group.cropId, householdId: hid, kg });
      setManualKg((m) => ({ ...m, [group.cropId]: "" }));
      await reload();
    } catch (err) {
      reportError(err);
    } finally {
      setConsuming(false);
    }
  };

  const saveBurnRate = async (cropId: number) => {
    const kgPerWeek = parseFloat(burnInputs[cropId] ?? "");
    if (!(kgPerWeek > 0)) return;
    const entry = data?.wishlist.find((w) => w.cropId === cropId);
    try {
      if (entry) await api("PUT", `/wishlist/${entry.id}`, { kgPerWeek, kgPerYear: entry.kgPerYear });
      else await api("POST", "/wishlist", { householdId: hid, cropId, kgPerWeek });
      setBurnInputs((b) => ({ ...b, [cropId]: "" }));
      await reload();
    } catch (err) {
      reportError(err);
    }
  };
  /** Clearing the weekly rate deletes the wishlist row unless it still has a yearly demand to keep. */
  const removeBurnRate = async (cropId: number) => {
    const entry = burnRate(cropId);
    if (!entry) return;
    try {
      if (entry.kgPerYear == null) await api("DELETE", `/wishlist/${entry.id}`);
      else await api("PUT", `/wishlist/${entry.id}`, { kgPerWeek: null, kgPerYear: entry.kgPerYear });
      await reload();
    } catch (err) {
      reportError(err);
    }
  };

  const toggle = (cropId: number) => setExpanded((s) => {
    const n = new Set(s);
    if (n.has(cropId)) n.delete(cropId); else n.add(cropId);
    return n;
  });

  return (
    <div>
      <PageTitle className="mb-6" action={!showForm && (
        <Button className="size-10 px-0" aria-label={t("storage.addButton.ariaLabel")} onClick={() => { setForm({ ...emptyForm, harvestedDate: today() }); setError(null); setShowForm(true); }}><PlusIcon /></Button>
      )}>{t("storage.title")}</PageTitle>

      {loading && !data ? (
        <>
          <Skeleton className="mb-3 h-4 w-24" />
          <div className="mb-6 grid gap-3">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="h-6 w-full" /></Card>)}</div>
        </>
      ) : (
        <>
          {showForm && (
            <Card className="mb-6 pt-6" data-testid="storage-form">
              <form className="space-y-4" onSubmit={(e) => void save(e)}>
                <FormError>{error}</FormError>
                <div className="space-y-2">
                  <Label htmlFor="cropId">{t("storage.form.crop.label")}</Label>
                  <Combobox id="cropId" value={form.cropId} options={crops} placeholder={t("storage.form.crop.placeholder")} onChange={(v) => setForm({ ...form, cropId: v })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantityKg">{t("storage.form.quantity.label")}</Label>
                  <UnitInput id="quantityKg" type="number" step="0.1" min="0.1" unit="kg" placeholder={t("storage.form.quantity.placeholder")} value={form.quantityKg} onChange={(e) => setForm({ ...form, quantityKg: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="harvestedDate">{t("storage.form.harvestedDate.label")}</Label>
                  <Input id="harvestedDate" type="date" value={form.harvestedDate} onChange={(e) => setForm({ ...form, harvestedDate: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plantingId">{t("storage.form.planting.label")}</Label>
                  <Combobox id="plantingId" value={form.plantingId} clearable placeholder={t("storage.form.planting.placeholder")}
                    options={(data?.plantings ?? []).map((p) => ({ id: p.id, name: `${cropName(p.cropId)} — ${p.plantedDate}` }))}
                    onChange={(v) => setForm({ ...form, plantingId: v })} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("storage.button.saving") : t("storage.button.create")}</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("storage.button.cancel")}</Button>
                </div>
              </form>
            </Card>
          )}

          {(urgent.length > 0 || soon.length > 0) && (
            <section data-testid="expiring-soon-section" className="mb-6 rounded-lg border border-border p-4">
              <h2 className="mb-3 text-base font-semibold">{t("storage.expiringSoon.title")}</h2>
              {urgent.length > 0 && (
                <div data-testid="expiring-urgent" className="mb-3">
                  <h3 className="mb-2 text-sm font-medium text-danger">{t("storage.expiringSoon.urgent")}</h3>
                  {urgent.map((g) => (
                    <div key={g.cropId} data-testid="expiring-urgent-row" className="flex items-center justify-between py-1 text-sm">
                      <span className="font-medium">{g.cropName}</span>
                      <Badge tone="danger">{t("storage.expiringSoon.daysLeft", { days: g.daysUntilExpiry ?? 0 })}</Badge>
                    </div>
                  ))}
                </div>
              )}
              {soon.length > 0 && (
                <div data-testid="expiring-soon">
                  <h3 className="mb-2 text-sm font-medium text-warning">{t("storage.expiringSoon.soon")}</h3>
                  {soon.map((g) => (
                    <div key={g.cropId} className="flex items-center justify-between py-1 text-sm">
                      <span className="font-medium">{g.cropName}</span>
                      <Badge>{t("storage.expiringSoon.daysLeft", { days: g.daysUntilExpiry ?? 0 })}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {groups.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t("storage.totalKg", { kg: totalKg.toFixed(1) })}</p>
              <div className="mb-6 grid gap-3">
                {groups.map((group) => {
                  const open = expanded.has(group.cropId);
                  const dep = depletion(group.cropId);
                  return (
                    <Card key={group.cropId} data-testid="storage-group">
                      <div data-testid="storage-group-header" className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="flex-1 font-semibold">{group.cropName}</span>
                        <Badge className="tabular-nums">{formatQuantity(group.totalKg)}</Badge>
                        {dep && dep.weeksRemaining !== null && (
                          <span data-testid="weeks-remaining" className="text-xs tabular-nums text-muted-foreground">{t("storage.depletion.weeksRemaining", { weeks: Math.round(dep.weeksRemaining) })}</span>
                        )}
                        {group.expiresAt && group.daysUntilExpiry !== null && (
                          <span className="text-xs text-muted-foreground">{t("storage.grouped.batch.expires")}: {group.expiresAt}</span>
                        )}
                        <Button variant="outline" className="h-8 px-3" data-testid="quick-consume-button" disabled={consuming} onClick={() => void consume(group, group.defaultConsumeKg)}>
                          &minus; {group.defaultConsumeKg} kg
                        </Button>
                        <Button variant="ghost" className="size-8 px-0" data-testid="expand-batches-button" aria-label={open ? t("storage.grouped.collapse") : t("storage.grouped.expand")} aria-expanded={open} onClick={() => toggle(group.cropId)}>
                          <svg className={open ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                          </svg>
                        </Button>
                      </div>
                      <div hidden={!open} className="mt-3 space-y-2">
                        {group.batches.map((b) => (
                          <div key={b.id} data-testid="batch-row" className="flex items-center gap-3 border-t border-border pt-2 text-sm text-muted-foreground">
                            <span>{t("storage.grouped.batch.harvested")}: {b.harvestedDate}</span>
                            <span className="tabular-nums">{formatQuantity(b.quantityKg)}</span>
                            {b.expiresAt && <span>{t("storage.grouped.batch.expires")}: {b.expiresAt}</span>}
                          </div>
                        ))}
                        <div className="flex items-center gap-2 border-t border-border pt-2">
                          <div className="w-36">
                            <UnitInput data-testid="manual-consume-input" type="number" step="0.1" min="0.1" unit="kg" placeholder={t("storage.grouped.consumeManual")}
                              value={manualKg[group.cropId] ?? ""} onChange={(e) => setManualKg({ ...manualKg, [group.cropId]: e.target.value })} />
                          </div>
                          <Button className="h-9" data-testid="manual-consume-confirm" disabled={consuming} onClick={() => void consume(group, parseFloat(manualKg[group.cropId] ?? ""))}>
                            {t("storage.grouped.consumeManual")}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </>
          ) : !showForm && <EmptyState title={t("storage.empty.title")} description={t("storage.empty.description")} />}

          <div className="mt-8" data-testid="burn-rate-section">
            <SectionTitle className="mb-4">{t("burnRate.title")}</SectionTitle>
            {storageCropIds.length === 0 ? <p className="text-sm text-muted-foreground">{t("burnRate.empty")}</p> : (
              <div className="grid gap-2">
                {storageCropIds.map((cropId) => {
                  const rate = burnRate(cropId);
                  const dep = depletion(cropId);
                  return (
                    <Card key={cropId} data-testid="burn-rate-row">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <span className="text-sm font-medium">{cropName(cropId)}</span>
                          <span className="text-sm tabular-nums text-muted-foreground">{rate ? `${rate.kgPerWeek} ${t("burnRate.unit")}` : "—"}</span>
                          {dep ? <span className="text-xs text-muted-foreground" data-testid="depletion-date">{t("storage.depletion.until")}: {dep.depletionDate}</span>
                            : !rate && <span className="text-xs italic text-muted-foreground">{t("storage.depletion.noRate")}</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="w-36">
                            <UnitInput type="number" step="0.1" min="0.1" unit={t("burnRate.unit")} placeholder={t("burnRate.placeholder")} aria-label={`${t("burnRate.unit")} ${cropName(cropId)}`}
                              value={burnInputs[cropId] ?? ""} onChange={(e) => setBurnInputs({ ...burnInputs, [cropId]: e.target.value })} onBlur={() => void saveBurnRate(cropId)} />
                          </div>
                          {rate && <Button variant="outline" className="h-9" onClick={() => void removeBurnRate(cropId)}>{t("burnRate.button.remove")}</Button>}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
