import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Input, cn } from "../ui";
import { api, get, useLoad } from "../api";
import { t, tn, type MsgKey } from "../i18n";
import { reportError } from "../toast";
import { Combobox, normalize } from "../components/Combobox";
import { EmptyState, FormError, Label, PlusIcon, Skeleton, UnitInput } from "../components/common";
import { today } from "../lib/format";
import { estimatedYieldKg, type PlantingMode } from "../lib/plantings";

interface Crop { id: number; name: string; yieldKgPerM2: number; yieldKgPerPlant: number | null }
interface Location { id: number; name: string; areaM2: number; isIndoor: boolean }
interface Planting {
  id: number; cropId: number; locationId: number; seedVarietyId: number | null; plantedDate: string; expectedHarvestDate: string | null;
  areaM2: number; status: string; plantingMode: PlantingMode; quantity: number | null; yieldKgPerPlantOverride: number | null;
}
interface SeedVariety { id: number; cropId: number; name: string; varietyType: string | null }

export const varietyLabel = (v: SeedVariety) => (v.varietyType ? `${v.varietyType} · ${v.name}` : v.name);

const emptyForm = {
  cropId: undefined as number | undefined, locationId: undefined as number | undefined, seedVarietyId: undefined as number | undefined,
  plantedDate: "", expectedHarvestDate: "", areaM2: "", status: "planted", plantingMode: "area" as PlantingMode, quantity: "", yieldKgPerPlantOverride: "",
};

