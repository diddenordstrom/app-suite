// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { MacroPresetService } from '../../../src/server/services/macro-preset.service';
import { MacroTargetService } from '../../../src/server/services/macro-target.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Macro Presets API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let presetService: MacroPresetService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();

    db.insert(schema.macroPreset)
      .values([
        {
          name: 'Stillasittande',
          kcalPerPerson: 2000,
          proteinG: 75,
          carbsG: 250,
          fatG: 70,
          activityLevel: 'sedentary',
        },
        {
          name: 'Måttligt aktiv',
          kcalPerPerson: 2500,
          proteinG: 95,
          carbsG: 310,
          fatG: 85,
          activityLevel: 'moderate',
        },
        {
          name: 'Aktiv',
          kcalPerPerson: 3000,
          proteinG: 115,
          carbsG: 375,
          fatG: 100,
          activityLevel: 'active',
        },
      ])
      .run();
    presetService = new MacroPresetService(db);
  });

  describe('GET /api/macro-preset — list all', () => {
    it('returns all seeded presets', async () => {
      // Act
      const presets = await presetService.getAll();

      // Assert
      expect(presets).toHaveLength(3);
    });

    it('returns presets with correct fields', async () => {
      // Act
      const presets = await presetService.getAll();
      const sedentary = presets.find((p) => p.activityLevel === 'sedentary');

      // Assert
      expect(sedentary).toBeDefined();
      expect(sedentary?.name).toBe('Stillasittande');
      expect(sedentary?.kcalPerPerson).toBe(2000);
      expect(sedentary?.proteinG).toBe(75);
      expect(sedentary?.carbsG).toBe(250);
      expect(sedentary?.fatG).toBe(70);
    });

    it('returns presets with unique ids', async () => {
      // Act
      const presets = await presetService.getAll();
      const ids = presets.map((p) => p.id);

      // Assert
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('GET /api/macro-preset/:id — get by id', () => {
    it('returns the preset with matching id', async () => {
      // Arrange
      const all = await presetService.getAll();
      const target = all.find((p) => p.activityLevel === 'active');
      expect(target).toBeDefined();

      // Act
      const found = await presetService.getById(target!.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.name).toBe('Aktiv');
      expect(found?.kcalPerPerson).toBe(3000);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const found = await presetService.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });
});

describe('Macro Targets API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let targetService: MacroTargetService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    targetService = new MacroTargetService(db);
  });

  describe('POST /api/macro-target — create', () => {
    it('creates a macro target with all required fields', async () => {
      // Act
      const result = await targetService.create({
        householdId: 1,
        name: 'Standard Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Assert
      expect(result.id).toBeDefined();
      expect(result.name).toBe('Standard Plan');
      expect(result.dailyKcal).toBe(8000);
      expect(result.householdId).toBe(1);
      expect(result.active).toBe(false);
    });

    it('creates with active=true and deactivates existing active targets', async () => {
      // Arrange
      const first = await targetService.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });

      // Act
      const second = await targetService.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: true,
      });

      // Assert
      const updatedFirst = await targetService.getById(first.id);
      expect(second.active).toBe(true);
      expect(updatedFirst?.active).toBe(false);
    });
  });

  describe('GET /api/macro-target — list by household', () => {
    it('returns all targets for a household', async () => {
      // Arrange
      await targetService.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });
      await targetService.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
      });

      // Act
      const targets = await targetService.getByHouseholdId(1);

      // Assert
      expect(targets).toHaveLength(2);
    });

    it('returns empty array when household has no targets', async () => {
      // Act
      const targets = await targetService.getByHouseholdId(1);

      // Assert
      expect(targets).toEqual([]);
    });
  });

  describe('GET /api/macro-target/active — get active for household', () => {
    it('returns the active target for a household', async () => {
      // Arrange
      await targetService.create({
        householdId: 1,
        name: 'Inactive',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: false,
      });
      const active = await targetService.create({
        householdId: 1,
        name: 'Active Plan',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: true,
      });

      // Act
      const result = await targetService.getActiveByHouseholdId(1);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.id).toBe(active.id);
      expect(result?.name).toBe('Active Plan');
    });

    it('returns null when no active target exists for household', async () => {
      // Act
      const result = await targetService.getActiveByHouseholdId(1);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('GET /api/macro-target/:id — get by id', () => {
    it('returns the target with matching id', async () => {
      // Arrange
      const created = await targetService.create({
        householdId: 1,
        name: 'My Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const found = await targetService.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.name).toBe('My Plan');
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const found = await targetService.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  describe('PUT /api/macro-target/:id — update', () => {
    it('updates name and macros', async () => {
      // Arrange
      const created = await targetService.create({
        householdId: 1,
        name: 'Old Name',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const updated = await targetService.update(created.id, {
        name: 'New Name',
        dailyKcal: 9000,
      });

      // Assert
      expect(updated?.name).toBe('New Name');
      expect(updated?.dailyKcal).toBe(9000);
      expect(updated?.dailyProteinG).toBe(300);
    });

    it('update with active=true deactivates others for same household', async () => {
      // Arrange
      const first = await targetService.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });
      const second = await targetService.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: false,
      });

      // Act
      const updated = await targetService.update(second.id, { active: true });

      // Assert
      const updatedFirst = await targetService.getById(first.id);
      expect(updated?.active).toBe(true);
      expect(updatedFirst?.active).toBe(false);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const result = await targetService.update(99999, { name: 'Nope' });

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('POST /api/macro-target/:id/activate — set active', () => {
    it('sets the target as active and deactivates others', async () => {
      // Arrange
      const first = await targetService.create({
        householdId: 1,
        name: 'Plan A',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
        active: true,
      });
      const second = await targetService.create({
        householdId: 1,
        name: 'Plan B',
        dailyKcal: 10000,
        dailyProteinG: 380,
        dailyCarbsG: 1240,
        dailyFatG: 340,
        active: false,
      });

      // Act
      const result = await targetService.setActive(second.id);

      // Assert
      const updatedFirst = await targetService.getById(first.id);
      expect(result?.active).toBe(true);
      expect(result?.id).toBe(second.id);
      expect(updatedFirst?.active).toBe(false);
    });

    it('returns null for a non-existent id', async () => {
      // Act
      const result = await targetService.setActive(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('DELETE /api/macro-target/:id — delete', () => {
    it('deletes an existing target and returns true', async () => {
      // Arrange
      const created = await targetService.create({
        householdId: 1,
        name: 'Temp Plan',
        dailyKcal: 8000,
        dailyProteinG: 300,
        dailyCarbsG: 1000,
        dailyFatG: 280,
      });

      // Act
      const deleted = await targetService.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      expect(await targetService.getById(created.id)).toBeNull();
    });

    it('returns false for a non-existent id', async () => {
      // Act
      const deleted = await targetService.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });
});
