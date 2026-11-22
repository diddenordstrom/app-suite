import { describe, it, expect, beforeEach } from 'vitest';
import { MacroPresetService } from './macro-preset.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

const testPresets: schema.NewMacroPreset[] = [
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
];

describe('MacroPresetService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: MacroPresetService;

  beforeEach(() => {
    db = createTestDb();
    service = new MacroPresetService(db);
    db.insert(schema.macroPreset).values(testPresets).run();
  });

  describe('getAll()', () => {
    it('returns all presets', async () => {
      // Act
      const presets = await service.getAll();

      // Assert
      expect(presets).toHaveLength(3);
    });

    it('returns presets with correct shape', async () => {
      // Act
      const presets = await service.getAll();
      const sedentary = presets.find((p) => p.activityLevel === 'sedentary');

      // Assert
      expect(sedentary).toBeDefined();
      expect(sedentary?.name).toBe('Stillasittande');
      expect(sedentary?.kcalPerPerson).toBe(2000);
      expect(sedentary?.proteinG).toBe(75);
    });

    it('returns an empty array when no presets exist', async () => {
      // Arrange
      const emptyDb = createTestDb();
      const emptyService = new MacroPresetService(emptyDb);

      // Act
      const presets = await emptyService.getAll();

      // Assert
      expect(presets).toHaveLength(0);
    });
  });

  describe('getById()', () => {
    it('returns the preset for a valid id', async () => {
      // Arrange
      const all = await service.getAll();
      const id = all[0]!.id;

      // Act
      const preset = await service.getById(id);

      // Assert
      expect(preset).not.toBeNull();
      expect(preset?.id).toBe(id);
    });

    it('returns null for an unknown id', async () => {
      // Act
      const preset = await service.getById(99999);

      // Assert
      expect(preset).toBeNull();
    });

    it('returns the correct preset by id', async () => {
      // Arrange
      const all = await service.getAll();
      const active = all.find((p) => p.activityLevel === 'active');
      expect(active).toBeDefined();

      // Act
      const found = await service.getById(active!.id);

      // Assert
      expect(found?.name).toBe('Aktiv');
      expect(found?.kcalPerPerson).toBe(3000);
    });
  });
});
