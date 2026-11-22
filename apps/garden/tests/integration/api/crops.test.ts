// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import * as schema from '../../../src/server/db/schema';
import { CropService } from '../../../src/server/services/crop.service';
import { CROPS } from '../../../src/server/db/seed-data';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';

describe('Crops API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: CropService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.crop).values(CROPS).run();
    service = new CropService(db);
  });

  describe('seed data integrity', () => {
    it('seeds exactly 20 crops', async () => {
      // Act
      const crops = await service.getAllCrops();

      // Assert
      expect(crops).toHaveLength(CROPS.length);
    });

    it('seeds all expected categories', async () => {
      // Act
      const crops = await service.getAllCrops();
      const categories = [...new Set(crops.map((c) => c.category))].sort();

      // Assert
      expect(categories).toEqual(['fruit', 'grain', 'leafy', 'legume', 'root']);
    });

    it('seeds the correct number of root vegetables', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'root').length;

      // Act
      const roots = await service.getCropsByCategory('root');

      // Assert
      expect(roots).toHaveLength(expected);
    });

    it('seeds the correct number of leafy greens', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'leafy').length;

      // Act
      const leafy = await service.getCropsByCategory('leafy');

      // Assert
      expect(leafy).toHaveLength(expected);
    });

    it('seeds the correct number of legumes', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'legume').length;

      // Act
      const legumes = await service.getCropsByCategory('legume');

      // Assert
      expect(legumes).toHaveLength(expected);
    });

    it('seeds the correct number of fruits', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'fruit').length;

      // Act
      const fruits = await service.getCropsByCategory('fruit');

      // Assert
      expect(fruits).toHaveLength(expected);
    });

    it('seeds the correct number of grains', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'grain').length;

      // Act
      const grains = await service.getCropsByCategory('grain');

      // Assert
      expect(grains).toHaveLength(expected);
    });

    it('seeds crops with valid nutrition data', async () => {
      // Act
      const crops = await service.getAllCrops();

      // Assert
      crops.forEach((crop) => {
        expect(crop.yieldKgPerM2).toBeGreaterThan(0);
        expect(crop.kcalPerKg).toBeGreaterThan(0);
        expect(crop.proteinGPerKg).toBeGreaterThanOrEqual(0);
        expect(crop.carbsGPerKg).toBeGreaterThanOrEqual(0);
        expect(crop.fatGPerKg).toBeGreaterThanOrEqual(0);
      });
    });

    it('seeds crops with unique names', async () => {
      // Act
      const crops = await service.getAllCrops();
      const names = crops.map((c) => c.name);

      // Assert
      expect(new Set(names).size).toBe(names.length);
    });
  });

  describe('GET /api/crops — query all', () => {
    it('returns all seeded crops via getAllCrops', async () => {
      // Act
      const crops = await service.getAllCrops();

      // Assert
      expect(crops).toHaveLength(CROPS.length);
      expect(crops[0]).toHaveProperty('id');
      expect(crops[0]).toHaveProperty('name');
      expect(crops[0]).toHaveProperty('yieldKgPerM2');
      expect(crops[0]).toHaveProperty('kcalPerKg');
      expect(crops[0]).toHaveProperty('proteinGPerKg');
      expect(crops[0]).toHaveProperty('carbsGPerKg');
      expect(crops[0]).toHaveProperty('fatGPerKg');
      expect(crops[0]).toHaveProperty('category');
    });

    it('returns crops with correct Potatis data', async () => {
      // Arrange
      const seedPotato = CROPS.find((c) => c.name === 'Potatis')!;

      // Act
      const crops = await service.getAllCrops();
      const potato = crops.find((c) => c.name === 'Potatis');

      // Assert
      expect(potato).toBeDefined();
      expect(potato!.yieldKgPerM2).toBe(seedPotato.yieldKgPerM2);
      expect(potato!.kcalPerKg).toBe(seedPotato.kcalPerKg);
      expect(potato!.proteinGPerKg).toBe(seedPotato.proteinGPerKg);
      expect(potato!.carbsGPerKg).toBe(seedPotato.carbsGPerKg);
      expect(potato!.fatGPerKg).toBe(seedPotato.fatGPerKg);
      expect(potato!.category).toBe('root');
    });
  });

  describe('GET /api/crops?category= — filter by category', () => {
    it('returns only root vegetables when filtering by root', async () => {
      // Arrange
      const expected = CROPS.filter((c) => c.category === 'root').length;

      // Act
      const roots = await service.getCropsByCategory('root');

      // Assert
      expect(roots).toHaveLength(expected);
      roots.forEach((c) => expect(c.category).toBe('root'));
    });

    it('returns only grains when filtering by grain', async () => {
      // Arrange
      const expectedNames = CROPS.filter((c) => c.category === 'grain')
        .map((c) => c.name)
        .sort();

      // Act
      const grains = await service.getCropsByCategory('grain');

      // Assert
      expect(grains).toHaveLength(expectedNames.length);
      const names = grains.map((c) => c.name).sort();
      expect(names).toEqual(expectedNames);
    });

    it('returns empty array for unknown category', async () => {
      // Act
      const result = await service.getCropsByCategory('berry');

      // Assert
      expect(result).toEqual([]);
    });
  });

  describe('GET /api/crops/:id — fetch by id', () => {
    it('returns a crop by its id', async () => {
      // Arrange
      const all = await service.getAllCrops();
      const target = all.find((c) => c.name === 'Tomat')!;

      // Act
      const crop = await service.getCropById(target.id);

      // Assert
      expect(crop).not.toBeNull();
      expect(crop!.name).toBe('Tomat');
      expect(crop!.kcalPerKg).toBe(180);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const crop = await service.getCropById(99999);

      // Assert
      expect(crop).toBeNull();
    });
  });
});
