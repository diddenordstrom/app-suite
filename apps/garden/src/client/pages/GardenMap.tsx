import { useReducer, useRef, useState } from "react";
import { ApiError, api, get, useLoad } from "../api";
import { useHousehold } from "../household";
import { t } from "../i18n";
import { Skeleton, SkeletonPage } from "../ui";
import { reportError } from "../toast";
import { useGardenCanvas, type DecorativeType, type GardenMode } from "../hooks/useGardenCanvas";
import { computePaintedAreaM2, getCellsForLocation, type Garden, type GardenLayout } from "../lib/gardenCanvas";
import { GardenInfoPanel, GardenPendingActions, GardenToolbar } from "../components/garden/GardenControls";
import { GardenBedPopover, GardenSetupDialog, GardenTagSheet, type TagChoice } from "../components/garden/GardenDialogs";

interface Location { id: number; name: string; areaM2: number }

/** Parses a stored layout; the retired "pond" decorative is read as "compost" (and saved that way next time). */
export function parseLayout(raw: string): { layout: GardenLayout; migrated: boolean } {
  const layout = JSON.parse(raw) as GardenLayout;
  let migrated = false;
  for (const [key, value] of Object.entries(layout.cells)) {
    if (value === "pond") { layout.cells[key] = "compost"; migrated = true; }
  }
  return { layout, migrated };
}

export function GardenMap() {
  const { current } = useHousehold();
  const layoutRef = useRef<GardenLayout>({ cells: {}, colors: {} });
  const { data, loading, setData } = useLoad(async () => {
    const [garden, locations, plantings, dashboard] = await Promise.all([
      get<Garden>("/garden", { householdId: current.id }).catch((e) => { if (e instanceof ApiError && e.status === 404) return null; throw e; }),
      get<Location[]>("/location"),
      get<{ locationId: number; status: string }[]>("/planting").catch(() => []),
      get<{ byLocation?: { locationId: number; kcal: number }[] }>("/dashboard", { householdId: current.id }).catch(() => null),
    ]);
    if (garden) {
      const { layout, migrated } = parseLayout(garden.layout);
      layoutRef.current = layout;
      if (migrated) void api("PUT", `/garden/${garden.id}/layout`, layout).catch(reportError);
    }
    return { garden, locations, plantings, kcal: dashboard?.byLocation ?? [] };
  }, [current.id]);

  if (loading && !data) return <SkeletonPage><Skeleton className="h-[calc(100dvh-8rem)] w-full rounded-lg md:h-dvh" /></SkeletonPage>;
  if (!data) return null;
  if (!data.garden) {
    return (
      <div className="h-[calc(100dvh-8rem)] md:h-dvh">
        <GardenSetupDialog open onClose={() => undefined} onCreate={(d) => {
          api<Garden>("POST", "/garden", { ...d, householdId: current.id })
            .then((garden) => { layoutRef.current = { cells: {}, colors: {} }; setData({ ...data, garden }); }, reportError);
        }} />
      </div>
    );
  }
  return <GardenEditor garden={data.garden} locations={data.locations} plantings={data.plantings} kcal={data.kcal} layoutRef={layoutRef}
    setGarden={(garden) => setData({ ...data, garden })} setLocations={(locations) => setData({ ...data, locations })} />;
}

