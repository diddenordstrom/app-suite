// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { ExpenseService } from '../../../src/server/services/expense.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Expenses API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: ExpenseService;

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
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
    service = new ExpenseService(db);
  });

  // ---------------------------------------------------------------------------
  // Create then getAll
  // ---------------------------------------------------------------------------

  describe('create → getAll', () => {
    it('created expense appears in getAll result', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Frön',
        cost: 49.9,
        date: '2026-03-01',
      });

      // Act
      const all = await service.getAll(1);

      // Assert
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(created.id);
      expect(all[0]?.name).toBe('Frön');
      expect(all[0]?.cost).toBe(49.9);
    });
  });

  // ---------------------------------------------------------------------------
  // Create then getById
  // ---------------------------------------------------------------------------

  describe('create → getById', () => {
    it('getById returns the created expense', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Gödsel',
        cost: 129.0,
        date: '2026-04-12',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.name).toBe('Gödsel');
      expect(found?.cost).toBe(129.0);
      expect(found?.date).toBe('2026-04-12');
    });
  });

  // ---------------------------------------------------------------------------
  // Create then update then getById
  // ---------------------------------------------------------------------------

  describe('create → update → getById', () => {
    it('getById shows updated fields after update', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Ursprunglig kostnad',
        cost: 50.0,
        date: '2026-03-01',
      });

      // Act
      await service.update(created.id, { name: 'Uppdaterad kostnad', cost: 75.0 });
      const found = await service.getById(created.id);

      // Assert
      expect(found?.name).toBe('Uppdaterad kostnad');
      expect(found?.cost).toBe(75.0);
    });
  });

  // ---------------------------------------------------------------------------
  // Create then delete then getById
  // ---------------------------------------------------------------------------

  describe('create → delete → getById', () => {
    it('getById returns null after delete', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Tillfällig',
        cost: 10.0,
        date: '2026-03-01',
      });

      // Act
      await service.delete(created.id);
      const found = await service.getById(created.id);

      // Assert
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // getAll with year filter
  // ---------------------------------------------------------------------------

  describe('getAll with year filter', () => {
    it('returns only expenses in the given year', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Kostnad 2025', cost: 100, date: '2025-06-01' });
      await service.create({ householdId: 1, name: 'Kostnad 2026', cost: 200, date: '2026-06-01' });

      // Act
      const result = await service.getAll(1, 2026);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Kostnad 2026');
    });

    it('excludes expenses from the boundary of the next year', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Sista 2026', cost: 50, date: '2026-12-31' });
      await service.create({ householdId: 1, name: 'Första 2027', cost: 50, date: '2027-01-01' });

      // Act
      const result = await service.getAll(1, 2026);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.name).toBe('Sista 2026');
    });
  });

  // ---------------------------------------------------------------------------
  // getTotalByYear
  // ---------------------------------------------------------------------------

  describe('getTotalByYear', () => {
    it('returns correct sum of costs for the given year', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Frön', cost: 100, date: '2026-03-01' });
      await service.create({ householdId: 1, name: 'Jord', cost: 150, date: '2026-05-01' });
      await service.create({ householdId: 1, name: 'Gammalt', cost: 999, date: '2025-01-01' });

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(250);
    });

    it('returns 0 when no expenses exist in that year', async () => {
      // Arrange — no expenses seeded

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(0);
    });

    it('excludes expenses from other households', async () => {
      // Arrange
      await service.create({ householdId: 1, name: 'Min kostnad', cost: 100, date: '2026-03-01' });
      await service.create({
        householdId: 2,
        name: 'Andras kostnad',
        cost: 500,
        date: '2026-04-01',
      });

      // Act
      const total = await service.getTotalByYear(1, 2026);

      // Assert
      expect(total).toBe(100);
    });
  });
});
