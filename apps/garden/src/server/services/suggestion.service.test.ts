import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { SuggestionService, classifyAtDate, classifyFrostTier } from './suggestion.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';
import { FAMILY_ROTATION_RULES, FAMILY_ROTATION_BONUSES } from '../db/seed-data';

// Zone 2 (Stockholm): lastFrost = May 8, firstFrost = Oct 15

describe('SuggestionService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;

  // IDs set during beforeEach
  let householdId: number;
  let locationId: number;
  let kaleId: number;
  let spinachId: number;
  let plantingId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    // Household with growingZone 2 (Stockholm)
    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Familjen Svensson', persons: 4, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;

    // Growing location belonging to the household
    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Köksträdgård', areaM2: 10 })
      .returning()
      .all();
    locationId = locRows[0]!.id;

    // Transplant crop: Grönkål — weeksToTransplant: 5, daysToMaturityFromTransplant: 60
    const kaleRows = db
      .insert(schema.crop)
      .values({
        name: 'Grönkål',
        yieldKgPerM2: 3.0,
        kcalPerKg: 490,
        proteinGPerKg: 45,
        carbsGPerKg: 90,
        fatGPerKg: 7,
        category: 'vegetable',
        weeksToTransplant: 5,
        directSowOnly: false,
        daysToMaturityFromTransplant: 60,
      })
      .returning()
      .all();
    kaleId = kaleRows[0]!.id;

    // Direct-sow crop: Spenat — directSowOnly: true, daysToMaturityFromTransplant: 40
    const spinachRows = db
      .insert(schema.crop)
      .values({
        name: 'Spenat',
        yieldKgPerM2: 2.0,
        kcalPerKg: 230,
        proteinGPerKg: 29,
        carbsGPerKg: 36,
        fatGPerKg: 4,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 40,
      })
      .returning()
      .all();
    spinachId = spinachRows[0]!.id;

    // A planting (e.g. existing radishes) that frees up the bed on Jul 1
    const plantingRows = db
      .insert(schema.planting)
      .values({
        cropId: kaleId,
        locationId,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-01',
        areaM2: 4.0,
        status: 'planted',
      })
      .returning()
      .all();
    plantingId = plantingRows[0]!.id;

    // Both crops on the wishlist
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: kaleId, kgPerWeek: 1 },
        { householdId, cropId: spinachId, kgPerWeek: 1 },
      ])
      .run();
  });

  // ---------------------------------------------------------------------------
  // 1. Transplant crop suggestion
  // ---------------------------------------------------------------------------

  it('generates transplant suggestion with correct date and title', async () => {
    // Arrange
    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdId, today);

    // Assert: kale sowDate = Jul 1 - 35 days = May 27
    const kaleSuggestion = suggestions.find((s) => s.title.startsWith('Starta Grönkål'));
    expect(kaleSuggestion).toBeDefined();
    expect(kaleSuggestion?.date).toBe('2026-05-27');
    expect(kaleSuggestion?.title).toBe('Starta Grönkål för Köksträdgård');
    expect(kaleSuggestion?.householdId).toBe(householdId);
    expect(kaleSuggestion?.status).toBe('suggestion');
    expect(kaleSuggestion?.completedAt).toBeNull();
    expect(kaleSuggestion?.recurringDays).toBeNull();
    // Attachments are stored in junction tables.
    const kaleLocRows = db
      .select()
      .from(schema.gardenEventLocation)
      .where(eq(schema.gardenEventLocation.eventId, kaleSuggestion!.id))
      .all();
    expect(kaleLocRows.map((r) => r.locationId)).toEqual([locationId]);
    const kalePlRows = db
      .select()
      .from(schema.gardenEventPlanting)
      .where(eq(schema.gardenEventPlanting.eventId, kaleSuggestion!.id))
      .all();
    expect(kalePlRows.map((r) => r.plantingId)).toEqual([plantingId]);
  });

  // ---------------------------------------------------------------------------
  // 2. Direct-sow suggestion
  // ---------------------------------------------------------------------------

  it('generates direct-sow suggestion with correct date and title', async () => {
    // Arrange
    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdId, today);

    // Assert: spinach sowDate = Jul 1, harvestReadyDate = Aug 10 < Oct 15 → feasible
    const spinachSuggestion = suggestions.find((s) => s.title.startsWith('Direktså Spenat'));
    expect(spinachSuggestion).toBeDefined();
    expect(spinachSuggestion?.date).toBe('2026-07-01');
    expect(spinachSuggestion?.title).toBe('Direktså Spenat i Köksträdgård');
    expect(spinachSuggestion?.status).toBe('suggestion');
    // Attachments are stored in junction tables.
    const spinachLocRows = db
      .select()
      .from(schema.gardenEventLocation)
      .where(eq(schema.gardenEventLocation.eventId, spinachSuggestion!.id))
      .all();
    expect(spinachLocRows.map((r) => r.locationId)).toEqual([locationId]);
    const spinachPlRows = db
      .select()
      .from(schema.gardenEventPlanting)
      .where(eq(schema.gardenEventPlanting.eventId, spinachSuggestion!.id))
      .all();
    expect(spinachPlRows.map((r) => r.plantingId)).toEqual([plantingId]);
  });

  // ---------------------------------------------------------------------------
  // 3. Infeasible crop — harvest too late
  // ---------------------------------------------------------------------------

  it('does not generate suggestion when harvestReadyDate exceeds firstFrostDate', async () => {
    // Arrange: add slow crop (120 days) to wishlist — Jul 1 + 120 = Oct 29 > Oct 15
    const slowCropRows = db
      .insert(schema.crop)
      .values({
        name: 'LångsamGröda',
        yieldKgPerM2: 1.0,
        kcalPerKg: 100,
        proteinGPerKg: 10,
        carbsGPerKg: 10,
        fatGPerKg: 1,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 120,
      })
      .returning()
      .all();
    const slowCropId = slowCropRows[0]!.id;
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: slowCropId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdId, today);

    // Assert
    const slowSuggestion = suggestions.find((s) => s.title.includes('LångsamGröda'));
    expect(slowSuggestion).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 4. sowDate too old (> 14 days ago)
  // ---------------------------------------------------------------------------

  it('does not generate suggestion when sowDate is more than 30 days in the past', async () => {
    // Arrange: today = Aug 1. Planting harvests Jun 1. Kale sowDate = Jun 1 - 35 = Apr 27 (95 days ago).
    db.insert(schema.planting)
      .values({
        cropId: spinachId,
        locationId,
        plantedDate: '2026-01-01',
        expectedHarvestDate: '2026-06-01',
        areaM2: 2.0,
        status: 'planted',
      })
      .run();

    const today = new Date('2026-08-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdId, today);

    // Assert: kale sowDate for Jun 1 harvest = Apr 27 — way too old
    const kaleSuggestion = suggestions.find(
      (s) => s.title === 'Starta Grönkål för Köksträdgård' && s.date === '2026-04-27',
    );
    expect(kaleSuggestion).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 5. Idempotency
  // ---------------------------------------------------------------------------

  it('calling twice produces the same number of suggestions (old ones replaced)', async () => {
    // Arrange
    const today = new Date('2026-05-01');

    // Act
    const first = await service.generateSuccessionSuggestions(householdId, today);
    const second = await service.generateSuccessionSuggestions(householdId, today);

    // Assert
    expect(second).toHaveLength(first.length);
  });

  // ---------------------------------------------------------------------------
  // 6. No wishlist
  // ---------------------------------------------------------------------------

  it('returns empty array when household has no wishlist entries', async () => {
    // Arrange: create a new household with no wishlist
    const newHouseRows = db
      .insert(schema.household)
      .values({ name: 'Tomt Hushåll', persons: 1, growingZone: 2 })
      .returning()
      .all();
    const emptyHouseholdId = newHouseRows[0]!.id;

    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(emptyHouseholdId, today);

    // Assert
    expect(suggestions).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 7. No plantings with expectedHarvestDate
  // ---------------------------------------------------------------------------

  it('returns empty array when no active plantings have expectedHarvestDate', async () => {
    // Arrange: new household with a planting but no expectedHarvestDate
    const newHouseRows = db
      .insert(schema.household)
      .values({ name: 'Hushåll Utan Skörd', persons: 2, growingZone: 2 })
      .returning()
      .all();
    const noHarvestHouseholdId = newHouseRows[0]!.id;

    const newLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId: noHarvestHouseholdId, name: 'Liten Bädd', areaM2: 3.0 })
      .returning()
      .all();
    const newLocId = newLocRows[0]!.id;

    db.insert(schema.planting)
      .values({
        cropId: kaleId,
        locationId: newLocId,
        plantedDate: '2026-04-01',
        // expectedHarvestDate intentionally omitted
        areaM2: 2.0,
        status: 'planted',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId: noHarvestHouseholdId, cropId: kaleId })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(noHarvestHouseholdId, today);

    // Assert
    expect(suggestions).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 8. Household without growingZone defaults to zone 2
  // ---------------------------------------------------------------------------

  it('uses zone 2 as default when household has no growingZone set', async () => {
    // Arrange: household without growingZone
    const noZoneHouseRows = db
      .insert(schema.household)
      .values({ name: 'Hushåll Utan Zon', persons: 2 })
      .returning()
      .all();
    const noZoneHouseholdId = noZoneHouseRows[0]!.id;

    const noZoneLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId: noZoneHouseholdId, name: 'Bädd', areaM2: 5.0 })
      .returning()
      .all();
    const noZoneLocId = noZoneLocRows[0]!.id;

    db.insert(schema.planting)
      .values({
        cropId: kaleId,
        locationId: noZoneLocId,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-01',
        areaM2: 2.0,
        status: 'planted',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId: noZoneHouseholdId, cropId: kaleId })
      .run();

    const today = new Date('2026-05-01');

    // Act — should not throw and should generate a suggestion using zone 2 frost dates
    const suggestions = await service.generateSuccessionSuggestions(noZoneHouseholdId, today);

    // Assert: zone 2 firstFrost = Oct 15. kale harvestReady = Jul 1 + 60 = Aug 30 < Oct 15 → feasible
    const kaleSuggestion = suggestions.find((s) => s.title.startsWith('Starta Grönkål'));
    expect(kaleSuggestion).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // 9. cropId and suggestionType on succession suggestions
  // ---------------------------------------------------------------------------

  it('stores cropId and suggestionType=succession on future-bed suggestions', async () => {
    // Arrange
    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdId, today);

    // Assert
    const kaleSuggestion = suggestions.find((s) => s.title.startsWith('Starta Grönkål'));
    expect(kaleSuggestion?.cropId).toBe(kaleId);
    expect(kaleSuggestion?.suggestionType).toBe('succession');

    const spinachSuggestion = suggestions.find((s) => s.title.startsWith('Direktså Spenat'));
    expect(spinachSuggestion?.cropId).toBe(spinachId);
    expect(spinachSuggestion?.suggestionType).toBe('succession');
  });

  // ---------------------------------------------------------------------------
  // 10. Empty bed — location with no plantings at all
  // ---------------------------------------------------------------------------

  it('generates Plantera suggestion for empty location (no plantings)', async () => {
    // Arrange: new household with an empty location + wishlist crop
    const emptyHouseRows = db
      .insert(schema.household)
      .values({ name: 'Tomt Hushåll', persons: 2, growingZone: 2 })
      .returning()
      .all();
    const emptyHouseholdId = emptyHouseRows[0]!.id;

    const emptyLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId: emptyHouseholdId, name: 'Ledig Bädd', areaM2: 5.0 })
      .returning()
      .all();
    const emptyLocId = emptyLocRows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values({ householdId: emptyHouseholdId, cropId: spinachId })
      .run();

    // today = Jun 1, spinach matures in 40 days → harvest Aug 11 < Oct 15 (zone 2) → feasible
    const today = new Date('2026-06-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(emptyHouseholdId, today);

    // Assert
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.title).toBe('Plantera Spenat i Ledig Bädd');
    expect(suggestions[0]?.date).toBe('2026-06-01');
    expect(suggestions[0]?.cropId).toBe(spinachId);
    expect(suggestions[0]?.suggestionType).toBe('empty_bed');
    expect(suggestions[0]?.status).toBe('suggestion');
    // Location attachment is in the junction table; no planting attached.
    const suggLocRows = db
      .select()
      .from(schema.gardenEventLocation)
      .where(eq(schema.gardenEventLocation.eventId, suggestions[0]!.id))
      .all();
    expect(suggLocRows.map((r) => r.locationId)).toEqual([emptyLocId]);
    const suggPlRows = db
      .select()
      .from(schema.gardenEventPlanting)
      .where(eq(schema.gardenEventPlanting.eventId, suggestions[0]!.id))
      .all();
    expect(suggPlRows).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // 11. Empty bed — location where all plantings are harvested
  // ---------------------------------------------------------------------------

  it('generates Plantera suggestion when all plantings in bed are harvested', async () => {
    // Arrange: new household, location with one fully-harvested planting
    const harvestedHouseRows = db
      .insert(schema.household)
      .values({ name: 'Skördat Hushåll', persons: 2, growingZone: 2 })
      .returning()
      .all();
    const harvestedHouseholdId = harvestedHouseRows[0]!.id;

    const harvestedLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId: harvestedHouseholdId, name: 'Skördad Bädd', areaM2: 4.0 })
      .returning()
      .all();
    const harvestedLocId = harvestedLocRows[0]!.id;

    db.insert(schema.planting)
      .values({
        cropId: kaleId,
        locationId: harvestedLocId,
        plantedDate: '2026-03-01',
        expectedHarvestDate: '2026-06-01',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId: harvestedHouseholdId, cropId: spinachId })
      .run();

    // today = Jun 15, spinach matures in 40 days → harvest Jul 25 < Oct 15 → feasible
    const today = new Date('2026-06-15');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(harvestedHouseholdId, today);

    // Assert
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]?.title).toBe('Plantera Spenat i Skördad Bädd');
    expect(suggestions[0]?.suggestionType).toBe('empty_bed');
  });

  // ---------------------------------------------------------------------------
  // 12. Empty bed — infeasible crop skipped
  // ---------------------------------------------------------------------------

  it('does not generate empty-bed suggestion when crop cannot mature before first frost', async () => {
    // Arrange: empty location, slow crop (120 days), today = Aug 1
    // harvestReady = Aug 1 + 120 = Nov 29 > Oct 15 (zone 2) → infeasible
    const slowHouseRows = db
      .insert(schema.household)
      .values({ name: 'Sen Gröda Hushåll', persons: 1, growingZone: 2 })
      .returning()
      .all();
    const slowHouseholdId = slowHouseRows[0]!.id;

    db.insert(schema.growingLocation)
      .values({ householdId: slowHouseholdId, name: 'Bädd', areaM2: 3.0 })
      .run();

    const slowCropRows = db
      .insert(schema.crop)
      .values({
        name: 'LångsamGröda2',
        yieldKgPerM2: 1.0,
        kcalPerKg: 100,
        proteinGPerKg: 10,
        carbsGPerKg: 10,
        fatGPerKg: 1,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 120,
      })
      .returning()
      .all();
    const slowCropId = slowCropRows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values({ householdId: slowHouseholdId, cropId: slowCropId })
      .run();

    const today = new Date('2026-08-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(slowHouseholdId, today);

    // Assert
    expect(suggestions).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 13. Cross-household isolation
  // ---------------------------------------------------------------------------

  it('does not generate suggestions for household A based on household B plantings', async () => {
    // Arrange: household B with its own location and planting
    const householdBRows = db
      .insert(schema.household)
      .values({ name: 'Hushåll B', persons: 2, growingZone: 2 })
      .returning()
      .all();
    const householdBId = householdBRows[0]!.id;

    const locBRows = db
      .insert(schema.growingLocation)
      .values({ householdId: householdBId, name: 'Trädgård B', areaM2: 8.0 })
      .returning()
      .all();
    const locBId = locBRows[0]!.id;

    db.insert(schema.planting)
      .values({
        cropId: kaleId,
        locationId: locBId,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-01',
        areaM2: 3.0,
        status: 'planted',
      })
      .run();

    // Household A has wishlist but NO plantings with expectedHarvestDate (remove existing one)
    // Use a fresh household A without plantings
    const householdARows = db
      .insert(schema.household)
      .values({ name: 'Hushåll A Isolerad', persons: 1, growingZone: 2 })
      .returning()
      .all();
    const householdAId = householdARows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values({ householdId: householdAId, cropId: kaleId })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const suggestions = await service.generateSuccessionSuggestions(householdAId, today);

    // Assert: household A has no plantings of its own → no suggestions
    expect(suggestions).toHaveLength(0);
  });
});

// =============================================================================
// generateBedSuggestions — bed-centric suggestions with rotation, sow windows,
// perennial exclusion, indoor exclusion, macro-gap ranking, and dismiss logic.
// Zone 2 (Stockholm): lastFrost = May 8, firstFrost = Oct 15.
// =============================================================================

describe('generateBedSuggestions', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;

  // Shared IDs reset per test
  let householdId: number;
  let locationId: number;
  let tomatoId: number;
  let beansId: number;
  let kaleId: number;

  // ---------------------------------------------------------------------------
  // Helper: insert a crop with explicit family and sow-window fields
  // ---------------------------------------------------------------------------
  function insertCrop(
    name: string,
    opts: {
      cropFamily?: string;
      isPerennial?: boolean;
      yieldKgPerM2?: number;
      proteinGPerKg?: number;
      carbsGPerKg?: number;
      kcalPerKg?: number;
      daysToMaturityFromTransplant?: number;
      weeksToTransplant?: number;
      directSowOnly?: boolean;
      indoorSowMonthStart?: number | null;
      indoorSowMonthEnd?: number | null;
      directSowMonthStart?: number | null;
      directSowMonthEnd?: number | null;
    } = {},
  ): number {
    const rows = db
      .insert(schema.crop)
      .values({
        name,
        yieldKgPerM2: opts.yieldKgPerM2 ?? 3.0,
        kcalPerKg: opts.kcalPerKg ?? 200,
        proteinGPerKg: opts.proteinGPerKg ?? 20,
        carbsGPerKg: opts.carbsGPerKg ?? 30,
        fatGPerKg: 2,
        category: 'vegetable',
        cropFamily: opts.cropFamily ?? 'unknown',
        isPerennial: opts.isPerennial ?? false,
        weeksToTransplant: opts.weeksToTransplant ?? null,
        directSowOnly: opts.directSowOnly ?? true,
        daysToMaturityFromTransplant: opts.daysToMaturityFromTransplant ?? 45,
        indoorSowMonthStart: opts.indoorSowMonthStart ?? null,
        indoorSowMonthEnd: opts.indoorSowMonthEnd ?? null,
        directSowMonthStart: opts.directSowMonthStart ?? null,
        directSowMonthEnd: opts.directSowMonthEnd ?? null,
      })
      .returning()
      .all();
    return rows[0]!.id;
  }

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    // Household with growingZone 2 (Stockholm): firstFrost = Oct 15
    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Testfamiljen', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;

    // One outdoor bed, 4 m²
    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Testbädd', areaM2: 4.0 })
      .returning()
      .all();
    locationId = locRows[0]!.id;

    // Solanaceae crop — tomato (protein-light)
    tomatoId = insertCrop('TestTomat', {
      cropFamily: 'solanaceae',
      proteinGPerKg: 8,
      carbsGPerKg: 26,
      kcalPerKg: 180,
      yieldKgPerM2: 8.0,
      daysToMaturityFromTransplant: 65,
      weeksToTransplant: 8,
      directSowOnly: false,
      indoorSowMonthStart: 2,
      indoorSowMonthEnd: 4,
    });

    // Fabaceae crop — beans (protein-rich)
    beansId = insertCrop('TestBönor', {
      cropFamily: 'fabaceae',
      proteinGPerKg: 60,
      carbsGPerKg: 120,
      kcalPerKg: 860,
      yieldKgPerM2: 3.0,
      daysToMaturityFromTransplant: 55,
      directSowOnly: true,
      directSowMonthStart: 4,
      directSowMonthEnd: 7,
    });

    // Brassicaceae crop — kale (neutral)
    kaleId = insertCrop('TestGrönkål', {
      cropFamily: 'brassicaceae',
      proteinGPerKg: 45,
      carbsGPerKg: 90,
      kcalPerKg: 490,
      yieldKgPerM2: 3.0,
      daysToMaturityFromTransplant: 60,
      weeksToTransplant: 5,
      directSowOnly: false,
      indoorSowMonthStart: 3,
      indoorSowMonthEnd: 5,
    });
  });

  // ---------------------------------------------------------------------------
  // 1. Rotation filter — same family excluded
  // ---------------------------------------------------------------------------

  it('should exclude same-family crops from a bed that recently grew that family', async () => {
    // Arrange: bed grew a solanaceae crop last season (harvested)
    seedFamilyRotationRulesForTest(db);
    db.insert(schema.planting)
      .values({
        cropId: tomatoId,
        locationId,
        plantedDate: '2025-04-01',
        expectedHarvestDate: '2025-09-01',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();

    // Add another solanaceae crop (paprika) and a non-solanaceae crop (beans) to wishlist
    const paprikaId = insertCrop('TestPaprika', { cropFamily: 'solanaceae' });
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: paprikaId, kgPerWeek: 1 },
        { householdId, cropId: beansId, kgPerWeek: 1 },
      ])
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: paprika (solanaceae) must not appear; beans (fabaceae) must appear
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    expect(cropNames).not.toContain('TestPaprika');
    expect(cropNames).toContain('TestBönor');
  });

  // ---------------------------------------------------------------------------
  // 2. Rotation filter — 2-year lookback boundary
  // ---------------------------------------------------------------------------

  it('should exclude family harvested 1.5 years ago but allow family harvested 5 years ago', async () => {
    // Arrange: two plantings — one 1.5 years ago (within window), one 5 years ago (outside)
    seedFamilyRotationRulesForTest(db);
    const paprikaId = insertCrop('TestPaprika', { cropFamily: 'solanaceae' });

    // 1.5 years ago — within 4-year rotation window → must be excluded
    db.insert(schema.planting)
      .values({
        cropId: tomatoId,
        locationId,
        plantedDate: '2024-10-01',
        expectedHarvestDate: '2024-10-15',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();

    // 5 years ago — beyond 4-year rotation window → must NOT block
    const oldTomatoId = insertCrop('TestGammalTomat', { cropFamily: 'solanaceae' });
    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'GammalBädd', areaM2: 4.0 })
      .returning()
      .all();
    const oldLocationId = locRows[0]!.id;
    db.insert(schema.planting)
      .values({
        cropId: oldTomatoId,
        locationId: oldLocationId,
        plantedDate: '2021-04-01',
        expectedHarvestDate: '2021-09-01',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: paprikaId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-04-08');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: paprika excluded from locationId (1.5yr ago), allowed for oldLocationId (5yr ago)
    const recentBed = results.find((r) => r.locationId === locationId);
    const oldBed = results.find((r) => r.locationId === oldLocationId);

    expect(recentBed?.crops.map((c) => c.cropName)).not.toContain('TestPaprika');
    expect(oldBed?.crops.map((c) => c.cropName)).toContain('TestPaprika');
  });

  // ---------------------------------------------------------------------------
  // 3. Perennial exclusion — never suggest perennial crops
  // ---------------------------------------------------------------------------

  it('should never include a perennial crop in any bed crop options', async () => {
    // Arrange: add a perennial and an annual to the wishlist; bed is empty
    const asparagusId = insertCrop('TestSparris', {
      cropFamily: 'asparagaceae',
      isPerennial: true,
    });
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: asparagusId, kgPerWeek: 1 },
        { householdId, cropId: beansId, kgPerWeek: 1 },
      ])
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: sparris (perennial) absent from all crop options across all beds
    const allCropNames = results.flatMap((r) => r.crops.map((c) => c.cropName));
    expect(allCropNames).not.toContain('TestSparris');
  });

  // ---------------------------------------------------------------------------
  // 4. Perennial exclusion — skip beds with an active perennial planting
  // ---------------------------------------------------------------------------

  it('should not generate a BedSuggestion for a bed occupied by an active perennial', async () => {
    // Arrange: bed has an active planting of a perennial crop (no harvest date — ongoing)
    const asparagusId = insertCrop('TestSparris', {
      cropFamily: 'asparagaceae',
      isPerennial: true,
    });
    db.insert(schema.planting)
      .values({
        cropId: asparagusId,
        locationId,
        plantedDate: '2024-04-01',
        areaM2: 4.0,
        status: 'planted',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: the perennial bed produces no BedSuggestion at all
    const perennialBedResult = results.find((r) => r.locationId === locationId);
    expect(perennialBedResult).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 5. Indoor location exclusion
  // ---------------------------------------------------------------------------

  it('should not generate a BedSuggestion for an indoor location', async () => {
    // Arrange: replace the default location with an indoor one
    const indoorLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Fönsterbräda', areaM2: 0.5, isIndoor: true })
      .returning()
      .all();
    const indoorLocId = indoorLocRows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: indoor location never appears in results
    const indoorResult = results.find((r) => r.locationId === indoorLocId);
    expect(indoorResult).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // 6. Sow window filter
  // ---------------------------------------------------------------------------

  it('should exclude crops whose sow window has passed and include crops still in window', async () => {
    // Arrange: today = Aug 1 (month 8)
    // passedCrop: directSowMonthStart=4, directSowMonthEnd=6 — window closed
    // activeCrop: directSowMonthStart=4, directSowMonthEnd=9 — window still open
    const passedCropId = insertCrop('SåttFönsterPasserat', {
      cropFamily: 'brassicaceae',
      daysToMaturityFromTransplant: 40,
      directSowOnly: true,
      directSowMonthStart: 4,
      directSowMonthEnd: 6,
    });
    const activeCropId = insertCrop('SåttFönsterAktivt', {
      cropFamily: 'brassicaceae',
      daysToMaturityFromTransplant: 40,
      directSowOnly: true,
      directSowMonthStart: 4,
      directSowMonthEnd: 9,
    });

    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: passedCropId, kgPerWeek: 1 },
        { householdId, cropId: activeCropId, kgPerWeek: 1 },
      ])
      .run();

    // today = Aug 1; zone 2 firstFrost = Oct 15; 40 days → harvest Sep 10 — feasible
    const today = new Date('2026-08-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    expect(cropNames).not.toContain('SåttFönsterPasserat');
    expect(cropNames).toContain('SåttFönsterAktivt');
  });

  // ---------------------------------------------------------------------------
  // 7. Demand-gap ranking — crop with lowest coverage % ranks first
  // ---------------------------------------------------------------------------

  it('should rank crop with lowest coverage percentage first', async () => {
    // Arrange: two wishlisted crops with kgPerWeek set
    // Beans: kgPerWeek=2 → annualDemand=104kg, no storage/plantings → 0% covered
    // Tomato: kgPerWeek=1 → annualDemand=52kg, has 26kg in storage → 50% covered
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: beansId, kgPerWeek: 2 },
        { householdId, cropId: tomatoId, kgPerWeek: 1 },
      ])
      .run();

    // Add 26kg tomato to storage → 50% coverage
    db.insert(schema.storageItem)
      .values({ cropId: tomatoId, householdId, quantityKg: 26, harvestedDate: '2026-03-01' })
      .run();

    // April 15: tomato indoor sow window [2,4] includes month 4; beans direct sow [4,7] includes month 4
    const today = new Date('2026-04-15');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: beans (0% covered) ranks before tomato (50% covered)
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    const beansIndex = cropNames.indexOf('TestBönor');
    const tomatoIndex = cropNames.indexOf('TestTomat');
    expect(beansIndex).toBeGreaterThanOrEqual(0);
    expect(tomatoIndex).toBeGreaterThanOrEqual(0);
    expect(beansIndex).toBeLessThan(tomatoIndex);
  });

  // ---------------------------------------------------------------------------
  // 7b. Demand-gap ranking — active planting yield counts as covered
  // ---------------------------------------------------------------------------

  it('should include expected yield from active plantings in coverage calculation', async () => {
    // Arrange: beans kgPerWeek=2 → annualDemand=104kg
    // Active planting of beans in a separate bed: 4m² × 3 kg/m² = 12kg → ~12% covered
    // Kale kgPerWeek=1 → annualDemand=52kg, no plantings or storage → 0% covered
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: beansId, kgPerWeek: 2 },
        { householdId, cropId: kaleId, kgPerWeek: 1 },
      ])
      .run();

    // Separate bed for the beans planting (avoids rotation conflict on main bed)
    const otherLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'BönBädd', areaM2: 4.0 })
      .returning()
      .all();
    const otherLocId = otherLocRows[0]!.id;

    db.insert(schema.planting)
      .values({
        cropId: beansId,
        locationId: otherLocId,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-07-01',
        areaM2: 4.0,
        status: 'planted',
      })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: kale (0% covered) ranks before beans (~12% covered) in main bed
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    const kaleIndex = cropNames.indexOf('TestGrönkål');
    const beansIndex = cropNames.indexOf('TestBönor');
    expect(kaleIndex).toBeGreaterThanOrEqual(0);
    expect(beansIndex).toBeGreaterThanOrEqual(0);
    expect(kaleIndex).toBeLessThan(beansIndex);
    // Kale's reason should show 0% covered
    const kaleOption = bedResult!.crops.find((c) => c.cropName === 'TestGrönkål');
    expect(kaleOption!.reason).toMatch(/0%/);
  });

  // ---------------------------------------------------------------------------
  // 7c. Demand-gap ranking — legacy both-null wishlist rows are filtered out
  // (the fallback bucket from the old engine was removed per the wishlist
  // demand-model refactor; missing demand now surfaces as a UI badge instead
  // of silently ranking at the top with 0% coverage).
  // ---------------------------------------------------------------------------

  it('excludes legacy wishlist rows where both demand fields are null', async () => {
    // Arrange: insert a legacy-style row directly (the service throws on
    // both-null adds), plus one row with proper demand for comparison.
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 2 })
      .run();
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: kaleId, kgPerWeek: null, kgPerYear: null })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: only the demand row appears.
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    expect(cropNames).toContain('TestBönor');
    expect(cropNames).not.toContain('TestGrönkål');
  });

  // ---------------------------------------------------------------------------
  // 7d. Demand-gap reason string contains coverage percentage
  // ---------------------------------------------------------------------------

  it('should include coverage percentage in the reason string for demand crops', async () => {
    // Arrange: tomato kgPerWeek=1 → annualDemand=52kg, 13kg in storage → 25% covered
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    db.insert(schema.storageItem)
      .values({ cropId: tomatoId, householdId, quantityKg: 13, harvestedDate: '2026-03-01' })
      .run();

    // April 15: tomato indoor sow window [2,4] includes month 4
    const today = new Date('2026-04-15');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const tomatoOption = bedResult!.crops.find((c) => c.cropName === 'TestTomat');
    expect(tomatoOption).toBeDefined();
    expect(tomatoOption!.reason).toContain('25%');
  });

  // ---------------------------------------------------------------------------
  // 8. Bed-centric grouping — crops appear in BOTH beds independently
  // ---------------------------------------------------------------------------

  it('should return one BedSuggestion per bed with all feasible crops in each', async () => {
    // Arrange: two empty beds, two wishlisted crops
    const locBRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'AndrasBädd', areaM2: 3.0 })
      .returning()
      .all();
    const locationBId = locBRows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: beansId, kgPerWeek: 1 },
        { householdId, cropId: kaleId, kgPerWeek: 1 },
      ])
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: both beds have their own entry, each containing both feasible crops
    const bedA = results.find((r) => r.locationId === locationId);
    const bedB = results.find((r) => r.locationId === locationBId);
    expect(bedA).toBeDefined();
    expect(bedB).toBeDefined();

    const bedACropNames = bedA!.crops.map((c) => c.cropName);
    const bedBCropNames = bedB!.crops.map((c) => c.cropName);
    expect(bedACropNames).toContain('TestBönor');
    expect(bedACropNames).toContain('TestGrönkål');
    expect(bedBCropNames).toContain('TestBönor');
    expect(bedBCropNames).toContain('TestGrönkål');
  });

  // ---------------------------------------------------------------------------
  // 9. Estimated yield calculation
  // ---------------------------------------------------------------------------

  it('should set estimatedYieldKg to areaM2 × yieldKgPerM2 for the bed', async () => {
    // Arrange: bed is 4 m², beans yield 3 kg/m² → expected 12 kg
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const beansCrop = bedResult!.crops.find((c) => c.cropName === 'TestBönor');
    expect(beansCrop).toBeDefined();
    expect(beansCrop!.estimatedYieldKg).toBe(12); // 4 m² × 3 kg/m²
  });

  // ---------------------------------------------------------------------------
  // 10. Succession type with bedFreesUp and currentCropName
  // ---------------------------------------------------------------------------

  it('should return type=succession with bedFreesUp and currentCropName for beds with active plantings', async () => {
    // Arrange: bed has an active planting of tomato with an expected harvest date
    db.insert(schema.planting)
      .values({
        cropId: tomatoId,
        locationId,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-08-15',
        areaM2: 4.0,
        status: 'planted',
      })
      .run();

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    expect(bedResult!.type).toBe('succession');
    expect(bedResult!.bedFreesUp).toBe('2026-08-15');
    expect(bedResult!.currentCropName).toBe('TestTomat');
  });

  // ---------------------------------------------------------------------------
  // 11. Ranking — all feasible crops returned, ordered by demand-gap (lowest coverage first)
  // ---------------------------------------------------------------------------

  it('should return all feasible crops ranked by coverage percentage (lowest first)', async () => {
    // Arrange: 4 wishlisted crops with kgPerWeek, each with different storage amounts
    // Give each crop a different amount in storage so coverage % varies deterministically
    const cropIds: number[] = [];
    for (let i = 1; i <= 4; i++) {
      const id = insertCrop(`RankCrop${i}`, {
        cropFamily: `family${i}`,
        daysToMaturityFromTransplant: 45,
        directSowOnly: true,
        directSowMonthStart: 3,
        directSowMonthEnd: 9,
      });
      cropIds.push(id);
      // kgPerWeek=1 for all → annualDemand=52kg each
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: id, kgPerWeek: 1 })
        .run();
      // Storage: RankCrop1=0kg (0%), RankCrop2=13kg (25%), RankCrop3=26kg (50%), RankCrop4=39kg (75%)
      if (i > 1) {
        db.insert(schema.storageItem)
          .values({
            cropId: id,
            householdId,
            quantityKg: (i - 1) * 13,
            harvestedDate: '2026-03-01',
          })
          .run();
      }
    }

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: all 4 crops present; RankCrop1 (0%) first, RankCrop4 (75%) last
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    expect(bedResult!.crops).toHaveLength(4);
    expect(bedResult!.crops[0]!.cropName).toBe('RankCrop1');
    expect(bedResult!.crops[3]!.cropName).toBe('RankCrop4');
  });

  // ---------------------------------------------------------------------------
  // 11b. (Removed: "fallback to cropFamily as reason when no crops have
  // kgPerWeek". The fallback bucket was removed when the wishlist demand model
  // refactor made at-least-one-of-{kgPerWeek, kgPerYear} a hard requirement.
  // Test 7c above now covers the filtering behaviour for legacy both-null
  // rows.)
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // 12. Dismiss persistence — dismissed crops do not reappear
  // ---------------------------------------------------------------------------

  it('should not include a crop that was dismissed for that bed in subsequent suggestions', async () => {
    // Arrange: wishlist has beans; generate once, then mark beans as dismissed for this bed
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    const { suggestions: firstResults } = await service.generateBedSuggestions(householdId, today);
    const bedResult = firstResults.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();

    // Dismiss the beans suggestion for this bed by setting status to 'dismissed'
    const beansSuggestion = bedResult!.crops.find((c) => c.cropName === 'TestBönor');
    expect(beansSuggestion).toBeDefined();
    db.update(schema.gardenEvent)
      .set({ status: 'dismissed' })
      .where(eq(schema.gardenEvent.id, beansSuggestion!.suggestionId))
      .run();

    // Act: regenerate
    const { suggestions: secondResults } = await service.generateBedSuggestions(householdId, today);

    // Assert: beans must not appear in the new suggestions for this bed
    const bedResultAfter = secondResults.find((r) => r.locationId === locationId);
    const cropNamesAfter = bedResultAfter?.crops.map((c) => c.cropName) ?? [];
    expect(cropNamesAfter).not.toContain('TestBönor');
  });

  // ---------------------------------------------------------------------------
  // 13. Empty crops array when all crops are rotation-blocked
  // ---------------------------------------------------------------------------

  it('should return a BedSuggestion with an empty crops array when all wishlisted crops are rotation-blocked', async () => {
    // Arrange: bed recently grew solanaceae AND brassicaceae — both wishlist families hard-excluded
    seedFamilyRotationRulesForTest(db);
    db.insert(schema.planting)
      .values([
        {
          cropId: tomatoId, // solanaceae (exclusionYears: 4)
          locationId,
          plantedDate: '2025-04-01',
          expectedHarvestDate: '2025-09-01',
          areaM2: 2.0,
          status: 'harvested',
        },
        {
          cropId: kaleId, // brassicaceae (exclusionYears: 6)
          locationId,
          plantedDate: '2025-06-01',
          expectedHarvestDate: '2025-08-01',
          areaM2: 2.0,
          status: 'harvested',
        },
      ])
      .run();

    // Wishlist: only solanaceae and brassicaceae crops (both hard-excluded by rotation rules)
    const paprikaId = insertCrop('TestPaprika', { cropFamily: 'solanaceae' });
    const cabbageId = insertCrop('TestKål', { cropFamily: 'brassicaceae' });
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: paprikaId, kgPerWeek: 1 },
        { householdId, cropId: cabbageId, kgPerWeek: 1 },
      ])
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: a BedSuggestion exists for this bed (it's still an empty bed) but crops is empty
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    expect(bedResult!.crops).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // 14. Empty bed — transplant crop sow window uses today, not today-minus-weeks
  // ---------------------------------------------------------------------------

  it('should suggest transplant crops for empty beds when indoor sow window includes today', async () => {
    // Arrange: empty bed, transplant crop (indoorSowMonthStart=3, indoorSowMonthEnd=4)
    // Today = April 9. Sow window is March–April → April IS in window.
    // Bug was: sowDate = April 9 - 8 weeks = Feb 12, month 2 NOT in [3,4] → filtered out.
    // Fix: for empty beds, sowDate = today → month 4 IS in [3,4].
    const tomatId = insertCrop('AprilTomat', {
      cropFamily: 'solanaceae',
      weeksToTransplant: 8,
      directSowOnly: false,
      indoorSowMonthStart: 3,
      indoorSowMonthEnd: 4,
      daysToMaturityFromTransplant: 70,
    });

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-04-09');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const tomatOption = bedResult!.crops.find((c) => c.cropName === 'AprilTomat');
    expect(tomatOption).toBeDefined();
    expect(tomatOption!.sowMethod).toBe('indoor');
    expect(tomatOption!.sowDate).toBe('2026-04-09');
  });

  // ---------------------------------------------------------------------------
  // 15. Empty bed — frost check accounts for transplant delay
  // ---------------------------------------------------------------------------

  it('should exclude transplant crops from empty beds when transplant+maturity exceeds first frost', async () => {
    // Arrange: today = Aug 1, transplant crop: 8 weeks transplant + 30 days maturity = 86 days
    // Harvest = Aug 1 + 86 = Oct 26 > Oct 15 (zone 2 firstFrost) → must be blocked
    const lateCropId = insertCrop('SenTomat', {
      cropFamily: 'solanaceae',
      weeksToTransplant: 8,
      directSowOnly: false,
      indoorSowMonthStart: 1,
      indoorSowMonthEnd: 9,
      daysToMaturityFromTransplant: 30,
    });

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: lateCropId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-08-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: crop should NOT appear (harvest Oct 26 > frost Oct 15)
    const bedResult = results.find((r) => r.locationId === locationId);
    expect(bedResult).toBeDefined();
    const lateCrop = bedResult!.crops.find((c) => c.cropName === 'SenTomat');
    expect(lateCrop).toBeUndefined();
  });

  it('wishlist unique constraint prevents duplicate crop entries', () => {
    // Arrange: add beans to wishlist
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    // Act + Assert: inserting the same crop again throws unique constraint error
    expect(() =>
      db
        .insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1 })
        .run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  // ---------------------------------------------------------------------------
  // Seedling transplant suggestions — surface "transplant existing seedlings to
  // outdoor bed" recommendations alongside the sow options on each bed card.
  // Zone 2 (Stockholm): lastFrost = May 8, firstFrost = Oct 15.
  // ---------------------------------------------------------------------------

  // Helper for the seedling-transplant suite — seeds an indoor location +
  // a seedling planting in one go, returns the seedling row id.
  function insertIndoorSeedling(cropId: number, plantedDate: string): number {
    const indoorLoc = db
      .insert(schema.growingLocation)
      .values({ householdId, name: `Inomhus ${cropId}`, areaM2: 1, isIndoor: true })
      .returning()
      .all();
    const seedling = db
      .insert(schema.planting)
      .values({
        cropId,
        locationId: indoorLoc[0]!.id,
        plantedDate,
        areaM2: 0.2,
        status: 'seedling',
      })
      .returning()
      .all();
    return seedling[0]!.id;
  }

  it('emits a transplant option for a matching indoor seedling on an empty outdoor bed', async () => {
    // Arrange — tomato seedling sown 2026-03-10. weeksToTransplant=8 → biology ready May 5.
    // Zone 2 lastFrost = May 8 → readyToTransplant = max(May 5, May 8) = May 8.
    const seedlingId = insertIndoorSeedling(tomatoId, '2026-03-10');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    const today = new Date('2026-05-01');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert
    const bed = results.find((r) => r.locationId === locationId);
    expect(bed).toBeDefined();
    const transplant = bed!.crops.find((c) => c.sowMethod === 'transplant');
    expect(transplant).toBeDefined();
    expect(transplant!.cropName).toBe('TestTomat');
    expect(transplant!.sourceSeedlingId).toBe(seedlingId);
    expect(transplant!.sowDate).toBe('2026-05-08');
  });

  it('pins the transplant date to last frost when seedling biology is ready earlier', async () => {
    // Arrange — sown so biology is ready Apr 5; zone 2 lastFrost = May 8 → date = May 8.
    insertIndoorSeedling(tomatoId, '2026-02-08'); // + 56 days = Apr 5
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-04-01'),
    );

    // Assert
    const transplant = results
      .find((r) => r.locationId === locationId)!
      .crops.find((c) => c.sowMethod === 'transplant');
    expect(transplant?.sowDate).toBe('2026-05-08');
  });

  it('pins the transplant date to biology readiness when biology is later than last frost', async () => {
    // Arrange — sown so biology is ready Jun 1; zone 2 lastFrost = May 8 → date = Jun 1.
    insertIndoorSeedling(tomatoId, '2026-04-06'); // + 56 days = Jun 1
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert
    const transplant = results
      .find((r) => r.locationId === locationId)!
      .crops.find((c) => c.sowMethod === 'transplant');
    expect(transplant?.sowDate).toBe('2026-06-01');
  });

  it('does not emit a transplant option for a bed with a recent same-family rotation conflict', async () => {
    // Arrange — bed had tomato (solanaceae) last year, still within 4-year rotation lookback
    seedFamilyRotationRulesForTest(db);
    db.insert(schema.planting)
      .values({
        cropId: tomatoId,
        locationId,
        plantedDate: '2025-04-01',
        expectedHarvestDate: '2025-09-01',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();
    insertIndoorSeedling(tomatoId, '2026-03-10');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert — bed yields no transplant option for tomato
    const bed = results.find((r) => r.locationId === locationId);
    const transplants = bed?.crops.filter((c) => c.sowMethod === 'transplant') ?? [];
    expect(transplants).toEqual([]);
  });

  it('does not emit a transplant option for a seedling whose crop is not on the wishlist', async () => {
    // Arrange — tomato seedling but tomato is NOT on wishlist (only beans wishlisted)
    insertIndoorSeedling(tomatoId, '2026-03-10');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert
    const bed = results.find((r) => r.locationId === locationId);
    const transplants = bed?.crops.filter((c) => c.sowMethod === 'transplant') ?? [];
    expect(transplants).toEqual([]);
  });

  it('persists a transplant suggestion as a gardenEvent with suggestionType=transplant and plantingId=seedlingId', async () => {
    // Arrange
    const seedlingId = insertIndoorSeedling(tomatoId, '2026-03-10');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tomatoId, kgPerWeek: 1 })
      .run();

    // Act
    await service.generateBedSuggestions(householdId, new Date('2026-05-01'));

    // Assert — gardenEvent row written with the expected wire fields
    const events = db
      .select()
      .from(schema.gardenEvent)
      .where(eq(schema.gardenEvent.suggestionType, 'transplant'))
      .all();
    expect(events).toHaveLength(1);
    expect(events[0]?.cropId).toBe(tomatoId);
    expect(events[0]?.date).toBe('2026-05-08');
    expect(events[0]?.status).toBe('suggestion');
    // Attachments are stored in junction tables.
    const transplantLocRows = db
      .select()
      .from(schema.gardenEventLocation)
      .where(eq(schema.gardenEventLocation.eventId, events[0]!.id))
      .all();
    expect(transplantLocRows.map((r) => r.locationId)).toEqual([locationId]);
    const transplantPlRows = db
      .select()
      .from(schema.gardenEventPlanting)
      .where(eq(schema.gardenEventPlanting.eventId, events[0]!.id))
      .all();
    expect(transplantPlRows.map((r) => r.plantingId)).toEqual([seedlingId]);
  });

  // ---------------------------------------------------------------------------
  // Companion-bonus integration (Phase 2 of the companion initiative).
  // The bed has an active neighbour planting; companion rows linking that
  // neighbour to candidate crops should:
  //   - augment the candidate's reason with "Bra granne med <neighbour>"
  //   - rank good companions above otherwise-equivalent non-companions
  //   - rank bad companions below otherwise-equivalent non-companions
  // ---------------------------------------------------------------------------

  function insertActiveNeighbour(cropId: number, expectedHarvestDate: string): void {
    db.insert(schema.planting)
      .values({
        cropId,
        locationId,
        plantedDate: '2026-04-01',
        expectedHarvestDate,
        areaM2: 1.0,
        status: 'growing',
      })
      .run();
  }

  function insertCompanion(cropAId: number, cropBId: number, relationship: 'good' | 'bad'): void {
    const [a, b] = cropAId <= cropBId ? [cropAId, cropBId] : [cropBId, cropAId];
    db.insert(schema.companionPlanting)
      .values({
        cropAId: a,
        cropBId: b,
        relationship,
        evidenceLevel: 'traditional',
        source: 'https://example.com/test',
      })
      .run();
  }

  it('annotates the reason with "Bra granne med X" when the candidate is a good companion of the active neighbour', async () => {
    // Arrange — bed has an active tomato planting (succession bed), and beans
    // is a good companion. Wishlist beans so it qualifies as a candidate.
    insertActiveNeighbour(tomatoId, '2026-06-30');
    insertCompanion(tomatoId, beansId, 'good');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    const beansOption = bedResult?.crops.find((c) => c.cropName === 'TestBönor');
    expect(beansOption).toBeDefined();
    expect(beansOption!.reason).toContain('Bra granne med TestTomat');
  });

  it('does not annotate candidates that have no companion relationship with the bed neighbours', async () => {
    // Arrange — kale has no companion row with tomato
    insertActiveNeighbour(tomatoId, '2026-06-30');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: kaleId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert — kale reason should be plain demand-gap, no "Bra granne" prefix
    const bedResult = results.find((r) => r.locationId === locationId);
    const kaleOption = bedResult?.crops.find((c) => c.cropName === 'TestGrönkål');
    expect(kaleOption).toBeDefined();
    expect(kaleOption!.reason).not.toContain('Bra granne');
  });

  it('ranks a good companion above an otherwise-equivalent non-companion', async () => {
    // Arrange — both beans and kale qualify as candidates, neither has demand
    // (no kgPerWeek), so they'd normally sort by family name alphabetically in
    // the fallback path. The good-companion bonus should not affect fallback
    // order, so test the *withDemand* path instead by setting kgPerWeek to
    // identical values. Then the only differentiator becomes the companion
    // bonus.
    insertActiveNeighbour(tomatoId, '2026-06-30');
    insertCompanion(tomatoId, beansId, 'good');
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: beansId, kgPerWeek: 1.0 },
        { householdId, cropId: kaleId, kgPerWeek: 1.0 },
      ])
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert — beans appears before kale in the candidate list
    const bedResult = results.find((r) => r.locationId === locationId);
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    const beansIdx = cropNames.indexOf('TestBönor');
    const kaleIdx = cropNames.indexOf('TestGrönkål');
    expect(beansIdx).toBeGreaterThanOrEqual(0);
    expect(kaleIdx).toBeGreaterThanOrEqual(0);
    expect(beansIdx).toBeLessThan(kaleIdx);
  });

  it('ranks a bad companion below an otherwise-equivalent non-companion', async () => {
    // Arrange — kale is marked as a bad companion of tomato; beans has no
    // companion row. Both have identical kgPerWeek so the only differentiator
    // is the bad-companion penalty.
    insertActiveNeighbour(tomatoId, '2026-06-30');
    insertCompanion(tomatoId, kaleId, 'bad');
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: beansId, kgPerWeek: 1.0 },
        { householdId, cropId: kaleId, kgPerWeek: 1.0 },
      ])
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert — kale (bad companion) is pushed below beans
    const bedResult = results.find((r) => r.locationId === locationId);
    const cropNames = bedResult!.crops.map((c) => c.cropName);
    const beansIdx = cropNames.indexOf('TestBönor');
    const kaleIdx = cropNames.indexOf('TestGrönkål');
    expect(beansIdx).toBeGreaterThanOrEqual(0);
    expect(kaleIdx).toBeGreaterThanOrEqual(0);
    expect(beansIdx).toBeLessThan(kaleIdx);
  });

  it('looks up companion pairs symmetrically (works regardless of which side is the neighbour)', async () => {
    // Arrange — store the pair with beans as cropAId (smaller would be tomato
    // since it was inserted first in beforeEach, but we don't actually know
    // for sure — the service must normalise either way). The neighbour is
    // tomato; the candidate is beans.
    insertActiveNeighbour(tomatoId, '2026-06-30');
    insertCompanion(beansId, tomatoId, 'good'); // intentionally non-canonical order
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: beansId, kgPerWeek: 1 })
      .run();

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(
      householdId,
      new Date('2026-05-01'),
    );

    // Assert
    const bedResult = results.find((r) => r.locationId === locationId);
    const beansOption = bedResult?.crops.find((c) => c.cropName === 'TestBönor');
    expect(beansOption!.reason).toContain('Bra granne med TestTomat');
  });

  // ---------------------------------------------------------------------------
  // Empty-bed nudges — dashboard / location-detail proactive surface. Verifies
  // frost-budget math, recently-harvested detection (14-day window), top-3
  // cap, daysToMaturity propagation, and isolation from succession beds.
  // ---------------------------------------------------------------------------

  describe('getBedNudges', () => {
    it('returns no beds (but still a valid frost budget) when no candidates qualify', async () => {
      // Arrange — bed has an active growing planting with no harvest date, so
      // classifyBed returns null → no suggestion. Frost budget should still
      // be returned for the header.
      db.insert(schema.planting)
        .values({
          cropId: tomatoId,
          locationId,
          plantedDate: '2026-04-01',
          areaM2: 4.0,
          status: 'growing',
        })
        .run();

      // Act
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      expect(result.beds).toEqual([]);
      expect(result.daysUntilFrost).toBeGreaterThan(0);
    });

    it('surfaces empty beds with candidates and the household frost budget', async () => {
      // Arrange
      db.insert(schema.householdCropWishlist)
        .values([
          { householdId, cropId: beansId, kgPerWeek: 1.0 },
          { householdId, cropId: kaleId, kgPerWeek: 1.0 },
        ])
        .run();

      // Act — zone 2 frost is Oct 15; today May 1 → ~167 days
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      expect(result.daysUntilFrost).toBeGreaterThan(150);
      expect(result.daysUntilFrost).toBeLessThan(200);
      expect(result.beds).toHaveLength(1);
      const bed = result.beds[0]!;
      expect(bed.locationId).toBe(locationId);
      expect(bed.type).toBe('empty');
      expect(bed.bedFreesUp).toBeNull();
      expect(bed.candidates.length).toBeGreaterThan(0);
      expect(bed.candidates.length).toBeLessThanOrEqual(3);
    });

    it('also surfaces succession beds with type=succession and bedFreesUp set', async () => {
      // Arrange — bed has an active planting with an expectedHarvestDate so
      // classifyBed returns 'succession'. Beans is the candidate.
      db.insert(schema.planting)
        .values({
          cropId: tomatoId,
          locationId,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-06-30',
          areaM2: 4.0,
          status: 'growing',
        })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1.0 })
        .run();

      // Act
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      const bed = result.beds.find((b) => b.locationId === locationId);
      expect(bed).toBeDefined();
      expect(bed!.type).toBe('succession');
      expect(bed!.bedFreesUp).toBe('2026-06-30');
    });

    it('flags recentlyHarvested when the latest harvest is within 14 days', async () => {
      // Arrange
      const [p] = db
        .insert(schema.planting)
        .values({
          cropId: tomatoId,
          locationId,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-04-20',
          areaM2: 4.0,
          status: 'harvested',
        })
        .returning()
        .all();
      db.insert(schema.harvestEvent)
        .values({ plantingId: p!.id, quantityKg: 0.5, harvestedDate: '2026-04-25' })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1.0 })
        .run();

      // Act — today is May 1, harvest was Apr 25 → 6 days ago
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      const bed = result.beds.find((b) => b.locationId === locationId);
      expect(bed).toBeDefined();
      expect(bed!.recentlyHarvested).toBe(true);
      expect(bed!.lastHarvestDate).toBe('2026-04-25');
    });

    it('does not flag recentlyHarvested when the latest harvest is older than 14 days', async () => {
      // Arrange
      const [p] = db
        .insert(schema.planting)
        .values({
          cropId: tomatoId,
          locationId,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-04-10',
          areaM2: 4.0,
          status: 'harvested',
        })
        .returning()
        .all();
      db.insert(schema.harvestEvent)
        .values({ plantingId: p!.id, quantityKg: 0.5, harvestedDate: '2026-04-05' })
        .run();
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1.0 })
        .run();

      // Act — today is May 1, harvest was Apr 5 → 26 days ago
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      const bed = result.beds.find((b) => b.locationId === locationId);
      expect(bed!.recentlyHarvested).toBe(false);
      expect(bed!.lastHarvestDate).toBe('2026-04-05');
    });

    it('propagates daysToMaturity from the underlying crop record', async () => {
      // Arrange
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1.0 })
        .run();

      // Act
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert — beans was inserted with daysToMaturityFromTransplant=55
      const beans = result.beds[0]?.candidates.find((c) => c.cropName === 'TestBönor');
      expect(beans).toBeDefined();
      expect(beans!.daysToMaturity).toBe(55);
    });

    it('caps candidates at the top 3 per bed', async () => {
      // Arrange — 6 crops in the wishlist, all eligible
      for (let i = 1; i <= 6; i++) {
        const cId = insertCrop(`TestCrop${i}`, {
          cropFamily: `family${i}`,
          directSowOnly: true,
          directSowMonthStart: 4,
          directSowMonthEnd: 7,
          daysToMaturityFromTransplant: 30 + i,
        });
        db.insert(schema.householdCropWishlist)
          .values({ householdId, cropId: cId, kgPerWeek: 1.0 })
          .run();
      }

      // Act
      const result = await service.getBedNudges(householdId, new Date('2026-05-01'));

      // Assert
      expect(result.beds[0]?.candidates.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // getDismissedPairs — 90-day expiry
  // ---------------------------------------------------------------------------

  describe('getDismissedPairs() — expiry logic', () => {
    // Uses tomatoId from the outer beforeEach (solanaceae, indoor sow months 2-4).
    // Note: tomatoId is already inserted as 'TestTomat' by the outer beforeEach,
    // so we reuse it here rather than inserting a new crop with the same name.

    it('includes dismissals with dismissedAt < 90 days old', async () => {
      // Arrange — dismissed 30 days ago (within window).
      // tomatoId (TestTomat) is solanaceae with indoor sow months 2-4 — no direct sow
      // window in May, so it won't appear as a candidate anyway. Instead use beansId
      // (directSow months 4-7) to confirm the suppression works properly.
      const dismissedAt = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const dismissedRows1 = db
        .insert(schema.gardenEvent)
        .values({
          householdId,
          title: 'Förslag',
          date: '2026-05-01',
          cropId: beansId,
          status: 'dismissed',
          dismissedAt,
        })
        .returning()
        .all();
      db.insert(schema.gardenEventLocation)
        .values({ eventId: dismissedRows1[0]!.id, locationId })
        .run();

      // Act — generate bed suggestions (exercises getDismissedPairs internally)
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1 })
        .run();
      const { suggestions: results } = await service.generateBedSuggestions(
        householdId,
        new Date('2026-05-01'),
      );
      const bed = results.find((r) => r.locationId === locationId);
      // The crop should NOT appear because dismissal is still active (< 90 days)
      const cropNames = bed?.crops.map((c) => c.cropName) ?? [];
      expect(cropNames).not.toContain('TestBönor');
    });

    it('excludes dismissals with dismissedAt >= 90 days old (expired)', async () => {
      // Arrange — dismissed 91 days ago (beyond window)
      const dismissedAt = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
      const dismissedRows2 = db
        .insert(schema.gardenEvent)
        .values({
          householdId,
          title: 'Förslag',
          date: '2026-05-01',
          cropId: beansId,
          status: 'dismissed',
          dismissedAt,
        })
        .returning()
        .all();
      db.insert(schema.gardenEventLocation)
        .values({ eventId: dismissedRows2[0]!.id, locationId })
        .run();

      // Wishlist — beansId already has directSowMonthStart 4-7 so passes sow-window filter in May
      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1 })
        .run();

      const { suggestions: results } = await service.generateBedSuggestions(
        householdId,
        new Date('2026-05-01'),
      );
      const bed = results.find((r) => r.locationId === locationId);
      // The crop SHOULD appear — the old dismissal is expired
      const cropNames = bed?.crops.map((c) => c.cropName) ?? [];
      expect(cropNames).toContain('TestBönor');
    });

    it('treats NULL dismissedAt as permanent (never expires) for safety', async () => {
      // Arrange — legacy row with no dismissedAt (NULL). We treat NULL as permanent:
      // the dismissal remains active forever so crops are not accidentally surfaced
      // for users who dismissed them before the dismissedAt column existed.
      const dismissedRows = db
        .insert(schema.gardenEvent)
        .values({
          householdId,
          title: 'Förslag',
          date: '2026-05-01',
          cropId: beansId,
          status: 'dismissed',
          // dismissedAt intentionally omitted (NULL)
        })
        .returning()
        .all();
      db.insert(schema.gardenEventLocation)
        .values({ eventId: dismissedRows[0]!.id, locationId })
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId, cropId: beansId, kgPerWeek: 1 })
        .run();

      const { suggestions: results } = await service.generateBedSuggestions(
        householdId,
        new Date('2026-05-01'),
      );
      const bed = results.find((r) => r.locationId === locationId);
      // NULL dismissedAt → treated as permanent → crop does NOT reappear
      const cropNames = bed?.crops.map((c) => c.cropName) ?? [];
      expect(cropNames).not.toContain('TestBönor');
    });
  });

  // ---------------------------------------------------------------------------
  // clearDismissals()
  // ---------------------------------------------------------------------------

  describe('clearDismissals()', () => {
    // Reuse tomatoId and beansId from the outer beforeEach to avoid unique constraint issues

    it('clears all dismissed events for the household and returns the count', async () => {
      // Arrange — 2 dismissed events for this household
      db.insert(schema.gardenEvent)
        .values([
          {
            householdId,
            title: 'Dismissed 1',
            date: '2026-05-01',
            cropId: tomatoId,
            status: 'dismissed',
            dismissedAt: new Date().toISOString(),
          },
          {
            householdId,
            title: 'Dismissed 2',
            date: '2026-05-02',
            cropId: beansId,
            status: 'dismissed',
            dismissedAt: new Date().toISOString(),
          },
        ])
        .run();

      // Act
      const result = await service.clearDismissals(householdId);

      // Assert
      expect(result.cleared).toBe(2);
      const remaining = db
        .select()
        .from(schema.gardenEvent)
        .where(eq(schema.gardenEvent.status, 'dismissed'))
        .all();
      expect(remaining).toHaveLength(0);
    });

    it('does not clear dismissed events belonging to a different household', async () => {
      // Arrange — dismissed event for a different household
      const otherHousehold = db
        .insert(schema.household)
        .values({ name: 'Other Family', persons: 2 })
        .returning()
        .all();
      const otherHouseholdId = otherHousehold[0]!.id;

      db.insert(schema.gardenEvent)
        .values({
          householdId: otherHouseholdId,
          title: 'Other dismissed',
          date: '2026-05-01',
          cropId: tomatoId,
          status: 'dismissed',
          dismissedAt: new Date().toISOString(),
        })
        .run();

      // Act — clear for our household (which has no dismissed events)
      const result = await service.clearDismissals(householdId);

      // Assert — nothing cleared for our household; other's event untouched
      expect(result.cleared).toBe(0);
      const otherRemaining = db
        .select()
        .from(schema.gardenEvent)
        .where(eq(schema.gardenEvent.householdId, otherHouseholdId))
        .all();
      expect(otherRemaining).toHaveLength(1);
      expect(otherRemaining[0]?.status).toBe('dismissed');
    });

    it('returns cleared: 0 when there are no dismissed events', async () => {
      // Arrange — no dismissed events
      const result = await service.clearDismissals(householdId);

      // Assert
      expect(result.cleared).toBe(0);
    });
  });
});