export function Plantings() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { data, loading } = useLoad(async () => {
    const [plantings, crops, locations, household, varieties] = await Promise.all([
      get<Planting[]>("/planting"), get<Crop[]>("/crops"), get<Location[]>("/location"),
      get<{ id: number; defaultPlantingUnit: PlantingMode }>("/household/current"), get<SeedVariety[]>("/seed-variety"),
    ]);
    return { plantings, crops, locations, household, varieties };
  }, []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const plantings = data?.plantings ?? [];
  const crops = data?.crops ?? [];
  const locations = data?.locations ?? [];
  const varieties = data?.varieties ?? [];
  const cropName = (id: number) => crops.find((c) => c.id === id)?.name ?? `#${id}`;
  const locationName = (id: number) => locations.find((l) => l.id === id)?.name ?? `#${id}`;
  const selectedCrop = crops.find((c) => c.id === form.cropId);
  const cropVarieties = form.cropId ? varieties.filter((v) => v.cropId === form.cropId) : [];

  const openForm = () => {
    const harvest = new Date();
    harvest.setMonth(harvest.getMonth() + 4);
    const cropId = Number(params.get("cropId")) || undefined;
    const locationId = Number(params.get("locationId")) || undefined;
    const loc = locations.find((l) => l.id === locationId);
    setForm({
      ...emptyForm, plantingMode: data?.household.defaultPlantingUnit ?? "area", plantedDate: today(), expectedHarvestDate: harvest.toISOString().slice(0, 10),
      cropId, locationId, status: loc?.isIndoor ? "seedling" : "planted",
    });
    setError(null);
    setShowForm(true);
  };
  // Arriving from a suggestion (?cropId=…&locationId=…) opens the form straight away.
  const opened = useRef(false);
  useEffect(() => {
    if (data && !opened.current && (params.get("cropId") || params.get("locationId"))) { opened.current = true; openForm(); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const area = Number(form.areaM2);
    const quantity = Number(form.quantity);
    if (!form.cropId) return setError(t("plantings.errors.cropRequired"));
    if (!form.locationId) return setError(t("plantings.errors.locationRequired"));
    if (!form.plantedDate) return setError(t("plantings.errors.plantedDateRequired"));
    if (form.plantingMode === "area" && !(area > 0)) return setError(t("plantings.errors.areaRequired"));
    if (form.plantingMode === "count" && !(quantity > 0)) return setError(t("plantings.errors.quantityRequired"));
    setSaving(true);
    try {
      const created = await api<{ id: number }>("POST", "/planting", {
        cropId: form.cropId, locationId: form.locationId, plantedDate: form.plantedDate, status: form.status, plantingMode: form.plantingMode,
        seedVarietyId: form.seedVarietyId ?? null,
        ...(form.expectedHarvestDate && { expectedHarvestDate: form.expectedHarvestDate }),
        ...(form.plantingMode === "count"
          ? { quantity, areaM2: 0, ...(form.yieldKgPerPlantOverride !== "" && { yieldKgPerPlantOverride: Number(form.yieldKgPerPlantOverride) }) }
          : { areaM2: area }),
      });
      const suggestionId = Number(params.get("suggestionId"));
      if (suggestionId) await api("POST", `/garden-event/${suggestionId}/accept`);
      navigate(`/plantings/${created.id}`);
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  const q = normalize(term.trim());
  const filtered = q ? plantings.filter((p) => `${normalize(cropName(p.cropId))} ${normalize(locationName(p.locationId))}`.includes(q)) : plantings;
  const canSearch = !showForm && plantings.length > 0;
  const anim = "overflow-hidden transition-all duration-300 ease-out";

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        {/* The title folds away while searching so the field has room. */}
        <h1 className={cn("whitespace-nowrap text-2xl font-bold tracking-tight", anim, searchOpen ? "max-w-0 opacity-0" : "max-w-[260px] opacity-100")}>{t("plantings.title")}</h1>
        {canSearch && (
          <div className={cn(anim, searchOpen ? "max-w-full flex-1 opacity-100" : "max-w-0 opacity-0")}>
            <Input ref={searchRef} type="search" data-testid="plantings-search" value={term} onChange={(e) => setTerm(e.target.value)}
              placeholder={t("plantings.search.placeholder")} aria-label={t("plantings.search.placeholder")} tabIndex={searchOpen ? 0 : -1}
              onBlur={() => { if (!term.trim()) setSearchOpen(false); }} />
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {canSearch && (
            <button type="button" data-testid="plantings-search-toggle" aria-label={t("plantings.search.placeholder")} tabIndex={searchOpen ? -1 : 0} onClick={() => setSearchOpen(true)}
              className={cn("inline-flex h-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground", anim, searchOpen ? "pointer-events-none w-0 opacity-0" : "w-10 opacity-100")}>
              <svg className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35m1.85-5.4a7.25 7.25 0 11-14.5 0 7.25 7.25 0 0114.5 0z" /></svg>
            </button>
          )}
          {!showForm && (
            <Button aria-label={t("plantings.addButton.ariaLabel")} tabIndex={searchOpen ? -1 : 0} onClick={openForm}
              className={cn("px-0", anim, searchOpen ? "pointer-events-none w-0 opacity-0" : "w-10 opacity-100")}><PlusIcon /></Button>
          )}
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-3">{[0, 1, 2, 3].map((i) => <Card key={i}><Skeleton className="mb-2 h-5 w-28" /><Skeleton className="mb-3 h-4 w-20" /><Skeleton className="h-8 w-full" /></Card>)}</div>
      ) : (
        <>
          {showForm && (
            <Card className="mb-6 pt-6" data-testid="planting-form">
              <form className="space-y-4" onSubmit={(e) => void save(e)}>
                <FormError>{error}</FormError>
                <div className="space-y-2">
                  <Label htmlFor="cropId">{t("plantings.form.crop.label")}</Label>
                  <Combobox data-testid="crop-combobox" id="cropId" value={form.cropId} options={crops} placeholder={t("plantings.form.crop.placeholder")}
                    onChange={(v) => setForm({ ...form, cropId: v, seedVarietyId: undefined })} />
                </div>
                {cropVarieties.length > 0 && (
                  <div className="space-y-2">
                    <Label htmlFor="seedVarietyId">{t("plantings.form.variety.label")}</Label>
                    <Combobox id="seedVarietyId" value={form.seedVarietyId} clearable placeholder={t("plantings.form.variety.none")}
                      options={cropVarieties.map((v) => ({ id: v.id, name: varietyLabel(v) }))} onChange={(v) => setForm({ ...form, seedVarietyId: v })} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="locationId">{t("plantings.form.location.label")}</Label>
                  <Combobox id="locationId" value={form.locationId} placeholder={t("plantings.form.location.placeholder")}
                    options={locations.map((l) => ({ id: l.id, name: `${l.name} (${l.areaM2} m²)` }))}
                    // An indoor location means the planting starts as a seedling.
                    onChange={(v) => {
                      const loc = locations.find((l) => l.id === v);
                      setForm({ ...form, locationId: v, ...(loc && { status: loc.isIndoor ? "seedling" : "planted" }) });
                    }} />
                </div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="plantedDate">{t("plantings.form.plantedDate.label")}</Label>
                    <Input id="plantedDate" type="date" value={form.plantedDate} onChange={(e) => setForm({ ...form, plantedDate: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="expectedHarvestDate">{t("plantings.form.expectedHarvestDate.label")}</Label>
                    <Input id="expectedHarvestDate" type="date" value={form.expectedHarvestDate} onChange={(e) => setForm({ ...form, expectedHarvestDate: e.target.value })} />
                  </div>
                </div>
                <PlantingModeFields form={form} setForm={(p) => setForm({ ...form, ...p })} cropYieldPerPlant={selectedCrop?.yieldKgPerPlant ?? null} />
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("plantings.button.saving") : t("plantings.button.create")}</Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>{t("plantings.button.cancel")}</Button>
                </div>
              </form>
            </Card>
          )}

          {filtered.length > 0 ? (
            <div className="grid gap-3">
              {filtered.map((p) => {
                const variety = p.seedVarietyId ? varieties.find((v) => v.id === p.seedVarietyId) : undefined;
                const yieldKg = estimatedYieldKg(p, crops.find((c) => c.id === p.cropId));
                return (
                  <Card key={p.id} data-testid="planting-card" className="p-0">
                    <Link to={`/plantings/${p.id}`} data-testid="planting-detail-link" aria-label={t("plantings.card.openDetail", { crop: cropName(p.cropId) })}
                      className="block rounded-lg p-4 transition hover:bg-muted/40">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <h2 className="font-semibold">{cropName(p.cropId)}</h2>
                          {variety && <p className="text-sm font-medium text-foreground/70">{varietyLabel(variety)}</p>}
                          <p className="text-sm text-muted-foreground">{locationName(p.locationId)}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground" data-testid="planting-card-status">{t(`plantings.status.${p.status}` as MsgKey)}</span>
                          <span aria-hidden className="text-lg leading-none text-muted-foreground">›</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><span className="text-muted-foreground">{t("plantings.card.planted")}</span><p className="font-medium tabular-nums">{p.plantedDate}</p></div>
                        <div><span className="text-muted-foreground">{t("plantings.card.expected")}</span><p className="font-medium tabular-nums">{yieldKg != null ? `${yieldKg} kg` : "—"}</p></div>
                        <div>
                          <span className="text-muted-foreground">{t("plantings.card.area")}</span>
                          <p className="font-medium tabular-nums">{p.plantingMode === "count" ? tn("plantings.card.plants", p.quantity ?? 0) : `${p.areaM2} m²`}</p>
                        </div>
                      </div>
                    </Link>
                  </Card>
                );
              })}
            </div>
          ) : !showForm && plantings.length > 0 && term.trim() ? (
            <p data-testid="plantings-search-empty" className="py-8 text-center text-sm text-muted-foreground">{t("plantings.search.empty", { query: term })}</p>
          ) : !showForm && <EmptyState title={t("plantings.empty.title")} description={t("plantings.empty.description")} />}
        </>
      )}
    </div>
  );
}

type ModeForm = { plantingMode: PlantingMode; areaM2: string; quantity: string; yieldKgPerPlantOverride: string };

/** Area or plant-count toggle and its fields; shared by the create form here and the edit form on the detail page. */
export function PlantingModeFields({ form, setForm, cropYieldPerPlant }: { form: ModeForm; setForm: (p: Partial<ModeForm>) => void; cropYieldPerPlant: number | null }) {
  const modeBtn = (mode: PlantingMode, label: string) => (
    <button type="button" aria-pressed={form.plantingMode === mode} onClick={() => setForm({ plantingMode: mode })}
      className={cn("px-4 py-1.5 text-sm font-medium transition", form.plantingMode === mode ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
      {label}
    </button>
  );
  return (
    <>
      <div className="space-y-2" data-testid="planting-mode-toggle">
        <Label className="block">{t("plantings.form.mode.label")}</Label>
        <div className="flex w-fit overflow-hidden rounded-md border border-border">
          {modeBtn("area", t("plantings.form.mode.area"))}
          {modeBtn("count", t("plantings.form.mode.count"))}
        </div>
      </div>
      {form.plantingMode === "area" ? (
        <div className="space-y-2">
          <Label htmlFor="areaM2">{t("plantings.form.area.label")}</Label>
          <UnitInput id="areaM2" type="number" step="0.1" min="0.1" unit="m²" placeholder={t("plantings.form.area.placeholder")} value={form.areaM2} onChange={(e) => setForm({ areaM2: e.target.value })} />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="quantity">{t("plantings.form.quantity.label")}</Label>
            <Input id="quantity" type="number" min={1} step={1} placeholder={t("plantings.form.quantity.placeholder")} value={form.quantity} onChange={(e) => setForm({ quantity: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="yieldKgPerPlantOverride">{t("plantings.form.yieldPerPlant.label")}</Label>
            <UnitInput id="yieldKgPerPlantOverride" type="number" step="0.1" min="0" unit="kg" value={form.yieldKgPerPlantOverride} onChange={(e) => setForm({ yieldKgPerPlantOverride: e.target.value })}
              placeholder={cropYieldPerPlant != null ? String(cropYieldPerPlant) : t("plantings.form.yieldPerPlant.placeholder")} />
          </div>
        </>
      )}
    </>
  );
}
