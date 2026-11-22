import { describe, it, expect, beforeEach } from 'vitest';
import { PlantingService } from './planting.service';
import { StorageService } from './storage.service';
import { HarvestEventService } from './harvest-event.service';
import { HarvestService, type HarvestResult } from './harvest.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

function assertSuccess(
  result: HarvestResult,
): asserts result is { planting: schema.Planting; storageItem: schema.StorageItem | null } {
  expect(result).not.toBeNull();
  expect(result).not.toHaveProperty('error');
}

describe('HarvestService', () => {
  let db: ReturnType<typeof createTestDb>;
  let plantingService: PlantingService;
  let storageService: StorageService;
  let harvestEventService: HarvestEventService;
  let service: HarvestService;

  beforeEach(() => {
    db = createTestDb();
    plantingService = new PlantingService(db);
    storageService = new StorageService(db);
    harvestEventService = new HarvestEventService(db);
    service = new HarvestService(plantingService, storageService, harvestEventService);

    // Seed household
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed crop
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

    // Seed growing location
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
  });

  describe('harvest()', () => {
    it('harvests a planted planting: status becomes harvested and storage item is created', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const result = await service.harvest(p.id, 1, 4.5, '2026-08-15', true, true);

      // Assert
      assertSuccess(result);
      expect(result.planting.status).toBe('harvested');
      expect(result.planting.id).toBe(p.id);
      expect(result.storageItem).not.toBeNull();
      expect(result.storageItem!.quantityKg).toBe(4.5);
      expect(result.storageItem!.harvestedDate).toBe('2026-08-15');
      expect(result.storageItem!.plantingId).toBe(p.id);
      expect(result.storageItem!.cropId).toBe(p.cropId);
    });

    it('harvests a growing planting: status becomes harvested and storage item is created', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.harvest(p.id, 1, 6.0, '2026-09-01', true, true);

      // Assert
      assertSuccess(result);
      expect(result.planting.status).toBe('harvested');
      expect(result.storageItem).not.toBeNull();
      expect(result.storageItem!.quantityKg).toBe(6.0);
    });

    it('returns null when the planting does not exist', async () => {
      // Arrange — no planting with id 99999

      // Act
      const result = await service.harvest(99999, 1, 4.5, '2026-08-15', true, true);

      // Assert
      expect(result).toBeNull();
    });

    it('returns an already-harvested error when planting is already harvested (final harvest)', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'harvested',
      });

      // Act
      const result = await service.harvest(p.id, 1, 4.5, '2026-08-15', true, true);

      // Assert
      expect(result).toEqual({ error: 'already_harvested' });
    });

    it('returns an already-harvested error when planting is already harvested (partial harvest)', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'harvested',
      });

      // Act
      const result = await service.harvest(p.id, 1, 2.0, '2026-08-15', false, true);

      // Assert
      expect(result).toEqual({ error: 'already_harvested' });
    });

    it('stores the correct cropId taken from the planting', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const result = await service.harvest(p.id, 1, 2.0, '2026-08-10', true, true);

      // Assert
      assertSuccess(result);
      expect(result.storageItem).not.toBeNull();
      expect(result.storageItem!.cropId).toBe(1);
      expect(result.storageItem!.householdId).toBe(1);
    });

    it('verifies the planting status is actually persisted as harvested', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      await service.harvest(p.id, 1, 3.0, '2026-08-01', true, true);
      const reloaded = await plantingService.getById(p.id);

      // Assert
      expect(reloaded?.status).toBe('harvested');
    });

    it('partial harvest keeps status as growing', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.harvest(p.id, 1, 1.5, '2026-08-01', false, true);

      // Assert
      assertSuccess(result);
      expect(result.planting.status).toBe('growing');
      const reloaded = await plantingService.getById(p.id);
      expect(reloaded?.status).toBe('growing');
    });

    it('partial harvest creates a storage item when addToStorage is true', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.harvest(p.id, 1, 2.0, '2026-08-10', false, true);

      // Assert
      assertSuccess(result);
      expect(result.storageItem).not.toBeNull();
      expect(result.storageItem!.quantityKg).toBe(2.0);
    });

    it('final harvest with addToStorage false marks as harvested but creates no storage item', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      });

      // Act
      const result = await service.harvest(p.id, 1, 3.0, '2026-08-20', true, false);

      // Assert
      assertSuccess(result);
      expect(result.planting.status).toBe('harvested');
      expect(result.storageItem).toBeNull();
    });

    it('addToStorage false returns storageItem as null', async () => {
      // Arrange
      const p = await plantingService.create({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'planted',
      });

      // Act
      const result = await service.harvest(p.id, 1, 1.0, '2026-08-05', false, false);

      // Assert
      assertSuccess(result);
      expect(result.storageItem).toBeNull();
    });
  });
});
