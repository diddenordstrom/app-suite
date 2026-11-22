import { describe, it, expect, beforeEach } from 'vitest';
import { SeedVarietyService } from './seed-variety.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('SeedVarietyService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SeedVarietyService;

  beforeEach(() => {
    db = createTestDb();
    service = new SeedVarietyService(db);

    db.insert(schema.crop)
      .values({
        name: 'Tomato',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
      })
      .run();

    db.insert(schema.crop)
      .values({
        name: 'Cucumber',
        yieldKgPerM2: 12.0,
        kcalPerKg: 160,
        proteinGPerKg: 7,
        carbsGPerKg: 30,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();
  });

  describe('create()', () => {
    it('creates a seed variety and returns it with an id', async () => {
      // Arrange
      const data: schema.NewSeedVariety = { cropId: 1, name: 'Tiny Tim' };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.cropId).toBe(1);
      expect(result.name).toBe('Tiny Tim');
      expect(result.varietyType).toBeNull();
    });

    it('creates a seed variety with an optional variety type', async () => {
      // Arrange
      const data: schema.NewSeedVariety = { cropId: 1, name: 'Tiny Tim', varietyType: 'Cherry' };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.varietyType).toBe('Cherry');
    });

    it('creates multiple varieties for the same crop', async () => {
      // Arrange & Act
      const first = await service.create({ cropId: 1, name: 'Tiny Tim', varietyType: 'Cherry' });
      const second = await service.create({
        cropId: 1,
        name: 'Bulgaarse Reuzen',
        varietyType: 'Beef',
      });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getById()', () => {
    it('returns the variety for a valid id', async () => {
      // Arrange
      const created = await service.create({ cropId: 1, name: 'Money Maker' });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Money Maker');
    });

    it('returns null for an unknown id', async () => {
      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('getByCropId()', () => {
    it('returns all varieties for the given crop', async () => {
      // Arrange
      await service.create({ cropId: 1, name: 'Tiny Tim', varietyType: 'Cherry' });
      await service.create({ cropId: 1, name: 'Money Maker' });
      await service.create({ cropId: 2, name: 'Beth Alpha', varietyType: 'Short' });

      // Act
      const result = await service.getByCropId(1);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((v) => v.cropId === 1)).toBe(true);
    });

    it('returns an empty array when no varieties exist for the crop', async () => {
      // Act
      const result = await service.getByCropId(1);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('getAll()', () => {
    it('returns all varieties', async () => {
      // Arrange
      await service.create({ cropId: 1, name: 'Tiny Tim' });
      await service.create({ cropId: 2, name: 'Beth Alpha' });

      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(2);
    });

    it('returns an empty array when none exist', async () => {
      // Act
      const all = await service.getAll();

      // Assert
      expect(all).toHaveLength(0);
    });
  });

  describe('update()', () => {
    it('updates the name', async () => {
      // Arrange
      const created = await service.create({ cropId: 1, name: 'Tyny Tim' });

      // Act
      const updated = await service.update(created.id, { name: 'Tiny Tim' });

      // Assert
      expect(updated?.name).toBe('Tiny Tim');
    });

    it('updates the variety type', async () => {
      // Arrange
      const created = await service.create({ cropId: 1, name: 'Tiny Tim' });

      // Act
      const updated = await service.update(created.id, { varietyType: 'Cherry' });

      // Assert
      expect(updated?.varietyType).toBe('Cherry');
      expect(updated?.name).toBe('Tiny Tim');
    });

    it('returns null when updating a non-existent variety', async () => {
      // Act
      const updated = await service.update(99999, { name: 'Ghost' });

      // Assert
      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing variety and returns true', async () => {
      // Arrange
      const created = await service.create({ cropId: 1, name: 'Tiny Tim' });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await service.getById(created.id)).toBeNull();
    });

    it('returns false when deleting a non-existent variety', async () => {
      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