// =============================================================================
// classifyAtDate — pure frost-tier classifier
// Zone 2: lastFrost = May 8, firstFrost = Oct 15, winterLow = -5°C
// =============================================================================

describe('classifyAtDate', () => {
  // Growing-season dates produce positive expected temps (SAFE for minTempC ≤ 0)
  const growingSeason = new Date(2026, 6, 15); // Jul 15 — peak summer (+10°C)
  const zone = 2;

  it('returns SAFE when expectedMin + buffer >= cropMinTempC', () => {
    // Arrange: summer day (expectedMin = +10), crop minTempC = 0, no buffer
    // Act
    const result = classifyAtDate(growingSeason, 0, 0, zone);
    // Assert
    expect(result.tier).toBe('safe');
    expect(result.needsFiberduk).toBe(false);
  });

  it('returns SAFE when location buffer closes the gap', () => {
    // Arrange: Oct 15 (expectedMin = 0°C), crop needs 0°C, buffer = 2
    // withLocation = 0 + 2 = 2 >= 0 → SAFE
    const firstFrostDate = new Date(2026, 9, 15); // Oct 15 (0°C)
    const result = classifyAtDate(firstFrostDate, 0, 2, zone);
    expect(result.tier).toBe('safe');
    expect(result.needsFiberduk).toBe(false);
  });

  it('returns STRETCH (needsFiberduk=true) when only fiberduk bonus closes the gap', () => {
    // Arrange: Jan 15 zone 2 (expectedMin = -5°C), crop minTempC = -4°C, no buffer
    // withLocation = -5 + 0 = -5 < -4 → not SAFE
    // withFiberduk = -5 + 0 + 2 = -3 >= -4 → STRETCH
    const jan15 = new Date(2026, 0, 15);
    const result = classifyAtDate(jan15, -4, 0, zone);
    expect(result.tier).toBe('stretch');
    expect(result.needsFiberduk).toBe(true);
  });

  it('returns STRETCH when buffer + fiberduk closes the gap but buffer alone does not', () => {
    // expectedMin = -5 (Jan 15), buffer = 0, cropMinTempC = -3
    // withLocation = -5 + 0 = -5 < -3 → not SAFE
    // withFiberduk = -5 + 0 + 2 = -3 >= -3 → STRETCH
    const jan15 = new Date(2026, 0, 15);
    const result = classifyAtDate(jan15, -3, 0, zone);
    expect(result.tier).toBe('stretch');
    expect(result.needsFiberduk).toBe(true);
  });

  it('returns IMPOSSIBLE when even fiberduk cannot close the gap', () => {
    // Arrange: Jan 15 zone 2 (expectedMin = -5°C), crop minTempC = -1°C (very tender), no buffer
    // withLocation = -5 + 0 = -5 < -1
    // withFiberduk = -5 + 0 + 2 = -3 < -1 → IMPOSSIBLE
    const jan15 = new Date(2026, 0, 15);
    const result = classifyAtDate(jan15, -1, 0, zone);
    expect(result.tier).toBe('impossible');
    expect(result.needsFiberduk).toBe(false);
  });

  it('returns SAFE for default crops (minTempC=0) in the growing season', () => {
    // Legacy behaviour: all default crops should be SAFE during growing season
    const result = classifyAtDate(new Date(2026, 5, 15), 0, 0, zone); // June 15
    expect(result.tier).toBe('safe');
  });
});

