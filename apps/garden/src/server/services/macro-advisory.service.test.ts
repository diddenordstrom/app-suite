import { describe, it, expect, beforeEach } from 'vitest';
import { MacroAdvisoryService } from './macro-advisory.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('MacroAdvisoryService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: MacroAdvisoryService;

  beforeEach(() => {
    db = createTestDb();
    service = new MacroAdvisoryService(db);

    // Seed household: 2 persons
    db.insert(schema.household).values({ name: 'Testfamiljen', persons: 2 }).run();

    // Seed crops with known nutrition values
    // Potatis: high carbs, low protein
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4.5,
        kcalPerKg: 810,
        proteinGPerKg: 18,
        carbsGPerKg: 168,
        fatGPerKg: 1,
        category: 'root',
        cropFamily: 'solanaceae',
        isPerennial: false,
      })
      .run();

    // Bönor: high protein
    db.insert(schema.crop)
      .values({
        name: 'Bönor',
        yieldKgPerM2: 0.7,
        kcalPerKg: 3170,
        proteinGPerKg: 220,
        carbsGPerKg: 451,
        fatGPerKg: 15,
        category: 'legume',
        cropFamily: 'fabaceae',
        isPerennial: false,
      })
      .run();

    // Solros: high fat
    db.insert(schema.crop)
      .values({
        name: 'Solros',
        yieldKgPerM2: 0.1,
        kcalPerKg: 6180,
        proteinGPerKg: 206,
        carbsGPerKg: 39,
        fatGPerKg: 561,
        category: 'grain',
        cropFamily: 'asteraceae',
        isPerennial: false,
      })
      .run();

    // Äpple: perennial — should never be suggested
    db.insert(schema.crop)
      .values({
        name: 'Äpple',
        yieldKgPerM2: 3.0,
        kcalPerKg: 480,
        proteinGPerKg: 0,
        carbsGPerKg: 106,
        fatGPerKg: 0,
        category: 'fruit',
        cropFamily: 'rosaceae',
        isPerennial: true,
      })
      .run();

    // Spenat: moderate protein
    db.insert(schema.crop)
      .values({
        name: 'Spenat',
        yieldKgPerM2: 2.0,
        kcalPerKg: 230,
        proteinGPerKg: 29,
        carbsGPerKg: 36,
        fatGPerKg: 4,
        category: 'leafy',
        cropFamily: 'amaranthaceae',
        isPerennial: false,
      })
      .run();
  });

  describe('getAdvisory()', () => {
    it('returns zero entries when wishlist is empty', async () => {
      // Arrange — no wishlist entries

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.totalWishlistEntries).toBe(0);
      expect(result.entriesWithDemand).toBe(0);
      expect(result.projectedCoverage).toBeNull();
      expect(result.weakestMacro).toBeNull();
      expect(result.suggestions).toEqual([]);
    });

    it('reports incomplete kgPerWeek counts', async () => {
      // Arrange — 2 entries, only 1 has kgPerWeek
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();
      db.insert(schema.householdCropWishlist).values({ householdId: 1, cropId: 2 }).run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.totalWishlistEntries).toBe(2);
      expect(result.entriesWithDemand).toBe(1);
      expect(result.projectedCoverage).toBeNull();
      expect(result.weakestMacro).toBeNull();
    });

    it('computes projected coverage using active macro target', async () => {
      // Arrange — macro target: 100g protein/day, 300g carbs/day, 80g fat/day
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      // Wishlist: only Potatis at 2 kg/week
      // Annual protein = 2 * 52 * 18 = 1872g
      // Annual target protein = 100 * 365 = 36500g
      // Coverage = round(1872 / 36500 * 100) = 5%
      // Annual carbs = 2 * 52 * 168 = 17472g
      // Annual target carbs = 300 * 365 = 109500g
      // Coverage = round(17472 / 109500 * 100) = 16%
      // Annual fat = 2 * 52 * 1 = 104g
      // Annual target fat = 80 * 365 = 29200g
      // Coverage = round(104 / 29200 * 100) = 0%
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.projectedCoverage).toEqual({
        proteinPct: 5,
        carbsPct: 16,
        fatPct: 0,
      });
    });

    it('falls back to Nordic defaults multiplied by persons when no macro target', async () => {
      // Arrange — no macro target, household has 2 persons
      // Nordic moderate default per person: 95g protein, 310g carbs, 85g fat
      // Household daily: 190g protein, 620g carbs, 170g fat
      // Wishlist: Potatis at 2 kg/week
      // Annual protein = 2 * 52 * 18 = 1872g
      // Annual target protein = 190 * 365 = 69350g
      // Coverage = round(1872 / 69350 * 100) = 3%
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.projectedCoverage).not.toBeNull();
      expect(result.projectedCoverage!.proteinPct).toBe(3);
    });

    it('identifies the weakest macro below 50%', async () => {
      // Arrange — macro target with modest targets so we can control the gap
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      // Potatis at 2 kg/week → protein 5%, carbs 16%, fat 0%
      // Fat is the weakest
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.weakestMacro).toBe('fat');
      expect(result.weakestPct).toBe(0);
    });

    it('returns null weakestMacro when all macros >= 50%', async () => {
      // Arrange — very low daily targets so coverage is high
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Low',
          dailyKcal: 100,
          dailyProteinG: 1,
          dailyCarbsG: 1,
          dailyFatG: 0.1,
          active: true,
        })
        .run();

      // Potatis at 2 kg/week → massive coverage
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.weakestMacro).toBeNull();
      expect(result.weakestPct).toBeNull();
      expect(result.suggestions).toEqual([]);
    });

    it('suggests top 3 non-perennial crops ranked by weak macro per kg', async () => {
      // Arrange — fat is weakest (see above potatis-only test)
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert — fat is weakest, so suggestions ranked by fatGPerKg
      // Solros: 561, Bönor: 15, Spenat: 4
      // Äpple is perennial → excluded
      // Potatis is on wishlist → excluded
      expect(result.suggestions).toHaveLength(3);
      expect(result.suggestions[0]!.cropName).toBe('Solros');
      expect(result.suggestions[0]!.valuePerKg).toBe(561);
      expect(result.suggestions[1]!.cropName).toBe('Bönor');
      expect(result.suggestions[2]!.cropName).toBe('Spenat');
    });

    it('excludes perennial crops from suggestions', async () => {
      // Arrange
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert — Äpple (perennial) should not appear
      const names = result.suggestions.map((s) => s.cropName);
      expect(names).not.toContain('Äpple');
    });

    it('excludes crops already on wishlist from suggestions', async () => {
      // Arrange
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      // Put Potatis AND Solros on wishlist
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 3, kgPerWeek: 0.5 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert — neither Potatis nor Solros should be in suggestions
      const names = result.suggestions.map((s) => s.cropName);
      expect(names).not.toContain('Potatis');
      expect(names).not.toContain('Solros');
    });

    it('limits suggestions to 3 even when more candidates exist', async () => {
      // Arrange — add more non-perennial crops
      db.insert(schema.crop)
        .values({
          name: 'Morötter',
          yieldKgPerM2: 3.5,
          kcalPerKg: 360,
          proteinGPerKg: 7,
          carbsGPerKg: 66,
          fatGPerKg: 2,
          category: 'root',
          cropFamily: 'apiaceae',
          isPerennial: false,
        })
        .run();

      db.insert(schema.crop)
        .values({
          name: 'Squash',
          yieldKgPerM2: 5.0,
          kcalPerKg: 170,
          proteinGPerKg: 12,
          carbsGPerKg: 22,
          fatGPerKg: 1,
          category: 'fruit',
          cropFamily: 'cucurbitaceae',
          isPerennial: false,
        })
        .run();

      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Test',
          dailyKcal: 2000,
          dailyProteinG: 100,
          dailyCarbsG: 300,
          dailyFatG: 80,
          active: true,
        })
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.suggestions).toHaveLength(3);
    });

    it('returns empty suggestions when no gap exists', async () => {
      // Arrange — very low targets
      db.insert(schema.macroTarget)
        .values({
          householdId: 1,
          name: 'Low',
          dailyKcal: 100,
          dailyProteinG: 1,
          dailyCarbsG: 1,
          dailyFatG: 0.1,
          active: true,
        })
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId: 1, cropId: 1, kgPerWeek: 2 })
        .run();

      // Act
      const result = await service.getAdvisory(1);

      // Assert
      expect(result.suggestions).toEqual([]);
    });
  });
});
