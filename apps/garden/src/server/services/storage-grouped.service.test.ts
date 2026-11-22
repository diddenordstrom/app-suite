import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

// Creates an in-memory DB with the new shelf_life_weeks and default_consume_kg columns
// that are added as part of the v0.5 Shelf-Life Tracker feature.

describe('StorageService.getGroupedStorage()', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: StorageService;

  beforeEach(() => {
    db = createTestDb();
    service = new StorageService(db);

    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();
  });

  it('returns empty array for a household with no storage items', async () => {
    // Arrange — no storage items seeded

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert
    expect(result).toEqual([]);
  });

  it('groups two storage items for the same crop into one group with summed totalKg', async () => {
    // Arrange
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
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 2.0, harvestedDate: '2026-08-01' })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 3.0, harvestedDate: '2026-08-10' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.cropId).toBe(1);
    expect(result[0]!.cropName).toBe('Tomat');
    expect(result[0]!.totalKg).toBeCloseTo(5.0);
    expect(result[0]!.batches).toHaveLength(2);
  });

  it('computes expiresAt by adding shelfLifeWeeks to harvestedDate', async () => {
    // Arrange — shelfLifeWeeks = 2, harvestedDate = 2026-01-01 → expiresAt = 2026-01-15
    db.insert(schema.crop)
      .values({
        name: 'Sallad',
        yieldKgPerM2: 3.0,
        kcalPerKg: 150,
        proteinGPerKg: 5,
        carbsGPerKg: 20,
        fatGPerKg: 1,
        category: 'leafy',
        shelfLifeWeeks: 2,
      })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.batches[0]!.expiresAt).toBe('2026-01-15');
  });

  it('sets expiresAt and daysUntilExpiry to null when crop has no shelfLifeWeeks', async () => {
    // Arrange
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.5,
        kcalPerKg: 810,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'root',
        shelfLifeWeeks: null,
      })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 5.0, harvestedDate: '2026-03-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]!.expiresAt).toBeNull();
    expect(result[0]!.daysUntilExpiry).toBeNull();
    expect(result[0]!.batches[0]!.expiresAt).toBeNull();
  });

  it('sets group expiresAt to the earliest expiry across all batches in the group', async () => {
    // Arrange — two batches, second expires earlier
    db.insert(schema.crop)
      .values({
        name: 'Sallad',
        yieldKgPerM2: 3.0,
        kcalPerKg: 150,
        proteinGPerKg: 5,
        carbsGPerKg: 20,
        fatGPerKg: 1,
        category: 'leafy',
        shelfLifeWeeks: 1,
      })
      .run();
    // Batch 1: harvested 2026-03-10 → expires 2026-03-17
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-03-10' })
      .run();
    // Batch 2: harvested 2026-03-01 → expires 2026-03-08 (earlier)
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-03-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert — group-level expiresAt is the earliest across batches
    expect(result[0]!.expiresAt).toBe('2026-03-08');
  });

  it('sorts groups by earliest expiresAt ascending with nulls last', async () => {
    // Arrange — crop A has expiry, crop B does not
    db.insert(schema.crop)
      .values({
        name: 'Sallad',
        yieldKgPerM2: 3.0,
        kcalPerKg: 150,
        proteinGPerKg: 5,
        carbsGPerKg: 20,
        fatGPerKg: 1,
        category: 'leafy',
        shelfLifeWeeks: 1,
      })
      .run();
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.5,
        kcalPerKg: 810,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'root',
        shelfLifeWeeks: null,
      })
      .run();

    db.insert(schema.storageItem)
      .values({ cropId: 2, householdId: 1, quantityKg: 3.0, harvestedDate: '2026-03-01' })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-03-20' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert — Sallad (has expiry) comes before Potatis (no expiry)
    expect(result).toHaveLength(2);
    expect(result[0]!.cropName).toBe('Sallad');
    expect(result[1]!.cropName).toBe('Potatis');
  });

  it('sorts batches within a group by harvestedDate ascending (oldest first)', async () => {
    // Arrange
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
    // Insert newer batch first
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-09-01' })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 2.0, harvestedDate: '2026-08-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert — oldest batch (Aug) is first in the batches array
    expect(result[0]!.batches[0]!.harvestedDate).toBe('2026-08-01');
    expect(result[0]!.batches[1]!.harvestedDate).toBe('2026-09-01');
  });

  it('sets expiresAt to null on a group when the crop has no shelfLifeWeeks even with multiple batches', async () => {
    // Arrange — crop without shelfLifeWeeks, two batches
    db.insert(schema.crop)
      .values({
        name: 'Lök',
        yieldKgPerM2: 3.0,
        kcalPerKg: 400,
        proteinGPerKg: 11,
        carbsGPerKg: 92,
        fatGPerKg: 1,
        category: 'vegetable',
        shelfLifeWeeks: null,
      })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 2.0, harvestedDate: '2026-06-01' })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.5, harvestedDate: '2026-07-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert — group-level expiry is null, and each batch has null expiresAt
    expect(result).toHaveLength(1);
    expect(result[0]!.expiresAt).toBeNull();
    expect(result[0]!.daysUntilExpiry).toBeNull();
    expect(result[0]!.batches[0]!.expiresAt).toBeNull();
    expect(result[0]!.batches[1]!.expiresAt).toBeNull();
  });

  it('exposes defaultConsumeKg from the crop on the group', async () => {
    // Arrange
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
        defaultConsumeKg: 0.5,
      })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 2.0, harvestedDate: '2026-08-01' })
      .run();

    // Act
    const result = await service.getGroupedStorage(1);

    // Assert
    expect(result[0]!.defaultConsumeKg).toBe(0.5);
  });
});
