import { describe, it, expect, beforeEach } from 'vitest';
import { StorageDepletionService } from './storage-depletion.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('StorageDepletionService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: StorageDepletionService;
  const today = new Date('2026-03-27T00:00:00.000Z');

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
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
    db.insert(schema.crop)
      .values({
        name: 'Morot',
        yieldKgPerM2: 3.5,
        kcalPerKg: 410,
        proteinGPerKg: 9,
        carbsGPerKg: 96,
        fatGPerKg: 2,
        category: 'root',
      })
      .run();
    service = new StorageDepletionService(db);
  });

  describe('getDepletionForHousehold()', () => {
    it('returns empty array when household has no storage items', async () => {
      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toEqual([]);
    });

    it('returns null depletion date and kgPerWeek when no burn rate is set', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 5,
          harvestedDate: '2026-03-01',
        })
        .run();

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        cropId: 1,
        quantityKg: 5,
        kgPerWeek: null,
        depletionDate: null,
        weeksRemaining: null,
      });
    });

    it('calculates depletion date when burn rate is set', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 2,
          harvestedDate: '2026-03-01',
        })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 0.5 })
        .run();

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.kgPerWeek).toBe(0.5);
      expect(result[0]!.weeksRemaining).toBe(4);
      // today (2026-03-27) + 4 weeks = 2026-04-24
      expect(result[0]!.depletionDate).toBe('2026-04-24');
    });

    it('sums quantities for multiple items of the same crop before calculating', async () => {
      // Arrange — two separate storage items for the same crop
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 1,
          harvestedDate: '2026-02-01',
        })
        .run();
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 1,
          harvestedDate: '2026-03-01',
        })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 0.5 })
        .run();

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert — combined 2 kg at 0.5 kg/week = 4 weeks
      expect(result).toHaveLength(2);
      const totalQty = result.reduce((sum, r) => sum + r.quantityKg, 0);
      expect(totalQty).toBe(2);
      // Each item shares the same weeksRemaining based on combined total
      expect(result[0]!.weeksRemaining).toBe(4);
      expect(result[1]!.weeksRemaining).toBe(4);
      expect(result[0]!.depletionDate).toBe('2026-04-24');
    });

    it('handles multiple crops independently', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 4,
          harvestedDate: '2026-03-01',
        })
        .run();
      db.insert(schema.storageItem)
        .values({
          cropId: 2,
          householdId: 1,
          quantityKg: 3,
          harvestedDate: '2026-03-01',
        })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();
      // No kgPerWeek for crop 2

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toHaveLength(2);
      const crop1Result = result.find((r) => r.cropId === 1);
      const crop2Result = result.find((r) => r.cropId === 2);

      expect(crop1Result!.weeksRemaining).toBe(2);
      expect(crop1Result!.depletionDate).toBe('2026-04-10');

      expect(crop2Result!.kgPerWeek).toBeNull();
      expect(crop2Result!.depletionDate).toBeNull();
    });

    it('returns storageItemId on each result', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 2,
          harvestedDate: '2026-03-01',
        })
        .run();

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result[0]!.storageItemId).toBeGreaterThan(0);
    });
  });
});
