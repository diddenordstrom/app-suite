// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageDepletionService } from '../../../src/server/services/storage-depletion.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Storage Depletion API (integration)', () => {
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
    service = new StorageDepletionService(db);
  });

  describe('GET /api/storage/depletion — depletion data', () => {
    it('returns empty array for household with no storage items', async () => {
      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toEqual([]);
    });

    it('returns depletion data with depletionDate when burn rate is set', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 4,
          harvestedDate: '2026-03-01',
        })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getDepletionForHousehold(1, today);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        cropId: 1,
        quantityKg: 4,
        kgPerWeek: 2,
        weeksRemaining: 2,
        depletionDate: '2026-04-10',
      });
      expect(result[0]!.storageItemId).toBeGreaterThan(0);
    });

    it('returns null depletionDate when no burn rate is configured', async () => {
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
  });
});
