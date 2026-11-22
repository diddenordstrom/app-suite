import { describe, it, expect, beforeEach } from 'vitest';
import { CropPriceService } from './crop-price.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('CropPriceService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: CropPriceService;

  beforeEach(() => {
    db = createTestDb();
    service = new CropPriceService(db);

    db.insert(schema.household).values({ name: 'Familjen Karlsson', persons: 4 }).run();
    db.insert(schema.household).values({ name: 'Familjen Berg', persons: 2 }).run();

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
  });

  describe('upsert()', () => {
    it('inserts a new price', async () => {
      // Arrange + Act
      const result = await service.upsert(1, 1, 25.5);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.householdId).toBe(1);
      expect(result.cropId).toBe(1);
      expect(result.pricePerKg).toBe(25.5);
    });

    it('updates the price when (household, crop) already exists', async () => {
      // Arrange
      await service.upsert(1, 1, 25.5);

      // Act
      const updated = await service.upsert(1, 1, 30);

      // Assert
      expect(updated.pricePerKg).toBe(30);
      const all = await service.listForHousehold(1);
      expect(all).toHaveLength(1);
    });

    it('rejects pricePerKg <= 0', async () => {
      await expect(service.upsert(1, 1, 0)).rejects.toThrow();
      await expect(service.upsert(1, 1, -1)).rejects.toThrow();
    });

    it('rejects non-finite pricePerKg', async () => {
      await expect(service.upsert(1, 1, Number.NaN)).rejects.toThrow();
      await expect(service.upsert(1, 1, Number.POSITIVE_INFINITY)).rejects.toThrow();
    });
  });

  describe('getPrice()', () => {
    it('returns null when no price is set', async () => {
      const result = await service.getPrice(1, 1);
      expect(result).toBeNull();
    });

    it('returns the row for an existing price', async () => {
      await service.upsert(1, 1, 25);
      const result = await service.getPrice(1, 1);
      expect(result?.pricePerKg).toBe(25);
    });

    it('isolates prices between households', async () => {
      await service.upsert(1, 1, 25);
      const otherHousehold = await service.getPrice(2, 1);
      expect(otherHousehold).toBeNull();
    });
  });

  describe('listForHousehold()', () => {
    it('returns an empty list when nothing is priced', async () => {
      const rows = await service.listForHousehold(1);
      expect(rows).toEqual([]);
    });

    it('returns all priced crops for the household', async () => {
      await service.upsert(1, 1, 25);
      await service.upsert(1, 2, 12);
      await service.upsert(2, 1, 99); // other household

      const rows = await service.listForHousehold(1);
      expect(rows).toHaveLength(2);
      const ids = rows.map((r) => r.cropId).sort();
      expect(ids).toEqual([1, 2]);
    });
  });

  describe('remove()', () => {
    it('removes an existing row and returns true', async () => {
      await service.upsert(1, 1, 25);
      const removed = await service.remove(1, 1);
      expect(removed).toBe(true);
      expect(await service.getPrice(1, 1)).toBeNull();
    });

    it('returns false when nothing was removed', async () => {
      const removed = await service.remove(1, 1);
      expect(removed).toBe(false);
    });

    it('does not affect prices from other households', async () => {
      await service.upsert(1, 1, 25);
      await service.upsert(2, 1, 50);
      await service.remove(1, 1);
      expect((await service.getPrice(2, 1))?.pricePerKg).toBe(50);
    });
  });
});
