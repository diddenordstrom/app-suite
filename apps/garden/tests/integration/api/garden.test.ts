// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { GardenService } from '../../../src/server/services/garden.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Garden API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: GardenService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    service = new GardenService(db);
  });

  describe('POST /api/garden — create', () => {
    it('creates a garden with dimensions', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        name: 'Min trädgård',
        widthCm: 2000,
        heightCm: 1500,
      });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Min trädgård');
      expect(result.widthCm).toBe(2000);
      expect(result.heightCm).toBe(1500);
      expect(result.cellSizeCm).toBe(10);
    });

    it('creates a garden with custom cell size', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        widthCm: 500,
        heightCm: 500,
        cellSizeCm: 5,
      });

      // Assert
      expect(result.cellSizeCm).toBe(5);
    });

    it('rejects duplicate garden per household', async () => {
      // Arrange
      await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act & Assert
      await expect(
        service.create({ householdId: 1, widthCm: 2000, heightCm: 1000 }),
      ).rejects.toThrow();
    });

    it('rejects invalid dimensions', async () => {
      await expect(service.create({ householdId: 1, widthCm: -1, heightCm: 500 })).rejects.toThrow(
        'widthCm must be positive',
      );
    });
  });

  describe('GET /api/garden — get by household', () => {
    it('returns the garden for a valid household', async () => {
      // Arrange
      await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.widthCm).toBe(1000);
    });

    it('returns null when no garden exists', async () => {
      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('PATCH /api/garden/:id — update', () => {
    it('updates garden dimensions', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act
      const updated = await service.update(created.id, { widthCm: 1500 });

      // Assert
      expect(updated!.widthCm).toBe(1500);
      expect(updated!.heightCm).toBe(500);
    });

    it('returns null for non-existent garden', async () => {
      // Act
      const result = await service.update(99999, { name: 'Nope' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('PUT /api/garden/:id/layout — update layout', () => {
    it('saves a valid layout with beds and decorative cells', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Bädd 1', areaM2: 4.0 })
        .run();

      const layout = {
        cells: { '5,3': 1, '10,10': 'path' },
        colors: { '1': '#4ade80' },
      };

      // Act
      const result = await service.updateLayout(created.id, layout);

      // Assert
      expect(result).not.toBeNull();
      const parsed = JSON.parse(result!.layout);
      expect(parsed.cells['5,3']).toBe(1);
      expect(parsed.cells['10,10']).toBe('path');
    });

    it('rejects out-of-bounds cells', async () => {
      // Arrange — 1000/10=100 cols, 500/10=50 rows
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act & Assert
      await expect(
        service.updateLayout(created.id, { cells: { '0,50': 'path' }, colors: {} }),
      ).rejects.toThrow('out of bounds');
    });

    it('rejects invalid location references', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, widthCm: 1000, heightCm: 500 });

      // Act & Assert
      await expect(
        service.updateLayout(created.id, { cells: { '0,0': 999 }, colors: {} }),
      ).rejects.toThrow('location');
    });
  });

  describe('DELETE /api/garden/:id — delete', () => {
    it('deletes an existing garden', async () => {
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
});
