// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { WishlistService } from '../../../src/server/services/wishlist.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Wishlist API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: WishlistService;

  beforeEach(() => {
    db = createTestDb();
    // Seed prerequisites
    db.insert(schema.household).values({ name: 'Household A', persons: 2 }).run();
    db.insert(schema.household).values({ name: 'Household B', persons: 3 }).run();
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
        name: 'Gurka',
        yieldKgPerM2: 6.0,
        kcalPerKg: 150,
        proteinGPerKg: 6,
        carbsGPerKg: 20,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();
    service = new WishlistService(db);
  });

  describe('getForHousehold', () => {
    it('returns empty array when no entries exist', async () => {
      const result = await service.getForHousehold(1);
      expect(result).toEqual([]);
    });
  });

  describe('add → getForHousehold', () => {
    it('returns the entry after adding', async () => {
      await service.add(1, 1, { kgPerWeek: 1 });

      const result = await service.getForHousehold(1);

      expect(result).toHaveLength(1);
      expect(result[0]?.householdId).toBe(1);
      expect(result[0]?.cropId).toBe(1);
    });
  });

  describe('add → removeById → getForHousehold', () => {
    it('returns empty array after adding then removing by id', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      await service.removeById(entry.id);
      const result = await service.getForHousehold(1);

      expect(result).toEqual([]);
    });
  });

  describe('removeById', () => {
    it('returns false for an unknown id', async () => {
      const result = await service.removeById(99999);
      expect(result).toBe(false);
    });
  });

  describe('household isolation', () => {
    it("household B's entries do not appear for household A", async () => {
      await service.add(2, 1, { kgPerWeek: 1 });

      const result = await service.getForHousehold(1);

      expect(result).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // demand fields — weekly + yearly support
  // ---------------------------------------------------------------------------

  describe('demand', () => {
    it('stores kgPerWeek when provided to add()', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1.5 });

      expect(entry.kgPerWeek).toBe(1.5);
      expect(entry.kgPerYear).toBeNull();
      const list = await service.getForHousehold(1);
      expect(list[0]?.kgPerWeek).toBe(1.5);
    });

    it('stores kgPerYear for preservation crops (e.g. vitlök)', async () => {
      const entry = await service.add(1, 1, { kgPerYear: 3 });

      expect(entry.kgPerYear).toBe(3);
      expect(entry.kgPerWeek).toBeNull();
    });

    it('stores both demand fields when set together', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 0.05, kgPerYear: 3 });

      expect(entry.kgPerWeek).toBe(0.05);
      expect(entry.kgPerYear).toBe(3);
    });

    it('throws when both demand fields are missing', async () => {
      await expect(service.add(1, 1, {})).rejects.toThrow(/demand/i);
    });
  });

  describe('updateDemand', () => {
    it('updates kgPerWeek on an existing entry', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      const updated = await service.updateDemand(entry.id, { kgPerWeek: 2.0 });

      expect(updated).not.toBeNull();
      expect(updated!.kgPerWeek).toBe(2.0);
    });

    it('switches between weekly and yearly cleanly', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      const updated = await service.updateDemand(entry.id, { kgPerYear: 5 });

      expect(updated!.kgPerWeek).toBeNull();
      expect(updated!.kgPerYear).toBe(5);
    });

    it('returns null for a nonexistent id', async () => {
      const result = await service.updateDemand(99999, { kgPerWeek: 1.0 });
      expect(result).toBeNull();
    });

    it('throws when both fields would be cleared', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1 });
      await expect(service.updateDemand(entry.id, {})).rejects.toThrow(/demand/i);
    });
  });

  describe('isOnWishlist', () => {
    it('returns true after add and false after remove', async () => {
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      expect(await service.isOnWishlist(1, 1)).toBe(true);

      await service.removeById(entry.id);

      expect(await service.isOnWishlist(1, 1)).toBe(false);
    });
  });
});
