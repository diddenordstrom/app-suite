/**
 * The garden map: draws the grid, painted beds and the pending selection on a <canvas> every animation frame,
 * and turns pointer input into paint, erase, pan and pinch-zoom.
 *
 * Zoom, pan, the pending selection and gesture state live in refs that the draw loop reads, so dragging never
 * re-renders React. Only the selection size is React state (the page swaps its toolbar on it). The layout belongs
 * to the page and comes in as a ref; erasing edits it in place and calls `onLayoutChange`.
 */
import { useEffect, useRef, useState, type MutableRefObject, type RefObject } from "react";
import { cellToPixel, computeMaxZoom, computeMinZoom, dampenZoomFactor, isInBounds, pixelToCell, type Garden, type GardenLayout } from "../lib/gardenCanvas";

export type GardenMode = "view" | "paint" | "erase";
export type DecorativeType = "path" | "shed" | "compost" | "building";

/** Fills for decorative cells and beds without a colour. These are the map's own data colours, the same in both themes. */
const UNTAGGED_COLOR = "#a3a3a3";
const DECORATIVE_COLORS: Record<string, string> = { path: "#d6d3d1", shed: "#92400e", compost: "#65a30d", building: "#475569" };
const ZOOM_PADDING = 48; // px of air around the grid at the widest zoom
const ZOOM_IN_VISIBLE_CELLS = 10; // cells across at the closest zoom
// Pinch is damped (a 4× spread gives ~2× zoom) and capped per event so a jumpy touch can't spike it.
const PINCH_GAIN = 0.5;
const PINCH_PER_EVENT_MIN = 0.97;
const PINCH_PER_EVENT_MAX = 1.03;

type Gesture = "idle" | "paint" | "erase" | "pan" | "two-finger";

