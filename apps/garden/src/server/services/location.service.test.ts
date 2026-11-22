import { describe, it, expect, beforeEach } from 'vitest';
import { LocationService } from './location.service';
import { PlantingService } from './planting.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

const testLocation: schema.NewGrowingLocation = {
  householdId: 1,
  name: 'Köksträdgård',
  areaM2: 12.5,
  description: 'Södervända bäddar längs staketet',
};

describe('LocationService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: LocationService;

  beforeEach(() => {
    db = createTestDb();
    service = new LocationService(db);

    // Insert a household so the foreign key constraint is satisfied
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();
  });

  describe('create()', () => {
    it('creates a location and returns it with an id', async () => {
      // Arrange — testLocation references householdId: 1 seeded in beforeEach

      // Act
      const result = await service.create(testLocation);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Köksträdgård');
      expect(result.areaM2).toBe(12.5);
      expect(result.description).toBe('Södervända bäddar längs staketet');
      expect(result.householdId).toBe(1);
    });

    it('creates a location without a description', async () => {
      // Arrange
      const noDesc: schema.NewGrowingLocation = {
        householdId: 1,
        name: 'Växthus',
        areaM2: 6.0,
      };

      // Act
      const result = await service.create(noDesc);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.description).toBeNull();
    });

    it('creates a location with isIndoor: true', async () => {
      // Arrange
      const indoorLocation: schema.NewGrowingLocation = {
        householdId: 1,
        name: 'Växthus',
        areaM2: 6.0,
        isIndoor: true,
      };

      // Act
      const result = await service.create(indoorLocation);

      // Assert
      expect(result.isIndoor).toBe(true);
    });

    it('creates a location with isIndoor: false by default', async () => {
      // Arrange — testLocation has no isIndoor field set

      // Act
      const result = await service.create(testLocation);

      // Assert
      expect(result.isIndoor).toBe(false);
    });

    it('creates multiple locations with unique ids', async () => {
      // Arrange — nothing extra

      // Act
      const first = await service.create(testLocation);
      const second = await service.create({ householdId: 1, name: 'Drivbänk', areaM2: 2.0 });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getById()', () => {
    it('returns the location for a valid id', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Köksträdgård');
    });

    it('returns null for an unknown id', async () => {
      // Arrange — empty db

      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('getAll()', () => {
    it('returns all locations', async () => {
      // Arrange
      await service.create(testLocation);
      await service.create({ householdId: 1, name: 'Drivbänk', areaM2: 2.0 });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns an empty array when none exist', async () => {
      // Arrange — empty db

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(0);
    });
  });

  describe('getByHouseholdId()', () => {
    it("returns only the given household's locations", async () => {
      // Arrange
      db.insert(schema.household).values({ name: 'Grannarna', persons: 2 }).run();
      await service.create(testLocation);
      await service.create({ householdId: 2, name: 'Grannens bädd', areaM2: 3 });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result.map((l) => l.name)).toEqual(['Köksträdgård']);
    });
  });

  describe('update()', () => {
    it('updates the location name', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const updated = await service.update(created.id, { name: 'Nytt namn' });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Nytt namn');
      expect(updated?.areaM2).toBe(12.5);
    });

    it('updates the area', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const updated = await service.update(created.id, { areaM2: 20.0 });

      // Assert
      expect(updated?.areaM2).toBe(20.0);
      expect(updated?.name).toBe('Köksträdgård');
    });

    it('updates the description', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const updated = await service.update(created.id, { description: 'Ny beskrivning' });

      // Assert
      expect(updated?.description).toBe('Ny beskrivning');
    });

    it('updates isIndoor to true', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const updated = await service.update(created.id, { isIndoor: true });

      // Assert
      expect(updated?.isIndoor).toBe(true);
      expect(updated?.name).toBe('Köksträdgård');
    });

    it('returns null when updating a non-existent location', async () => {
      // Arrange — empty db

      // Act
      const updated = await service.update(99999, { name: 'Nope' });

      // Assert
      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing location and returns true', async () => {
      // Arrange
      const created = await service.create(testLocation);

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('returns false when deleting a non-existent location', async () => {
      // Arrange — empty db

      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });

  describe('movePlantingsAndDelete()', () => {
    let plantingService: PlantingService;

    beforeEach(() => {
      plantingService = new PlantingService(db);

      // Seed a crop so planting FK is satisfied
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
    });

    it('moves all plantings to the target location and deletes the source', async () => {
      // Arrange
      const source = await service.create({ householdId: 1, name: 'Source', areaM2: 4.0 });
      const target = await service.create({ householdId: 1, name: 'Target', areaM2: 6.0 });

      await plantingService.create({
        cropId: 1,
        locationId: source.id,
        plantedDate: '2026-04-01',
        areaM2: 1.0,
        status: 'planted',
      });
      await plantingService.create({
        cropId: 1,
        locationId: source.id,
        plantedDate: '2026-04-15',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.movePlantingsAndDelete(source.id, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(2);
      expect(result.deleted).toBe(true);
      expect(await service.getById(source.id)).toBeNull();
      const movedPlantings = await plantingService.getByLocationId(target.id);
      expect(movedPlantings).toHaveLength(2);
      expect(movedPlantings.every((p) => p.locationId === target.id)).toBe(true);
    });

    it('deletes a location with zero plantings and returns moved: 0', async () => {
      // Arrange
      const source = await service.create({ householdId: 1, name: 'Empty Source', areaM2: 4.0 });
      const target = await service.create({ householdId: 1, name: 'Target', areaM2: 6.0 });

      // Act
      const result = await service.movePlantingsAndDelete(source.id, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(0);
      expect(result.deleted).toBe(true);
      expect(await service.getById(source.id)).toBeNull();
    });

    it('returns deleted: false when source location does not exist', async () => {
      // Arrange
      const target = await service.create({ householdId: 1, name: 'Target', areaM2: 6.0 });

      // Act
      const result = await service.movePlantingsAndDelete(99999, target.id, plantingService);

      // Assert
      expect(result.moved).toBe(0);
      expect(result.deleted).toBe(false);
    });
  });
});
