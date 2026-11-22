import { describe, it, expect, beforeEach } from 'vitest';
import { GardenService } from './garden.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('GardenService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: GardenService;

  beforeEach(() => {
    db = createTestDb();
    service = new GardenService(db);

    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();
  });

  describe('create()', () => {
    it('creates a garden and returns it with an id', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Min trädgård',
        widthCm: 1000,
        heightCm: 500,
      });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Min trädgård');
      expect(result.widthCm).toBe(1000);
      expect(result.heightCm).toBe(500);
      expect(result.householdId).toBe(1);
    });

    it('creates with default cellSizeCm of 10', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        widthCm: 1000,
        heightCm: 500,
      });

      // Assert
      expect(result.cellSizeCm).toBe(10);
    });

    it('creates with default empty layout', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        widthCm: 1000,
        heightCm: 500,
      });

      // Assert
      expect(JSON.parse(result.layout)).toEqual({ cells: {}, colors: {} });
    });

    it('creates with a custom cellSizeCm', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        widthCm: 1000,
        heightCm: 500,
        cellSizeCm: 20,
      });

      // Assert
      expect(result.cellSizeCm).toBe(20);
    });

    it('rejects creation when garden already exists for household', async () => {
      // Arrange
      await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act & Assert
      await expect(
        service.create({ householdId: 1, widthCm: 2000, heightCm: 1000 }),
      ).rejects.toThrow();
    });

    it('rejects when widthCm is zero or negative', async () => {
      await expect(service.create({ householdId: 1, widthCm: 0, heightCm: 500 })).rejects.toThrow(
        'widthCm must be positive',
      );

      await expect(
        service.create({ householdId: 1, widthCm: -100, heightCm: 500 }),
      ).rejects.toThrow('widthCm must be positive');
    });

    it('rejects when heightCm is zero or negative', async () => {
      await expect(service.create({ householdId: 1, widthCm: 1000, heightCm: 0 })).rejects.toThrow(
        'heightCm must be positive',
      );
    });

    it('rejects when cellSizeCm is less than 1', async () => {
      await expect(
        service.create({ householdId: 1, widthCm: 1000, heightCm: 500, cellSizeCm: 0 }),
      ).rejects.toThrow('cellSizeCm must be at least 1');
    });

    it('rejects when total cell count exceeds 100,000', async () => {
      // 10000cm × 10000cm / 1cm cells = 100,000,000 cells
      await expect(
        service.create({ householdId: 1, widthCm: 10000, heightCm: 10000, cellSizeCm: 1 }),
      ).rejects.toThrow('cell count');
    });
  });

  describe('getByHouseholdId()', () => {
    it('returns the garden for a valid householdId', async () => {
      // Arrange
      await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.widthCm).toBe(1000);
    });

    it('returns null when no garden exists for householdId', async () => {
      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates garden name', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const updated = await service.update(created.id, { name: 'Bakgården' });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Bakgården');
      expect(updated?.widthCm).toBe(1000);
    });

    it('updates dimensions', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const updated = await service.update(created.id, { widthCm: 2000, heightCm: 1000 });

      // Assert
      expect(updated?.widthCm).toBe(2000);
      expect(updated?.heightCm).toBe(1000);
    });

    it('updates cellSizeCm', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const updated = await service.update(created.id, { cellSizeCm: 20 });

      // Assert
      expect(updated?.cellSizeCm).toBe(20);
    });

    it('rejects resize when new cell count exceeds 100K', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act & Assert
      await expect(
        service.update(created.id, { widthCm: 10000, heightCm: 10000, cellSizeCm: 1 }),
      ).rejects.toThrow('cell count');
    });

    it('returns null when updating a non-existent garden', async () => {
      // Act
      const result = await service.update(99999, { name: 'Nope' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateLayout()', () => {
    it('saves a valid layout', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Bädd A', areaM2: 4.0 })
        .run();

      const layout = {
        cells: { '5,3': 1 },
        colors: { '1': '#4ade80' },
      };

      // Act
      const result = await service.updateLayout(created.id, layout);

      // Assert
      expect(result).not.toBeNull();
      expect(JSON.parse(result!.layout)).toEqual(layout);
    });

    it('rejects layout with cell coordinates outside bounds', async () => {
      // Arrange — 1000cm / 10 = 100 cols, 500cm / 10 = 50 rows, valid range 0..99, 0..49
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      const layout = {
        cells: { '100,0': 1 }, // col 100 is out of bounds (max 99)
        colors: {},
      };

      // Act & Assert
      await expect(service.updateLayout(created.id, layout)).rejects.toThrow('out of bounds');
    });

    it('rejects layout referencing non-existent locationIds', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      const layout = {
        cells: { '5,3': 999 }, // locationId 999 doesn't exist
        colors: {},
      };

      // Act & Assert
      await expect(service.updateLayout(created.id, layout)).rejects.toThrow('location');
    });

    it('rejects layout exceeding 100K cell count', async () => {
      // Arrange — large garden that fits under the cell cap at creation
      const created = await service.create({
        householdId: 1,
        widthCm: 100000,
        heightCm: 100,
        cellSizeCm: 10,
      });

      // Build a layout with 100,001 cells (exceeds cap)
      const cells: Record<string, string> = {};
      for (let i = 0; i < 100_001; i++) {
        cells[`${i},0`] = 'path';
      }

      // Act & Assert
      await expect(service.updateLayout(created.id, { cells, colors: {} })).rejects.toThrow(
        'cell count',
      );
    });

    it('accepts layout with decorative string labels', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      const layout = {
        cells: { '0,0': 'path', '1,0': 'shed', '2,0': 'pond' },
        colors: {},
      };

      // Act
      const result = await service.updateLayout(created.id, layout);

      // Assert
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!.layout);
      expect(parsed.cells['0,0']).toBe('path');
      expect(parsed.cells['1,0']).toBe('shed');
      expect(parsed.cells['2,0']).toBe('pond');
    });

    it('accepts empty layout', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const result = await service.updateLayout(created.id, { cells: {}, colors: {} });

      // Assert
      expect(result).not.toBeNull();
      expect(JSON.parse(result!.layout)).toEqual({ cells: {}, colors: {} });
    });

    it('returns null for non-existent garden', async () => {
      // Act
      const result = await service.updateLayout(99999, { cells: {}, colors: {} });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing garden and returns true', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await service.getByHouseholdId(1)).toBeNull();
    });

    it('returns false for non-existent garden', async () => {
      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });

  describe('calculatePaintedArea()', () => {
    it('returns correct m2 for a locationId', () => {
      // Arrange — 25 cells at 10cm = 25 × 0.01 m² = 0.25 m²
      const layout = {
        cells: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`${i},0`, 1])),
        colors: { '1': '#4ade80' },
      };

      // Act
      const area = service.calculatePaintedArea(layout, 10, 1);

      // Assert
      expect(area).toBeCloseTo(0.25);
    });

    it('returns 0 when locationId has no painted cells', () => {
      // Arrange
      const layout = {
        cells: { '0,0': 2 },
        colors: {},
      };

      // Act
      const area = service.calculatePaintedArea(layout, 10, 1);

      // Assert
      expect(area).toBe(0);
    });

    it('ignores decorative cells', () => {
      // Arrange
      const layout = {
        cells: { '0,0': 1, '1,0': 'path', '2,0': 1 },
        colors: {},
      };

      // Act
      const area = service.calculatePaintedArea(layout, 10, 1);

      // Assert — 2 cells at 10cm = 0.02 m²
      expect(area).toBeCloseTo(0.02);
    });
  });

  describe('getCellCount()', () => {
    it('returns total number of cells in layout', () => {
      // Arrange
      const layout = {
        cells: { '0,0': 1, '1,0': 'path', '2,0': 2 },
        colors: {},
      };

      // Act & Assert
      expect(service.getCellCount(layout)).toBe(3);
    });

    it('returns 0 for empty layout', () => {
      // Act & Assert
      expect(service.getCellCount({ cells: {}, colors: {} })).toBe(0);
    });
  });
});
