import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('StorageService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: StorageService;

  beforeEach(() => {
    db = createTestDb();
    service = new StorageService(db);

    // Seed a household so storage_item.household_id FK is satisfied
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed a crop so storage_item.crop_id FK is satisfied
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

    // Seed a planting so storage_item.planting_id FK is satisfied
    db.insert(schema.planting)
      .values({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      })
      .run();
  });

  describe('create()', () => {
    it('creates a storage item and returns it with an id', async () => {
      // Arrange
      const data: schema.NewStorageItem = {
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.cropId).toBe(1);
      expect(result.householdId).toBe(1);
      expect(result.quantityKg).toBe(5.0);
      expect(result.harvestedDate).toBe('2026-08-15');
      expect(result.plantingId).toBeNull();
    });

    it('creates a storage item linked to a planting', async () => {
      // Arrange
      const data: schema.NewStorageItem = {
        cropId: 1,
        plantingId: 1,
        householdId: 1,
        quantityKg: 3.5,
        harvestedDate: '2026-08-20',
      };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.plantingId).toBe(1);
      expect(result.quantityKg).toBe(3.5);
    });

    it('creates multiple storage items with unique ids', async () => {
      // Arrange
      const data: schema.NewStorageItem = {
        cropId: 1,
        householdId: 1,
        quantityKg: 2.0,
        harvestedDate: '2026-08-15',
      };

      // Act
      const first = await service.create(data);
      const second = await service.create({ ...data, quantityKg: 4.0 });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getById()', () => {
    it('returns the storage item for a valid id', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.quantityKg).toBe(5.0);
      expect(found?.harvestedDate).toBe('2026-08-15');
    });

    it('returns null for an unknown id', async () => {
      // Arrange — empty storage

      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('getAll()', () => {
    it('returns all storage items', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });
      await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 3.0,
        harvestedDate: '2026-09-01',
      });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns an empty array when none exist', async () => {
      // Arrange — no storage items seeded

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(0);
    });
  });

  describe('getByHouseholdId()', () => {
    it('returns storage items for the given household', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.householdId).toBe(1);
    });

    it('returns an empty array when no items exist for the household', async () => {
      // Arrange — no items seeded

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('returns only items belonging to the requested household', async () => {
      // Arrange — add a second household
      db.insert(schema.household).values({ name: 'Familjen Johansson', persons: 2 }).run();

      await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });
      await service.create({
        cropId: 1,
        householdId: 2,
        quantityKg: 2.0,
        harvestedDate: '2026-08-20',
      });

      // Act
      const result = await service.getByHouseholdId(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.householdId).toBe(1);
    });
  });

  describe('update()', () => {
    it('updates the quantity of an existing storage item', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });

      // Act
      const updated = await service.update(created.id, { quantityKg: 3.0 });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.quantityKg).toBe(3.0);
      expect(updated?.harvestedDate).toBe('2026-08-15');
    });

    it('updates the harvested date (partial update)', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });

      // Act
      const updated = await service.update(created.id, { harvestedDate: '2026-08-20' });

      // Assert
      expect(updated?.harvestedDate).toBe('2026-08-20');
      expect(updated?.quantityKg).toBe(5.0);
    });

    it('returns null when updating a non-existent storage item', async () => {
      // Arrange — empty storage

      // Act
      const updated = await service.update(99999, { quantityKg: 1.0 });

      // Assert
      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing storage item and returns true', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        householdId: 1,
        quantityKg: 5.0,
        harvestedDate: '2026-08-15',
      });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('returns false when deleting a non-existent storage item', async () => {
      // Arrange — empty storage

      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
