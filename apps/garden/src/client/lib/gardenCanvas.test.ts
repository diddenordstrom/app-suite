import { describe, it, expect } from 'vitest';
import {
  cellToPixel,
  pixelToCell,
  isInBounds,
  getCellsForLocation,
  computeMinZoom,
  computeMaxZoom,
  computePaintedAreaM2,
  computeCellsCentroidPixel,
  dampenZoomFactor,
} from './gardenCanvas';

describe('gardenCanvas', () => {
  describe('cellToPixel()', () => {
    it('converts cell coordinates to pixel position with no zoom or offset', () => {
      const result = cellToPixel(5, 3, 20, 1, 0, 0);
      expect(result).toEqual({ x: 100, y: 60 });
    });

    it('applies zoom factor', () => {
      const result = cellToPixel(5, 3, 20, 2, 0, 0);
      expect(result).toEqual({ x: 200, y: 120 });
    });

    it('applies offset', () => {
      const result = cellToPixel(5, 3, 20, 1, 10, 20);
      expect(result).toEqual({ x: 110, y: 80 });
    });

    it('handles zero coordinates', () => {
      const result = cellToPixel(0, 0, 10, 1, 0, 0);
      expect(result).toEqual({ x: 0, y: 0 });
    });
  });

  describe('pixelToCell()', () => {
    it('converts pixel position to cell coordinates with no zoom or offset', () => {
      const result = pixelToCell(100, 60, 20, 1, 0, 0);
      expect(result).toEqual({ col: 5, row: 3 });
    });

    it('floors to the correct cell', () => {
      const result = pixelToCell(119, 79, 20, 1, 0, 0);
      expect(result).toEqual({ col: 5, row: 3 });
    });

    it('accounts for zoom', () => {
      const result = pixelToCell(200, 120, 20, 2, 0, 0);
      expect(result).toEqual({ col: 5, row: 3 });
    });

    it('accounts for offset', () => {
      const result = pixelToCell(110, 80, 20, 1, 10, 20);
      expect(result).toEqual({ col: 5, row: 3 });
    });
  });

  describe('isInBounds()', () => {
    it('returns true for valid coordinates', () => {
      expect(isInBounds(0, 0, 10, 10)).toBe(true);
      expect(isInBounds(9, 9, 10, 10)).toBe(true);
    });

    it('returns false for out-of-bounds coordinates', () => {
      expect(isInBounds(-1, 0, 10, 10)).toBe(false);
      expect(isInBounds(0, -1, 10, 10)).toBe(false);
      expect(isInBounds(10, 0, 10, 10)).toBe(false);
      expect(isInBounds(0, 10, 10, 10)).toBe(false);
    });
  });

  describe('getCellsForLocation()', () => {
    it('returns cell keys for a given locationId', () => {
      const layout = {
        cells: { '0,0': 1, '1,0': 2, '2,0': 1, '3,0': 'path' },
        colors: {},
      };
      expect(getCellsForLocation(layout, 1)).toEqual(['0,0', '2,0']);
    });

    it('returns empty array when locationId has no cells', () => {
      const layout = { cells: { '0,0': 2 }, colors: {} };
      expect(getCellsForLocation(layout, 1)).toEqual([]);
    });
  });

  describe('computeMinZoom()', () => {
    it('fits a square grid into a square canvas with padding', () => {
      // canvas 800x600, grid 20x20 cells at 10cm each, padding 32px
      // availableW = 800 - 64 = 736, availableH = 600 - 64 = 536
      // zoomW = 736 / (20*10) = 3.68, zoomH = 536 / (20*10) = 2.68
      const result = computeMinZoom(800, 600, 20, 20, 10, 32);
      expect(result).toBeCloseTo(2.68, 1);
    });

    it('returns width-limited zoom when canvas is narrow', () => {
      // canvas 400x800, grid 40x10 cells at 10cm
      // availableW = 400-64=336, availableH = 800-64=736
      // zoomW = 336/400 = 0.84, zoomH = 736/100 = 7.36
      const result = computeMinZoom(400, 800, 40, 10, 10, 32);
      expect(result).toBeCloseTo(0.84, 1);
    });

    it('returns a small positive number for large grids', () => {
      const result = computeMinZoom(800, 600, 100, 100, 10, 32);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(1);
    });
  });

  describe('computeMaxZoom()', () => {
    it('computes zoom so 10 cells fill the smaller canvas dimension', () => {
      // canvas 800x600, cellSize 10, visibleCells 10
      // min(800,600) = 600, zoom = 600 / (10*10) = 6
      const result = computeMaxZoom(800, 600, 10, 10);
      expect(result).toBeCloseTo(6);
    });

    it('uses the smaller dimension', () => {
      // canvas 400x1000, cellSize 20, visibleCells 10
      // min(400,1000)=400, zoom = 400 / (10*20) = 2
      const result = computeMaxZoom(400, 1000, 20, 10);
      expect(result).toBeCloseTo(2);
    });
  });

  describe('computePaintedAreaM2()', () => {
    it('computes area correctly for 10cm cells', () => {
      // 25 cells × (0.1m)² = 0.25 m²
      expect(computePaintedAreaM2(25, 10)).toBeCloseTo(0.25);
    });

    it('computes area correctly for 100cm (1m) cells', () => {
      // 4 cells × (1m)² = 4 m²
      expect(computePaintedAreaM2(4, 100)).toBeCloseTo(4);
    });

    it('returns 0 for zero cells', () => {
      expect(computePaintedAreaM2(0, 10)).toBe(0);
    });
  });

  describe('computeCellsCentroidPixel()', () => {
    it('returns null for an empty set', () => {
      expect(computeCellsCentroidPixel(new Set(), 10, 1, 0, 0)).toBeNull();
    });

    it('returns the cell centre for a single cell', () => {
      // cell (2,3) at cellSize 10 zoom 1: top-left = (20,30), centre = (25,35)
      const result = computeCellsCentroidPixel(['2,3'], 10, 1, 0, 0);
      expect(result).toEqual({ x: 25, y: 35 });
    });

    it('averages multiple cells', () => {
      // cells (0,0) and (2,2): centroid col,row = (1,1); centre = (1.5, 1.5) * 10 = (15,15)
      const result = computeCellsCentroidPixel(['0,0', '2,2'], 10, 1, 0, 0);
      expect(result).toEqual({ x: 15, y: 15 });
    });

    it('applies zoom and offset', () => {
      // cell (2,3) zoom 2 offset (100, 50): cellToPixel(2.5, 3.5, 10, 2, 100, 50)
      //   = (2.5*10*2 + 100, 3.5*10*2 + 50) = (150, 120)
      const result = computeCellsCentroidPixel(['2,3'], 10, 2, 100, 50);
      expect(result).toEqual({ x: 150, y: 120 });
    });

    it('tolerates malformed keys by skipping them', () => {
      const result = computeCellsCentroidPixel(['1,1', 'garbage', '3,3'], 10, 1, 0, 0);
      // Only 1,1 and 3,3 count → centroid 2,2 → centre (2.5, 2.5) * 10 = (25, 25)
      expect(result).toEqual({ x: 25, y: 25 });
    });
  });

  describe('dampenZoomFactor()', () => {
    it('returns 1 for ratio = 1 (no change)', () => {
      expect(dampenZoomFactor(1, 0.5)).toBe(1);
    });

    it('dampens a 4× pinch with gain 0.5 to a 2× zoom', () => {
      expect(dampenZoomFactor(4, 0.5)).toBeCloseTo(2, 5);
    });

    it('dampens a 0.25× pinch symmetrically to a 0.5× zoom', () => {
      expect(dampenZoomFactor(0.25, 0.5)).toBeCloseTo(0.5, 5);
    });

    it('with gain 1 is the identity (no dampening)', () => {
      expect(dampenZoomFactor(2.5, 1)).toBeCloseTo(2.5, 5);
    });

    it('with gain 0 always returns 1 (fully damped)', () => {
      expect(dampenZoomFactor(10, 0)).toBe(1);
    });

    it('guards against non-positive or non-finite input', () => {
      expect(dampenZoomFactor(0, 0.5)).toBe(1);
      expect(dampenZoomFactor(-1, 0.5)).toBe(1);
      expect(dampenZoomFactor(Number.NaN, 0.5)).toBe(1);
    });
  });
});
