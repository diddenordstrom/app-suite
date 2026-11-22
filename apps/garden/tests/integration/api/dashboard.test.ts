// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardService } from '../../../src/server/services/dashboard.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Dashboard API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: DashboardService;

  beforeEach(() => {
    db = createTestDb();
    // Seed household
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();

    // Seed crop — includes yieldKgPerPlant for count-mode tests
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        yieldKgPerPlant: 5.0,
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
    service = new DashboardService(db);
  });

  // -------------------------------------------------------------------------
  // Existing tests
  // -------------------------------------------------------------------------

  describe('GET /api/dashboard?householdId=99999 — unknown household', () => {
    it('returns zeroes for both growing and onHand when household has no data', async () => {
      // Arrange — household 99999 has no plantings or storage items

      // Act
      const growing = await service.getGrowingMacros(99999);
      const onHand = await service.getOnHandMacros(99999);

      // Assert
      expect(growing).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
      expect(onHand).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });
  });

  describe('GET /api/dashboard?householdId=1 — known household', () => {
    it('returns the correct shape with growing and onHand keys', async () => {
      // Arrange — household 1 has no plantings or storage items yet

      // Act
      const growing = await service.getGrowingMacros(1);
      const onHand = await service.getOnHandMacros(1);
      const result = { growing, onHand };

      // Assert
      expect(result).toHaveProperty('growing');
      expect(result).toHaveProperty('onHand');
      expect(result.growing).toHaveProperty('kcal');
      expect(result.growing).toHaveProperty('proteinG');
      expect(result.growing).toHaveProperty('carbsG');
      expect(result.growing).toHaveProperty('fatG');
      expect(result.onHand).toHaveProperty('kcal');
      expect(result.onHand).toHaveProperty('proteinG');
      expect(result.onHand).toHaveProperty('carbsG');
      expect(result.onHand).toHaveProperty('fatG');
    });

    it('returns correct growing macros from active area-mode plantings', async () => {
      // Arrange
      // Tomat planting: 2 m2 × 8 kg/m2 = 16 kg → kcal 2880
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'growing',
        })
        .run();

      // Act
      const growing = await service.getGrowingMacros(1);

      // Assert
      expect(growing.kcal).toBe(2880);
      expect(growing.proteinG).toBe(144);
    });

    it('returns correct onHand macros from storage items', async () => {
      // Arrange
      // 5 kg Tomat: kcal = 5 × 180 = 900
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 5.0,
          harvestedDate: '2026-08-15',
        })
        .run();

      // Act
      const onHand = await service.getOnHandMacros(1);

      // Assert
      expect(onHand.kcal).toBe(900);
      expect(onHand.proteinG).toBe(45);
    });

    // -----------------------------------------------------------------------
    // New: count-mode planting kcal contribution
    // -----------------------------------------------------------------------

    it('returns growing kcal > 0 for a count-mode planting using crop default yield', async () => {
      // Arrange
      // Tomat: yieldKgPerPlant = 5.0 kg, quantity = 3 → 15 kg → kcal = 15 × 180 = 2700
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 3,
          status: 'growing',
        })
        .run();

      // Act
      const growing = await service.getGrowingMacros(1);

      // Assert
      expect(growing.kcal).toBeGreaterThan(0);
      expect(growing.kcal).toBe(2700);
    });

    it('uses yieldKgPerPlantOverride when set, ignoring crop default', async () => {
      // Arrange
      // Crop default yieldKgPerPlant = 5.0 kg, override = 2.0 kg
      // quantity = 3 → 3 × 2.0 = 6 kg → kcal = 6 × 180 = 1080
      // If override is NOT used, kcal would be 2700 (using crop default 5 kg/plant)
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 3,
          yieldKgPerPlantOverride: 2.0,
          status: 'growing',
        })
        .run();

      // Act
      const growing = await service.getGrowingMacros(1);

      // Assert — must use override (1080), not crop default (2700)
      expect(growing.kcal).toBe(1080);
    });

    it('sums correctly when both area-mode and count-mode plantings are active', async () => {
      // Arrange
      // Area-mode: 2 m2 × 8 kg/m2 = 16 kg → 16 × 180 = 2880 kcal
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          plantingMode: 'area',
          status: 'growing',
        })
        .run();

      // Count-mode: 3 plants × 5 kg/plant = 15 kg → 15 × 180 = 2700 kcal
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-15',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 3,
          status: 'growing',
        })
        .run();

      // Act
      const growing = await service.getGrowingMacros(1);

      // Assert — total: 2880 + 2700 = 5580 kcal
      expect(growing.kcal).toBe(5580);
    });

    it('returns zero kcal for count-mode planting when neither crop yield nor override is set', async () => {
      // Arrange — seed a crop with no yieldKgPerPlant
      db.insert(schema.crop)
        .values({
          name: 'Sallad',
          yieldKgPerM2: 3.0,
          yieldKgPerPlant: null,
          kcalPerKg: 150,
          proteinGPerKg: 12,
          carbsGPerKg: 25,
          fatGPerKg: 1,
          category: 'vegetable',
        })
        .run();

      db.insert(schema.planting)
        .values({
          cropId: 2,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 5,
          // no yieldKgPerPlantOverride, crop has no yieldKgPerPlant
          status: 'growing',
        })
        .run();

      // Act
      const growing = await service.getGrowingMacros(1);

      // Assert — no yield data means 0 kg → 0 kcal
      expect(growing.kcal).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /api/dashboard — byLocation breakdown
  // ---------------------------------------------------------------------------

  describe('GET /api/dashboard — byLocation breakdown', () => {
    it('response includes byLocation array', async () => {
      // Arrange — use the default household (id=1) with no plantings

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert
      expect(Array.isArray(result)).toBe(true);
    });

    it('byLocation is empty when household has no active plantings', async () => {
      // Arrange — household 1 exists but has no plantings

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert
      expect(result).toEqual([]);
    });

    it('byLocation has one entry per active location', async () => {
      // Arrange — seed a second location for the household
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Pallkrage 1', areaM2: 4.0 })
        .run();

      // Plant one active planting in location 1 (id=1)
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          status: 'growing',
        })
        .run();

      // Plant one active planting in the new location (id=2)
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 2,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert — one entry per location that has active plantings
      expect(result).toHaveLength(2);
    });

    it('byLocation entry has correct locationId and locationName', async () => {
      // Arrange — location "Köksträdgård" already seeded with id=1 in createTestDb
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert
      expect(result[0]).toMatchObject({
        locationId: 1,
        locationName: 'Köksträdgård',
      });
    });

    it('byLocation entry kcal reflects planted crop yield', async () => {
      // Arrange
      // Tomat: yieldKgPerM2=8, kcalPerKg=180
      // planting: 2 m2 → 2 × 8 = 16 kg → 16 × 180 = 2880 kcal
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert
      expect(result[0].kcal).toBe(2880);
    });

    it('byLocation merges multiple plantings in the same location into one entry', async () => {
      // Arrange — two active plantings sharing the same location.
      // Tomat: 1 m² × 8 kg/m² × 180 kcal/kg = 1440 kcal
      // Tomat: 2 m² × 8 kg/m² × 180 kcal/kg = 2880 kcal
      // Merged kcal: 1440 + 2880 = 4320.
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          status: 'growing',
        })
        .run();
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-15',
          areaM2: 2.0,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert — merged into a single entry for location 1
      expect(result).toHaveLength(1);
      expect(result[0]!.locationId).toBe(1);
      expect(result[0]!.kcal).toBe(4320);
      expect(result[0]!.proteinG).toBe(216); // (8+16) × 9
      expect(result[0]!.carbsG).toBe(840); // (8+16) × 35
      expect(result[0]!.fatG).toBe(48); // (8+16) × 2
    });

    it('byLocation excludes harvested plantings', async () => {
      // Arrange — planting with status "harvested" must not contribute
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'harvested',
        })
        .run();

      // Act
      const result = await service.getMacrosByLocation(1);

      // Assert — harvested plantings are excluded, so location does not appear
      expect(result).toEqual([]);
    });
  });
});