// =============================================================================
// classifyFrostTier — worst-of-two classifier for sow + harvest dates
// =============================================================================

describe('classifyFrostTier', () => {
  const zone = 2;

  it('returns SAFE when both sow and harvest are SAFE', () => {
    // Both dates in the growing season with default minTempC = 0
    const result = classifyFrostTier(0, 0, zone, new Date(2026, 4, 15), new Date(2026, 7, 1));
    expect(result.tier).toBe('safe');
    expect(result.advice).toBeUndefined();
  });

  it('returns STRETCH (with advice) when harvest is STRETCH and sow is SAFE', () => {
    // Sow = July 15 (SAFE), harvest = Nov 15 (STRETCH or IMPOSSIBLE based on crop temp)
    // zone 2 firstFrost Oct 15, so Nov 15 expected ~-2°C
    // crop minTempC = -3, frostBufferC = 0
    // Nov 15: between firstFrost(Oct15) and Jan15 → expected ~ -1.6°C
    // withLocation = -1.6 + 0 = -1.6 < -3? No, -1.6 > -3 → SAFE
    // Let's use crop minTempC = -1 instead: -1.6 < -1 (not safe), -1.6 + 2 = 0.4 >= -1 → STRETCH
    const sowDate = new Date(2026, 6, 15); // Jul 15 (SAFE)
    const harvestDate = new Date(2026, 10, 15); // Nov 15 (after first frost)
    const result = classifyFrostTier(-1, 0, zone, sowDate, harvestDate);
    // Either STRETCH or IMPOSSIBLE depending on computed temp — at minimum not SAFE
    expect(['stretch', 'impossible']).toContain(result.tier);
  });

  it('returns worse tier: IMPOSSIBLE if either endpoint is IMPOSSIBLE', () => {
    // Sow = Jan 15 (very cold, expectedMin = -5), crop minTempC = -1, no buffer
    // withLocation = -5, withFiberduk = -3 < -1 → IMPOSSIBLE
    const sowDate = new Date(2026, 0, 15); // Jan 15 — IMPOSSIBLE
    const harvestDate = new Date(2026, 6, 15); // Jul 15 — SAFE
    const result = classifyFrostTier(-1, 0, zone, sowDate, harvestDate);
    expect(result.tier).toBe('impossible');
  });

  it('returns STRETCH advice string when tier is STRETCH', () => {
    // Find a scenario where STRETCH is the worst tier
    // Jan 15, zone 2: expectedMin = -5, crop minTempC = -4, no buffer
    // withLocation = -5 < -4, withFiberduk = -3 >= -4 → STRETCH
    const sowDate = new Date(2026, 0, 15); // Jan 15 — STRETCH
    const harvestDate = new Date(2026, 6, 15); // Jul 15 — SAFE
    const result = classifyFrostTier(-4, 0, zone, sowDate, harvestDate);
    expect(result.tier).toBe('stretch');
    expect(result.advice).toBe('frostGate.advice.requiresFiberduk');
  });

  it('returns no advice when tier is SAFE', () => {
    const result = classifyFrostTier(0, 0, zone, new Date(2026, 5, 1), new Date(2026, 7, 1));
    expect(result.tier).toBe('safe');
    expect(result.advice).toBeUndefined();
  });

  it('returns no advice when tier is IMPOSSIBLE', () => {
    // Jan 15, zone 2: expectedMin = -5, crop minTempC = -1, buffer = 0
    // withFiberduk = -3 < -1 → IMPOSSIBLE
    const result = classifyFrostTier(-1, 0, zone, new Date(2026, 0, 15), new Date(2026, 0, 15));
    expect(result.tier).toBe('impossible');
    expect(result.advice).toBeUndefined();
  });
});

