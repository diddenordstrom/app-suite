import { describe, it, expect, beforeEach } from 'vitest';
import { PlantingService } from './planting.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('PlantingService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: PlantingService;

  beforeEach(() => {
    db = createTestDb();
    service = new PlantingService(db);

    // Seed a household so growing_location FK is satisfied
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed a crop so planting.crop_id FK is satisfied
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
      })
      .run();

    // Seed a growing location so planting.location_id FK is satisfied
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
  });

  describe('create()', () => {
    it('creates a planting and returns it with an id', async () => {
      // Arrange
      const data: schema.NewPlanting = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.cropId).toBe(1);
      expect(result.locationId).toBe(1);
      expect(result.plantedDate).toBe('2026-04-01');
      expect(result.areaM2).toBe(2.0);
      expect(result.status).toBe('planted');
      expect(result.expectedHarvestDate).toBeNull();
    });

    it('creates a planting with an expected harvest date', async () => {
      // Arrange
      const data: schema.NewPlanting = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-01',
        areaM2: 3.0,
        status: 'planted',
      };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.expectedHarvestDate).toBe('2026-07-01');
    });

    it('creates multiple plantings with unique ids', async () => {
      // Arrange
      const data: schema.NewPlanting = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      };

      // Act
      const first = await service.create(data);
      const second = await service.create({ ...data, plantedDate: '2026-05-01' });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getById()', () => {
    it('returns the planting for a valid id', async () => {
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
      expect(found?.plantedDate).toBe('2026-04-01');
      expect(found?.cropId).toBe(1);
    });

    it('returns null for an unknown id', async () => {
      // Arrange — empty db (no plantings)

      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('getAll()', () => {
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
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-05-01',
        areaM2: 1.5,
        status: 'planted',
      });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns an empty array when none exist', async () => {
      // Arrange — no plantings seeded

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(0);
    });
  });

  describe('getByHouseholdId()', () => {
    it("returns only plantings in the given household's locations", async () => {
      // Arrange
      db.insert(schema.household).values({ name: 'Grannarna', persons: 2 }).run();
      db.insert(schema.growingLocation)
        .values({ householdId: 2, name: 'Grannens bädd', areaM2: 3 })
        .run();
      const base = { cropId: 1, plantedDate: '2026-05-01', areaM2: 1, status: 'planted' };
      const ours = await service.create({ ...base, locationId: 1 });
      await service.create({ ...base, locationId: 2 });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result.map((p) => p.id)).toEqual([ours.id]);
    });
  });

  describe('getByLocationId()', () => {
    it('returns plantings for the given location', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const result = await service.getByLocationId(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.locationId).toBe(1);
    });

    it('returns an empty array when no plantings exist for the location', async () => {
      // Arrange — no plantings for location 1

      // Act
      const result = await service.getByLocationId(1);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('returns only plantings for the requested location', async () => {
      // Arrange — add a second location
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Växthus', areaM2: 6.0 })
        .run();

      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });
      await service.create({
        cropId: 1,
        locationId: 2,
        plantedDate: '2026-04-15',
        areaM2: 1.0,
        status: 'planted',
      });

      // Act
      const result = await service.getByLocationId(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.locationId).toBe(1);
    });
  });

  describe('update()', () => {
    it('updates the status from planted to growing', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, { status: 'growing' });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('growing');
      expect(updated?.areaM2).toBe(2.0);
    });

    it('updates the status from growing to harvested', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const updated = await service.update(created.id, { status: 'harvested' });

      // Assert
      expect(updated?.status).toBe('harvested');
    });

    it('updates only the area (partial update)', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, { areaM2: 5.0 });

      // Assert
      expect(updated?.areaM2).toBe(5.0);
      expect(updated?.status).toBe('planted');
      expect(updated?.plantedDate).toBe('2026-04-01');
    });

    it('updates the expected harvest date', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const updated = await service.update(created.id, { expectedHarvestDate: '2026-08-01' });

      // Assert
      expect(updated?.expectedHarvestDate).toBe('2026-08-01');
    });

    it('returns null when updating a non-existent planting', async () => {
      // Arrange — empty db

      // Act
      const updated = await service.update(99999, { status: 'growing' });

      // Assert
      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing planting and returns true', async () => {
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
      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('returns false when deleting a non-existent planting', async () => {
      // Arrange — empty db

      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
