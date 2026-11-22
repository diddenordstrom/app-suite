import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Card, Dialog, Input, cn, PageSkeleton } from "../ui";
import { ApiError, api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t, type MsgKey } from "../i18n";
import { reportError } from "../toast";
import { Combobox } from "../components/Combobox";
import { Select } from "../components/Select";
import { OverflowMenu } from "../components/OverflowMenu";
import { FormError, Label, UnitInput } from "../components/common";
import { ConfirmDialog, ImageUploadDialog } from "../components/dialogs";
import { today } from "../lib/format";
import type { PlantingMode } from "../lib/plantings";
import { PlantingModeFields, varietyLabel } from "./Plantings";

interface Planting {
  id: number; cropId: number; locationId: number; seedVarietyId: number | null; plantedDate: string; expectedHarvestDate: string | null;
  areaM2: number; plantingMode: PlantingMode; quantity: number | null; yieldKgPerPlantOverride: number | null; status: string;
}
interface Crop { id: number; name: string; yieldKgPerM2: number; yieldKgPerPlant: number | null }
interface Location { id: number; name: string; areaM2: number; isIndoor: boolean }
interface SeedVariety { id: number; cropId: number; name: string; varietyType: string | null }
interface ImageRow { imageId: string; caption: string | null; takenAt: string | null; uploadedAt: string | null }
interface HarvestEvent { id: number; quantityKg: number; harvestedDate: string; addedToStorage: boolean }
interface Companion { otherCropId: number; otherCropName: string; source: string; note: string | null }

/** Statuses the user picks; "growing" and "harvested" are set by the app and shown read-only. */
const EDIT_STATUSES = ["planted", "seedling"] as const;
const statusClass: Record<string, string> = {
  harvested: "bg-warning/15 text-foreground",
  seedling: "bg-chart-1/20 text-foreground",
  growing: "bg-success/15 text-foreground",
};
const imageUrl = (id: string) => `/api/image/${id}`;

