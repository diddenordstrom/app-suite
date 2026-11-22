import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseService } from './expense.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('ExpenseService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: ExpenseService;

  beforeEach(() => {
    db = createTestDb();
    service = new ExpenseService(db);

    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();
    db.insert(schema.household).values({ name: 'Familjen Andersson', persons: 2 }).run();
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
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('returns created expense with all fields matching input', async () => {
      // Arrange
      const input = {
        householdId: 1,
        name: 'Frön Tomat',
        cost: 49.9,
        date: '2026-03-01',
        cropId: 1,
        locationId: 1,
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.householdId).toBe(1);
      expect(result.name).toBe('Frön Tomat');
      expect(result.cost).toBe(49.9);
      expect(result.date).toBe('2026-03-01');
      expect(result.cropId).toBe(1);
      expect(result.locationId).toBe(1);
    });

    it('nullable fields (cropId, locationId) default to null when omitted', async () => {
      // Arrange
      const input = {
        householdId: 1,
        name: 'Gödsel',
        cost: 129.0,
        date: '2026-04-01',
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.cropId).toBeNull();
      expect(result.locationId).toBeNull();
    });

    it('multiple creates get unique ids', async () => {
      // Arrange
      const input = { householdId: 1, name: 'Frön', cost: 50, date: '2026-03-01' };

      // Act
      const first = await service.create(input);
      const second = await service.create({ ...input, date: '2026-03-02' });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  // ---------------------------------------------------------------------------
  // getAll()
  // ---------------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns all expenses for a given household', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön', cost: 50, date: '2026-03-01' });
      await service.create({ householdId: 1, name: 'Jord', cost: 75, date: '2026-03-15' });

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(2);
    });

    it('returns empty array when none exist', async () => {
      // Arrange — no expenses seeded

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('does NOT return expenses from a different household', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön', cost: 50, date: '2026-03-01' });
      await service.create({ householdId: 2, name: 'Jord', cost: 75, date: '2026-03-15' });

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.householdId).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getAll() with year filter
  // ---------------------------------------------------------------------------

  describe('getAll() with year filter', () => {
    it('returns only expenses in the given year', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Vårfrön', cost: 50, date: '2026-03-01' });
      await service.create({ householdId: 1, name: 'Höstlök', cost: 30, date: '2025-09-01' });

      // Act
      const result = await service.getAll(1, 2026);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Vårfrön');
    });

    it('excludes expenses from other years', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön 2024', cost: 50, date: '2024-06-01' });
      await service.create({ householdId: 1, name: 'Frön 2025', cost: 50, date: '2025-06-01' });
      await service.create({ householdId: 1, name: 'Frön 2026', cost: 50, date: '2026-06-01' });

      // Act
      const result = await service.getAll(1, 2026);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Frön 2026');
    });

    it('returns all expenses when no year filter given', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'A', cost: 10, date: '2025-01-01' });
      await service.create({ householdId: 1, name: 'B', cost: 20, date: '2026-01-01' });

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(2);
    });
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------

  describe('getById()', () => {
    it('returns expense for valid id', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Frön',
        cost: 50,
        date: '2026-03-01',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Frön');
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------------

  describe('update()', () => {
    it('partial update (name only) preserves other fields', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Frön',
        cost: 49.9,
        date: '2026-03-01',
      });

      // Act
      const updated = await service.update(created.id, { name: 'Premiumfrön' });

      // Assert
      expect(updated?.name).toBe('Premiumfrön');
      expect(updated?.cost).toBe(49.9);
      expect(updated?.date).toBe('2026-03-01');
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const result = await service.update(99999, { name: 'Okänd' });

      // Assert
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true and expense no longer appears in getAll', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Frön',
        cost: 50,
        date: '2026-03-01',
      });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      const all = await service.getAll(1);
      expect(all).toHaveLength(0);
    });

    it('returns false for unknown id', async () => {
      // Arrange — empty db

      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // getTotalByYear()
  // ---------------------------------------------------------------------------

  describe('getTotalByYear()', () => {
    it('returns sum of costs for the given year and household', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön', cost: 100, date: '2026-03-01' });
      await service.create({ householdId: 1, name: 'Jord', cost: 200, date: '2026-06-15' });

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(300);
    });

    it('returns 0 when no expenses exist for that year', async () => {
      // Arrange — no expenses seeded

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(0);
    });

    it('excludes expenses from other households', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön', cost: 100, date: '2026-03-01' });
      await service.create({ householdId: 2, name: 'Jord', cost: 999, date: '2026-06-01' });

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(100);
    });

    it('excludes expenses from other years', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        name: 'Gammal kostnad',
        cost: 500,
        date: '2025-06-01',
      });
      await service.create({ householdId: 1, name: 'Ny kostnad', cost: 150, date: '2026-06-01' });

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(150);
    });
  });
});
