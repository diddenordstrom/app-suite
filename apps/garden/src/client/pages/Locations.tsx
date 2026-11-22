import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Badge, Button, Card, Input } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { reportError } from "../toast";
import { Select } from "../components/Select";
import { EmptyState, FormError, Label, PageTitle, PlusIcon, UnitInput } from "../components/common";
import { FROST_PROTECTION_PRESETS } from "../lib/frost-protection-presets";

interface Location { id: number; householdId: number; name: string; areaM2: number; description: string | null; isIndoor: boolean }
interface LocationMacroSummary { locationId: number; kcal: number; proteinG: number; carbsG: number; fatG: number }

const emptyForm = { name: "", areaM2: "", description: "", isIndoor: false, frostBufferC: 0 };

export function Locations() {
  const { current } = useHousehold();
  const navigate = useNavigate();
  const { data, loading } = useLoad(async () => {
    const locations = await get<Location[]>("/location");
    const dashboard = await get<{ byLocation: LocationMacroSummary[] }>("/dashboard", { householdId: current.id }).catch(() => null);
    return { locations, macros: dashboard?.byLocation ?? [] };
  }, [current.id]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locations = data?.locations ?? [];
  const totalArea = locations.reduce((s, l) => s + l.areaM2, 0);
  const macros = (id: number) => data?.macros.find((m) => m.locationId === id);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const area = Number(form.areaM2);
    if (!form.name.trim()) return setError(t("locations.errors.nameRequired"));
    if (!form.areaM2 || !(area > 0)) return setError(t("locations.errors.areaRequired"));
    setSaving(true);
    try {
      const created = await api<{ id: number }>("POST", "/location", {
        name: form.name.trim(), areaM2: area, householdId: current.id, isIndoor: form.isIndoor, frostBufferC: form.frostBufferC,
        ...(form.description.trim() && { description: form.description.trim() }),
      });
      navigate(`/locations/${created.id}`);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageTitle action={!showForm && <Button className="size-10 px-0" aria-label={t("locations.addButton.ariaLabel")} onClick={() => { setForm(emptyForm); setError(null); setShowForm(true); }}><PlusIcon /></Button>}>
        {t("locations.title")}
      </PageTitle>

      {loading && !data ? (
        <p className="py-16 text-center text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <>
          {showForm && (
            <Card className="mb-6" data-testid="location-form">
              <form className="space-y-4" onSubmit={(e) => void save(e)}>
                <FormError>{error}</FormError>
                <div className="space-y-2">
                  <Label htmlFor="name">{t("locations.form.name.label")}</Label>
                  <Input id="name" value={form.name} placeholder={t("locations.form.name.placeholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="areaM2">{t("locations.form.area.label")}</Label>
                  <UnitInput id="areaM2" type="number" step="0.1" min="0.1" unit="m²" value={form.areaM2} placeholder={t("locations.form.area.placeholder")} onChange={(e) => setForm({ ...form, areaM2: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">{t("locations.form.description.label")}</Label>
                  <Input id="description" value={form.description} placeholder={t("locations.form.description.placeholder")} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input id="isIndoor" type="checkbox" checked={form.isIndoor} onChange={(e) => setForm({ ...form, isIndoor: e.target.checked })} />
                  {t("locations.form.isIndoor.label")}
                </label>
                <FrostProtectionField value={form.frostBufferC} onChange={(frostBufferC) => setForm({ ...form, frostBufferC })} />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("locations.button.saving") : t("locations.button.add")}</Button>
                  <Button type="button" variant="outline" onClick={() => { setShowForm(false); setForm(emptyForm); setError(null); }}>{t("locations.button.cancel")}</Button>
                </div>
              </form>
            </Card>
          )}
          {locations.length > 0 ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">{t("locations.totalArea", { area: totalArea.toFixed(1) })}</p>
              <div className="grid gap-3 md:grid-cols-2">
                {locations.map((loc) => {
                  const m = macros(loc.id);
                  return (
                    <Link key={loc.id} to={`/locations/${loc.id}`} className="block" data-testid="location-card">
                      <Card className="transition-colors hover:bg-accent/40">
                        <div className="mb-2 flex items-start justify-between gap-2">
                          <div>
                            <h2 className="font-semibold">{loc.name}</h2>
                            {loc.description && <p className="text-sm text-muted-foreground">{loc.description}</p>}
                          </div>
                          <div className="flex items-center gap-1.5">
                            {loc.isIndoor && <Badge tone="signature" data-testid="indoor-badge">{t("locations.form.isIndoor.label")}</Badge>}
                            <Badge>{loc.areaM2} m²</Badge>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
                          <Macro value={`${m?.kcal.toLocaleString() ?? 0} kcal`} label={t("locations.macros.kcal")} />
                          <Macro value={`${m?.proteinG ?? 0} g`} label={t("locations.macros.protein")} />
                          <Macro value={`${m?.carbsG ?? 0} g`} label={t("locations.macros.carbs")} />
                          <Macro value={`${m?.fatG ?? 0} g`} label={t("locations.macros.fat")} />
                        </div>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            </>
          ) : !showForm && <EmptyState title={t("locations.empty.title")} description={t("locations.empty.description")} />}
        </>
      )}
    </div>
  );
}

function Macro({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-medium tabular-nums text-foreground">{value}</p>
      <span>{label}</span>
    </div>
  );
}

/** Frost protection level → frostBufferC, with its help text. */
export function FrostProtectionField({ value, onChange, id = "frostBufferC", testId = "frost-protection-select" }: { value: number; onChange: (v: number) => void; id?: string; testId?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{t("locationForm.frostProtection.label")}</Label>
      <Select id={id} data-testid={testId} value={value} onChange={onChange}
        options={FROST_PROTECTION_PRESETS.map((p) => ({ value: p.frostBufferC, label: t(p.i18nKey) }))} />
      <p className="text-xs text-muted-foreground">{t("locationForm.frostProtection.helpText")}</p>
    </div>
  );
}