function GardenEditor({ garden, locations, plantings, kcal, layoutRef, setGarden, setLocations }: {
  garden: Garden; locations: Location[]; plantings: { locationId: number; status: string }[]; kcal: { locationId: number; kcal: number }[];
  layoutRef: React.MutableRefObject<GardenLayout>; setGarden: (g: Garden) => void; setLocations: (l: Location[]) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  const [mode, setMode] = useState<GardenMode>("view");
  const [decorative, setDecorative] = useState<DecorativeType | null>(null);
  const undoStack = useRef<GardenLayout[]>([]);
  const [saving, setSaving] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [popover, setPopover] = useState<{ id: number; position: { x: number; y: number } } | null>(null);

  const snapshot = () => { undoStack.current.push(structuredClone(layoutRef.current)); };
  const save = async () => {
    setSaving(true);
    try { await api<Garden>("PUT", `/garden/${garden.id}/layout`, layoutRef.current); } catch (e) { reportError(e); } finally { setSaving(false); }
  };
  const canvas = useGardenCanvas({
    canvasRef, garden, layoutRef, mode, locations,
    onBedClick: (id, position) => setPopover({ id, position }),
    onLayoutChange: redraw,
    onStrokeStart: snapshot,
  });

  const tag = (choice: TagChoice) => {
    snapshot();
    const layout = layoutRef.current;
    for (const key of canvas.getSelected()) layout.cells[key] = "decorativeType" in choice ? choice.decorativeType : choice.locationId;
    if (!("decorativeType" in choice)) layout.colors[String(choice.locationId)] = choice.color;
    canvas.clearSelection();
    redraw();
    void save();
  };
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ended = canvas.handlers.onPointerUp(e);
    // Decoratives are armed in the toolbar and applied on release; beds collect until ✓.
    if (ended === "paint" && decorative !== null && canvas.getSelected().size > 0) tag({ decorativeType: decorative });
    if (ended === "erase") void save();
  };
  const undo = () => {
    const prev = undoStack.current.pop();
    if (!prev) return;
    layoutRef.current = prev;
    redraw();
    void save();
  };
  /** New width/height drops cells outside the grid; a new cell size keeps cell positions and changes their real size. */
  const updateSize = async (d: { widthCm: number; heightCm: number; cellSizeCm: number }) => {
    const cols = Math.ceil(d.widthCm / d.cellSizeCm);
    const rows = Math.ceil(d.heightCm / d.cellSizeCm);
    const layout = layoutRef.current;
    layout.cells = Object.fromEntries(Object.entries(layout.cells).filter(([key]) => {
      const [c, r] = key.split(",").map(Number);
      return c! < cols && r! < rows;
    }));
    try {
      setGarden(await api<Garden>("PATCH", `/garden/${garden.id}`, d));
      await save();
    } catch (e) { reportError(e); }
  };
  const clearCells = () => { snapshot(); layoutRef.current.cells = {}; redraw(); void save(); };
  const updateArea = async (locationId: number, areaM2: number) => {
    try {
      await api("PUT", `/location/${locationId}`, { areaM2 });
      setLocations(await get<Location[]>("/location"));
      setPopover(null);
    } catch (e) { reportError(e); }
  };
  const recalibrate = async (cellSizeCm: number) => {
    try { setGarden(await api<Garden>("PATCH", `/garden/${garden.id}`, { cellSizeCm })); setPopover(null); } catch (e) { reportError(e); }
  };

  const painted = Object.keys(layoutRef.current.cells).length;
  const pending = mode === "paint" && decorative === null && canvas.selectedCount > 0;
  const popLoc = popover ? locations.find((l) => l.id === popover.id) : undefined;

  return (
    <div className="relative h-[calc(100dvh-8rem)] w-full overflow-hidden md:h-dvh">
      <canvas ref={canvasRef} data-testid="garden-canvas" {...canvas.handlers} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        className={`block size-full touch-none border-0 border-border text-primary ${mode === "view" ? "cursor-grab" : "cursor-crosshair"}`} />
      {pending
        ? <GardenPendingActions onCommit={() => setTagOpen(true)} onCancel={canvas.clearSelection} />
        : <GardenToolbar mode={mode} decorative={decorative} canUndo={undoStack.current.length > 0} saving={saving}
            onMode={(m) => { setMode(m); if (m !== "paint") canvas.clearSelection(); }} onDecorative={setDecorative} onUndo={undo} onZoomIn={canvas.zoomIn} onZoomOut={canvas.zoomOut} />}
      <GardenInfoPanel widthCm={garden.widthCm} heightCm={garden.heightCm} cellSizeCm={garden.cellSizeCm} paintedCount={painted} onUpdate={(d) => void updateSize(d)} onClear={clearCells} />
      <GardenTagSheet open={tagOpen} locations={locations} onClose={() => setTagOpen(false)} onTag={tag} />
      {popover && popLoc && (
        <GardenBedPopover position={popover.position} locationId={popLoc.id} name={popLoc.name} storedAreaM2={popLoc.areaM2} cellSizeCm={garden.cellSizeCm}
          paintedAreaM2={computePaintedAreaM2(getCellsForLocation(layoutRef.current, popLoc.id).length, garden.cellSizeCm)}
          plantingCount={plantings.filter((p) => p.locationId === popLoc.id && p.status !== "harvested").length}
          totalKcal={kcal.find((k) => k.locationId === popLoc.id)?.kcal ?? 0}
          onClose={() => setPopover(null)} onUpdateArea={(a) => void updateArea(popLoc.id, a)} onRecalibrate={(c) => void recalibrate(c)} />
      )}
      {painted === 0 && mode === "view" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="rounded-lg bg-card/80 px-4 py-2 text-sm text-muted-foreground">{t("garden.empty")}</p>
        </div>
      )}
    </div>
  );
}
