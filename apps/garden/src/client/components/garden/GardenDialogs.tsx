/** The garden map's dialogs: first-time setup, tagging a selection, and the popover for a clicked bed. */
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button, Dialog, Input, cn } from "../../ui";
import { locale, t, type MsgKey } from "../../i18n";
import { Combobox } from "../Combobox";
import { Label } from "../common";
import { DECORATIVES } from "./GardenControls";
import type { DecorativeType } from "../../hooks/useGardenCanvas";

const MAX_CELLS = 100_000;

export function GardenSetupDialog({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (d: { name: string; widthCm: number; heightCm: number; cellSizeCm: number }) => void }) {
  const [form, setForm] = useState({ name: "", widthM: "", heightM: "", cellSizeCm: "10" });
  const w = Number(form.widthM), h = Number(form.heightM), c = Number(form.cellSizeCm);
  const cells = w > 0 && h > 0 && c > 0 ? Math.ceil((w * 100) / c) * Math.ceil((h * 100) / c) : 0;
  const tooMany = cells > MAX_CELLS;
  const ok = w > 0 && h > 0 && c > 0 && !tooMany;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (ok) onCreate({ name: form.name || t("garden.setup.name.placeholder"), widthCm: Math.round(w * 100), heightCm: Math.round(h * 100), cellSizeCm: c });
  };
  return (
    <Dialog open={open} onClose={onClose} title={t("garden.setup.title")} className="sm:max-w-md">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-1">
          <Label htmlFor="garden-name">{t("garden.setup.name.label")}</Label>
          <Input id="garden-name" value={form.name} placeholder={t("garden.setup.name.placeholder")} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="garden-width">{t("garden.setup.width.label")}</Label>
            <Input id="garden-width" type="number" min="0.1" step="0.1" value={form.widthM} placeholder={t("garden.setup.width.placeholder")} onChange={(e) => setForm({ ...form, widthM: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="garden-height">{t("garden.setup.height.label")}</Label>
            <Input id="garden-height" type="number" min="0.1" step="0.1" value={form.heightM} placeholder={t("garden.setup.height.placeholder")} onChange={(e) => setForm({ ...form, heightM: e.target.value })} />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="garden-cell-size">{t("garden.setup.cellSize.label")}</Label>
          <Input id="garden-cell-size" type="number" min={1} step={1} value={form.cellSizeCm} onChange={(e) => setForm({ ...form, cellSizeCm: e.target.value })} />
          <p className="text-xs text-muted-foreground">{t("garden.setup.cellSize.hint")}</p>
        </div>
        {cells > 0 && (
          <p className={cn("text-sm", tooMany ? "text-danger" : "text-muted-foreground")}>
            {t("garden.setup.cellCount", { count: cells.toLocaleString(locale) })}
            {tooMany && ` — ${t("garden.cellLimit.warning", { max: MAX_CELLS.toLocaleString(locale) })}`}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={!ok}>{t("garden.setup.button")}</Button>
      </form>
    </Dialog>
  );
}

/** Bed fills to pick from. They are map data (drawn on the canvas under dark labels), not theme colours. */
const PALETTE = ["#4ade80", "#22c55e", "#16a34a", "#facc15", "#f59e0b", "#f97316", "#38bdf8", "#818cf8", "#c084fc", "#fb7185", "#a78bfa", "#94a3b8"];
export type TagChoice = { locationId: number; color: string } | { decorativeType: DecorativeType };

export function GardenTagSheet({ open, locations, onClose, onTag }: { open: boolean; locations: { id: number; name: string }[]; onClose: () => void; onTag: (c: TagChoice) => void }) {
  const [kind, setKind] = useState<"bed" | "decorative">("bed");
  const [locationId, setLocationId] = useState<number | undefined>();
  const [color, setColor] = useState(PALETTE[0]!);
  const [decorative, setDecorative] = useState<DecorativeType>("path");
  const tag = () => {
    if (kind === "decorative") onTag({ decorativeType: decorative });
    else if (locationId) onTag({ locationId, color });
    onClose();
  };
  const toggle = (on: boolean): "primary" | "outline" => (on ? "primary" : "outline");
  return (
    <Dialog open={open} onClose={onClose} title={t("garden.tag.title")}>
      <div className="space-y-4">
        <div className="flex gap-2">
          <Button variant={toggle(kind === "bed")} className="h-9" onClick={() => setKind("bed")}>{t("garden.tag.selectLocation")}</Button>
          <Button variant={toggle(kind === "decorative")} className="h-9" onClick={() => setKind("decorative")}>{t("garden.tag.decorative")}</Button>
        </div>
        {kind === "bed" ? (
          <>
            <div className="space-y-1">
              <Label htmlFor="tag-location">{t("garden.tag.selectLocation")}</Label>
              <Combobox id="tag-location" value={locationId} options={locations} placeholder={t("garden.tag.selectLocation")} onChange={setLocationId} />
            </div>
            <div>
              <p className="text-sm font-medium">{t("garden.tag.selectColor")}</p>
              <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("garden.tag.selectColor")}>
                {PALETTE.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} onClick={() => setColor(c)}
                    className={cn("size-8 rounded-full border-2 transition-transform", color === c ? "scale-110 border-foreground" : "border-transparent")} style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            {DECORATIVES.map((d) => <Button key={d} variant={toggle(decorative === d)} className="h-9" onClick={() => setDecorative(d)}>{t(`garden.decorative.${d}` as MsgKey)}</Button>)}
          </div>
        )}
        <Button className="w-full" disabled={kind === "bed" && !locationId} onClick={tag}>{t("garden.tag.button")}</Button>
      </div>
    </Dialog>
  );
}

/**
 * The card shown where a bed was clicked: painted vs stored area, plantings, kcal. When the two areas differ it offers
 * to store the painted area, or to rescale the (global) cell size so this bed's painted area matches the stored one.
 */
export function GardenBedPopover({ position, locationId, name, paintedAreaM2, storedAreaM2, cellSizeCm, plantingCount, totalKcal, onClose, onUpdateArea, onRecalibrate }: {
  position: { x: number; y: number }; locationId: number; name: string; paintedAreaM2: number; storedAreaM2: number; cellSizeCm: number;
  plantingCount: number; totalKcal: number; onClose: () => void; onUpdateArea: (areaM2: number) => void; onRecalibrate: (cellSizeCm: number) => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const mismatch = Math.abs(paintedAreaM2 - storedAreaM2) > 0.05;
  // Scale by sqrt(target / painted) and round to whole cm; the result can drift a little from the target.
  const proposed = paintedAreaM2 > 0 && storedAreaM2 > 0 ? Math.round(cellSizeCm * Math.sqrt(storedAreaM2 / paintedAreaM2)) : null;
  const next = proposed !== null && proposed >= 1 ? proposed : null;
  const projected = next !== null ? paintedAreaM2 * (next / cellSizeCm) ** 2 : 0;
  const row = (label: string, value: string) => <div className="flex justify-between"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>;
  return (
    <>
      <div className="fixed z-30 min-w-[200px] max-w-[280px] -translate-x-1/2 rounded-lg border border-border bg-card p-3 shadow-lg" style={{ top: position.y + 10, left: position.x }} data-testid="garden-bed-popover">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{name}</h3>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">×</button>
        </div>
        <dl className="space-y-1 text-xs">
          {row(t("garden.popover.paintedArea"), `${paintedAreaM2.toFixed(2)} m²`)}
          {row(t("garden.popover.storedArea"), `${storedAreaM2.toFixed(2)} m²`)}
          {row(t("garden.popover.plantings"), String(plantingCount))}
          {row(t("garden.popover.kcal"), Math.round(totalKcal).toLocaleString(locale))}
        </dl>
        {mismatch && (
          <div className="mt-2 text-xs text-warning">
            <p>{t("garden.warning.areaMismatch", { painted: paintedAreaM2.toFixed(2), stored: storedAreaM2.toFixed(2) })}</p>
            <Button variant="outline" className="mt-1 h-7 w-full text-xs" onClick={() => onUpdateArea(paintedAreaM2)}>{t("garden.warning.areaMismatchButton")}</Button>
            {next !== null && next !== cellSizeCm && (
              <Button variant="outline" className="mt-1 h-7 w-full text-xs" data-testid="recalibrate-cellsize-btn" onClick={() => setConfirm(true)}>{t("garden.recalibrate.button")}</Button>
            )}
          </div>
        )}
        <Link to={`/locations/${locationId}`} className="mt-2 block text-center text-xs text-primary hover:underline">{t("garden.popover.viewDetails")} →</Link>
      </div>
      <Dialog open={confirm} onClose={() => setConfirm(false)} title={t("garden.recalibrate.confirmTitle")} className="sm:max-w-sm">
        <p className="mb-2 text-sm text-muted-foreground">{t("garden.recalibrate.confirmBody", { from: cellSizeCm, to: next ?? cellSizeCm, area: projected.toFixed(2), target: storedAreaM2.toFixed(2) })}</p>
        <p className="mb-4 text-xs text-muted-foreground">{t("garden.recalibrate.globalFootnote")}</p>
        <div className="flex gap-2">
          <Button className="flex-1" data-testid="recalibrate-cellsize-confirm" onClick={() => { if (next !== null) onRecalibrate(next); setConfirm(false); }}>{t("garden.recalibrate.button")}</Button>
          <Button variant="outline" onClick={() => setConfirm(false)}>{t("common.cancel")}</Button>
        </div>
      </Dialog>
    </>
  );
}
