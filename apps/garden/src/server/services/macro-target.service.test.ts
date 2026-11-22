import { describe, it, expect, beforeEach } from 'vitest';
import { MacroTargetService } from './macro-target.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('MacroTargetService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: MacroTargetService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    service = new MacroTargetService(db);
  });

  describe('create()', () => {
    it('creates a macro target', async () => {
      // Arrange
      const data: schema.NewMacroTarget = {
        householdId: 1,
        name: 'Standard Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      };

      // Act
      const result = await service.create(data);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Standard Plan');
      expect(result.dailyKcal).toBe(8000);
      expect(result.dailyProteinG).toBe(300);
      expect(result.householdId).toBe(1);
      expect(result.active).toBe(false);
    });

    it('creates with active=true and deactivates other targets', async () => {
      // Arrange
      const first = await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });
      expect(first.active).toBe(true);

      // Act
      const second = await service.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: true,
      });

      // Assert
      const updatedFirst = await service.getById(first.id);
      expect(second.active).toBe(true);
      expect(updatedFirst?.active).toBe(false);
    });
  });

  describe('getById()', () => {
    it('returns the target for a valid id', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
    });

    it('returns null for an unknown id', async () => {
      // Act
      const result = await service.getById(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('getByHouseholdId()', () => {
    it('returns all targets for a household', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });
      await service.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
      });

      // Act
      const targets = await service.getByHouseholdId(1);

      // Assert
      expect(targets).toHaveLength(2);
    });

    it('returns empty array when no targets exist for household', async () => {
      // Act
      const targets = await service.getByHouseholdId(1);

      // Assert
      expect(targets).toHaveLength(0);
    });
  });

  describe('getActiveByHouseholdId()', () => {
    it('returns the active target for a household', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        name: 'Inactive Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: false,
      });
      const active = await service.create({
        householdId: 1,
        name: 'Active Plan',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: true,
      });

      // Act
      const result = await service.getActiveByHouseholdId(1);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe(active.id);
      expect(result?.name).toBe('Active Plan');
    });

    it('returns null when no active target exists', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        name: 'Inactive Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: false,
      });

      // Act
      const result = await service.getActiveByHouseholdId(1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('setActive()', () => {
    it('sets the target as active and deactivates others for same household', async () => {
      // Arrange
      const first = await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });
      const second = await service.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: false,
      });

      // Act
      const result = await service.setActive(second.id);

      // Assert
      const updatedFirst = await service.getById(first.id);
      expect(result?.active).toBe(true);
      expect(result?.id).toBe(second.id);
      expect(updatedFirst?.active).toBe(false);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const result = await service.setActive(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('update()', () => {
    it('updates name and returns updated target', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Old Name',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const updated = await service.update(created.id, { name: 'New Name' });

      // Assert
      expect(updated?.name).toBe('New Name');
      expect(updated?.dailyKcal).toBe(8000);
    });

    it('update with active=true deactivates others for same household', async () => {
      // Arrange
      const first = await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });
      const second = await service.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: false,
      });

      // Act
      const updated = await service.update(second.id, { active: true });

      // Assert
      const updatedFirst = await service.getById(first.id);
      expect(updated?.active).toBe(true);
      expect(updatedFirst?.active).toBe(false);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const result = await service.update(99999, { name: 'Nope' });

      // Assert
      expect(result).toBeNull();
    });

    it('returns null when updating an unknown id with active=true (no existing target to swap)', async () => {
      // Arrange — existing active target on the household; the unknown-id update must not touch it
      const keep = await service.create({
        householdId: 1,
        name: 'Keep me',
        dailyKcal: 7000,
        dailyProteinG: 200,
        dailyCarbsG: 900,
        dailyFatG: 250,
        active: true,
      });

      // Act
      const result = await service.update(99999, { active: true });

      // Assert
      expect(result).toBeNull();
      const stillActive = await service.getById(keep.id);
      expect(stillActive?.active).toBe(true);
    });
  });

  describe('delete()', () => {
    it('deletes an existing target and returns true', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await service.getById(created.id)).toBeNull();
    });

    it('returns false for a non-existent id', async () => {
      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
