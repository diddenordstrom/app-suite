/** The painted grid: cell "col,row" → location id (a bed) or a decorative type; bed colours by location id. */
export interface GardenLayout { cells: Record<string, number | string>; colors: Record<string, string> }
export interface Garden { id: number; householdId: number; name: string; widthCm: number; heightCm: number; cellSizeCm: number; layout: string }

export function cellToPixel(
  col: number,
  row: number,
  cellSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } {
  return {
    x: col * cellSize * zoom + offsetX,
    y: row * cellSize * zoom + offsetY,
  };
}

export function pixelToCell(
  px: number,
  py: number,
  cellSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { col: number; row: number } {
  return {
    col: Math.floor((px - offsetX) / (cellSize * zoom)),
    row: Math.floor((py - offsetY) / (cellSize * zoom)),
  };
}

export function isInBounds(col: number, row: number, gridCols: number, gridRows: number): boolean {
  return col >= 0 && row >= 0 && col < gridCols && row < gridRows;
}

export function getCellsForLocation(layout: GardenLayout, locationId: number): string[] {
  return Object.entries(layout.cells)
    .filter(([, value]) => value === locationId)
    .map(([key]) => key);
}

export function computeMinZoom(
  canvasWidth: number,
  canvasHeight: number,
  cols: number,
  rows: number,
  cellSize: number,
  padding: number,
): number {
  const availableW = canvasWidth - padding * 2;
  const availableH = canvasHeight - padding * 2;
  return Math.min(availableW / (cols * cellSize), availableH / (rows * cellSize));
}

export function computeMaxZoom(
  canvasWidth: number,
  canvasHeight: number,
  cellSize: number,
  visibleCells: number,
): number {
  return Math.min(canvasWidth, canvasHeight) / (visibleCells * cellSize);
}

export function computePaintedAreaM2(cellCount: number, cellSizeCm: number): number {
  const cellAreaM2 = (cellSizeCm / 100) ** 2;
  return cellCount * cellAreaM2;
}

/**
 * Centroid of a set of `"col,row"` cell keys in canvas-pixel space (relative
 * to the canvas element). Returns null for an empty set.
 *
 * The `+0.5` offsets push the result to the visual centre of each cell rather
 * than its top-left corner, which is what we want for positioning floating UI
 * (pending-selection action buttons) above the selection.
 */
export function computeCellsCentroidPixel(
  cellKeys: Iterable<string>,
  cellSize: number,
  zoom: number,
  offsetX: number,
  offsetY: number,
): { x: number; y: number } | null {
  let sumCol = 0;
  let sumRow = 0;
  let count = 0;
  for (const key of cellKeys) {
    const [colStr, rowStr] = key.split(',');
    const col = Number(colStr);
    const row = Number(rowStr);
    if (Number.isFinite(col) && Number.isFinite(row)) {
      sumCol += col;
      sumRow += row;
      count += 1;
    }
  }
  if (count === 0) return null;
  return cellToPixel(sumCol / count + 0.5, sumRow / count + 0.5, cellSize, zoom, offsetX, offsetY);
}

/**
 * Dampens a raw pinch ratio so a 4× distance change yields less than a 4×
 * zoom. `gain` < 1 makes pinch feel like a precision dial instead of a
 * slingshot. Caller is responsible for clamping the result to the zoom
 * range before applying it.
 *
 * Math: `rawRatio ** gain` — preserves the identity at ratio = 1 (1^x = 1)
 * and flattens both directions symmetrically (0.25 -> 0.5 with gain=0.5).
 */
export function dampenZoomFactor(rawRatio: number, gain: number): number {
  if (!Number.isFinite(rawRatio) || rawRatio <= 0) return 1;
  return rawRatio ** gain;
}
