// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { LocationService } from '../../../src/server/services/location.service';
import { PlantingService } from '../../../src/server/services/planting.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Locations API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: LocationService;
  let plantingService: PlantingService;

  beforeEach(() => {
    db = createTestDb();
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
    service = new LocationService(db);
    plantingService = new PlantingService(db);
  });

  describe('POST /api/location — create', () => {
    it('creates a location with name and area', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        name: 'Köksträdgård',
        areaM2: 12.5,
      });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Köksträdgård');
      expect(result.areaM2).toBe(12.5);
      expect(result.householdId).toBe(1);
    });

    it('creates a location with optional description', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        name: 'Växthus',
        areaM2: 6.0,
        description: 'Uppvärmt växthus',
      });

      // Assert
      expect(result.description).toBe('Uppvärmt växthus');
    });

    it('creates an indoor location when isIndoor is true', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        name: 'Fönsterbräda',
        areaM2: 0.5,
        isIndoor: true,
      });

      // Assert
      expect(result.isIndoor).toBe(true);
    });

    it('defaults isIndoor to false when not provided', async () => {
      // Act
      const result = await service.create({
        householdId: 1,
        name: 'Utomhusbädd',
        areaM2: 4.0,
      });

      // Assert
      expect(result.isIndoor).toBe(false);
    });

    it('creates multiple locations with unique ids', async () => {
      // Act
      const first = await service.create({ householdId: 1, name: 'Bädd 1', areaM2: 4.0 });
      const second = await service.create({ householdId: 1, name: 'Bädd 2', areaM2: 3.0 });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('GET /api/location — list all', () => {
    it('returns all locations', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Bädd 1', areaM2: 4.0 });
      await service.create({ householdId: 1, name: 'Bädd 2', areaM2: 3.0 });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns empty array when no locations exist', async () => {
      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toEqual([]);
    });
  });

  describe('GET /api/location/:id — get by id', () => {
    it('returns the location with matching id', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Växthus', areaM2: 6.0 });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found!.name).toBe('Växthus');
    });

    it('returns null for non-existent id', async () => {
      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('PUT /api/location/:id — update', () => {
    it('updates the name', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Old Name', areaM2: 4.0 });

      // Act
      const updated = await service.update(created.id, { name: 'New Name' });

      // Assert
      expect(updated!.name).toBe('New Name');
      expect(updated!.areaM2).toBe(4.0);
    });

    it('updates the area', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Bädd', areaM2: 4.0 });

      // Act
      const updated = await service.update(created.id, { areaM2: 8.0 });

      // Assert
      expect(updated!.areaM2).toBe(8.0);
    });

    it('adds a description', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Bädd', areaM2: 4.0 });

      // Act
      const updated = await service.update(created.id, { description: 'Solig plats' });

      // Assert
      expect(updated!.description).toBe('Solig plats');
    });

    it('updates isIndoor to true', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Bädd', areaM2: 4.0 });

      // Act
      const updated = await service.update(created.id, { isIndoor: true });

      // Assert
      expect(updated!.isIndoor).toBe(true);
    });

    it('returns null for non-existent id', async () => {
      // Act
      const result = await service.update(99999, { name: 'Nope' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('DELETE /api/location/:id — delete', () => {
    it('deletes an existing location', async () => {
      // Arrange
      const created = await service.create({ householdId: 1, name: 'Temp', areaM2: 2.0 });

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

  describe('POST /api/location/:id/move-plantings — move plantings and delete', () => {
    it('moves 2 plantings to target location and deletes source', async () => {
      // Arrange
      const source = await service.create({ householdId: 1, name: 'Source Bed', areaM2: 4.0 });
      const target = await service.create({ householdId: 1, name: 'Target Bed', areaM2: 8.0 });

      await plantingService.create({
        cropId: 1,
        locationId: source.id,
        plantedDate: '2026-04-01',
        areaM2: 1.5,
        status: 'planted',
      });
      await plantingService.create({
        cropId: 1,
        locationId: source.id,
        plantedDate: '2026-05-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.movePlantingsAndDelete(source.id, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(2);
      expect(result.deleted).toBe(true);
      expect(await service.getById(source.id)).toBeNull();
      const targetPlantings = await plantingService.getByLocationId(target.id);
      expect(targetPlantings).toHaveLength(2);
    });

    it('deletes a location with 0 plantings and returns moved: 0', async () => {
      // Arrange
      const source = await service.create({ householdId: 1, name: 'Empty Bed', areaM2: 2.0 });
      const target = await service.create({ householdId: 1, name: 'Target', areaM2: 4.0 });

      // Act
      const result = await service.movePlantingsAndDelete(source.id, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(0);
      expect(result.deleted).toBe(true);
      expect(await service.getById(source.id)).toBeNull();
    });

    it('returns deleted: false when source location does not exist', async () => {
      // Arrange
      const target = await service.create({ householdId: 1, name: 'Target', areaM2: 4.0 });

      // Act
      const result = await service.movePlantingsAndDelete(99999, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(0);
      expect(result.deleted).toBe(false);
    });

    it('throws when target location id is same as source', async () => {
      // Arrange
      const location = await service.create({ householdId: 1, name: 'Bed', areaM2: 4.0 });

      // Act & Assert
      await expect(
        service.movePlantingsAndDelete(location.id, location.id, plantingService),
      ).rejects.toThrow('Target location must be different from source');
    });

    it('throws when target location does not exist', async () => {
      // Arrange
      const source = await service.create({ householdId: 1, name: 'Source', areaM2: 4.0 });

      // Act & Assert
      await expect(
        service.movePlantingsAndDelete(source.id, 99999, plantingService),
      ).rejects.toThrow('Target location not found');
    });
  });
});
