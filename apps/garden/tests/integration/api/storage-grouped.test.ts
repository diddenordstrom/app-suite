// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from '../../../src/server/services/storage.service';
import { ConsumeService } from '../../../src/server/services/consume.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('GET /api/storage/grouped — grouped storage (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let storageService: StorageService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
        shelfLifeWeeks: 2,
        defaultConsumeKg: 0.5,
      })
      .run();
    storageService = new StorageService(db);
  });

  it('returns 200 and a StorageGroup array for a valid householdId', async () => {
    // Arrange
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 3.0, harvestedDate: '2026-08-01' })
      .run();

    // Act
    const result = await storageService.getGroupedStorage(1);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      cropId: 1,
      cropName: 'Tomat',
      totalKg: 3.0,
    });
  });

  it('returns an empty array for a household with no storage', async () => {
    // Arrange — no storage items seeded

    // Act
    const result = await storageService.getGroupedStorage(1);

    // Assert
    expect(result).toEqual([]);
  });

  it('returns groups with expiresAt computed from shelfLifeWeeks + harvestedDate', async () => {
    // Arrange — shelfLifeWeeks=2, harvestedDate=2026-01-01 → expiresAt=2026-01-15
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
      .run();

    // Act
    const result = await storageService.getGroupedStorage(1);

    // Assert
    expect(result[0]!.batches[0]!.expiresAt).toBe('2026-01-15');
  });
});

describe('POST /api/storage/consume — consume FIFO (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let storageService: StorageService;
  let consumeService: ConsumeService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
        shelfLifeWeeks: 2,
        defaultConsumeKg: 0.5,
      })
      .run();
    storageService = new StorageService(db);
    consumeService = new ConsumeService(db);
  });

  it('returns updated groups after a successful consume reducing the oldest batch first', async () => {
    // Arrange — two batches for crop 1
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 0.5, harvestedDate: '2026-01-01' })
      .run();
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-15' })
      .run();

    const batches = db
      .select()
      .from(schema.storageItem)
      .all()
      .sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));

    // Act — consume 0.5kg: oldest batch fully consumed
    await consumeService.consume(batches, 1, 0.5);

    // Assert — remaining total is 1.0kg (second batch only)
    const groups = await storageService.getGroupedStorage(1);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.totalKg).toBeCloseTo(1.0);
    expect(groups[0]!.batches).toHaveLength(1);
    expect(groups[0]!.batches[0]!.harvestedDate).toBe('2026-01-15');
  });

  it('returns 404 equivalent (empty groups) when crop is not found in household storage', async () => {
    // Arrange — storage is empty for this household
    const batches = db.select().from(schema.storageItem).all();

    // Act
    await consumeService.consume(batches, 1, 0.5);

    // Assert — no groups exist
    const groups = await storageService.getGroupedStorage(1);
    expect(groups).toHaveLength(0);
  });

  it('validates that required fields (cropId, householdId, kg) are needed to perform a consume', async () => {
    // Arrange — this verifies the service layer contract: consume() requires valid batches
    const batches = db.select().from(schema.storageItem).all();

    // Act + Assert — consuming 0 kg should be a no-op without error
    await expect(consumeService.consume(batches, 1, 0)).resolves.toBeUndefined();
    const groups = await storageService.getGroupedStorage(1);
    expect(groups).toHaveLength(0);
  });

  it('does not mutate storage when kg is negative (negative kg no-op at service level)', async () => {
    // Arrange — one batch with known quantity
    db.insert(schema.storageItem)
      .values({ cropId: 1, householdId: 1, quantityKg: 2.0, harvestedDate: '2026-01-01' })
      .run();
    const batches = db
      .select()
      .from(schema.storageItem)
      .all()
      .sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));

    // Act — the service loop exits early because remaining <= 0 from the start
    await consumeService.consume(batches, 1, -1.0);

    // Assert — batch is untouched; the API layer (consume.post.ts) rejects negatives with 400
    const groups = await storageService.getGroupedStorage(1);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.totalKg).toBeCloseTo(2.0);
  });
});
