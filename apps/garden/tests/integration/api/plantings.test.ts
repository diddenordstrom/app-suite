// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { PlantingService } from '../../../src/server/services/planting.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Plantings API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: PlantingService;

  beforeEach(() => {
    db = createTestDb();
    // Seed prerequisites
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'fruit',
      })
      .run();
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.5,
        kcalPerKg: 770,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'root',
      })
      .run();
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Växthus', areaM2: 6.0 })
      .run();
    service = new PlantingService(db);
  });

  // -------------------------------------------------------------------------
  // Existing area-mode tests (must still pass after the feature is built)
  // -------------------------------------------------------------------------

  describe('POST /api/planting — create (area mode)', () => {
    it('creates a planting with all required fields', async () => {
      // Act
      const result = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.5,
        status: 'planted',
      });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.cropId).toBe(1);
      expect(result.locationId).toBe(1);
      expect(result.plantedDate).toBe('2026-04-01');
      expect(result.areaM2).toBe(2.5);
      expect(result.status).toBe('planted');
    });

    it('creates a planting with optional expected harvest date', async () => {
      // Act
      const result = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-15',
        areaM2: 3.0,
        status: 'planted',
      });

      // Assert
      expect(result.expectedHarvestDate).toBe('2026-07-15');
    });

    it('supports different crops and locations', async () => {
      // Act
      const tomato = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });
      const potato = await service.create({
        cropId: 2,
        locationId: 2,
        plantedDate: '2026-04-15',
        areaM2: 5.0,
        status: 'planted',
      });

      // Assert
      expect(tomato.cropId).toBe(1);
      expect(potato.cropId).toBe(2);
      expect(potato.locationId).toBe(2);
    });
  });

  // -------------------------------------------------------------------------
  // New: count-mode planting creation
  // -------------------------------------------------------------------------

  describe('POST /api/planting — create (count mode)', () => {
    it('creates a count-mode planting and returns new fields', async () => {
      // Arrange
      const input = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count' as const,
        quantity: 6,
        status: 'planted' as const,
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.plantingMode).toBe('count');
      expect(result.quantity).toBe(6);
    });

    it('creates a count-mode planting with a yield override', async () => {
      // Arrange
      const input = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count' as const,
        quantity: 4,
        yieldKgPerPlantOverride: 4.5,
        status: 'planted' as const,
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.plantingMode).toBe('count');
      expect(result.quantity).toBe(4);
      expect(result.yieldKgPerPlantOverride).toBe(4.5);
    });

    it('rejects count-mode planting when quantity is missing', async () => {
      // Arrange — service must throw when plantingMode is 'count' but no quantity given
      const input = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count' as const,
        // quantity intentionally omitted
        status: 'planted' as const,
      };

      // Act + Assert
      await expect(service.create(input)).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // GET — new fields appear in list results
  // -------------------------------------------------------------------------

  describe('GET /api/planting — list all', () => {
    it('returns all plantings', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });
      await service.create({
        cropId: 2,
        locationId: 2,
        plantedDate: '2026-04-15',
        areaM2: 5.0,
        status: 'growing',
      });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns empty array when no plantings exist', async () => {
      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toEqual([]);
    });

    it('returns plantingMode, quantity, and yieldKgPerPlantOverride on each item', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count',
        quantity: 3,
        yieldKgPerPlantOverride: 2.5,
        status: 'planted',
      });

      // Act
      const all = await service.getAll();
      const item = all[0]!;

      // Assert
      expect(item).toHaveProperty('plantingMode', 'count');
      expect(item).toHaveProperty('quantity', 3);
      expect(item).toHaveProperty('yieldKgPerPlantOverride', 2.5);
    });

    it('returns plantingMode as "area" and null quantity for area-mode plantings', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const all = await service.getAll();
      const item = all[0]!;

      // Assert
      expect(item).toHaveProperty('plantingMode', 'area');
      expect(item.quantity).toBeNull();
      expect(item.yieldKgPerPlantOverride).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // GET by id
  // -------------------------------------------------------------------------

  describe('GET /api/planting/:id — get by id', () => {
    it('returns the planting with matching id', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found!.id).toBe(created.id);
    });

    it('returns null for non-existent id', async () => {
      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // PUT — update count-mode fields
  // -------------------------------------------------------------------------

  describe('PUT /api/planting/:id — update', () => {
    it('transitions status through the full lifecycle', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act — planted → growing
      const growing = await service.update(created.id, { status: 'growing' });
      expect(growing!.status).toBe('growing');

      // Act — growing → harvested
      const harvested = await service.update(created.id, { status: 'harvested' });
      expect(harvested!.status).toBe('harvested');
    });

    it('updates multiple fields at once', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, {
        areaM2: 4.0,
        expectedHarvestDate: '2026-08-01',
        status: 'growing',
      });

      // Assert
      expect(updated!.areaM2).toBe(4.0);
      expect(updated!.expectedHarvestDate).toBe('2026-08-01');
      expect(updated!.status).toBe('growing');
    });

    it('can update quantity on a count-mode planting', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count',
        quantity: 3,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, { quantity: 10 });

      // Assert
      expect(updated!.quantity).toBe(10);
    });

    it('can update yieldKgPerPlantOverride on a count-mode planting', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 0,
        plantingMode: 'count',
        quantity: 3,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, { yieldKgPerPlantOverride: 7.2 });

      // Assert
      expect(updated!.yieldKgPerPlantOverride).toBe(7.2);
    });

    it('returns null for non-existent id', async () => {
      // Act
      const result = await service.update(99999, { status: 'growing' });

      // Assert
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // DELETE
  // -------------------------------------------------------------------------

  describe('DELETE /api/planting/:id — delete', () => {
    it('deletes an existing planting', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await service.getById(created.id)).toBeNull();
    });

    it('returns false for non-existent id', async () => {
      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
