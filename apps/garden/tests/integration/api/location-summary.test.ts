// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardService } from '../../../src/server/services/dashboard.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('getLocationSummary (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: DashboardService;

  beforeEach(() => {
    db = createTestDb();
    // Seed household
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();

    // Seed crop — Tomat with all macro data and both area- and count-mode yields
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

    // Seed a growing location with a description
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5, description: 'Solig sydvägg' })
      .run();
    service = new DashboardService(db);
  });

  // -------------------------------------------------------------------------
  // 404 — non-existent location
  // -------------------------------------------------------------------------

  describe('non-existent location id', () => {
    it('returns null for location id that does not exist', async () => {
      // Arrange — no location with id 99999

      // Act
      const result = await service.getLocationSummary(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Response shape
  // -------------------------------------------------------------------------

  describe('response shape', () => {
    it('returns location, plantings, and totals fields for a known location', async () => {
      // Arrange — location id=1 seeded in createTestDb, no plantings needed for shape check

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result).not.toBeNull();
      expect(result).toHaveProperty('location');
      expect(result).toHaveProperty('plantings');
      expect(result).toHaveProperty('totals');
    });

    it('location field contains id, name, areaM2, and description', async () => {
      // Arrange — location seeded: name='Köksträdgård', areaM2=12.5, description='Solig sydvägg'

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.location).toMatchObject({
        id: 1,
        name: 'Köksträdgård',
        areaM2: 12.5,
        description: 'Solig sydvägg',
      });
    });

    it('totals field contains kcal, proteinG, carbsG, and fatG', async () => {
      // Arrange

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.totals).toHaveProperty('kcal');
      expect(result!.totals).toHaveProperty('proteinG');
      expect(result!.totals).toHaveProperty('carbsG');
      expect(result!.totals).toHaveProperty('fatG');
    });
  });

  // -------------------------------------------------------------------------
  // Empty plantings
  // -------------------------------------------------------------------------

  describe('location with no active plantings', () => {
    it('returns an empty plantings array', async () => {
      // Arrange — location 1 has no plantings

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings).toEqual([]);
    });

    it('returns zero totals when there are no active plantings', async () => {
      // Arrange — location 1 has no plantings

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Planting data
  // -------------------------------------------------------------------------

  describe('plantings array content', () => {
    it('contains the correct crop name for a planting', async () => {
      // Arrange
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

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings).toHaveLength(1);
      expect(result!.plantings[0].cropName).toBe('Tomat');
    });

    it('each planting entry contains plantingId, cropName, plantingMode, areaM2, quantity, expectedYieldKg, kcal, proteinG, carbsG, fatG', async () => {
      // Arrange
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

      // Act
      const result = await service.getLocationSummary(1);
      const entry = result!.plantings[0];

      // Assert
      expect(entry).toHaveProperty('plantingId');
      expect(entry).toHaveProperty('cropName');
      expect(entry).toHaveProperty('plantingMode');
      expect(entry).toHaveProperty('areaM2');
      expect(entry).toHaveProperty('quantity');
      expect(entry).toHaveProperty('expectedYieldKg');
      expect(entry).toHaveProperty('kcal');
      expect(entry).toHaveProperty('proteinG');
      expect(entry).toHaveProperty('carbsG');
      expect(entry).toHaveProperty('fatG');
    });
  });

  // -------------------------------------------------------------------------
  // expectedYieldKg — area mode
  // -------------------------------------------------------------------------

  describe('expectedYieldKg — area mode', () => {
    it('calculates expectedYieldKg as areaM2 * yieldKgPerM2 when no harvests exist', async () => {
      // Arrange
      // Tomat: yieldKgPerM2=8.0, planting areaM2=2.0 → 2 × 8 = 16 kg
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

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(16);
    });

    it('subtracts harvested kg from area-mode expectedYieldKg', async () => {
      // Arrange
      // Tomat: areaM2=2.0 × yieldKgPerM2=8.0 = 16 kg gross
      // harvestEvent: 4 kg already harvested → remaining = 12 kg
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

      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 4.0, harvestedDate: '2026-07-01' })
        .run();

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(12);
    });

    it('floors expectedYieldKg at 0 when harvested exceeds gross yield (area mode)', async () => {
      // Arrange
      // Tomat: areaM2=1.0 × yieldKgPerM2=8.0 = 8 kg gross
      // harvestEvent: 10 kg logged (overshoot) → remaining must be 0, not negative
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          plantingMode: 'area',
          status: 'growing',
        })
        .run();

      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 10.0, harvestedDate: '2026-07-01' })
        .run();

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // expectedYieldKg — count mode
  // -------------------------------------------------------------------------

  describe('expectedYieldKg — count mode', () => {
    it('calculates expectedYieldKg as quantity * yieldKgPerPlant when no harvests exist', async () => {
      // Arrange
      // Tomat: yieldKgPerPlant=5.0, quantity=3 → 3 × 5 = 15 kg
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
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(15);
    });

    it('uses yieldKgPerPlantOverride instead of crop default in count mode', async () => {
      // Arrange
      // Tomat: crop default yieldKgPerPlant=5.0, override=2.0
      // quantity=3 → 3 × 2.0 = 6 kg  (not 15 kg)
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
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(6);
    });

    it('subtracts harvested kg from count-mode expectedYieldKg', async () => {
      // Arrange
      // quantity=3, yieldKgPerPlant=5.0 → gross 15 kg; 3 kg harvested → 12 kg remaining
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

      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 3.0, harvestedDate: '2026-07-01' })
        .run();

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].expectedYieldKg).toBe(12);
    });
  });

  // -------------------------------------------------------------------------
  // Macro calculations per planting
  // -------------------------------------------------------------------------

  describe('macro calculations per planting entry', () => {
    it('calculates kcal as expectedYieldKg * kcalPerKg (rounded)', async () => {
      // Arrange
      // Tomat: areaM2=2.0 × yieldKgPerM2=8.0 = 16 kg → 16 × 180 = 2880 kcal
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

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].kcal).toBe(2880);
    });

    it('calculates proteinG as expectedYieldKg * proteinGPerKg (rounded)', async () => {
      // Arrange
      // Tomat: 16 kg × 9 g/kg = 144 g protein
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

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings[0].proteinG).toBe(144);
    });
  });

  // -------------------------------------------------------------------------
  // Harvested plantings are excluded
  // -------------------------------------------------------------------------

  describe('harvested planting exclusion', () => {
    it('excludes plantings with status "harvested" from the plantings array', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          plantingMode: 'area',
          status: 'harvested',
        })
        .run();

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.plantings).toEqual([]);
    });

    it('only counts active plantings in totals, ignoring harvested ones', async () => {
      // Arrange — one harvested, one active
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          plantingMode: 'area',
          status: 'harvested',
        })
        .run();

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-05-01',
          areaM2: 1.0,
          plantingMode: 'area',
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getLocationSummary(1);

      // Assert — only the active planting (1 m2 × 8 kg/m2 = 8 kg → 8 × 180 = 1440 kcal)
      expect(result!.plantings).toHaveLength(1);
      expect(result!.totals.kcal).toBe(1440);
    });
  });

  // -------------------------------------------------------------------------
  // Totals row
  // -------------------------------------------------------------------------

  describe('totals', () => {
    it('sums kcal across all active plantings', async () => {
      // Arrange
      // Planting 1: 2 m2 × 8 kg/m2 = 16 kg → 16 × 180 = 2880 kcal
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

      // Planting 2: 3 plants × 5 kg/plant = 15 kg → 15 × 180 = 2700 kcal
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
      const result = await service.getLocationSummary(1);

      // Assert — 2880 + 2700 = 5580
      expect(result!.totals.kcal).toBe(5580);
    });

    it('sums proteinG across all active plantings', async () => {
      // Arrange
      // Planting 1: 16 kg × 9 g/kg = 144 g
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

      // Planting 2: 15 kg × 9 g/kg = 135 g
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
      const result = await service.getLocationSummary(1);

      // Assert — 144 + 135 = 279 g
      expect(result!.totals.proteinG).toBe(279);
    });

    it('totals are zero when plantings array is empty', async () => {
      // Arrange — no plantings

      // Act
      const result = await service.getLocationSummary(1);

      // Assert
      expect(result!.totals).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });
  });
});
