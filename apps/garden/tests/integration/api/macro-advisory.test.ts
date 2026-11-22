// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { MacroAdvisoryService } from '../../../src/server/services/macro-advisory.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Macro Advisory API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: MacroAdvisoryService;

  beforeEach(() => {
    db = createTestDb();
    service = new MacroAdvisoryService(db);

    db.insert(schema.household).values({ name: 'Testfamiljen', persons: 2 }).run();

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
  });

  it('returns advisory with projected coverage for complete wishlist', async () => {
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

    // Assert
    expect(result.totalWishlistEntries).toBe(1);
    expect(result.entriesWithDemand).toBe(1);
    expect(result.projectedCoverage).not.toBeNull();
    expect(result.weakestMacro).toBe('fat');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('returns null coverage when kgPerWeek is incomplete', async () => {
    // Arrange
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
  });

  it('returns empty advisory for unknown household', async () => {
    // Act
    const result = await service.getAdvisory(99999);

    // Assert
    expect(result.totalWishlistEntries).toBe(0);
    expect(result.suggestions).toEqual([]);
  });
});