export function useGardenCanvas({ canvasRef, garden, layoutRef, mode, locations, onBedClick, onLayoutChange, onStrokeStart }: {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  garden: Garden;
  layoutRef: MutableRefObject<GardenLayout>;
  mode: GardenMode;
  locations: { id: number; name: string }[];
  onBedClick: (locationId: number, position: { x: number; y: number }) => void;
  onLayoutChange: () => void;
  /** Before an erase stroke changes the layout, so the page can take an undo snapshot. */
  onStrokeStart: () => void;
}) {
  // Latest props for the draw loop and the handlers.
  const props = useRef({ garden, mode, locations, onBedClick, onLayoutChange, onStrokeStart });
  props.current = { garden, mode, locations, onBedClick, onLayoutChange, onStrokeStart };

  const view = useRef({ zoom: 1, x: 0, y: 0 });
  const size = useRef({ w: 0, h: 0 });
  const selected = useRef(new Set<string>());
  const [selectedCount, setSelectedCount] = useState(0);
  const g = useRef({
    pointers: new Map<number, { x: number; y: number }>(),
    mode: "idle" as Gesture,
    lastX: 0, lastY: 0,
    stroke: new Set<string>(),
    startDistance: 1, startZoom: 1, midX: 0, midY: 0,
  });

  const syncCount = () => setSelectedCount(selected.current.size);
  const grid = () => {
    const cellSize = props.current.garden.cellSizeCm;
    return { cols: Math.ceil(props.current.garden.widthCm / cellSize), rows: Math.ceil(props.current.garden.heightCm / cellSize), cellSize };
  };
  const zoomBounds = () => {
    const { w, h } = size.current;
    if (!w || !h) return { min: 0.1, max: 10 };
    const { cols, rows, cellSize } = grid();
    return { min: computeMinZoom(w, h, cols, rows, cellSize, ZOOM_PADDING), max: computeMaxZoom(w, h, cellSize, ZOOM_IN_VISIBLE_CELLS) };
  };
  const cellAt = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const { cols, rows, cellSize } = grid();
    const v = view.current;
    const c = pixelToCell(clientX - rect.left, clientY - rect.top, cellSize, v.zoom, v.x, v.y);
    return isInBounds(c.col, c.row, cols, rows) ? `${c.col},${c.row}` : null;
  };
  /** Zoom to `next`, keeping the point under (clientX, clientY) still. */
  const zoomAround = (next: number, clientX?: number, clientY?: number) => {
    const v = view.current;
    const canvas = canvasRef.current;
    if (canvas && clientX !== undefined && clientY !== undefined) {
      const rect = canvas.getBoundingClientRect();
      const mx = clientX - rect.left;
      const my = clientY - rect.top;
      v.x = mx - ((mx - v.x) / v.zoom) * next;
      v.y = my - ((my - v.y) / v.zoom) * next;
    }
    v.zoom = next;
  };

  const paintCell = (key: string) => {
    if (!selected.current.has(key)) { g.current.stroke.add(key); selected.current.add(key); syncCount(); }
  };
  const eraseCell = (key: string) => {
    const layout = layoutRef.current;
    if (key in layout.cells) {
      const rest = { ...layout.cells };
      delete rest[key];
      layout.cells = rest;
      props.current.onLayoutChange();
    }
    if (selected.current.delete(key)) syncCount();
  };

  // ── Drawing ────────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: parent.clientWidth, h: parent.clientHeight };
      canvas.width = Math.round(size.current.w * dpr);
      canvas.height = Math.round(size.current.h * dpr);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas.parentElement!);

    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const { w, h } = size.current;
      const { cols, rows, cellSize } = grid();
      const v = view.current;
      const scaled = cellSize * v.zoom;
      const layout = layoutRef.current;
      // Theme colours come from the canvas's own CSS (`color` = primary, `border-color` = grid lines).
      const css = getComputedStyle(canvas);
      const at = (key: string) => {
        const [c, r] = key.split(",").map(Number);
        return cellToPixel(c!, r!, cellSize, v.zoom, v.x, v.y);
      };

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      for (const [key, value] of Object.entries(layout.cells)) {
        const p = at(key);
        ctx.fillStyle = typeof value === "string" ? DECORATIVE_COLORS[value] ?? UNTAGGED_COLOR : layout.colors[String(value)] ?? UNTAGGED_COLOR;
        ctx.fillRect(p.x, p.y, scaled, scaled);
      }

      // Pending selection: tinted primary with a dashed outline, so it reads as "not tagged yet".
      if (selected.current.size > 0) {
        ctx.fillStyle = css.color;
        ctx.globalAlpha = 0.4;
        for (const key of selected.current) { const p = at(key); ctx.fillRect(p.x, p.y, scaled, scaled); }
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.strokeStyle = css.color;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        for (const key of selected.current) { const p = at(key); ctx.strokeRect(p.x, p.y, scaled, scaled); }
        ctx.restore();
      }

      // Grid lines, only over the visible part of the grid.
      ctx.strokeStyle = css.borderTopColor;
      ctx.lineWidth = 1;
      const c0 = Math.max(0, Math.floor(-v.x / scaled));
      const c1 = Math.min(cols, Math.ceil((w - v.x) / scaled));
      const r0 = Math.max(0, Math.floor(-v.y / scaled));
      const r1 = Math.min(rows, Math.ceil((h - v.y) / scaled));
      ctx.beginPath();
      for (let c = c0; c <= c1; c++) {
        const x = c * scaled + v.x;
        ctx.moveTo(x, r0 * scaled + v.y);
        ctx.lineTo(x, r1 * scaled + v.y);
      }
      for (let r = r0; r <= r1; r++) {
        const y = r * scaled + v.y;
        ctx.moveTo(c0 * scaled + v.x, y);
        ctx.lineTo(c1 * scaled + v.x, y);
      }
      ctx.stroke();

      // Each bed's name and painted area at its centre (dark text: bed fills are light).
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const nameSize = Math.max(10, scaled * 0.4);
      const areaSize = Math.max(9, nameSize * 0.78);
      for (const loc of props.current.locations) {
        let sumC = 0, sumR = 0, n = 0;
        for (const [key, value] of Object.entries(layout.cells)) {
          if (value !== loc.id) continue;
          const [c, r] = key.split(",").map(Number);
          sumC += c!; sumR += r!; n++;
        }
        if (n === 0) continue;
        const p = cellToPixel(sumC / n, sumR / n, cellSize, v.zoom, v.x, v.y);
        const area = (n * cellSize * cellSize) / 10_000;
        const cx = p.x + scaled / 2;
        const cy = p.y + scaled / 2;
        ctx.font = `${nameSize}px ${css.fontFamily}`;
        ctx.fillStyle = "#000";
        ctx.fillText(loc.name, cx, cy - nameSize * 0.45);
        ctx.font = `${areaSize}px ${css.fontFamily}`;
        ctx.fillStyle = "#444";
        ctx.fillText(`(${area.toFixed(area < 1 ? 2 : 1)} m²)`, cx, cy + areaSize * 0.7);
      }
    };
    frame = requestAnimationFrame(draw);

    // Wheel zoom needs a non-passive listener to stop the page scrolling.
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { min, max } = zoomBounds();
      zoomAround(Math.max(min, Math.min(max, view.current.zoom * (e.deltaY > 0 ? 0.97 : 1.03))), e.clientX, e.clientY);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("wheel", onWheel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Pointer input ──────────────────────────────────────────────────────
  const beginTwoFinger = () => {
    const s = g.current;
    const [p1, p2] = [...s.pointers.values()];
    if (!p1 || !p2) return;
    s.startDistance = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    s.startZoom = view.current.zoom;
    s.midX = (p1.x + p2.x) / 2;
    s.midY = (p1.y + p2.y) / 2;
    s.mode = "two-finger";
  };
  const updateTwoFinger = () => {
    const s = g.current;
    const [p1, p2] = [...s.pointers.values()];
    if (!p1 || !p2) return;
    const v = view.current;
    const midX = (p1.x + p2.x) / 2;
    const midY = (p1.y + p2.y) / 2;
    v.x += midX - s.midX;
    v.y += midY - s.midY;
    s.midX = midX;
    s.midY = midY;
    const { min, max } = zoomBounds();
    const target = Math.max(min, Math.min(max, s.startZoom * dampenZoomFactor((Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1) / s.startDistance, PINCH_GAIN)));
    const step = Math.max(PINCH_PER_EVENT_MIN, Math.min(PINCH_PER_EVENT_MAX, target / v.zoom));
    zoomAround(Math.max(min, Math.min(max, v.zoom * step)), midX, midY);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = g.current;
    s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    // Middle mouse pans in any mode.
    if (e.button === 1 || (props.current.mode === "view" && s.pointers.size === 1)) {
      s.mode = "pan";
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      return;
    }
    // A second finger: undo what the first just painted and pan/zoom instead.
    if (s.pointers.size >= 2) {
      if (s.mode === "paint" && s.stroke.size > 0) {
        for (const key of s.stroke) selected.current.delete(key);
        s.stroke.clear();
        syncCount();
      }
      beginTwoFinger();
      return;
    }
    const key = cellAt(e.clientX, e.clientY);
    if (!key) return;
    if (props.current.mode === "paint") {
      s.mode = "paint";
      s.stroke.clear();
      paintCell(key);
    } else if (props.current.mode === "erase") {
      s.mode = "erase";
      props.current.onStrokeStart();
      eraseCell(key);
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const s = g.current;
    if (s.pointers.has(e.pointerId)) s.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (s.mode === "two-finger") return updateTwoFinger();
    if (s.mode === "pan") {
      view.current.x += e.clientX - s.lastX;
      view.current.y += e.clientY - s.lastY;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      return;
    }
    if (s.mode !== "paint" && s.mode !== "erase") return;
    const key = cellAt(e.clientX, e.clientY);
    if (!key) return;
    if (s.mode === "paint") paintCell(key);
    else eraseCell(key);
  };

  /** Returns the gesture that just ended, so the page can react to the end of a paint or erase stroke. */
  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>): Gesture => {
    const s = g.current;
    const ended = s.mode;
    s.pointers.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* not captured */ }
    if (s.pointers.size === 0) {
      s.mode = "idle";
      s.stroke.clear();
    } else if (s.mode === "two-finger") {
      // Down to one finger: stop, rather than suddenly start painting.
      s.mode = "idle";
    }
    return ended;
  };

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (props.current.mode !== "view") return;
    const key = cellAt(e.clientX, e.clientY);
    const value = key ? layoutRef.current.cells[key] : undefined;
    if (typeof value === "number") props.current.onBedClick(value, { x: e.clientX, y: e.clientY });
  };

  const zoomIn = () => { view.current.zoom = Math.min(zoomBounds().max, view.current.zoom * 1.2); };
  const zoomOut = () => { view.current.zoom = Math.max(zoomBounds().min, view.current.zoom / 1.2); };
  const clearSelection = () => { selected.current = new Set(); setSelectedCount(0); };
  const getSelected = () => selected.current;

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClick },
    selectedCount, clearSelection, getSelected, zoomIn, zoomOut,
  };
}
