import { describe, it, expect, beforeEach } from 'vitest';
import { HarvestEventService } from './harvest-event.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('HarvestEventService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: HarvestEventService;

  beforeEach(() => {
    db = createTestDb();
    service = new HarvestEventService(db);

    // Seed household
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed crop
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

    // Seed growing location
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();

    // Seed a planting
    db.insert(schema.planting)
      .values({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        areaM2: 2.0,
        status: 'growing',
      })
      .run();
  });

  describe('create()', () => {
    it('creates a harvest event and returns it with an id', async () => {
      // Arrange
      const plantingId = 1;
      const quantityKg = 3.5;
      const harvestedDate = '2026-08-15';
      const addedToStorage = true;

      // Act
      const result = await service.create(plantingId, quantityKg, harvestedDate, addedToStorage);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.plantingId).toBe(plantingId);
      expect(result.quantityKg).toBe(quantityKg);
      expect(result.harvestedDate).toBe(harvestedDate);
      expect(result.addedToStorage).toBe(addedToStorage);
    });

    it('creates a harvest event with addedToStorage false', async () => {
      // Arrange & Act
      const result = await service.create(1, 1.5, '2026-09-01', false);

      // Assert
      expect(result.addedToStorage).toBe(false);
    });

    it('creates multiple harvest events for the same planting', async () => {
      // Arrange & Act
      const first = await service.create(1, 2.0, '2026-08-01', true);
      const second = await service.create(1, 1.0, '2026-08-15', false);

      // Assert
      expect(first.id).not.toBe(second.id);
      expect(first.quantityKg).toBe(2.0);
      expect(second.quantityKg).toBe(1.0);
    });
  });

  describe('sumByPlantingId()', () => {
    it('returns 0 for a planting with no harvest events', async () => {
      // Arrange — no events for planting 1

      // Act
      const total = await service.sumByPlantingId(1);

      // Assert
      expect(total).toBe(0);
    });

    it('returns 0 for an unknown planting id', async () => {
      // Arrange — planting 99999 does not exist

      // Act
      const total = await service.sumByPlantingId(99999);

      // Assert
      expect(total).toBe(0);
    });

    it('returns the sum of all harvest events for a planting', async () => {
      // Arrange
      await service.create(1, 2.5, '2026-08-01', true);
      await service.create(1, 1.5, '2026-08-15', false);

      // Act
      const total = await service.sumByPlantingId(1);

      // Assert
      expect(total).toBe(4.0);
    });

    it('returns only the sum for the requested planting', async () => {
      // Arrange — seed a second planting
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-05-01',
          areaM2: 3.0,
          status: 'growing',
        })
        .run();

      await service.create(1, 3.0, '2026-08-01', true);
      await service.create(2, 10.0, '2026-08-20', true);

      // Act
      const total = await service.sumByPlantingId(1);

      // Assert
      expect(total).toBe(3.0);
    });
  });

  describe('sumByPlantingIds()', () => {
    it('returns an empty Map for an empty input array', async () => {
      // Arrange & Act
      const result = await service.sumByPlantingIds([]);

      // Assert
      expect(result.size).toBe(0);
    });

    it('returns 0 for a planting with no harvest events', async () => {
      // Arrange — no events seeded

      // Act
      const result = await service.sumByPlantingIds([1]);

      // Assert
      expect(result.get(1)).toBe(0);
    });

    it('returns the correct sum per planting for multiple plantings', async () => {
      // Arrange — seed a second planting
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-05-01',
          areaM2: 3.0,
          status: 'growing',
        })
        .run();

      await service.create(1, 2.0, '2026-08-01', true);
      await service.create(1, 1.0, '2026-08-10', false);
      await service.create(2, 5.0, '2026-08-20', true);

      // Act
      const result = await service.sumByPlantingIds([1, 2]);

      // Assert
      expect(result.get(1)).toBe(3.0);
      expect(result.get(2)).toBe(5.0);
    });

    it('returns 0 for plantings with no events when others have events', async () => {
      // Arrange — seed a second planting
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-05-01',
          areaM2: 3.0,
          status: 'growing',
        })
        .run();

      await service.create(1, 4.0, '2026-08-01', true);
      // planting 2 has no events

      // Act
      const result = await service.sumByPlantingIds([1, 2]);

      // Assert
      expect(result.get(1)).toBe(4.0);
      expect(result.get(2)).toBe(0);
    });
  });

  describe('sumByHouseholdAndYear()', () => {
    it('returns 0 when no harvest events exist', async () => {
      // Arrange — no events seeded

      // Act
      const total = await service.sumByHouseholdAndYear(1, 2026);

      // Assert
      expect(total).toBe(0);
    });

    it('sums only events within the given year', async () => {
      // Arrange
      await service.create(1, 3.0, '2026-07-01', true);
      await service.create(1, 2.0, '2026-09-15', false);
      await service.create(1, 5.0, '2025-08-01', true); // previous year

      // Act
      const total = await service.sumByHouseholdAndYear(1, 2026);

      // Assert
      expect(total).toBe(5.0);
    });

    it('returns 0 for a year with no events', async () => {
      // Arrange
      await service.create(1, 4.0, '2026-06-01', true);

      // Act
      const total = await service.sumByHouseholdAndYear(1, 2025);

      // Assert
      expect(total).toBe(0);
    });

    it('only sums events for plantings in the given household', async () => {
      // Arrange — second household with its own location and planting
      db.insert(schema.household).values({ name: 'Other', persons: 2 }).run();
      db.insert(schema.growingLocation)
        .values({ householdId: 2, name: 'Other garden', areaM2: 5 })
        .run();
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 2,
          plantedDate: '2026-04-01',
          areaM2: 1,
          status: 'growing',
        })
        .run();

      await service.create(1, 3.0, '2026-07-01', true); // household 1
      await service.create(2, 10.0, '2026-07-01', true); // household 2

      // Act
      const total = await service.sumByHouseholdAndYear(1, 2026);

      // Assert
      expect(total).toBe(3.0);
    });
  });

  describe('listByPlanting()', () => {
    it('returns harvest events for a planting ordered by date desc', async () => {
      // Arrange
      await service.create(1, 0.5, '2026-07-10', true);
      await service.create(1, 1.2, '2026-07-25', true);
      await service.create(1, 0.8, '2026-07-15', false);

      // Act
      const result = await service.listByPlanting(1);

      // Assert
      expect(result).toHaveLength(3);
      expect(result.map((r) => r.harvestedDate)).toEqual([
        '2026-07-25',
        '2026-07-15',
        '2026-07-10',
      ]);
      expect(result[0]!.quantityKg).toBe(1.2);
      expect(result[1]!.addedToStorage).toBe(false);
    });

    it('returns an empty array for a planting with no harvests', async () => {
      // Act
      const result = await service.listByPlanting(1);

      // Assert
      expect(result).toEqual([]);
    });

    it('does not leak rows across plantings', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-01', areaM2: 1 })
        .run();
      await service.create(1, 0.5, '2026-07-10', true);
      await service.create(2, 2.0, '2026-07-12', true);

      // Act
      const planting1 = await service.listByPlanting(1);
      const planting2 = await service.listByPlanting(2);

      // Assert
      expect(planting1).toHaveLength(1);
      expect(planting1[0]!.quantityKg).toBe(0.5);
      expect(planting2).toHaveLength(1);
      expect(planting2[0]!.quantityKg).toBe(2.0);
    });
  });
});
