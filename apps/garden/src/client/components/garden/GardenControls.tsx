/** The garden map's floating controls: toolbar, pending-selection actions and the info panel. */
import { useEffect, useState } from "react";
import { Button, Input, cn } from "../../ui";
import { locale, t, type MsgKey } from "../../i18n";
import type { DecorativeType, GardenMode } from "../../hooks/useGardenCanvas";
import { Label } from "../common";
import { ConfirmDialog } from "../dialogs";

/** Bottom centre on phones, top left on larger screens; the toolbar and the pending actions share the spot. */
const slot = "absolute bottom-4 left-1/2 z-20 -translate-x-1/2 md:bottom-auto md:left-4 md:top-4 md:translate-x-0";
const bar = "flex gap-1 rounded-lg border border-border bg-card p-1 shadow-lg";
const pill = (on: boolean) => cn("h-8 px-3", !on && "bg-transparent text-foreground hover:bg-accent");

export const MODES: { value: GardenMode; key: MsgKey }[] = [
  { value: "view", key: "garden.toolbar.viewMode" },
  { value: "paint", key: "garden.toolbar.paintMode" },
  { value: "erase", key: "garden.toolbar.eraser" },
];
export const DECORATIVES: DecorativeType[] = ["path", "shed", "compost", "building"];

export function GardenToolbar({ mode, decorative, canUndo, saving, onMode, onDecorative, onUndo, onZoomIn, onZoomOut }: {
  mode: GardenMode; decorative: DecorativeType | null; canUndo: boolean; saving: boolean;
  onMode: (m: GardenMode) => void; onDecorative: (d: DecorativeType | null) => void; onUndo: () => void; onZoomIn: () => void; onZoomOut: () => void;
}) {
  return (
    <div className={cn(slot, "flex flex-col items-center gap-2 md:items-start")}>
      <div className={bar}>
        {MODES.map((m) => (
          <Button key={m.value} variant={mode === m.value ? "primary" : "ghost"} aria-pressed={mode === m.value} className={pill(mode === m.value)} onClick={() => onMode(m.value)}>{t(m.key)}</Button>
        ))}
      </div>
      {mode === "paint" && (
        <div className={cn(bar, "max-w-[calc(100vw-2rem)] overflow-x-auto")}>
          <Button variant={decorative === null ? "primary" : "ghost"} className={pill(decorative === null)} onClick={() => onDecorative(null)}>{t("garden.decorative.bed")}</Button>
          {DECORATIVES.map((d) => (
            <Button key={d} variant={decorative === d ? "primary" : "ghost"} className={cn(pill(decorative === d), "whitespace-nowrap")} onClick={() => onDecorative(d)}>{t(`garden.decorative.${d}` as MsgKey)}</Button>
          ))}
        </div>
      )}
      <div className={bar}>
        <Button variant="ghost" className="h-8 px-3" disabled={!canUndo} onClick={onUndo}>{t("garden.toolbar.undo")}</Button>
        <Button variant="ghost" className="h-8 px-3" aria-label={t("garden.toolbar.zoomIn")} onClick={onZoomIn}>+</Button>
        <Button variant="ghost" className="h-8 px-3" aria-label={t("garden.toolbar.zoomOut")} onClick={onZoomOut}>−</Button>
      </div>
      {saving && <span className="rounded bg-card px-2 py-1 text-xs text-muted-foreground shadow-sm">{t("garden.saving")}</span>}
    </div>
  );
}

export function GardenPendingActions({ onCommit, onCancel }: { onCommit: () => void; onCancel: () => void }) {
  return (
    <div data-testid="garden-pending-actions" className={cn(slot, bar)}>
      <Button className="h-8 px-3" data-testid="garden-pending-commit" onClick={onCommit}>✓ {t("garden.pending.commit")}</Button>
      <Button variant="ghost" className="h-8 px-3" data-testid="garden-pending-cancel" onClick={onCancel}>✕ {t("garden.pending.cancel")}</Button>
    </div>
  );
}

