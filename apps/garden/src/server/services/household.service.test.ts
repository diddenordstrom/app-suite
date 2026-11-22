import { describe, it, expect, beforeEach } from 'vitest';
import { HouseholdService } from './household.service';
import { createTestDb } from '../test-utils/create-test-db';
import type * as schema from '../db/schema';

const testHousehold: schema.NewHousehold = {
  name: 'Familjen Svensson',
  persons: 4,
};

describe('HouseholdService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: HouseholdService;

  beforeEach(() => {
    db = createTestDb();
    service = new HouseholdService(db);
  });

  describe('create()', () => {
    it('creates a household and returns it with an id', async () => {
      const result = await service.create(testHousehold);
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Familjen Svensson');
      expect(result.persons).toBe(4);
    });

    it('creates a household with a growingZone value', async () => {
      // Arrange
      const withZone: schema.NewHousehold = { name: 'Gården', persons: 3, growingZone: 4 };

      // Act
      const result = await service.create(withZone);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.growingZone).toBe(4);
    });

    it('creates multiple households with unique ids', async () => {
      const first = await service.create(testHousehold);
      const second = await service.create({ name: 'Gården', persons: 2 });
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getById()', () => {
    it('returns the household for a valid id', async () => {
      const created = await service.create(testHousehold);
      const found = await service.getById(created.id);
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Familjen Svensson');
    });

    it('returns growingZone correctly', async () => {
      // Arrange
      const created = await service.create({ name: 'Odlarens hem', persons: 2, growingZone: 6 });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found?.growingZone).toBe(6);
    });

    it('returns null for an unknown id', async () => {
      const found = await service.getById(99999);
      expect(found).toBeNull();
    });
  });

  describe('getAll()', () => {
    it('returns all households', async () => {
      await service.create(testHousehold);
      await service.create({ name: 'Gården', persons: 2 });
      const all = await service.getAll();
      expect(all).toHaveLength(2);
    });

    it('returns an empty array when none exist', async () => {
      const all = await service.getAll();
      expect(all).toHaveLength(0);
    });
  });

  describe('update()', () => {
    it('updates the household name', async () => {
      const created = await service.create(testHousehold);
      const updated = await service.update(created.id, { name: 'Nya namnet' });
      expect(updated).not.toBeNull();
      expect(updated?.name).toBe('Nya namnet');
      expect(updated?.persons).toBe(4);
    });

    it('updates persons count', async () => {
      const created = await service.create(testHousehold);
      const updated = await service.update(created.id, { persons: 5 });
      expect(updated?.persons).toBe(5);
    });

    it('updates growingZone', async () => {
      // Arrange
      const created = await service.create({ name: 'Gården', persons: 2, growingZone: 3 });

      // Act
      const updated = await service.update(created.id, { growingZone: 5 });

      // Assert
      expect(updated?.growingZone).toBe(5);
      expect(updated?.name).toBe('Gården');
    });

    it('returns null when updating a non-existent household', async () => {
      const updated = await service.update(99999, { name: 'Nope' });
      expect(updated).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes an existing household and returns true', async () => {
      const created = await service.create(testHousehold);
      const deleted = await service.delete(created.id);
      expect(deleted).toBe(true);

      const found = await service.getById(created.id);
      expect(found).toBeNull();
    });

    it('returns false when deleting a non-existent household', async () => {
      const deleted = await service.delete(99999);
      expect(deleted).toBe(false);
    });
  });
});