export function PlantingDetail() {
  const id = Number(useParams().id);
  const { current } = useHousehold();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(async () => {
    const planting = await get<Planting>(`/planting/${id}`);
    const [crops, locations, varieties, images, harvests, companions, wishlist] = await Promise.all([
      get<Crop[]>("/crops"), get<Location[]>("/location"), get<SeedVariety[]>("/seed-variety"),
      get<ImageRow[]>(`/planting/${id}/image`), get<HarvestEvent[]>(`/planting/${id}/harvest`),
      get<{ good: Companion[]; bad: Companion[] }>(`/crops/${planting.cropId}/companions`),
      get<{ cropId: number }[]>("/wishlist", { householdId: current.id }).catch(() => []),
    ]);
    return { planting, crops, locations, varieties, images, harvests, companions, wishlist: new Set(wishlist.map((w) => w.cropId)) };
  }, [id, current.id]);
  const notFound = error !== null && !data;

  const [editOpen, setEditOpen] = useState(false);
  const [harvestOpen, setHarvestOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [lightbox, setLightbox] = useState<ImageRow | null>(null);
  const [deleteImage, setDeleteImage] = useState<ImageRow | null>(null);
  const [busy, setBusy] = useState(false);

  const back = <div className="mb-4"><Link to="/plantings" className="text-sm text-muted-foreground transition hover:text-foreground">{t("plantingDetail.backLink")}</Link></div>;
  if (loading && !data) return <>{back}<PageSkeleton header={false} cards={2} columns="" /></>;
  if (notFound || !data) return <>{back}<div className="flex justify-center py-16 text-sm text-muted-foreground">404</div></>;

  const { planting, companions } = data;
  const crop = data.crops.find((c) => c.id === planting.cropId);
  const location = data.locations.find((l) => l.id === planting.locationId);
  if (!crop || !location) return back;
  const hero = data.images[0];
  const grid = data.images.slice(1);
  const goodInWishlist = companions.good.filter((c) => data.wishlist.has(c.otherCropId));
  const goodGeneral = companions.good.filter((c) => !data.wishlist.has(c.otherCropId));
  const totalKg = data.harvests.reduce((s, h) => s + h.quantityKg, 0);

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try { await action(); } catch (e) { reportError(e); } finally { setBusy(false); }
  };
  const changeStatus = (status: string) => run(async () => { await api("PUT", `/planting/${planting.id}`, { status }); await reload(); });
  const removePlanting = () => run(async () => { await api("DELETE", `/planting/${planting.id}`); navigate("/plantings"); });
  const removeImage = () => run(async () => {
    if (!deleteImage) return;
    await api("DELETE", `/image/${deleteImage.imageId}`);
    setDeleteImage(null);
    setLightbox(null);
    await reload();
  });

  return (
    <div>
      {back}
      <div className="mb-4 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="planting-detail-crop-name">{crop.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{location.name}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {(EDIT_STATUSES as readonly string[]).includes(planting.status) ? (
            <Select data-testid="planting-detail-status-select" aria-label={t("plantings.form.status.label")} value={planting.status} disabled={busy}
              triggerClassName={cn("h-auto w-auto gap-1 border-0 px-2 py-1 text-xs font-medium", statusClass[planting.status] ?? "bg-primary/15 text-foreground")}
              options={EDIT_STATUSES.map((s) => ({ value: s, label: t(`plantings.status.${s}` as MsgKey) }))} onChange={(s) => void changeStatus(s)} />
          ) : (
            <span data-testid="planting-detail-status" className={cn("rounded-md px-2 py-1 text-xs font-medium", statusClass[planting.status] ?? "bg-primary/15")}>
              {t(`plantings.status.${planting.status}` as MsgKey)}
            </span>
          )}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" className="h-9" data-testid="planting-detail-edit-btn" onClick={() => setEditOpen(true)}>{t("plantingDetail.actions.edit")}</Button>
        {planting.status !== "harvested" && <Button className="h-9" data-testid="planting-detail-harvest-btn" onClick={() => setHarvestOpen(true)}>{t("plantingDetail.actions.harvest")}</Button>}
        <OverflowMenu label={t("plantingDetail.actions.more")} testId="planting-detail-overflow-btn">
          <button type="button" className="w-full px-3 py-1.5 text-left text-sm text-danger hover:bg-muted" data-testid="planting-detail-delete-btn" onClick={() => setDeleteOpen(true)}>
            {t("plantingDetail.actions.delete")}
          </button>
        </OverflowMenu>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-md border border-border px-3 py-2"><p className="text-xs text-muted-foreground">{t("plantingDetail.fields.plantedDate")}</p><p className="font-medium tabular-nums">{planting.plantedDate}</p></div>
        <div className="rounded-md border border-border px-3 py-2"><p className="text-xs text-muted-foreground">{t("plantingDetail.fields.expectedHarvest")}</p><p className="font-medium tabular-nums">{planting.expectedHarvestDate ?? "—"}</p></div>
      </div>

      <Card className="mb-3 overflow-hidden p-0" data-testid="planting-hero">
        {hero ? (
          <button type="button" className="block w-full" aria-label={t("plantingDetail.image.openLightbox")} onClick={() => setLightbox(hero)}>
            <img src={imageUrl(hero.imageId)} alt={hero.caption ?? crop.name} className="h-auto w-full object-cover" />
          </button>
        ) : (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center" data-testid="planting-no-images">
            <p className="mb-3 text-sm text-muted-foreground">{t("plantingDetail.image.empty")}</p>
            <Button className="h-9" onClick={() => setUploadOpen(true)}>{t("plantingDetail.image.uploadButton")}</Button>
          </div>
        )}
      </Card>
      {hero && <Button variant="outline" className="mb-6 h-9 w-full" onClick={() => setUploadOpen(true)}>{t("plantingDetail.image.uploadButton")}</Button>}
      {grid.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-2">
          {grid.map((img) => (
            <button key={img.imageId} type="button" className="aspect-square overflow-hidden rounded-md border border-border" aria-label={t("plantingDetail.image.openLightbox")} onClick={() => setLightbox(img)}>
              <img src={imageUrl(img.imageId)} alt={img.caption ?? crop.name} className="size-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {(companions.good.length > 0 || companions.bad.length > 0) && (
        <Card className="mb-3 space-y-3" data-testid="companion-card">
          <p className="text-sm font-semibold">{t("plantingDetail.companions.title")}</p>
          <CompanionGroup label={t("plantingDetail.companions.inWishlist")} items={goodInWishlist} testId="companion-chip-wishlist" className="bg-success/15" />
          <CompanionGroup label={t("plantingDetail.companions.general")} items={goodGeneral} testId="companion-chip-general" className="bg-muted" />
          <CompanionGroup label={t("plantingDetail.companions.avoid")} items={companions.bad} testId="companion-chip-avoid" className="bg-danger/15" />
        </Card>
      )}

      <Card data-testid="harvest-history">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm font-semibold">{t("plantingDetail.harvestHistory.title")}</p>
          {data.harvests.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{totalKg.toFixed(2)} kg</span>}
        </div>
        {data.harvests.length === 0 ? <p className="text-sm text-muted-foreground">{t("plantingDetail.harvestHistory.empty")}</p> : (
          <ul className="space-y-1.5">
            {data.harvests.map((h) => (
              <li key={h.id} className="flex items-center justify-between text-sm" data-testid="harvest-row">
                <span className="tabular-nums">{h.harvestedDate}</span>
                <span className="font-medium tabular-nums">
                  {h.quantityKg.toFixed(2)} kg
                  {!h.addedToStorage && <span className="ml-1 text-xs text-muted-foreground">· {t("plantingDetail.harvestHistory.notStored")}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ImageUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} title={t("plantingDetail.image.uploadTitle")} saveLabel={t("plantingDetail.image.saveButton")}
        attach={async (imageId, caption) => { await api("POST", `/planting/${id}/image`, { imageId, caption }); await reload(); }} />

      <Dialog open={lightbox !== null} onClose={() => setLightbox(null)} title={lightbox?.caption || crop.name} className="sm:max-w-2xl">
        {lightbox && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{lightbox.takenAt || lightbox.uploadedAt}</p>
            <img src={imageUrl(lightbox.imageId)} alt={lightbox.caption ?? crop.name} className="h-auto w-full rounded-md" />
            <Button variant="outline" className="w-full text-danger" data-testid="lightbox-delete" onClick={() => setDeleteImage(lightbox)}>{t("plantingDetail.image.deleteButton")}</Button>
          </div>
        )}
      </Dialog>
      <ConfirmDialog open={deleteImage !== null} onClose={() => setDeleteImage(null)} busy={busy} testId="confirm-delete-image" onConfirm={() => void removeImage()}
        title={t("plantingDetail.image.deleteConfirmTitle")} confirmLabel={t("plantingDetail.image.deleteButton")}
        body={deleteImage?.caption ? t("plantingDetail.image.deleteConfirmWithCaption", { caption: deleteImage.caption }) : t("plantingDetail.image.deleteConfirmBody")} />
      <ConfirmDialog open={deleteOpen} onClose={() => setDeleteOpen(false)} busy={busy} testId="confirm-delete-planting" onConfirm={() => void removePlanting()}
        title={t("plantingDetail.delete.confirmTitle")} confirmLabel={t("plantingDetail.actions.delete")} body={t("plantingDetail.delete.confirmBody", { crop: crop.name })} />

      {editOpen && <EditDialog planting={planting} crops={data.crops} locations={data.locations} varieties={data.varieties} onClose={() => setEditOpen(false)} onSaved={reload} />}
      {harvestOpen && <HarvestDialog plantingId={planting.id} onClose={() => setHarvestOpen(false)} onSaved={reload} />}
    </div>
  );
}

function CompanionGroup({ label, items, testId, className }: { label: string; items: Companion[]; testId: string; className: string }) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((c) => (
          <span key={c.otherCropId} title={c.note ?? ""} data-testid={testId} className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs", className)}>
            {c.otherCropName}
            <a href={c.source} target="_blank" rel="noopener noreferrer" aria-label={t("plantingDetail.companions.sourceLink")} className="opacity-70 hover:opacity-100">🔗</a>
          </span>
        ))}
      </div>
    </div>
  );
}

function EditDialog({ planting: p, crops, locations, varieties, onClose, onSaved }: {
  planting: Planting; crops: Crop[]; locations: Location[]; varieties: SeedVariety[]; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    cropId: p.cropId as number | undefined, locationId: p.locationId as number | undefined, seedVarietyId: p.seedVarietyId ?? undefined,
    plantedDate: p.plantedDate, expectedHarvestDate: p.expectedHarvestDate ?? "", areaM2: String(p.areaM2 ?? ""), status: p.status,
    plantingMode: p.plantingMode ?? "area", quantity: p.quantity != null ? String(p.quantity) : "", yieldKgPerPlantOverride: p.yieldKgPerPlantOverride != null ? String(p.yieldKgPerPlantOverride) : "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const cropVarieties = form.cropId ? varieties.filter((v) => v.cropId === form.cropId) : [];

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
      await api("PUT", `/planting/${p.id}`, {
        cropId: form.cropId, locationId: form.locationId, plantedDate: form.plantedDate, status: form.status, plantingMode: form.plantingMode,
        seedVarietyId: form.seedVarietyId ?? null,
        ...(form.expectedHarvestDate && { expectedHarvestDate: form.expectedHarvestDate }),
        ...(form.plantingMode === "count"
          ? { quantity, areaM2: 0, ...(form.yieldKgPerPlantOverride !== "" && { yieldKgPerPlantOverride: Number(form.yieldKgPerPlantOverride) }) }
          : { areaM2: area }),
      });
      onClose();
      await onSaved();
    } catch (err) {
      reportError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={t("plantingDetail.edit.title")} className="sm:max-w-md">
      <form className="space-y-4" data-testid="planting-edit-form" onSubmit={(e) => void save(e)}>
        <FormError>{error}</FormError>
        <div className="space-y-2">
          <Label htmlFor="edit-cropId">{t("plantings.form.crop.label")}</Label>
          <Combobox data-testid="edit-crop-combobox" id="edit-cropId" value={form.cropId} options={crops} placeholder={t("plantings.form.crop.placeholder")} onChange={(v) => setForm({ ...form, cropId: v, seedVarietyId: undefined })} />
        </div>
        {cropVarieties.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="edit-seedVarietyId">{t("plantings.form.variety.label")}</Label>
            <Combobox id="edit-seedVarietyId" value={form.seedVarietyId} clearable placeholder={t("plantings.form.variety.none")} options={cropVarieties.map((v) => ({ id: v.id, name: varietyLabel(v) }))} onChange={(v) => setForm({ ...form, seedVarietyId: v })} />
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="edit-locationId">{t("plantings.form.location.label")}</Label>
          <Combobox id="edit-locationId" value={form.locationId} placeholder={t("plantings.form.location.placeholder")} options={locations.map((l) => ({ id: l.id, name: `${l.name} (${l.areaM2} m²)` }))} onChange={(v) => setForm({ ...form, locationId: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="edit-plantedDate">{t("plantings.form.plantedDate.label")}</Label>
            <Input id="edit-plantedDate" type="date" value={form.plantedDate} onChange={(e) => setForm({ ...form, plantedDate: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-expectedHarvestDate">{t("plantings.form.expectedHarvestDate.label")}</Label>
            <Input id="edit-expectedHarvestDate" type="date" value={form.expectedHarvestDate} onChange={(e) => setForm({ ...form, expectedHarvestDate: e.target.value })} />
          </div>
        </div>
        <PlantingModeFields form={form} setForm={(patch) => setForm({ ...form, ...patch })} cropYieldPerPlant={crops.find((c) => c.id === form.cropId)?.yieldKgPerPlant ?? null} />
        <div className="flex gap-2 pt-2">
          <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("plantings.button.saving") : t("plantings.button.update")}</Button>
          <Button type="button" variant="outline" onClick={onClose}>{t("plantings.button.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function HarvestDialog({ plantingId, onClose, onSaved }: { plantingId: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const { current } = useHousehold();
  const [form, setForm] = useState({ quantity: "", unit: "kg" as "kg" | "g", harvestedDate: today(), isFinalHarvest: false, addToStorage: true });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setError(null), [form.quantity]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const qty = Number(form.quantity);
    if (!(qty > 0)) return setError(t("plantings.harvest.errors.quantityRequired"));
    setSaving(true);
    try {
      await api("POST", `/planting/${plantingId}/harvest`, {
        quantityKg: form.unit === "g" ? qty / 1000 : qty, harvestedDate: form.harvestedDate, householdId: current.id,
        isFinalHarvest: form.isFinalHarvest, addToStorage: form.addToStorage,
      });
      onClose();
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={t("plantingDetail.harvest.title")} className="sm:max-w-md">
      <form className="space-y-4" data-testid="planting-harvest-form" onSubmit={(e) => void save(e)}>
        <FormError>{error}</FormError>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="harvest-qty">{t("plantings.harvest.form.quantity.label")}</Label>
            <div className="flex gap-1">
              <div className="flex-1">
                <UnitInput id="harvest-qty" type="number" step="0.1" min="0.1" unit={form.unit} placeholder={t("plantings.harvest.form.quantity.placeholder")} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
              </div>
              <Select data-testid="harvest-unit-select" aria-label={t("plantings.harvest.form.unit.label")} triggerClassName="w-auto px-2" value={form.unit}
                options={[{ value: "kg" as const, label: t("plantings.harvest.form.unit.kg") }, { value: "g" as const, label: t("plantings.harvest.form.unit.g") }]}
                onChange={(unit) => setForm({ ...form, unit })} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="harvest-date">{t("plantings.harvest.form.date.label")}</Label>
            <Input id="harvest-date" type="date" value={form.harvestedDate} onChange={(e) => setForm({ ...form, harvestedDate: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <label htmlFor="harvest-final" className="flex cursor-pointer items-center gap-2 text-sm">
            <input id="harvest-final" type="checkbox" className="accent-primary" checked={form.isFinalHarvest} onChange={(e) => setForm({ ...form, isFinalHarvest: e.target.checked })} />
            {t("plantings.harvest.form.isFinal.label")}
          </label>
          <label htmlFor="harvest-storage" className="flex cursor-pointer items-center gap-2 text-sm">
            <input id="harvest-storage" type="checkbox" className="accent-primary" checked={form.addToStorage} onChange={(e) => setForm({ ...form, addToStorage: e.target.checked })} />
            {t("plantings.harvest.form.addToStorage.label")}
          </label>
        </div>
        <div className="flex gap-2 pt-1">
          <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("plantings.button.saving") : t("plantingDetail.harvest.save")}</Button>
          <Button type="button" variant="outline" onClick={onClose}>{t("plantings.button.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}