/** The 📐 button, the scale chip and a slide-in panel for the grid's size and cell size. */
export function GardenInfoPanel({ widthCm, heightCm, cellSizeCm, paintedCount, onUpdate, onClear }: {
  widthCm: number; heightCm: number; cellSizeCm: number; paintedCount: number;
  onUpdate: (d: { widthCm: number; heightCm: number; cellSizeCm: number }) => void; onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  // Edited locally and saved explicitly, so a half-typed number doesn't redraw the grid.
  const [form, setForm] = useState({ widthCm: String(widthCm), heightCm: String(heightCm), cellSizeCm: String(cellSizeCm) });
  useEffect(() => setForm({ widthCm: String(widthCm), heightCm: String(heightCm), cellSizeCm: String(cellSizeCm) }), [widthCm, heightCm, cellSizeCm]);
  const w = Number(form.widthCm), h = Number(form.heightCm), c = Number(form.cellSizeCm);
  const cols = c > 0 ? Math.ceil(w / c) : 0;
  const rows = c > 0 ? Math.ceil(h / c) : 0;
  const changed = w !== widthCm || h !== heightCm || c !== cellSizeCm;
  const save = () => { if (changed && w > 0 && h > 0 && c > 0) onUpdate({ widthCm: w, heightCm: h, cellSizeCm: c }); };
  const field = (key: keyof typeof form, id: string, label: MsgKey, testId: string) => (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">{t(label)}</Label>
      <Input id={id} type="number" min={1} data-testid={testId} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
    </div>
  );

  return (
    <>
      <button type="button" data-testid="garden-info-toggle" aria-label={t("garden.info.toggle")} aria-expanded={open} onClick={() => setOpen(!open)}
        className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-full border border-border bg-card shadow-lg transition hover:bg-muted">
        <span aria-hidden className="text-lg">📐</span>
      </button>
      <div data-testid="garden-scale-chip" aria-label={t("garden.info.scaleAriaLabel")}
        className="absolute right-3 top-15 z-20 rounded-md border border-border bg-card px-2 py-1 text-xs tabular-nums text-muted-foreground shadow-sm">
        {t("garden.info.scaleLabel", { cells: Math.round(100 / cellSizeCm) })}
      </div>
      {open && (
        <aside data-testid="garden-info-panel" aria-label={t("garden.info.title")}
          className="absolute inset-y-0 right-0 z-30 w-72 max-w-[85vw] overflow-y-auto border-l border-border bg-card p-4 shadow-xl">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">{t("garden.info.title")}</h2>
            <button type="button" aria-label={t("garden.info.close")} onClick={() => setOpen(false)} className="text-lg leading-none text-muted-foreground hover:text-foreground">×</button>
          </div>
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-2">
              {field("widthCm", "info-width", "garden.info.widthCm", "garden-info-width")}
              {field("heightCm", "info-height", "garden.info.heightCm", "garden-info-height")}
            </div>
            {field("cellSizeCm", "info-cell-size", "garden.info.cellSizeCm", "garden-info-cellsize")}
            <p className="text-xs text-muted-foreground">{t("garden.info.cellSizeHint")}</p>
            <div className="space-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">{t("garden.info.totalCells")}</span><span className="font-medium tabular-nums">{cols} × {rows} = {(cols * rows).toLocaleString(locale)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("garden.info.totalArea")}</span><span className="font-medium tabular-nums">{((w * h) / 10_000).toFixed(2)} m²</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t("garden.info.paintedCells")}</span><span className="font-medium tabular-nums" data-testid="garden-info-painted-count">{paintedCount.toLocaleString(locale)}</span></div>
            </div>
            {changed && (
              <div className="flex gap-2 pt-1">
                <Button className="h-9 flex-1" data-testid="garden-info-save" onClick={save}>{t("garden.info.save")}</Button>
                <Button variant="outline" className="h-9" onClick={() => setForm({ widthCm: String(widthCm), heightCm: String(heightCm), cellSizeCm: String(cellSizeCm) })}>{t("common.cancel")}</Button>
              </div>
            )}
            <div className="border-t border-border pt-3">
              <Button variant="outline" className="w-full text-danger" disabled={paintedCount === 0} data-testid="garden-info-clear" onClick={() => setConfirmClear(true)}>{t("garden.info.clearButton")}</Button>
            </div>
          </div>
        </aside>
      )}
      <ConfirmDialog open={confirmClear} onClose={() => setConfirmClear(false)} testId="garden-info-clear-confirm" onConfirm={() => { onClear(); setConfirmClear(false); }}
        title={t("garden.info.clearConfirmTitle")} body={t("garden.info.clearConfirmBody", { count: paintedCount })} confirmLabel={t("garden.info.clearButton")} />
    </>
  );
}
