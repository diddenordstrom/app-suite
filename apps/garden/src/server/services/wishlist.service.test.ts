import { describe, it, expect, beforeEach } from 'vitest';
import { WishlistService } from './wishlist.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('WishlistService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: WishlistService;

  beforeEach(() => {
    db = createTestDb();
    service = new WishlistService(db);

    // Seed household and crops so FK constraints are satisfied
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
        name: 'Gurka',
        yieldKgPerM2: 10.0,
        kcalPerKg: 150,
        proteinGPerKg: 6,
        carbsGPerKg: 25,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();
  });

  describe('add()', () => {
    it('adds a crop to the wishlist and returns the record with id', async () => {
      // Arrange
      const householdId = 1;
      const cropId = 1;

      // Act
      const result = await service.add(householdId, cropId, { kgPerWeek: 1 });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.householdId).toBe(householdId);
      expect(result.cropId).toBe(cropId);
    });

    it('returns existing entry when adding the same crop twice (idempotent)', async () => {
      // Arrange
      const first = await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const second = await service.add(1, 1, { kgPerWeek: 1 });

      // Assert — same row returned, no duplicate created
      expect(second.id).toBe(first.id);
      const all = await service.getForHousehold(1);
      expect(all).toHaveLength(1);
    });

    it('throws when both demand fields are null/undefined', async () => {
      // Arrange — empty options object means "I forgot to set demand"
      // The spec requires at least one of kgPerWeek / kgPerYear so the engine
      // can rank the crop. Validation is at the service layer so the API + any
      // future bulk-import path get the same guarantee.

      // Act + Assert
      await expect(service.add(1, 1, {})).rejects.toThrow(/demand/i);
    });
  });

  describe('remove()', () => {
    it('returns true when the entry is found and removed', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const result = await service.remove(1, 1);

      // Assert
      expect(result).toBe(true);
    });

    it('returns false when the entry is not found', async () => {
      // Arrange — nothing on the wishlist

      // Act
      const result = await service.remove(1, 99999);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getForHousehold()', () => {
    it('returns all wishlist entries for a household', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 1 });
      await service.add(1, 2, { kgPerWeek: 1 });

      // Act
      const result = await service.getForHousehold(1);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((r) => r.householdId === 1)).toBe(true);
    });

    it('returns an empty array when the household has no wishlist entries', async () => {
      // Arrange — nothing added

      // Act
      const result = await service.getForHousehold(1);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('does NOT return entries from a different household', async () => {
      // Arrange — add to household 2 only
      await service.add(2, 1, { kgPerWeek: 1 });

      // Act — query household 1
      const result = await service.getForHousehold(1);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('isOnWishlist()', () => {
    it('returns true when the crop is on the wishlist', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const result = await service.isOnWishlist(1, 1);

      // Assert
      expect(result).toBe(true);
    });

    it('returns false when the crop is not on the wishlist', async () => {
      // Arrange — nothing added

      // Act
      const result = await service.isOnWishlist(1, 1);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('add() with demand fields', () => {
    it('stores kgPerWeek when provided', async () => {
      // Arrange & Act
      const result = await service.add(1, 1, { kgPerWeek: 2.5 });

      // Assert
      expect(result.kgPerWeek).toBe(2.5);
      expect(result.kgPerYear).toBeNull();
    });

    it('stores kgPerYear when provided', async () => {
      // Arrange & Act — vitlök-style preservation crop
      const result = await service.add(1, 1, { kgPerYear: 3 });

      // Assert
      expect(result.kgPerYear).toBe(3);
      expect(result.kgPerWeek).toBeNull();
    });

    it('stores both kgPerWeek and kgPerYear when provided together', async () => {
      // Arrange & Act
      const result = await service.add(1, 1, { kgPerWeek: 0.05, kgPerYear: 3 });

      // Assert
      expect(result.kgPerWeek).toBe(0.05);
      expect(result.kgPerYear).toBe(3);
    });

    it('throws when both demand fields are explicitly null', async () => {
      // Arrange & Act
      await expect(service.add(1, 1, { kgPerWeek: null, kgPerYear: null })).rejects.toThrow(
        /demand/i,
      );
    });
  });

  describe('updateDemand()', () => {
    it('sets kgPerWeek on an existing wishlist entry', async () => {
      // Arrange
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const updated = await service.updateDemand(entry.id, { kgPerWeek: 3.0 });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated!.kgPerWeek).toBe(3.0);
      expect(updated!.kgPerYear).toBeNull();
    });

    it('sets kgPerYear on an existing wishlist entry', async () => {
      // Arrange
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const updated = await service.updateDemand(entry.id, { kgPerYear: 5 });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated!.kgPerYear).toBe(5);
      expect(updated!.kgPerWeek).toBeNull();
    });

    it('sets both demand fields when provided together', async () => {
      // Arrange
      const entry = await service.add(1, 1, { kgPerWeek: 1 });

      // Act
      const updated = await service.updateDemand(entry.id, { kgPerWeek: 0.05, kgPerYear: 3 });

      // Assert
      expect(updated!.kgPerWeek).toBe(0.05);
      expect(updated!.kgPerYear).toBe(3);
    });

    it('clears the other field when only one is provided', async () => {
      // Arrange — start with weekly, switch to yearly
      const entry = await service.add(1, 1, { kgPerWeek: 2 });

      // Act
      const updated = await service.updateDemand(entry.id, { kgPerYear: 10 });

      // Assert
      expect(updated!.kgPerWeek).toBeNull();
      expect(updated!.kgPerYear).toBe(10);
    });

    it('returns null for a nonexistent id', async () => {
      // Arrange & Act
      const result = await service.updateDemand(99999, { kgPerWeek: 1.0 });

      // Assert
      expect(result).toBeNull();
    });

    it('throws when both demand fields would be cleared', async () => {
      // Arrange
      const entry = await service.add(1, 1, { kgPerWeek: 2.0 });

      // Act + Assert — empty object would null both fields, which the engine
      // can't rank. To remove demand entirely, the caller should delete the
      // wishlist row instead.
      await expect(service.updateDemand(entry.id, {})).rejects.toThrow(/demand/i);
    });
  });

  describe('getAnnualDemandMap()', () => {
    it('returns annual kg per crop for entries with kgPerWeek', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 2.0 });
      await service.add(1, 2, { kgPerWeek: 1.5 });

      // Act
      const map = await service.getAnnualDemandMap(1);

      // Assert — weekly × 52
      expect(map.size).toBe(2);
      expect(map.get(1)).toBe(2.0 * 52);
      expect(map.get(2)).toBe(1.5 * 52);
    });

    it('returns annual kg per crop for entries with kgPerYear', async () => {
      // Arrange — preservation crop, yearly demand only
      await service.add(1, 1, { kgPerYear: 3 });

      // Act
      const map = await service.getAnnualDemandMap(1);

      // Assert
      expect(map.get(1)).toBe(3);
    });

    it('sums kgPerWeek and kgPerYear when both are set', async () => {
      // Arrange — fresh garlic plus a winter stash
      await service.add(1, 1, { kgPerWeek: 0.05, kgPerYear: 3 });

      // Act
      const map = await service.getAnnualDemandMap(1);

      // Assert
      expect(map.get(1)).toBe(0.05 * 52 + 3);
    });

    it('excludes legacy rows where both demand fields are null', async () => {
      // Arrange — fresh add via service requires demand, but legacy DB rows
      // from before validation existed will still appear with both nulls.
      // Insert directly to simulate the legacy state the migration leaves.
      await service.add(1, 1, { kgPerWeek: 2.0 });
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 2, kgPerWeek: null, kgPerYear: null })
        .run();

      // Act
      const map = await service.getAnnualDemandMap(1);

      // Assert
      expect(map.size).toBe(1);
      expect(map.has(2)).toBe(false);
    });

    it('returns an empty map when no entries have demand', async () => {
      // Arrange — legacy-style row, both null
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: null, kgPerYear: null })
        .run();

      // Act
      const map = await service.getAnnualDemandMap(1);

      // Assert
      expect(map.size).toBe(0);
    });
  });

  describe('clear()', () => {
    it('removes all wishlist entries for the given household', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 1 });
      await service.add(1, 2, { kgPerWeek: 1 });

      // Act
      await service.clear(1);

      // Assert
      const remaining = await service.getForHousehold(1);
      expect(remaining).toHaveLength(0);
    });

    it('does NOT remove entries for other households', async () => {
      // Arrange
      await service.add(1, 1, { kgPerWeek: 1 });
      await service.add(2, 1, { kgPerWeek: 1 });

      // Act — clear only household 1
      await service.clear(1);

      // Assert — household 2 entry should still be there
      const remaining = await service.getForHousehold(2);
      expect(remaining).toHaveLength(1);
    });
  });
});
