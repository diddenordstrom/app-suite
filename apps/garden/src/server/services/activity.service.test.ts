import { describe, it, expect, beforeEach } from 'vitest';
import { ActivityService } from './activity.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

const testActivity: schema.NewActivity = {
  action: 'created',
  entityType: 'location',
  entityId: 42,
  metadata: JSON.stringify({ name: 'Köksträdgård' }),
};

describe('ActivityService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: ActivityService;
  let householdId: number;
  let otherHouseholdId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new ActivityService(db);
    const rows = db
      .insert(schema.household)
      .values([
        { name: 'Ours', persons: 2 },
        { name: 'Theirs', persons: 2 },
      ])
      .returning()
      .all();
    householdId = rows[0]!.id;
    otherHouseholdId = rows[1]!.id;
  });

  describe('log()', () => {
    it('creates an activity record and returns it with an id', async () => {
      // Arrange — testActivity defined above

      // Act
      const result = await service.log({ ...testActivity, householdId });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.action).toBe('created');
      expect(result.entityType).toBe('location');
      expect(result.entityId).toBe(42);
      expect(result.metadata).toBe(JSON.stringify({ name: 'Köksträdgård' }));
    });

    it('creates an activity without metadata', async () => {
      // Arrange
      const noMeta: schema.NewActivity = {
        householdId,
        action: 'deleted',
        entityType: 'household',
        entityId: 1,
      };

      // Act
      const result = await service.log(noMeta);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.metadata).toBeNull();
    });

    it('creates multiple activity records with unique ids', async () => {
      // Arrange — nothing extra

      // Act
      const first = await service.log({ ...testActivity, householdId });
      const second = await service.log({
        householdId,
        action: 'updated',
        entityType: 'planting',
        entityId: 7,
      });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  describe('getRecent()', () => {
    it('returns activities in reverse chronological order', async () => {
      // Arrange
      await service.log({ householdId, action: 'created', entityType: 'location', entityId: 1 });
      await service.log({ householdId, action: 'updated', entityType: 'location', entityId: 1 });
      await service.log({ householdId, action: 'deleted', entityType: 'location', entityId: 1 });

      // Act
      const result = await service.getRecent(householdId);

      // Assert — most recent first
      expect(result[0]!.action).toBe('deleted');
      expect(result[1]!.action).toBe('updated');
      expect(result[2]!.action).toBe('created');
    });

    it('returns at most 20 records by default', async () => {
      // Arrange — insert 25 records
      for (let i = 1; i <= 25; i++) {
        await service.log({ householdId, action: 'created', entityType: 'planting', entityId: i });
      }

      // Act
      const result = await service.getRecent(householdId);

      // Assert
      expect(result).toHaveLength(20);
    });

    it('respects the limit parameter', async () => {
      // Arrange — insert 10 records
      for (let i = 1; i <= 10; i++) {
        await service.log({ householdId, action: 'created', entityType: 'planting', entityId: i });
      }

      // Act
      const result = await service.getRecent(householdId, 5);

      // Assert
      expect(result).toHaveLength(5);
    });

    it('returns an empty array when there are no activities', async () => {
      // Arrange — empty db

      // Act
      const result = await service.getRecent(householdId);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('per household', () => {
    it("getRecent only returns the given household's activity", async () => {
      // Arrange
      await service.log({ householdId, action: 'created', entityType: 'location', entityId: 1 });
      await service.log({
        householdId: otherHouseholdId,
        action: 'created',
        entityType: 'location',
        entityId: 2,
      });

      // Act
      const result = await service.getRecent(householdId);

      // Assert
      expect(result.map((a) => a.entityId)).toEqual([1]);
    });

    it("getByEntity ignores another household's activity for the same entity", async () => {
      // Arrange
      await service.log({
        householdId: otherHouseholdId,
        action: 'created',
        entityType: 'location',
        entityId: 5,
      });

      // Act
      const result = await service.getByEntity(householdId, 'location', 5);

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('getByEntity()', () => {
    it('returns all activities for the given entity', async () => {
      // Arrange
      await service.log({ householdId, action: 'created', entityType: 'location', entityId: 5 });
      await service.log({ householdId, action: 'updated', entityType: 'location', entityId: 5 });
      await service.log({ householdId, action: 'created', entityType: 'planting', entityId: 5 });

      // Act
      const result = await service.getByEntity(householdId, 'location', 5);

      // Assert
      expect(result).toHaveLength(2);
      expect(result.every((a) => a.entityType === 'location' && a.entityId === 5)).toBe(true);
    });

    it('returns empty array for an unknown entity', async () => {
      // Arrange — nothing logged for this entity

      // Act
      const result = await service.getByEntity(householdId, 'location', 99999);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('filters by both entityType and entityId', async () => {
      // Arrange — same id, different entityType
      await service.log({ householdId, action: 'created', entityType: 'location', entityId: 1 });
      await service.log({ householdId, action: 'created', entityType: 'household', entityId: 1 });

      // Act
      const result = await service.getByEntity(householdId, 'household', 1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]!.entityType).toBe('household');
    });
  });

  describe('getAll()', () => {
    it('returns all activities', async () => {
      // Arrange
      await service.log({ ...testActivity, householdId });
      await service.log({ householdId, action: 'updated', entityType: 'planting', entityId: 7 });

      // Act
      const result = await service.getAll();

      // Assert
      expect(result).toHaveLength(2);
    });

    it('returns an empty array when there are no activities', async () => {
      // Arrange — empty db

      // Act
      const result = await service.getAll();

      // Assert
      expect(result).toHaveLength(0);
    });
  });
});
