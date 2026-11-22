import { describe, it, expect, beforeEach } from 'vitest';
import { ConsumeService } from './consume.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('ConsumeService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: ConsumeService;

  beforeEach(() => {
    db = createTestDb();
    service = new ConsumeService(db);

    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();
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
  });

  describe('consume()', () => {
    it('reduces batch quantity when consuming less than the batch total (partial batch)', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
        .run();
      const batches = db.select().from(schema.storageItem).all();

      // Act
      await service.consume(batches, 1, 0.3);

      // Assert
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.quantityKg).toBeCloseTo(0.7);
    });

    it('deletes the batch when consuming exactly the batch total (full batch)', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
        .run();
      const batches = db.select().from(schema.storageItem).all();

      // Act
      await service.consume(batches, 1, 1.0);

      // Assert
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(0);
    });

    it('deletes the first batch and reduces the second when consuming across two batches (multi-batch FIFO)', async () => {
      // Arrange — two batches, oldest first by harvestedDate
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 0.7, harvestedDate: '2026-01-01' })
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-10' })
        .run();
      const batches = db
        .select()
        .from(schema.storageItem)
        .all()
        .sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));

      // Act — consume 1.5kg: first batch (0.7kg) deleted, second batch reduced by 0.8kg
      await service.consume(batches, 1, 1.5);

      // Assert
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.quantityKg).toBeCloseTo(0.2);
    });

    it('consumes all available kg and does not error when requested kg exceeds total stock (over-consume)', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
        .run();
      const batches = db.select().from(schema.storageItem).all();

      // Act + Assert — must not throw
      await expect(service.consume(batches, 1, 5.0)).resolves.toBeUndefined();

      // Assert — all batches are fully consumed
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(0);
    });

    it('is a no-op and does not error when the batch list is empty (empty)', async () => {
      // Arrange — no batches
      const batches: schema.StorageItem[] = [];

      // Act + Assert — must not throw
      await expect(service.consume(batches, 1, 2.0)).resolves.toBeUndefined();
    });

    it('is a no-op and mutates nothing when kg is 0 (zero consume)', async () => {
      // Arrange — one batch with 1kg
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 1.0, harvestedDate: '2026-01-01' })
        .run();
      const batches = db.select().from(schema.storageItem).all();

      // Act — consume 0 kg
      await service.consume(batches, 1, 0);

      // Assert — batch is untouched
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.quantityKg).toBeCloseTo(1.0);
    });

    it('consumes oldest batch first regardless of insertion order (FIFO order)', async () => {
      // Arrange — insert newer batch first, then older batch
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 0.5, harvestedDate: '2026-02-01' })
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 0.5, harvestedDate: '2026-01-01' })
        .run();

      const allBatches = db.select().from(schema.storageItem).all();
      // Pass batches sorted oldest-first as callers are expected to do
      const sorted = [...allBatches].sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));

      // Act — consume exactly the oldest batch
      await service.consume(sorted, 1, 0.5);

      // Assert — the batch with the older harvestedDate is gone
      const remaining = db.select().from(schema.storageItem).all();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.harvestedDate).toBe('2026-02-01');
    });
  });
});
