// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { HouseholdService } from '../../../src/server/services/household.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';

describe('Household API — defaultPlantingUnit (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: HouseholdService;

  beforeEach(() => {
    db = createTestDb();
    service = new HouseholdService(db);
  });

  // -------------------------------------------------------------------------
  // GET — defaultPlantingUnit is present in response
  // -------------------------------------------------------------------------

  describe('GET /api/household — defaultPlantingUnit field', () => {
    it('returns defaultPlantingUnit with the default value of "area"', async () => {
      // Arrange
      await service.create({ name: 'Testfamiljen', persons: 3 });

      // Act
      const all = await service.getAll();
      const household = all[0]!;

      // Assert
      expect(household).toHaveProperty('defaultPlantingUnit', 'area');
    });

    it('returns defaultPlantingUnit on getById', async () => {
      // Arrange
      const created = await service.create({ name: 'Testfamiljen', persons: 3 });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found!).toHaveProperty('defaultPlantingUnit', 'area');
    });
  });

  // -------------------------------------------------------------------------
  // PUT — persisting defaultPlantingUnit
  // -------------------------------------------------------------------------

  describe('PUT /api/household/:id — update defaultPlantingUnit', () => {
    it('persists defaultPlantingUnit "count" when updated', async () => {
      // Arrange
      const created = await service.create({ name: 'Testfamiljen', persons: 3 });

      // Act
      const updated = await service.update(created.id, { defaultPlantingUnit: 'count' });

      // Assert
      expect(updated).not.toBeNull();
      expect(updated!.defaultPlantingUnit).toBe('count');
    });

    it('can switch defaultPlantingUnit back to "area" after setting it to "count"', async () => {
      // Arrange
      const created = await service.create({ name: 'Testfamiljen', persons: 3 });
      await service.update(created.id, { defaultPlantingUnit: 'count' });

      // Act
      const restored = await service.update(created.id, { defaultPlantingUnit: 'area' });

      // Assert
      expect(restored!.defaultPlantingUnit).toBe('area');
    });

    it('does not reset other fields when updating only defaultPlantingUnit', async () => {
      // Arrange
      const created = await service.create({ name: 'Familjen Nilsson', persons: 5 });

      // Act
      const updated = await service.update(created.id, { defaultPlantingUnit: 'count' });

      // Assert
      expect(updated!.name).toBe('Familjen Nilsson');
      expect(updated!.persons).toBe(5);
    });
  });
});