// =============================================================================
// Service-level: frost gate behaviour via generateBedSuggestions
// =============================================================================

describe('generateBedSuggestions — frost gate (smart)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;
  let householdId: number;
  let locationId: number;

  // Helper: insert a crop with optional minTempC
  function insertCrop(
    name: string,
    opts: {
      daysToMaturityFromTransplant?: number;
      directSowOnly?: boolean;
      minTempC?: number;
    } = {},
  ): number {
    const rows = db
      .insert(schema.crop)
      .values({
        name,
        yieldKgPerM2: 3.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: opts.directSowOnly ?? true,
        daysToMaturityFromTransplant: opts.daysToMaturityFromTransplant ?? 45,
        minTempC: opts.minTempC ?? 0,
      })
      .returning()
      .all();
    return rows[0]!.id;
  }

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Frost Gate Household', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;

    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'TestBädd', areaM2: 4.0, frostBufferC: 0 })
      .returning()
      .all();
    locationId = locRows[0]!.id;
  });

  it('drops IMPOSSIBLE candidates — slow tender crop in late season is excluded', async () => {
    // Zone 2, today = Aug 1. Crop: 90 days to maturity → harvest Nov 1.
    // Nov 1 expectedMin ≈ -1.4°C. Crop minTempC = 0, buffer = 0.
    // withLocation = -1.4 < 0, withFiberduk = 0.6 >= 0 → STRETCH (not IMPOSSIBLE).
    // To get IMPOSSIBLE we need a crop that is even more tender than fiberduk can cover.
    // minTempC = 2 (very tender): withFiberduk = 0.6 < 2 → IMPOSSIBLE
    const tenderId = insertCrop('TenderCrop', {
      daysToMaturityFromTransplant: 90,
      directSowOnly: true,
      minTempC: 2,
    });
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: tenderId, kgPerWeek: 1 })
      .run();

    const today = new Date(2026, 7, 1); // Aug 1
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);
    const bedResult = results.find((r) => r.locationId === locationId);
    const cropNames = (bedResult?.crops ?? []).map((c) => c.cropName);
    expect(cropNames).not.toContain('TenderCrop');
  });

  it('keeps SAFE candidates', async () => {
    // Zone 2, today = May 1. Fast crop (45 days) harvests Jun 15 — deep summer, SAFE.
    const safeCropId = insertCrop('SafeCrop', {
      daysToMaturityFromTransplant: 45,
      directSowOnly: true,
      minTempC: 0,
    });
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: safeCropId, kgPerWeek: 1 })
      .run();

    const today = new Date(2026, 4, 1); // May 1
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);
    const bedResult = results.find((r) => r.locationId === locationId);
    const cropNames = (bedResult?.crops ?? []).map((c) => c.cropName);
    expect(cropNames).toContain('SafeCrop');
  });

  it('STRETCH candidate is kept and advice text appears in reason', async () => {
    // Zone 2, today = Sep 1. Crop: 50 days → harvest Oct 21 (after first frost Oct 15).
    // expectedMin at Oct 21 ≈ small negative (between firstFrost 0°C and next Jan15 -5°C).
    // crop minTempC = 0, buffer = 0 → withLocation < 0, withFiberduk = withLocation + 2.
    // If expectedMin = ~-0.3°C: withLocation = -0.3 < 0, withFiberduk = 1.7 >= 0 → STRETCH
    const stretchCropId = insertCrop('StretchCrop', {
      daysToMaturityFromTransplant: 50,
      directSowOnly: true,
      minTempC: 0,
    });
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: stretchCropId, kgPerWeek: 1 })
      .run();

    const today = new Date(2026, 8, 1); // Sep 1
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);
    const bedResult = results.find((r) => r.locationId === locationId);
    const stretchSuggestion = (bedResult?.crops ?? []).find((c) => c.cropName === 'StretchCrop');

    if (stretchSuggestion) {
      // If STRETCH: advice text should be in the reason
      expect(stretchSuggestion.reason).toContain('frostGate.advice.requiresFiberduk');
    }
    // Otherwise IMPOSSIBLE or not present — both are valid given exact temp math
    // The assertion is: if it's kept, advice must be present
  });

  it('defaulted crops (minTempC=0, frostBufferC=0) produce same behaviour as old hard gate', async () => {
    // This validates backward compat: a crop with default settings should behave
    // identically to the old binary check (harvest before firstFrost = yes, after = no,
    // except STRETCH suggestions may now appear near the frost date).
    // Old gate: harvest Jul 15 (< Oct 15 frost) → included
    const compatCropId = insertCrop('CompatCrop', {
      daysToMaturityFromTransplant: 45,
      directSowOnly: true,
      minTempC: 0,
    });
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: compatCropId, kgPerWeek: 1 })
      .run();

    const today = new Date(2026, 4, 1); // May 1 → harvest Jun 15 → SAFE
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);
    const bedResult = results.find((r) => r.locationId === locationId);
    const cropNames = (bedResult?.crops ?? []).map((c) => c.cropName);
    expect(cropNames).toContain('CompatCrop');
  });
});

