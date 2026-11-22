import { describe, it, expect, beforeEach } from 'vitest';
import { DashboardService } from './dashboard.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('DashboardService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: DashboardService;

  beforeEach(() => {
    db = createTestDb();
    service = new DashboardService(db);

    // Seed household
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed crops
    // Tomat: yield 8 kg/m2, 5 kg/plant, kcal 180/kg, protein 9g/kg, carbs 35g/kg, fat 2g/kg
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

    // Potatis: yield 4 kg/m2, kcal 770/kg, protein 20g/kg, carbs 170g/kg, fat 1g/kg
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.0,
        kcalPerKg: 770,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'root',
      })
      .run();

    // Seed growing location
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
  });

  describe('getGrowingMacros()', () => {
    it('returns zeroes when there are no active plantings', async () => {
      // Arrange — no plantings seeded

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('returns zeroes for an unknown household', async () => {
      // Arrange — household 99999 has no locations or plantings

      // Act
      const result = await service.getGrowingMacros(99999);

      // Assert
      expect(result).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('excludes plantings with status harvested', async () => {
      // Arrange — one harvested planting only
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
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('calculates macros from expected yield with no harvest events', async () => {
      // Arrange
      // Tomat planting: 2 m2 × 8 kg/m2 = 16 kg remaining
      // kcal = 16 × 180 = 2880, protein = 16 × 9 = 144g, carbs = 16 × 35 = 560g, fat = 16 × 2 = 32g
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
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(2880);
      expect(result.proteinG).toBe(144);
      expect(result.carbsG).toBe(560);
      expect(result.fatG).toBe(32);
    });

    it('subtracts harvest events from expected yield', async () => {
      // Arrange
      // Tomat planting: 2 m2 × 8 kg/m2 = 16 kg expected, 6 kg harvested → 10 kg remaining
      // kcal = 10 × 180 = 1800
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'growing',
        })
        .run();

      db.insert(schema.harvestEvent)
        .values({
          plantingId: 1,
          quantityKg: 4.0,
          harvestedDate: '2026-08-01',
          addedToStorage: true,
        })
        .run();

      db.insert(schema.harvestEvent)
        .values({
          plantingId: 1,
          quantityKg: 2.0,
          harvestedDate: '2026-08-15',
          addedToStorage: false,
        })
        .run();

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(1800); // 10 kg × 180 kcal/kg
      expect(result.proteinG).toBe(90); // 10 kg × 9 g/kg
    });

    it('floors remaining yield at 0 when over-harvested', async () => {
      // Arrange
      // Tomat planting: 1 m2 × 8 kg/m2 = 8 kg expected, but 10 kg harvested → clamped to 0
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 1.0,
          status: 'growing',
        })
        .run();

      db.insert(schema.harvestEvent)
        .values({
          plantingId: 1,
          quantityKg: 10.0,
          harvestedDate: '2026-08-01',
          addedToStorage: true,
        })
        .run();

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(0);
      expect(result.proteinG).toBe(0);
      expect(result.carbsG).toBe(0);
      expect(result.fatG).toBe(0);
    });

    it('sums macros across multiple active plantings', async () => {
      // Arrange
      // Planting 1 (Tomat): 2 m2 × 8 kg/m2 = 16 kg → kcal 2880
      // Planting 2 (Potatis): 3 m2 × 4 kg/m2 = 12 kg → kcal 9240
      // Total kcal = 12120
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'growing',
        })
        .run();

      db.insert(schema.planting)
        .values({
          cropId: 2,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 3.0,
          status: 'planted',
        })
        .run();

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(12120); // 2880 + 9240
      expect(result.proteinG).toBe(384); // 144 + 240 (16×9 + 12×20)
    });

    it('calculates kcal for a count-mode planting using crop default yield', async () => {
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
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(2700); // 3 × 5.0 kg × 180 kcal/kg
    });

    it('uses yieldKgPerPlantOverride when set, ignoring crop default', async () => {
      // Arrange
      // Crop default yieldKgPerPlant = 5.0 kg, override = 2.0 kg
      // quantity = 3 → 3 × 2.0 = 6 kg → kcal = 6 × 180 = 1080
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
      const result = await service.getGrowingMacros(1);

      // Assert — must use override (1080), not crop default (2700)
      expect(result.kcal).toBe(1080);
    });

    it('treats a count-mode planting with null quantity as zero yield', async () => {
      // Arrange — count mode but quantity unset; should fall back to 0 × yieldPerPlant = 0
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: null,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert
      expect(result.kcal).toBe(0);
    });

    it('falls back to zero yield when count-mode crop has neither override nor crop default', async () => {
      // Arrange — Potatis has no yieldKgPerPlant; count-mode with no override → 0 kg
      db.insert(schema.planting)
        .values({
          cropId: 2,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 10,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getGrowingMacros(1);

      // Assert — quantity × (override ?? crop default ?? 0) = 10 × 0 = 0
      expect(result.kcal).toBe(0);
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
      const result = await service.getGrowingMacros(1);

      // Assert — total: 2880 + 2700 = 5580 kcal
      expect(result.kcal).toBe(5580);
    });
  });

  describe('getOnHandMacros()', () => {
    it('returns zeroes when there are no storage items', async () => {
      // Arrange — no storage items

      // Act
      const result = await service.getOnHandMacros(1);

      // Assert
      expect(result).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('returns zeroes for an unknown household', async () => {
      // Act
      const result = await service.getOnHandMacros(99999);

      // Assert
      expect(result).toEqual({ kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 });
    });

    it('calculates macros from a single storage item', async () => {
      // Arrange
      // 5 kg Tomat: kcal = 5 × 180 = 900, protein = 5 × 9 = 45g, carbs = 5 × 35 = 175g, fat = 5 × 2 = 10g
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 5.0,
          harvestedDate: '2026-08-15',
        })
        .run();

      // Act
      const result = await service.getOnHandMacros(1);

      // Assert
      expect(result.kcal).toBe(900);
      expect(result.proteinG).toBe(45);
      expect(result.carbsG).toBe(175);
      expect(result.fatG).toBe(10);
    });

    it('sums macros across multiple storage items', async () => {
      // Arrange
      // 5 kg Tomat: kcal 900, protein 45g
      // 10 kg Potatis: kcal 7700, protein 200g
      // Total: kcal 8600, protein 245g
      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 5.0,
          harvestedDate: '2026-08-15',
        })
        .run();

      db.insert(schema.storageItem)
        .values({
          cropId: 2,
          householdId: 1,
          quantityKg: 10.0,
          harvestedDate: '2026-08-20',
        })
        .run();

      // Act
      const result = await service.getOnHandMacros(1);

      // Assert
      expect(result.kcal).toBe(8600);
      expect(result.proteinG).toBe(245);
    });

    it('only includes storage items for the given household', async () => {
      // Arrange — seed a second household
      db.insert(schema.household).values({ name: 'Other Family', persons: 2 }).run();
      db.insert(schema.growingLocation)
        .values({ householdId: 2, name: 'Other Garden', areaM2: 5.0 })
        .run();

      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 1,
          quantityKg: 5.0,
          harvestedDate: '2026-08-15',
        })
        .run();

      db.insert(schema.storageItem)
        .values({
          cropId: 1,
          householdId: 2,
          quantityKg: 100.0,
          harvestedDate: '2026-08-15',
        })
        .run();

      // Act
      const result = await service.getOnHandMacros(1);

      // Assert — only household 1's 5 kg Tomat
      expect(result.kcal).toBe(900);
    });
  });

  describe('getSelfSufficiency()', () => {
    it('returns empty crops and 0 averagePct when no wishlist entries have kgPerWeek', async () => {
      // Arrange — no wishlist entries at all

      // Act
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops).toEqual([]);
      expect(result.averagePct).toBe(0);
    });

    it('returns coverage for a single wishlisted crop with storage', async () => {
      // Arrange: Tomat on wishlist with kgPerWeek=1 → annual demand = 52kg
      // 13kg in storage → 25% covered
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 1 })
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 13, harvestedDate: '2026-08-01' })
        .run();

      // Act
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops).toHaveLength(1);
      expect(result.crops[0]).toMatchObject({
        cropId: 1,
        cropName: 'Tomat',
        annualDemandKg: 52,
        coveredKg: 13,
        coveragePct: 25,
      });
      expect(result.averagePct).toBe(25);
    });

    it('includes expected yield from active plantings in coverage', async () => {
      // Arrange: Tomat kgPerWeek=2 → annual demand = 104kg
      // Active planting: 2 m2 × 8 kg/m2 = 16kg expected → 16/104 ≈ 15%
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();
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
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops).toHaveLength(1);
      expect(result.crops[0]!.coveredKg).toBe(16); // 2 m2 × 8 kg/m2
      expect(result.crops[0]!.coveragePct).toBe(15); // Math.round(16/104 * 100)
    });

    it('combines storage and planting yield for coverage', async () => {
      // Arrange: Tomat kgPerWeek=1 → annual demand = 52kg
      // Storage: 10kg + Planting: 2m2 × 8 kg/m2 = 16kg → covered = 26kg → 50%
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 1 })
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 10, harvestedDate: '2026-08-01' })
        .run();
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
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops[0]!.coveredKg).toBe(26);
      expect(result.crops[0]!.coveragePct).toBe(50);
    });

    it('exposes storageKg and expectedYieldKg separately so the UI can stack-render them', async () => {
      // Arrange: Tomat kgPerWeek=1 → 52kg demand. Storage 10kg + 2m² × 8 kg/m² = 16kg yield.
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 1 })
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 10, harvestedDate: '2026-08-01' })
        .run();
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
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops[0]!.storageKg).toBe(10);
      expect(result.crops[0]!.expectedYieldKg).toBe(16);
      expect(result.crops[0]!.coveredKg).toBe(26);
    });

    it('returns zero storageKg and expectedYieldKg for an uncovered crop, not undefined', async () => {
      // Arrange — Potatis wishlisted, no storage and no plantings.
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 2, kgPerWeek: 1 })
        .run();

      // Act
      const result = await service.getSelfSufficiency(1);

      // Assert — fields are explicit zeros (UI math relies on this)
      expect(result.crops[0]!.storageKg).toBe(0);
      expect(result.crops[0]!.expectedYieldKg).toBe(0);
      expect(result.crops[0]!.coveredKg).toBe(0);
      expect(result.crops[0]!.coveragePct).toBe(0);
    });

    it('averages coverage across multiple wishlisted crops', async () => {
      // Arrange: Tomat kgPerWeek=1 (52kg demand), 26kg storage → 50% covered
      //          Potatis kgPerWeek=2 (104kg demand), 0kg → 0% covered
      // Average: (50 + 0) / 2 = 25%
      db.insert(schema.householdCropWishlist)
        .values([
          { householdId: 1, cropId: 1, kgPerWeek: 1 },
          { householdId: 1, cropId: 2, kgPerWeek: 2 },
        ])
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 26, harvestedDate: '2026-08-01' })
        .run();

      // Act
      const result = await service.getSelfSufficiency(1);

      // Assert
      expect(result.crops).toHaveLength(2);
      expect(result.averagePct).toBe(25);
    });

    it('ignores wishlisted crops without kgPerWeek', async () => {
      // Arrange: Tomat has kgPerWeek, Potatis does not
      db.insert(schema.householdCropWishlist)
        .values([
          { householdId: 1, cropId: 1, kgPerWeek: 1 },
          { householdId: 1, cropId: 2 }, // no kgPerWeek
        ])
        .run();
      db.insert(schema.storageItem)
        .values({ cropId: 1, householdId: 1, quantityKg: 26, harvestedDate: '2026-08-01' })
        .run();

      // Act
      const result = await service.getSelfSufficiency(1);

      // Assert — only Tomat included
      expect(result.crops).toHaveLength(1);
      expect(result.crops[0]!.cropName).toBe('Tomat');
      expect(result.averagePct).toBe(50);
    });
  });
});
