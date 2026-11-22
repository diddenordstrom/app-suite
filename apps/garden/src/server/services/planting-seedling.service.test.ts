import { describe, it, expect, beforeEach } from 'vitest';
import { PlantingService } from './planting.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('PlantingService — seedling status', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: PlantingService;

  beforeEach(() => {
    db = createTestDb();
    service = new PlantingService(db);

    db.insert(schema.household).values({ name: 'Familjen Lindgren', persons: 3 }).run();

    db.insert(schema.crop)
      .values({
        name: 'Paprika',
        yieldKgPerM2: 4.0,
        kcalPerKg: 310,
        proteinGPerKg: 10,
        carbsGPerKg: 60,
        fatGPerKg: 3,
        category: 'vegetable',
        weeksToTransplant: 10,
      })
      .run();

    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Fönsterbräda', areaM2: 0.5, isIndoor: true })
      .run();
  });

  describe('create() with seedling status', () => {
    it('saves a planting with status seedling and retrieves it correctly', async () => {
      // Arrange
      const data: schema.NewPlanting = {
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-02-15',
        areaM2: 0.5,
        status: 'seedling',
      };

      // Act
      const created = await service.create(data);
      const found = await service.getById(created.id);

      // Assert
      expect(created.status).toBe('seedling');
      expect(found).not.toBeNull();
      expect(found?.status).toBe('seedling');
      expect(found?.plantedDate).toBe('2026-02-15');
    });
  });

  describe('update() seedling → planted transition (plant-out)', () => {
    it('updates a planting from seedling to planted', async () => {
      // Arrange
      const created = await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-02-15',
        areaM2: 0.5,
        status: 'seedling',
      });

      // Act
      const updated = await service.update(created.id, {
        status: 'planted',
        plantedDate: '2026-05-20',
      });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated?.status).toBe('planted');
      expect(updated?.plantedDate).toBe('2026-05-20');
    });
  });

  describe('getByHouseholdAndStatus()', () => {
    it('returns seedling plantings for a household', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-02-15',
        areaM2: 0.5,
        status: 'seedling',
      });

      // Act
      const result = await service.getByHouseholdAndStatus(1, 'seedling');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('seedling');
    });

    it('returns planted plantings for a household', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-05-20',
        areaM2: 0.5,
        status: 'planted',
      });
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-02-15',
        areaM2: 0.5,
        status: 'seedling',
      });

      // Act
      const result = await service.getByHouseholdAndStatus(1, 'planted');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.status).toBe('planted');
    });

    it('returns an empty array when no plantings match the status', async () => {
      // Arrange
      await service.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-05-20',
        areaM2: 0.5,
        status: 'planted',
      });

      // Act
      const result = await service.getByHouseholdAndStatus(1, 'seedling');

      // Assert
      expect(result).toHaveLength(0);
    });

    it('does NOT return plantings from a different household', async () => {
      // Arrange — second household with its own location and planting
      db.insert(schema.household).values({ name: 'Familjen Strand', persons: 2 }).run();
      db.insert(schema.growingLocation)
        .values({ householdId: 2, name: 'Balkong', areaM2: 1.0 })
        .run();

      await service.create({
        cropId: 1,
        locationId: 2,
        plantedDate: '2026-02-15',
        areaM2: 0.5,
        status: 'seedling',
      });

      // Act — query for household 1 which has no plantings
      const result = await service.getByHouseholdAndStatus(1, 'seedling');

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
