// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { CropPriceService } from '../../../src/server/services/crop-price.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Crop prices API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: CropPriceService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    db.insert(schema.household).values({ name: 'Other Family', persons: 2 }).run();
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
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.0,
        kcalPerKg: 770,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();
    service = new CropPriceService(db);
  });

  describe('upsert → listForHousehold', () => {
    it('returns the priced crop after upsert', async () => {
      await service.upsert(1, 1, 25);

      const all = await service.listForHousehold(1);

      expect(all).toHaveLength(1);
      expect(all[0]?.pricePerKg).toBe(25);
    });

    it('updates the price when called twice with the same crop', async () => {
      await service.upsert(1, 1, 25);
      await service.upsert(1, 1, 33);

      const all = await service.listForHousehold(1);
      expect(all).toHaveLength(1);
      expect(all[0]?.pricePerKg).toBe(33);
    });
  });

  describe('isolation', () => {
    it("household B's prices do not appear for household A", async () => {
      await service.upsert(2, 1, 25);

      const all = await service.listForHousehold(1);

      expect(all).toEqual([]);
    });
  });

  describe('upsert → remove', () => {
    it('returns empty after removing the priced crop', async () => {
      await service.upsert(1, 1, 25);
      const removed = await service.remove(1, 1);

      expect(removed).toBe(true);
      expect(await service.listForHousehold(1)).toEqual([]);
    });

    it('returns false for an unknown (household, crop)', async () => {
      const result = await service.remove(1, 999);
      expect(result).toBe(false);
    });
  });

  describe('validation', () => {
    it('rejects non-positive pricePerKg', async () => {
      await expect(service.upsert(1, 1, 0)).rejects.toThrow();
      await expect(service.upsert(1, 1, -5)).rejects.toThrow();
    });
  });
});