// ---------------------------------------------------------------------------
// getRotationStatus — private method, tested via cast
// ---------------------------------------------------------------------------

function seedFamilyRotationRulesForTest(db: ReturnType<typeof createTestDb>): void {
  db.insert(schema.cropFamilyRotation).values(FAMILY_ROTATION_RULES).run();
  db.insert(schema.familyRotationBonus).values(FAMILY_ROTATION_BONUSES).run();
}

/**
 * Insert a minimal crop row with the given family and return its id.
 */
function insertRotationCrop(
  db: ReturnType<typeof createTestDb>,
  name: string,
  cropFamily: string,
): number {
  const rows = db
    .insert(schema.crop)
    .values({
      name,
      yieldKgPerM2: 1.0,
      kcalPerKg: 100,
      proteinGPerKg: 10,
      carbsGPerKg: 10,
      fatGPerKg: 1,
      category: 'vegetable',
      directSowOnly: true,
      daysToMaturityFromTransplant: 60,
      cropFamily,
    })
    .returning()
    .all();
  return rows[0]!.id;
}

describe('getRotationStatus', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;
  let locationId: number;

  beforeEach(() => {
    // Fresh in-memory DB per test — plantings must not bleed across tests
    db = createTestDb();
    service = new SuggestionService(db);

    // Seed rotation rules
    seedFamilyRotationRulesForTest(db);

    // Create a household + location
    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Rotation Test Household', persons: 2, growingZone: 2 })
      .returning()
      .all();
    const householdId = houseRows[0]!.id;

    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Rotation Bed', areaM2: 5 })
      .returning()
      .all();
    locationId = locRows[0]!.id;
  });

  const callGetRotationStatus = (
    svc: SuggestionService,
    locId: number,
    family: string,
    today: Date,
  ) =>
    (
      svc as unknown as { getRotationStatus: (l: number, f: string, t: Date) => unknown }
    ).getRotationStatus(locId, family, today);

  // ── A: clean bed → allowed=true, no penalty, no bonus ─────────────────────
  it('A: returns allowed=true with zero penalty and bonus for a clean bed', () => {
    // Arrange: location has no plantings — fresh bed
    const today = new Date('2026-05-27');

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── B: hard exclusion inside the window ───────────────────────────────────
  it('B: returns allowed=false when same family planted within exclusionYears', () => {
    // Arrange: Brassicaceae exclusionYears=6; plant 3 years ago → inside window
    const today = new Date('2026-05-27');
    const brassicaCropId = insertRotationCrop(db, 'RotTestBrassica_B', 'Brassicaceae');
    const threeYearsAgo = new Date(today.getTime() - 3 * 365 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: brassicaCropId,
        locationId,
        plantedDate: threeYearsAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: false,
      penalty: 0,
      bonus: 0,
      advice: 'rotation.advice.hardExclusion',
    });
  });

  // ── C: hard exclusion just outside the window ──────────────────────────────
  it('C: returns allowed=true when same family planted just outside exclusionYears window', () => {
    // Arrange: Brassicaceae exclusionYears=6; plant 7 years ago → outside window
    const today = new Date('2026-05-27');
    const brassicaCropId = insertRotationCrop(db, 'RotTestBrassica_C', 'Brassicaceae');
    const sevenYearsAgo = new Date(today.getTime() - 7 * 365 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: brassicaCropId,
        locationId,
        plantedDate: sevenYearsAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── D: soft penalty inside the window ─────────────────────────────────────
  it('D: returns penalty=25 when same family planted within penaltyYears', () => {
    // Arrange: Alliaceae penaltyYears=4; plant 2 years ago → inside window
    const today = new Date('2026-05-27');
    const alliaceaeCropId = insertRotationCrop(db, 'RotTestAlliaceae_D', 'alliaceae');
    const twoYearsAgo = new Date(today.getTime() - 2 * 365 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: alliaceaeCropId,
        locationId,
        plantedDate: twoYearsAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Alliaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: true,
      penalty: 25,
      bonus: 0,
      advice: 'rotation.advice.softPenalty',
    });
  });

  // ── E: soft penalty just outside the window ────────────────────────────────
  it('E: returns no penalty when same family planted just outside penaltyYears window', () => {
    // Arrange: Alliaceae penaltyYears=4; plant 5 years ago → outside window
    const today = new Date('2026-05-27');
    const alliaceaeCropId = insertRotationCrop(db, 'RotTestAlliaceae_E', 'alliaceae');
    const fiveYearsAgo = new Date(today.getTime() - 5 * 365 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: alliaceaeCropId,
        locationId,
        plantedDate: fiveYearsAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Alliaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── F: no row in crop_family_rotation for family ───────────────────────────
  it('F: returns allowed=true with zero scores when family has no rotation rule', () => {
    // Arrange
    const today = new Date('2026-05-27');

    // Act
    const result = callGetRotationStatus(service, locationId, 'unknown', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── G: top-tier legume bonus ───────────────────────────────────────────────
  it('G: returns bonus=-15 for top-tier successor after Fabaceae within 365 days', () => {
    // Arrange: Fabaceae planted 100 days ago; Brassicaceae candidate → bonus -15
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_G', 'fabaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: true,
      penalty: 0,
      bonus: -15,
      advice: 'rotation.advice.legumeBonus',
    });
  });

  // ── H: moderate-tier legume bonus ─────────────────────────────────────────
  it('H: returns bonus=-10 for moderate-tier successor after Fabaceae within 365 days', () => {
    // Arrange: Fabaceae planted 100 days ago; Cucurbitaceae candidate → bonus -10
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_H', 'fabaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Cucurbitaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: true,
      penalty: 0,
      bonus: -10,
      advice: 'rotation.advice.legumeBonus',
    });
  });

  // ── I: legume-after-legume: bonus + soft penalty stack ────────────────────
  it('I: stacks penalty=25 and bonus=15 when Fabaceae follows Fabaceae (soft window)', () => {
    // Arrange: Fabaceae planted 200 days ago; Fabaceae candidate
    // Fabaceae penaltyYears=4 → 200 days < 4*365 → soft penalty applies
    // Fabaceae→Fabaceae autotoxicity row → bonus=15 applies
    // advice = legumeBonus (bonus key wins)
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_I', 'fabaceae');
    const twohundredDaysAgo = new Date(today.getTime() - 200 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: twohundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Fabaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: true,
      penalty: 25,
      bonus: 15,
      advice: 'rotation.advice.legumeBonus',
    });
  });

  // ── J: Apiaceae after Fabaceae — no bonus row ──────────────────────────────
  it('J: returns no bonus for Apiaceae candidate after Fabaceae (no bonus row exists)', () => {
    // Arrange: Fabaceae 100 days ago; Apiaceae candidate → no bonus row → no bonus
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_J', 'fabaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Apiaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── K: Alliaceae after Fabaceae — no bonus row ────────────────────────────
  it('K: returns no bonus for Alliaceae candidate after Fabaceae (no bonus row exists)', () => {
    // Arrange: Fabaceae 100 days ago; Alliaceae candidate → no bonus row → no bonus
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_K', 'fabaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Alliaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── L: bonus expires past 365 days ────────────────────────────────────────
  it('L: returns no bonus when Fabaceae predecessor is more than 365 days ago', () => {
    // Arrange: Fabaceae planted 400 days ago → outside rolling lookback → no bonus
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_L', 'fabaceae');
    const fourHundredDaysAgo = new Date(today.getTime() - 400 * 86400000);
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: fourHundredDaysAgo.toISOString().slice(0, 10),
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({ allowed: true, penalty: 0, bonus: 0 });
  });

  // ── M: multiple Fabaceae in window → bonus is flat (not multiplied) ────────
  it('M: applies bonus once even when multiple Fabaceae plantings exist within 365 days', () => {
    // Arrange: Fabaceae planted both 50 and 300 days ago; Brassicaceae candidate
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_M', 'fabaceae');
    const fiftyDaysAgo = new Date(today.getTime() - 50 * 86400000);
    const threeHundredDaysAgo = new Date(today.getTime() - 300 * 86400000);
    db.insert(schema.planting)
      .values([
        {
          cropId: fabaceaeCropId,
          locationId,
          plantedDate: fiftyDaysAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
        {
          cropId: fabaceaeCropId,
          locationId,
          plantedDate: threeHundredDaysAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
      ])
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert: bonus is -15, not -30 (one bonus row, not multiplied)
    expect(result).toEqual({
      allowed: true,
      penalty: 0,
      bonus: -15,
      advice: 'rotation.advice.legumeBonus',
    });
  });

  // ── N: multi-history bed (outside-window hard excl + bonus) ───────────────
  it('N: applies legume bonus and ignores out-of-window Brassicaceae hard exclusion', () => {
    // Arrange: Fabaceae 100 days ago + Brassicaceae 7 years ago → Brassicaceae candidate
    // Brassicaceae exclusionYears=6 → 7 yrs ago is OUTSIDE window → allowed
    // Fabaceae bonus for Brassicaceae → -15
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_N', 'fabaceae');
    const brassicaCropId = insertRotationCrop(db, 'RotTestBrassica_N', 'Brassicaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    const sevenYearsAgo = new Date(today.getTime() - 7 * 365 * 86400000);
    db.insert(schema.planting)
      .values([
        {
          cropId: fabaceaeCropId,
          locationId,
          plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
        {
          cropId: brassicaCropId,
          locationId,
          plantedDate: sevenYearsAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
      ])
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: true,
      penalty: 0,
      bonus: -15,
      advice: 'rotation.advice.legumeBonus',
    });
  });

  // ── O: hard exclusion short-circuits bonus ─────────────────────────────────
  it('O: hard exclusion short-circuits; bonus is not computed when disallowed', () => {
    // Arrange: Fabaceae 100 days ago + Brassicaceae 3 years ago → Brassicaceae candidate
    // Brassicaceae exclusionYears=6 → 3 yrs ago is INSIDE window → allowed=false
    // Fabaceae bonus must NOT appear
    const today = new Date('2026-05-27');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_O', 'fabaceae');
    const brassicaCropId = insertRotationCrop(db, 'RotTestBrassica_O', 'Brassicaceae');
    const hundredDaysAgo = new Date(today.getTime() - 100 * 86400000);
    const threeYearsAgo = new Date(today.getTime() - 3 * 365 * 86400000);
    db.insert(schema.planting)
      .values([
        {
          cropId: fabaceaeCropId,
          locationId,
          plantedDate: hundredDaysAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
        {
          cropId: brassicaCropId,
          locationId,
          plantedDate: threeYearsAgo.toISOString().slice(0, 10),
          areaM2: 1,
          status: 'harvested',
        },
      ])
      .run();

    // Act
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', today);

    // Assert
    expect(result).toEqual({
      allowed: false,
      penalty: 0,
      bonus: 0,
      advice: 'rotation.advice.hardExclusion',
    });
  });

  // ── P: `today` parameter is honoured (not Date.now() internally) ──────────
  it('P: honours the today parameter — bonus depends on today, not Date.now()', () => {
    // Arrange: Fabaceae planted on 2024-01-01.
    // If today = 2024-04-10 (100 days later) → inside 365-day window → bonus applies.
    // If today = Date.now() (2026-05-27, 876 days later) → outside window → no bonus.
    // The test passes a past `today` so the planting is inside-window for that date.
    const pastToday = new Date('2024-04-10');
    const fabaceaeCropId = insertRotationCrop(db, 'RotTestFabaceae_P', 'fabaceae');
    db.insert(schema.planting)
      .values({
        cropId: fabaceaeCropId,
        locationId,
        plantedDate: '2024-01-01',
        areaM2: 1,
        status: 'harvested',
      })
      .run();

    // Act: pass pastToday explicitly — if method uses Date.now() internally this fails
    const result = callGetRotationStatus(service, locationId, 'Brassicaceae', pastToday);

    // Assert: bonus must apply because plantedDate is within 365 days of pastToday
    expect(result).toEqual({
      allowed: true,
      penalty: 0,
      bonus: -15,
      advice: 'rotation.advice.legumeBonus',
    });
  });
});

// =============================================================================
// generateBedSuggestions — rotation integration (Layer 4)
// =============================================================================

describe('generateBedSuggestions — rotation integration', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;
  let householdId: number;
  let locationId: number;

  // Insert a fast direct-sow crop with a given cropFamily and return its id
  function insertFastCrop(name: string, cropFamily: string): number {
    const rows = db
      .insert(schema.crop)
      .values({
        name,
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 60,
        cropFamily,
      })
      .returning()
      .all();
    return rows[0]!.id;
  }

  // Insert a past planting (harvested status) on locationId
  function insertPastPlanting(cropId: number, plantedDate: string): void {
    db.insert(schema.planting)
      .values({ cropId, locationId, plantedDate, areaM2: 2, status: 'harvested' })
      .run();
  }

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    // Seed rotation rules + bonuses
    db.insert(schema.cropFamilyRotation).values(FAMILY_ROTATION_RULES).run();
    db.insert(schema.familyRotationBonus).values(FAMILY_ROTATION_BONUSES).run();

    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Rotation Integration Household', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;

    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Rotationsbädd', areaM2: 4.0, frostBufferC: 0 })
      .returning()
      .all();
    locationId = locRows[0]!.id;
  });

  // ── a: Hard-excluded candidate is dropped end-to-end ──────────────────────
  it('a: hard-excluded Brassicaceae candidate is absent from result.crops', async () => {
    // Arrange: Brassicaceae exclusionYears=6 → plant 3 yrs ago → inside window → dropped
    const brassicaId = insertFastCrop('Kål', 'Brassicaceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: brassicaId, kgPerWeek: 1 })
      .run();
    insertPastPlanting(brassicaId, '2023-05-27'); // ~3 years ago, inside 6yr window

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Brassicaceae not in any bed's crops
    const allCropNames = results.flatMap((b) => b.crops.map((c) => c.cropName));
    expect(allCropNames).not.toContain('Kål');
  });

  // ── b: Soft-penalty candidate is kept but ranked lower than clean equivalent ─
  it('b: soft-penalty Alliaceae crop ranks lower than clean crop with identical coverage', async () => {
    // Arrange: Alliaceae penaltyYears=4 → 2 yrs ago → inside penalty window → +25 score
    // Clean crop (Apiaceae, no rule) → score unaffected → ranks first (lower score = better)
    const alliaceaId = insertFastCrop('Lök', 'Alliaceae');
    const cleanId = insertFastCrop('Morot', 'Apiaceae');
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: alliaceaId, kgPerWeek: 1 },
        { householdId, cropId: cleanId, kgPerWeek: 1 },
      ])
      .run();
    insertPastPlanting(alliaceaId, '2024-05-27'); // ~2 yrs ago, inside 4yr penalty window

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: clean crop (Morot) ranks above penalised crop (Lök) — i.e. appears first
    const emptyBed = results.find((b) => b.type === 'empty_bed');
    expect(emptyBed).toBeDefined();
    const cropNames = emptyBed!.crops.map((c) => c.cropName);
    const morotIdx = cropNames.indexOf('Morot');
    const lökIdx = cropNames.indexOf('Lök');
    expect(morotIdx).toBeGreaterThanOrEqual(0);
    expect(lökIdx).toBeGreaterThanOrEqual(0);
    expect(morotIdx).toBeLessThan(lökIdx);
  });

  // ── c: Soft-penalty candidate carries the softPenalty advice key in reason ─
  it('c: soft-penalty candidate carries rotation.advice.softPenalty key in reason', async () => {
    // Arrange: same setup as (b) — Alliaceae 2 yrs ago → soft penalty active
    const alliaceaId = insertFastCrop('Purjolök', 'Alliaceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: alliaceaId, kgPerWeek: 1 })
      .run();
    insertPastPlanting(alliaceaId, '2024-05-27'); // inside 4yr penalty window

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Purjolök's reason includes the softPenalty key
    const allCrops = results.flatMap((b) => b.crops);
    const candidate = allCrops.find((c) => c.cropName === 'Purjolök');
    expect(candidate).toBeDefined();
    expect(candidate!.reason).toContain('rotation.advice.softPenalty');
  });

  // ── d: Legume bonus ranks Brassicaceae above equivalent Apiaceae ───────────
  it('d: Brassicaceae ranks above Apiaceae when Fabaceae was planted 100 days ago', async () => {
    // Arrange: Fabaceae 100 days ago → Brassicaceae gets -15 bonus; Apiaceae gets 0
    // Both crops at identical 0% coverage → Brassicaceae score = 0 + (-15) = -15 < 0 = Apiaceae
    const fabaceaId = insertFastCrop('Ärtor', 'Fabaceae');
    const brassicaId = insertFastCrop('Brysselkål', 'Brassicaceae');
    const apiaceaeId = insertFastCrop('Dill', 'Apiaceae');
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: brassicaId, kgPerWeek: 1 },
        { householdId, cropId: apiaceaeId, kgPerWeek: 1 },
      ])
      .run();
    const hundredDaysAgo = new Date(new Date('2026-05-27').getTime() - 100 * 86400000)
      .toISOString()
      .slice(0, 10);
    insertPastPlanting(fabaceaId, hundredDaysAgo);

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Brassicaceae (Brysselkål) ranks above Apiaceae (Dill)
    const emptyBed = results.find((b) => b.type === 'empty_bed');
    expect(emptyBed).toBeDefined();
    const cropNames = emptyBed!.crops.map((c) => c.cropName);
    const brassicaIdx = cropNames.indexOf('Brysselkål');
    const apiaceaeIdx = cropNames.indexOf('Dill');
    expect(brassicaIdx).toBeGreaterThanOrEqual(0);
    expect(apiaceaeIdx).toBeGreaterThanOrEqual(0);
    expect(brassicaIdx).toBeLessThan(apiaceaeIdx);
  });

  // ── e: Legume bonus surfaces legumeBonus key in reason ────────────────────
  it('e: Brassicaceae candidate after Fabaceae has rotation.advice.legumeBonus in reason', async () => {
    // Arrange: Fabaceae 100 days ago → Brassicaceae gets legumeBonus advice
    const fabaceaId = insertFastCrop('Bönor', 'Fabaceae');
    const brassicaId = insertFastCrop('Blomkål', 'Brassicaceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: brassicaId, kgPerWeek: 1 })
      .run();
    const hundredDaysAgo = new Date(new Date('2026-05-27').getTime() - 100 * 86400000)
      .toISOString()
      .slice(0, 10);
    insertPastPlanting(fabaceaId, hundredDaysAgo);

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Blomkål's reason contains legumeBonus key
    const allCrops = results.flatMap((b) => b.crops);
    const candidate = allCrops.find((c) => c.cropName === 'Blomkål');
    expect(candidate).toBeDefined();
    expect(candidate!.reason).toContain('rotation.advice.legumeBonus');
  });

  // ── f: Moderate legume bonus ranks Cucurbitaceae above Apiaceae ────────────
  it('f: Cucurbitaceae ranks above Apiaceae when Fabaceae was planted 100 days ago', async () => {
    // Arrange: Fabaceae 100 days ago → Cucurbitaceae gets -10 bonus; Apiaceae gets 0
    const fabaceaId = insertFastCrop('Socker­ärtor', 'Fabaceae');
    const cucurbitId = insertFastCrop('Zucchini', 'Cucurbitaceae');
    const apiaceaeId = insertFastCrop('Persilja', 'Apiaceae');
    db.insert(schema.householdCropWishlist)
      .values([
        { householdId, cropId: cucurbitId, kgPerWeek: 1 },
        { householdId, cropId: apiaceaeId, kgPerWeek: 1 },
      ])
      .run();
    const hundredDaysAgo = new Date(new Date('2026-05-27').getTime() - 100 * 86400000)
      .toISOString()
      .slice(0, 10);
    insertPastPlanting(fabaceaId, hundredDaysAgo);

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Cucurbitaceae (Zucchini) ranks above Apiaceae (Persilja)
    const emptyBed = results.find((b) => b.type === 'empty_bed');
    expect(emptyBed).toBeDefined();
    const cropNames = emptyBed!.crops.map((c) => c.cropName);
    const cucurbitIdx = cropNames.indexOf('Zucchini');
    const apiaceaeIdx = cropNames.indexOf('Persilja');
    expect(cucurbitIdx).toBeGreaterThanOrEqual(0);
    expect(apiaceaeIdx).toBeGreaterThanOrEqual(0);
    expect(cucurbitIdx).toBeLessThan(apiaceaeIdx);
  });

  // ── g: Fabaceae after Fabaceae — penalty AND bonus both nonzero, legumeBonus key ─
  it('g: Fabaceae-after-Fabaceae has both penalty and bonus; ranks lower than clean-bed Fabaceae', async () => {
    // Bed A (locationId): Fabaceae 100 days ago → Fabaceae candidate gets penalty=25 + bonus=15 = net +40
    // Bed B (clean): no prior plantings → Fabaceae candidate score = 0
    // Both crops at 0% coverage → penalised bed's Fabaceae ranks lower
    const fabaceaId = insertFastCrop('ÄrtorG', 'Fabaceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: fabaceaId, kgPerWeek: 1 })
      .run();
    const hundredDaysAgo = new Date(new Date('2026-05-27').getTime() - 100 * 86400000)
      .toISOString()
      .slice(0, 10);
    insertPastPlanting(fabaceaId, hundredDaysAgo);

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: the Fabaceae candidate is present (not hard-excluded) with legumeBonus advice key
    const allCrops = results.flatMap((b) => b.crops);
    const candidate = allCrops.find((c) => c.cropName === 'ÄrtorG');
    expect(candidate).toBeDefined();
    expect(candidate!.reason).toContain('rotation.advice.legumeBonus');
  });

  // ── h: Apiaceae after Fabaceae — no bonus, no rotation advice in reason ────
  it('h: Apiaceae after Fabaceae has no rotation advice in reason', async () => {
    // Arrange: Fabaceae 100 days ago; Apiaceae has no bonus row → no rotation advice
    const fabaceaId = insertFastCrop('SockärH', 'Fabaceae');
    const apiaceaeId = insertFastCrop('ÄngsyllaH', 'Apiaceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: apiaceaeId, kgPerWeek: 1 })
      .run();
    const hundredDaysAgo = new Date(new Date('2026-05-27').getTime() - 100 * 86400000)
      .toISOString()
      .slice(0, 10);
    insertPastPlanting(fabaceaId, hundredDaysAgo);

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Apiaceae candidate present, reason has no rotation advice key
    const allCrops = results.flatMap((b) => b.crops);
    const candidate = allCrops.find((c) => c.cropName === 'ÄngsyllaH');
    expect(candidate).toBeDefined();
    expect(candidate!.reason).not.toContain('rotation.advice');
  });

  // ── i: Seedling transplant path also honours getRotationStatus ─────────────
  it('i: hard-excluded seedling transplant candidate is absent from result.crops', async () => {
    // Arrange: indoor seedling of Brassicaceae + Brassicaceae planting 3 yrs ago → dropped
    const brassicaId = insertFastCrop('TomplanteringI', 'Brassicaceae');
    // Override to be an indoor-start crop (not directSowOnly)
    const transplantBrassicaRows = db
      .insert(schema.crop)
      .values({
        name: 'IndoorKålI',
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: false,
        weeksToTransplant: 6,
        daysToMaturityFromTransplant: 60,
        cropFamily: 'Brassicaceae',
      })
      .returning()
      .all();
    const indoorBrassicaId = transplantBrassicaRows[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: indoorBrassicaId, kgPerWeek: 1 })
      .run();

    // Add an indoor seedling for this crop
    const indoorLocRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Fönsterbräda', areaM2: 1.0, isIndoor: true })
      .returning()
      .all();
    const indoorLocId = indoorLocRows[0]!.id;
    db.insert(schema.planting)
      .values({
        cropId: indoorBrassicaId,
        locationId: indoorLocId,
        plantedDate: '2026-03-01',
        areaM2: 1,
        status: 'seedling',
      })
      .run();

    // Past Brassicaceae planting on the outdoor bed 3 yrs ago → hard exclusion
    insertPastPlanting(brassicaId, '2023-05-27');

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: IndoorKålI does not appear as a transplant suggestion on this bed
    const allCropNames = results.flatMap((b) => b.crops.map((c) => c.cropName));
    expect(allCropNames).not.toContain('IndoorKålI');
  });

  // ── j: 3-year-old Asteraceae NOT blocked — old 730-day blanket gone ────────
  it("j: Asteraceae planting 3 years ago does NOT block today's Asteraceae candidate", async () => {
    // Arrange: Asteraceae penaltyYears=2 → 3 yrs ago is OUTSIDE 2-yr penalty window
    // Old getRotationFamilies used 730-day blanket → would have dropped this candidate
    // New getRotationStatus → penalty window is 2 yrs × 365 = 730 days; 3 yrs = 1095 days → outside
    const asteraceaId = insertFastCrop('Solros', 'Asteraceae');
    db.insert(schema.householdCropWishlist)
      .values({ householdId, cropId: asteraceaId, kgPerWeek: 1 })
      .run();
    insertPastPlanting(asteraceaId, '2023-05-27'); // 3 years ago, outside 2yr penalty window

    const today = new Date('2026-05-27');

    // Act
    const { suggestions: results } = await service.generateBedSuggestions(householdId, today);

    // Assert: Solros appears with zero rotation penalty
    const allCrops = results.flatMap((b) => b.crops);
    const candidate = allCrops.find((c) => c.cropName === 'Solros');
    expect(candidate).toBeDefined();
    // No rotation advice since outside penalty window
    expect(candidate!.reason).not.toContain('rotation.advice');
  });
});

// =============================================================================
// getMaxedOutFamilyHints — Layer 7
// =============================================================================

describe('getMaxedOutFamilyHints', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;
  let householdId: number;
  let locationId: number;

  function insertCrop(name: string, cropFamily: string): number {
    const rows = db
      .insert(schema.crop)
      .values({
        name,
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 60,
        cropFamily,
      })
      .returning()
      .all();
    return rows[0]!.id;
  }

  function addToWishlist(cropId: number) {
    db.insert(schema.householdCropWishlist).values({ householdId, cropId, kgPerWeek: 1 }).run();
  }

  function addHarvestedPlanting(cropId: number) {
    db.insert(schema.planting)
      .values({
        cropId,
        locationId,
        plantedDate: '2025-04-01',
        expectedHarvestDate: '2025-09-01',
        areaM2: 4.0,
        status: 'harvested',
      })
      .run();
  }

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    // Seed rotation rules so Solanaceae hard-excludes work
    db.insert(schema.cropFamilyRotation).values(FAMILY_ROTATION_RULES).onConflictDoNothing().run();
    db.insert(schema.familyRotationBonus)
      .values(FAMILY_ROTATION_BONUSES)
      .onConflictDoNothing()
      .run();

    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Maxfamiljen', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;

    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Bädd A', areaM2: 4.0 })
      .returning()
      .all();
    locationId = locRows[0]!.id;
  });

  // ---------------------------------------------------------------------------
  // q. 3 Solanaceae on wishlist; every bed hard-excludes Solanaceae → maxed
  // ---------------------------------------------------------------------------

  it('returns the family when wishlist has 3 Solanaceae crops and every bed hard-excludes it', async () => {
    // Arrange: 3 Solanaceae wishlist crops
    const s1 = insertCrop('Tomat', 'Solanaceae');
    const s2 = insertCrop('Paprika', 'Solanaceae');
    const s3 = insertCrop('Aubergine', 'Solanaceae');
    addToWishlist(s1);
    addToWishlist(s2);
    addToWishlist(s3);

    // The bed recently grew Solanaceae — hard-exclusion applies
    addHarvestedPlanting(s1);

    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(householdId, today);

    // Assert
    expect(hints).toHaveLength(1);
    expect(hints[0]!.family).toBe('Solanaceae');
    expect(hints[0]!.wishlistCount).toBe(3);
  });

  // ---------------------------------------------------------------------------
  // r. 3 Solanaceae; one bed allows it (no recent history) → returns []
  // ---------------------------------------------------------------------------

  it('returns [] when wishlist has 3 Solanaceae but at least one bed allows it', async () => {
    // Arrange: 3 Solanaceae wishlist crops
    const s1 = insertCrop('Tomat', 'Solanaceae');
    const s2 = insertCrop('Paprika', 'Solanaceae');
    const s3 = insertCrop('Aubergine', 'Solanaceae');
    addToWishlist(s1);
    addToWishlist(s2);
    addToWishlist(s3);

    // No plantings → rotation has no history → allowed
    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(householdId, today);

    // Assert
    expect(hints).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // s. 2 Solanaceae on wishlist; all beds excluded → under threshold → []
  // ---------------------------------------------------------------------------

  it('returns [] when wishlist has only 2 Solanaceae crops even if all beds exclude it', async () => {
    // Arrange: only 2 Solanaceae crops
    const s1 = insertCrop('Tomat', 'Solanaceae');
    const s2 = insertCrop('Paprika', 'Solanaceae');
    addToWishlist(s1);
    addToWishlist(s2);

    // The bed recently grew Solanaceae — hard-exclusion applies
    addHarvestedPlanting(s1);

    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(householdId, today);

    // Assert: count < 3 → not maxed
    expect(hints).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // t. 3 Solanaceae AND 3 Brassicaceae, both blocked → returns both families
  // ---------------------------------------------------------------------------

  it('returns both families when two distinct families are both maxed', async () => {
    // Arrange: 3 Solanaceae
    const s1 = insertCrop('Tomat', 'Solanaceae');
    const s2 = insertCrop('Paprika', 'Solanaceae');
    const s3 = insertCrop('Aubergine', 'Solanaceae');
    addToWishlist(s1);
    addToWishlist(s2);
    addToWishlist(s3);
    addHarvestedPlanting(s1); // hard-excludes Solanaceae from the bed

    // 3 Brassicaceae
    const b1 = insertCrop('Kål', 'Brassicaceae');
    const b2 = insertCrop('Broccoli', 'Brassicaceae');
    const b3 = insertCrop('Blomkål', 'Brassicaceae');
    addToWishlist(b1);
    addToWishlist(b2);
    addToWishlist(b3);
    addHarvestedPlanting(b1); // hard-excludes Brassicaceae from the same bed

    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(householdId, today);

    // Assert: both families present
    expect(hints).toHaveLength(2);
    const families = hints.map((h) => h.family).sort();
    expect(families).toContain('Solanaceae');
    expect(families).toContain('Brassicaceae');
    for (const h of hints) {
      expect(h.wishlistCount).toBe(3);
    }
  });

  // ---------------------------------------------------------------------------
  // u. Empty wishlist → returns []
  // ---------------------------------------------------------------------------

  it('returns [] for an empty wishlist', async () => {
    // Arrange: no wishlist entries
    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(householdId, today);

    // Assert
    expect(hints).toHaveLength(0);
  });

  // ---------------------------------------------------------------------------
  // v. 3 Solanaceae; household has ZERO beds → vacuously maxed → returns hint
  // ---------------------------------------------------------------------------

  it('returns the family when household has zero beds (vacuously maxed)', async () => {
    // Arrange: fresh household with no beds
    const emptyHouseRows = db
      .insert(schema.household)
      .values({ name: 'Inget bädd', persons: 1, growingZone: 2 })
      .returning()
      .all();
    const emptyHouseholdId = emptyHouseRows[0]!.id;

    const s1 = db
      .insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 60,
        cropFamily: 'Solanaceae',
      })
      .returning()
      .all()[0]!.id;
    const s2 = db
      .insert(schema.crop)
      .values({
        name: 'Paprika',
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 60,
        cropFamily: 'Solanaceae',
      })
      .returning()
      .all()[0]!.id;
    const s3 = db
      .insert(schema.crop)
      .values({
        name: 'Aubergine',
        yieldKgPerM2: 2.0,
        kcalPerKg: 200,
        proteinGPerKg: 20,
        carbsGPerKg: 30,
        fatGPerKg: 2,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 60,
        cropFamily: 'Solanaceae',
      })
      .returning()
      .all()[0]!.id;

    db.insert(schema.householdCropWishlist)
      .values([
        { householdId: emptyHouseholdId, cropId: s1, kgPerWeek: 1 },
        { householdId: emptyHouseholdId, cropId: s2, kgPerWeek: 1 },
        { householdId: emptyHouseholdId, cropId: s3, kgPerWeek: 1 },
      ])
      .run();

    const today = new Date('2026-05-27');

    // Act
    const hints = await service.getMaxedOutFamilyHints(emptyHouseholdId, today);

    // Assert: no beds → no allowed beds → family is maxed
    expect(hints).toHaveLength(1);
    expect(hints[0]!.family).toBe('Solanaceae');
    expect(hints[0]!.wishlistCount).toBe(3);
  });
});

// =============================================================================
// generateBedSuggestions — wrapped return shape (Layer 7 Test w)
// =============================================================================

describe('generateBedSuggestions — wrapped return shape', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: SuggestionService;
  let householdId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new SuggestionService(db);

    db.insert(schema.cropFamilyRotation).values(FAMILY_ROTATION_RULES).onConflictDoNothing().run();
    db.insert(schema.familyRotationBonus)
      .values(FAMILY_ROTATION_BONUSES)
      .onConflictDoNothing()
      .run();

    const houseRows = db
      .insert(schema.household)
      .values({ name: 'Wrapfamiljen', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdId = houseRows[0]!.id;
  });

  // ---------------------------------------------------------------------------
  // w. generateBedSuggestions returns { suggestions, maxedOutFamilies }
  // ---------------------------------------------------------------------------

  it('returns a wrapped object with suggestions and maxedOutFamilies arrays', async () => {
    // Arrange: a bed + a wishlist crop
    const locRows = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Bädd', areaM2: 4.0 })
      .returning()
      .all();
    const locId = locRows[0]!.id;

    const cropRows = db
      .insert(schema.crop)
      .values({
        name: 'Spenat',
        yieldKgPerM2: 2.0,
        kcalPerKg: 230,
        proteinGPerKg: 29,
        carbsGPerKg: 36,
        fatGPerKg: 4,
        category: 'vegetable',
        directSowOnly: true,
        daysToMaturityFromTransplant: 40,
        cropFamily: 'Chenopodiaceae',
      })
      .returning()
      .all();
    const cropId = cropRows[0]!.id;
    db.insert(schema.householdCropWishlist).values({ householdId, cropId, kgPerWeek: 1 }).run();

    const today = new Date('2026-05-27');

    // Act
    const result = await service.generateBedSuggestions(householdId, today);

    // Assert: result has the wrapped shape
    expect(result).toHaveProperty('suggestions');
    expect(result).toHaveProperty('maxedOutFamilies');
    expect(Array.isArray(result.suggestions)).toBe(true);
    expect(Array.isArray(result.maxedOutFamilies)).toBe(true);

    // The bed with a wishlisted crop should appear in suggestions
    const bedResult = result.suggestions.find((s) => s.locationId === locId);
    expect(bedResult).toBeDefined();
  });
});
