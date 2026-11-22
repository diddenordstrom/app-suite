import { useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Dialog, Input, PageSkeleton } from "../ui";
import { api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { locale, t, type MsgKey } from "../i18n";
import { reportError } from "../toast";
import { Combobox } from "../components/Combobox";
import { EmptyState, FormError, Label, UnitInput } from "../components/common";
import { ConfirmDialog, ImageUploadDialog } from "../components/dialogs";
import { EVENT_TYPE_CHIP } from "../lib/events";
import { today } from "../lib/format";
import { FrostProtectionField } from "./Locations";
import { OverflowMenu } from "../components/OverflowMenu";

interface Location { id: number; householdId: number; name: string; areaM2: number; description: string | null; isIndoor: boolean; frostBufferC: number }
interface Macros { kcal: number; proteinG: number; carbsG: number; fatG: number }
interface PlantingSummary extends Macros { plantingId: number; cropName: string; plantingMode: string; areaM2: number; quantity: number | null; expectedYieldKg: number }
interface Summary { location: { id: number; name: string; areaM2: number; description: string | null }; plantings: PlantingSummary[]; totals: Macros }
const CHORES = ["watering", "fertilizing", "pruning", "weeding", "pest_check"] as const;
type LastDone = Record<(typeof CHORES)[number], string | null>;
interface BedNudge { locationId: number; recentlyHarvested: boolean; candidates: { suggestionId: number; cropName: string; daysToMaturity: number | null }[] }

const daysAgo = (date: string) => Math.max(0, Math.round((new Date(today()).getTime() - new Date(date).getTime()) / 86_400_000));

export function LocationDetail() {
  const id = Number(useParams().id);
  const { current } = useHousehold();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useLoad(async () => {
    const [summary, lastDone, images, locations, nudges] = await Promise.all([
      get<Summary>(`/location/${id}/summary`),
      get<LastDone>(`/location/${id}/last-done`),
      get<{ imageId: string }[]>(`/location/${id}/image`),
      get<Location[]>("/location").catch(() => [] as Location[]),
      // The endpoint regenerates suggestions, so it is fine to call on every visit.
      get<{ daysUntilFrost: number; beds: BedNudge[] }>("/bed-nudges", { householdId: current.id }).catch(() => ({ daysUntilFrost: 0, beds: [] })),
    ]);
    return {
      summary, lastDone, images, others: locations.filter((l) => l.id !== id), full: locations.find((l) => l.id === id) ?? null,
      daysUntilFrost: nudges.daysUntilFrost, nudge: nudges.beds.find((b) => b.locationId === id) ?? null,
    };
  }, [id, current.id]);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const back = <div className="mb-4"><Link to="/locations" className="text-sm text-muted-foreground transition hover:text-foreground">{t("locationDetail.backLink")}</Link></div>;
  if (loading && !data) return <>{back}<PageSkeleton header={false} cards={2} columns="" /></>;
  if (!data) return <>{back}<div className="flex justify-center py-16 text-sm text-muted-foreground">{error ? "404" : null}</div></>;

  const { summary, full, nudge } = data;
  const hero = data.images[0];
  const lastDone = CHORES.filter((c) => data.lastDone[c] !== null).map((c) => ({ type: c, date: data.lastDone[c] as string }));
  const sizeLabel = (p: PlantingSummary) => (p.plantingMode === "count" && p.quantity !== null
    ? `${p.quantity} ${t("locationDetail.plantingMode.count")}`
    : `${p.areaM2} ${t("locationDetail.plantingMode.area")}`);
  const removeHero = async () => {
    if (!hero) return;
    setBusy(true);
    try {
      await api("DELETE", `/image/${hero.imageId}`);
      setRemoveOpen(false);
      await reload();
    } catch (e) { reportError(e); } finally { setBusy(false); }
  };

  return (
    <div>
      {back}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight" data-testid="location-name">{summary.location.name}</h1>
          {summary.location.description && <p className="mt-1 text-sm text-muted-foreground">{summary.location.description}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {full?.isIndoor && <Badge tone="signature" data-testid="location-detail-indoor-badge">{t("locations.form.isIndoor.label")}</Badge>}
          <Badge>{summary.location.areaM2} m²</Badge>
        </div>
      </div>

      <div className="mb-6 flex gap-2">
        <Button variant="outline" className="h-9 flex-1" data-testid="location-detail-edit-btn" disabled={!full} onClick={() => setEditOpen(true)}>{t("locationDetail.actions.edit")}</Button>
        <OverflowMenu label={t("locationDetail.actions.more")} testId="location-detail-overflow-btn">
          <button type="button" className="w-full px-3 py-2 text-left text-sm text-danger hover:bg-muted/40" data-testid="location-detail-delete-btn" onClick={() => setDeleteOpen(true)}>
            {t("locationDetail.actions.delete")}
          </button>
        </OverflowMenu>
      </div>

      <Card className="mb-3 overflow-hidden p-0" data-testid="location-hero">
        {hero ? <img src={`/api/image/${hero.imageId}`} alt={summary.location.name} className="h-auto w-full object-cover" /> : (
          <div className="flex flex-col items-center justify-center px-4 py-12 text-center" data-testid="location-no-image">
            <p className="mb-3 text-sm text-muted-foreground">{t("locationDetail.image.empty")}</p>
            <Button className="h-9" onClick={() => setUploadOpen(true)}>{t("locationDetail.image.addButton")}</Button>
          </div>
        )}
      </Card>
      {hero && (
        <div className="mb-6 flex gap-2">
          <Button variant="outline" className="h-9 flex-1" onClick={() => setUploadOpen(true)}>{t("locationDetail.image.replaceButton")}</Button>
          <Button variant="outline" className="h-9 flex-1 text-danger" data-testid="location-image-remove" onClick={() => setRemoveOpen(true)}>{t("locationDetail.image.removeButton")}</Button>
        </div>
      )}

      {nudge && nudge.candidates.length > 0 && (
        <Card data-testid="location-nudge-card" className="mb-3 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("locationDetail.succession.title")}</p>
            {nudge.recentlyHarvested && <span className="rounded bg-warning/15 px-1.5 py-0.5 text-xs" data-testid="location-nudge-recent">🌾 {t("locationDetail.succession.justHarvested")}</span>}
          </div>
          <p className="text-xs text-muted-foreground">{t("locationDetail.succession.daysUntilFrost", { days: data.daysUntilFrost })}</p>
          <div className="flex flex-wrap gap-1.5">
            {nudge.candidates.map((c) => (
              <span key={c.suggestionId} className="inline-flex items-center gap-1 rounded-md bg-success/15 px-2 py-1 text-xs" data-testid="location-nudge-chip">
                {c.cropName}{c.daysToMaturity !== null && <span className="tabular-nums text-muted-foreground">· {c.daysToMaturity}d</span>}
              </span>
            ))}
          </div>
          <Link to="/suggestions" className="mt-1 block text-xs text-primary hover:underline">{t("locationDetail.succession.viewSuggestions")} →</Link>
        </Card>
      )}

      {lastDone.length > 0 && (
        <Card data-testid="last-done-card" className="mb-3">
          <p className="mb-3 text-sm font-semibold">{t("locationDetail.lastDone.title")}</p>
          <ul className="space-y-1.5">
            {lastDone.map((row) => {
              const ago = daysAgo(row.date);
              return (
                <li key={row.type} data-testid={`last-done-${row.type}`} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span aria-hidden>{EVENT_TYPE_CHIP[row.type].emoji}</span><span>{t(`calendar.eventType.${row.type}` as MsgKey)}</span></span>
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {row.date} · {ago === 0 ? t("locationDetail.lastDone.today") : ago === 1 ? t("locationDetail.lastDone.yesterday") : t("locationDetail.lastDone.daysAgo", { days: ago })}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        {summary.plantings.length > 0 ? (
          <>
            {summary.plantings.map((p) => (
              <Card key={p.plantingId}>
                <Link to={`/plantings/${p.plantingId}`} data-testid="location-planting-link" aria-label={t("locationDetail.openPlantingDetail", { crop: p.cropName })}
                  className="group -m-1 mb-2 flex items-start justify-between rounded-md p-1 transition hover:bg-muted/40">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold" data-testid="planting-crop-name">{p.cropName}</p>
                    <p className="text-sm text-muted-foreground">{sizeLabel(p)}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="text-right text-sm">
                      <p className="font-medium tabular-nums" data-testid="planting-expected-yield">{p.expectedYieldKg.toFixed(1)} kg</p>
                      <p className="text-xs text-muted-foreground">{t("locationDetail.expectedYield")}</p>
                    </div>
                    <span aria-hidden className="translate-y-0.5 text-lg leading-none text-muted-foreground transition-transform group-hover:translate-x-0.5">›</span>
                  </div>
                </Link>
                <MacroRow m={p} />
              </Card>
            ))}
            <Card data-testid="location-totals">
              <p className="mb-2 text-sm font-semibold">{t("locationDetail.totals")}</p>
              <MacroRow m={summary.totals} />
            </Card>
          </>
        ) : <EmptyState title={t("locationDetail.noPlantings")} to={`/plantings?locationId=${id}`} />}
      </div>

      <ImageUploadDialog open={uploadOpen} onClose={() => setUploadOpen(false)} title={t("locationDetail.image.uploadTitle")} saveLabel={t("locationDetail.image.saveButton")}
        withCaption={false} fileId="location-image-file" fileTestId="location-image-file-input" fileLabel={t("locationDetail.image.filePicker")}
        attach={async (imageId) => { await api("POST", `/location/${id}/image`, { imageId }); await reload(); }} />
      <ConfirmDialog open={removeOpen} onClose={() => setRemoveOpen(false)} busy={busy} testId="confirm-remove-location-image" onConfirm={() => void removeHero()}
        title={t("locationDetail.image.removeConfirmTitle")} body={t("locationDetail.image.removeConfirmBody")} confirmLabel={t("locationDetail.image.removeButton")} />
      {editOpen && full && <EditDialog location={full} onClose={() => setEditOpen(false)} onSaved={reload} />}
      {deleteOpen && (
        <DeleteDialog name={summary.location.name} plantingCount={summary.plantings.length} others={data.others} onClose={() => setDeleteOpen(false)}
          onConfirm={async (target) => {
            if (target) await api("POST", `/location/${id}/move-plantings`, { targetLocationId: target });
            else await api("DELETE", `/location/${id}`);
            navigate("/locations");
          }} />
      )}
    </div>
  );
}

function MacroRow({ m }: { m: Macros }) {
  const cell = (value: string, label: string) => <div><p className="font-medium tabular-nums text-foreground">{value}</p><span>{label}</span></div>;
  return (
    <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground">
      {cell(`${m.kcal.toLocaleString(locale)} kcal`, t("locations.macros.kcal"))}
      {cell(`${m.proteinG} g`, t("locations.macros.protein"))}
      {cell(`${m.carbsG} g`, t("locations.macros.carbs"))}
      {cell(`${m.fatG} g`, t("locations.macros.fat"))}
    </div>
  );
}

function EditDialog({ location: l, onClose, onSaved }: { location: Location; onClose: () => void; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ name: l.name, areaM2: String(l.areaM2), description: l.description ?? "", isIndoor: l.isIndoor, frostBufferC: l.frostBufferC ?? 0 });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const area = Number(form.areaM2);
    if (!form.name.trim()) return setError(t("locations.errors.nameRequired"));
    if (!(area > 0)) return setError(t("locations.errors.areaRequired"));
    setSaving(true);
    try {
      await api("PUT", `/location/${l.id}`, {
        name: form.name.trim(), areaM2: area, isIndoor: form.isIndoor, frostBufferC: form.frostBufferC,
        ...(form.description.trim() && { description: form.description.trim() }),
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
    <Dialog open onClose={onClose} title={t("locationDetail.edit.title")} className="sm:max-w-md">
      <form className="space-y-4" data-testid="location-edit-form" onSubmit={(e) => void save(e)}>
        <FormError>{error}</FormError>
        <div className="space-y-2">
          <Label htmlFor="edit-name">{t("locations.form.name.label")}</Label>
          <Input id="edit-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-areaM2">{t("locations.form.area.label")}</Label>
          <UnitInput id="edit-areaM2" type="number" step="0.1" min="0.1" unit="m²" value={form.areaM2} onChange={(e) => setForm({ ...form, areaM2: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="edit-description">{t("locations.form.description.label")}</Label>
          <Input id="edit-description" value={form.description} placeholder={t("locations.form.description.placeholder")} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input id="edit-isIndoor" type="checkbox" className="accent-primary" checked={form.isIndoor} onChange={(e) => setForm({ ...form, isIndoor: e.target.checked })} />
          {t("locations.form.isIndoor.label")}
        </label>
        <FrostProtectionField id="edit-frostBufferC" testId="edit-frost-protection-select" value={form.frostBufferC} onChange={(frostBufferC) => setForm({ ...form, frostBufferC })} />
        <div className="flex gap-2">
          <Button type="submit" className="flex-1" disabled={saving}>{saving ? t("locations.button.saving") : t("locations.button.update")}</Button>
          <Button type="button" variant="outline" onClick={onClose}>{t("locations.button.cancel")}</Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Delete a location; one that still has plantings moves them to another location first (which removes it). */
function DeleteDialog({ name, plantingCount, others, onClose, onConfirm }: {
  name: string; plantingCount: number; others: Location[]; onClose: () => void; onConfirm: (target: number | undefined) => Promise<void>;
}) {
  const [target, setTarget] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const needsTarget = plantingCount > 0;
  const confirm = async () => {
    if (needsTarget && !target) return;
    setBusy(true);
    try { await onConfirm(needsTarget ? target : undefined); } catch (e) { reportError(e); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={onClose} title={t("locationDetail.delete.confirmTitle")} className="sm:max-w-md">
      <p className="mb-4 text-sm text-muted-foreground">{t("locationDetail.delete.confirmBody", { name })}</p>
      {needsTarget && (
        <div className="mb-4 space-y-3">
          <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">{t("locations.movePlantings.description", { count: plantingCount })}</div>
          <div className="space-y-2">
            <Label htmlFor="delete-move-target">{t("locations.movePlantings.targetLabel")}</Label>
            <Combobox id="delete-move-target" value={target} options={others} placeholder={t("plantings.form.location.placeholder")} onChange={setTarget} />
          </div>
        </div>
      )}
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1 text-danger" disabled={busy || (needsTarget && !target)} data-testid="confirm-delete-location" onClick={() => void confirm()}>
          {busy ? t("locations.button.saving") : needsTarget ? t("locations.movePlantings.button") : t("locationDetail.delete.confirmButton")}
        </Button>
        <Button onClick={onClose}>{t("common.cancel")}</Button>
      </div>
    </Dialog>
  );
}
