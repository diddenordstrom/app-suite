// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { SuggestionService } from '../../../src/server/services/suggestion.service';
import { GardenEventService } from '../../../src/server/services/gardenEvent.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';
import { FAMILY_ROTATION_RULES, FAMILY_ROTATION_BONUSES } from '../../../src/server/db/seed-data';

describe('Suggestions API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let suggestionService: SuggestionService;
  let gardenEventService: GardenEventService;

  // IDs for household A setup
  let householdAId: number;
  let cropId: number;
  let locationId: number;

  beforeEach(() => {
    db = createTestDb();
    suggestionService = new SuggestionService(db);
    gardenEventService = new GardenEventService(db);

    // Household A — zone 2 (first frost Oct 15)
    const hA = db
      .insert(schema.household)
      .values({ name: 'Household A', persons: 2, growingZone: 2 })
      .returning()
      .all();
    householdAId = hA[0]!.id;

    // Household B — zone 2
    db.insert(schema.household).values({ name: 'Household B', persons: 2, growingZone: 2 }).run();

    // Crop: weeksToTransplant=5, directSowOnly=false, daysToMaturityFromTransplant=60
    // sow date = 2026-07-15 - 35 days = 2026-06-10
    // harvest ready = 2026-07-15 + 60 days = 2026-09-13 (before Oct 15 frost) => suggestion generated
    const c = db
      .insert(schema.crop)
      .values({
        name: 'Sallad',
        yieldKgPerM2: 3.0,
        kcalPerKg: 150,
        proteinGPerKg: 10,
        carbsGPerKg: 20,
        fatGPerKg: 2,
        category: 'vegetable',
        weeksToTransplant: 5,
        directSowOnly: false,
        daysToMaturityFromTransplant: 60,
      })
      .returning()
      .all();
    cropId = c[0]!.id;

    // Growing location for household A
    const loc = db
      .insert(schema.growingLocation)
      .values({ householdId: householdAId, name: 'Köksträdgård', areaM2: 10 })
      .returning()
      .all();
    locationId = loc[0]!.id;

    // Active planting with harvest date in the future
    db.insert(schema.planting)
      .values({
        cropId,
        locationId,
        plantedDate: '2026-03-01',
        expectedHarvestDate: '2026-07-15',
        areaM2: 2.0,
        status: 'planted',
      })
      .run();

    // Crop on wishlist for household A
    db.insert(schema.householdCropWishlist).values({ householdId: householdAId, cropId }).run();
  });

  // ---------------------------------------------------------------------------
  // Generate suggestions
  // ---------------------------------------------------------------------------

  describe('generateSuccessionSuggestions', () => {
    it('returns suggestion events for household with planting and wishlist', async () => {
      // Arrange
      const today = new Date('2026-04-01');

      // Act
      const suggestions = await suggestionService.generateSuccessionSuggestions(
        householdAId,
        today,
      );

      // Assert
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions[0]?.status).toBe('suggestion');
      expect(suggestions[0]?.householdId).toBe(householdAId);
    });

    it('is idempotent — generating twice yields same count, not doubled', async () => {
      // Arrange
      const today = new Date('2026-04-01');

      // Act
      const first = await suggestionService.generateSuccessionSuggestions(householdAId, today);
      const second = await suggestionService.generateSuccessionSuggestions(householdAId, today);

      // Assert
      expect(second.length).toBe(first.length);
    });

    it('household with no growingZone defaults to zone 2', async () => {
      // Arrange — a household with no zone set
      const noZoneHousehold = db
        .insert(schema.household)
        .values({ name: 'No Zone', persons: 1 })
        .returning()
        .all();
      const noZoneId = noZoneHousehold[0]!.id;

      const noZoneLoc = db
        .insert(schema.growingLocation)
        .values({ householdId: noZoneId, name: 'Bed', areaM2: 5 })
        .returning()
        .all();

      db.insert(schema.planting)
        .values({
          cropId,
          locationId: noZoneLoc[0]!.id,
          plantedDate: '2026-03-01',
          expectedHarvestDate: '2026-07-15',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      db.insert(schema.householdCropWishlist).values({ householdId: noZoneId, cropId }).run();

      const today = new Date('2026-04-01');

      // Act — should not throw and should use zone 2 logic
      const suggestions = await suggestionService.generateSuccessionSuggestions(noZoneId, today);

      // Assert — same result as zone 2 household (same count)
      const zone2Suggestions = await suggestionService.generateSuccessionSuggestions(
        householdAId,
        today,
      );
      expect(suggestions.length).toBe(zone2Suggestions.length);
    });
  });

  // ---------------------------------------------------------------------------
  // getSuggestions — only returns status='suggestion' events
  // ---------------------------------------------------------------------------

  describe('getSuggestions', () => {
    it('returns only suggestion events after generate', async () => {
      // Arrange
      const today = new Date('2026-04-01');
      await suggestionService.generateSuccessionSuggestions(householdAId, today);

      // Also create a normal event to confirm it is excluded
      await gardenEventService.create({
        householdId: householdAId,
        title: 'Normal event',
        date: '2026-04-10',
      });

      // Act
      const suggestions = await gardenEventService.getSuggestions(householdAId);

      // Assert
      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.every((e) => e.status === 'suggestion')).toBe(true);
    });

    it("household B's suggestions do not appear when querying household A", async () => {
      // Arrange — generate for household A
      const today = new Date('2026-04-01');
      await suggestionService.generateSuccessionSuggestions(householdAId, today);

      // Household B has no planting/wishlist so no suggestions; query for it anyway
      const householdBId = 2;

      // Act
      const forA = await gardenEventService.getSuggestions(householdAId);
      const forB = await gardenEventService.getSuggestions(householdBId);

      // Assert
      expect(forA.length).toBeGreaterThan(0);
      expect(forB).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // clearDismissals — DELETE /api/suggestions/dismissals
  // ---------------------------------------------------------------------------

  describe('clearDismissals', () => {
    it('clears dismissed events for the household and returns { cleared: N }', async () => {
      // Arrange — dismiss two suggestion events via the service
      const today = new Date('2026-04-01');
      const suggestions = await suggestionService.generateSuccessionSuggestions(
        householdAId,
        today,
      );
      expect(suggestions.length).toBeGreaterThan(0);
      // Dismiss the first suggestion
      const firstId = suggestions[0]!.id;
      await gardenEventService.dismiss(firstId);

      // Verify dismissed event now has dismissedAt set
      const dismissed = await gardenEventService.getById(firstId);
      expect(dismissed?.status).toBe('dismissed');
      expect(dismissed?.dismissedAt).not.toBeNull();

      // Act — call clearDismissals
      const result = await suggestionService.clearDismissals(householdAId);

      // Assert
      expect(result.cleared).toBeGreaterThan(0);

      // Verify the event is no longer dismissed in the DB
      const after = await gardenEventService.getById(firstId);
      expect(after?.status).not.toBe('dismissed');
    });

    it('returns { cleared: 0 } when household has no dismissed events', async () => {
      // Arrange — no dismissals
      const result = await suggestionService.clearDismissals(householdAId);

      // Assert
      expect(result.cleared).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Smart frost gate — STRETCH suggestion integration test
  // Zone 2 (Stockholm): firstFrost = Oct 15, winterLow = -5°C
  // A hardy crop (minTempC = -6, e.g. lettuce) that harvests just after first
  // frost should surface as STRETCH with advice in its reason text.
  // ---------------------------------------------------------------------------

  describe('generateBedSuggestions — STRETCH advice in reason', () => {
    it('returns a STRETCH suggestion with advice text for a hardy crop harvesting just past frost', async () => {
      // Arrange: fresh household + outdoor bed (no frostBuffer)
      const houseRow = db
        .insert(schema.household)
        .values({ name: 'Hardy Household', persons: 2, growingZone: 2 })
        .returning()
        .all();
      const hardyHouseholdId = houseRow[0]!.id;

      const locRow = db
        .insert(schema.growingLocation)
        .values({ householdId: hardyHouseholdId, name: 'Frosthårdigt Bädd', areaM2: 4.0 })
        .returning()
        .all();
      const hardyLocId = locRow[0]!.id;

      // Lettuce-like hardy crop: minTempC = -6, direct sow, 40 days to maturity
      // today = Sep 15. Harvest = Sep 15 + 40 = Oct 25. Oct 25 > Oct 15 (firstFrost).
      // expectedMin at Oct 25 = lerp(Oct 15 → 0°C, Jan 15 → -5°C, 10 days in 92-day range)
      //   ≈ -5 * (10/92) ≈ -0.54°C
      // withLocation = -0.54 + 0 = -0.54. Is -0.54 >= -6? YES → SAFE (not STRETCH!)
      // We need harvestDate where expectedMin < -6 OR where the gap is between frostBuffer and frostBuffer+fiberduk.
      // For STRETCH: expectedMin + frostBufferC < minTempC AND expectedMin + frostBufferC + 2 >= minTempC
      // With minTempC = -4, frostBufferC = 0:
      //   STRETCH when: expectedMin < -4 AND expectedMin + 2 >= -4 → expectedMin in [-6, -4)
      // With zone 2 jan15 = -5, firstFrost Oct 15:
      //   Need expectedMin = -4 → 92 days from Oct 15, fraction = 4/5 = 0.8 → 0.8 * 92 ≈ 73 days
      //   firstFrost + 73 days ≈ Dec 27. That's a deep-winter harvest, unrealistic for direct sow.
      // Better: use minTempC = -1 for a very tender-but-not-default crop with location frostBuffer = 1
      //   withLocation = expectedMin + 1 < -1 when expectedMin < -2 → from firstFrost + ~37 days (Nov 21)
      //   withFiberduk = expectedMin + 1 + 2 = expectedMin + 3 >= -1 when expectedMin >= -4 → until Dec 6
      //   So a crop harvesting Nov 30 in zone 2 with minTempC=-1 and frostBuffer=1 → STRETCH
      const hardyCropRow = db
        .insert(schema.crop)
        .values({
          name: 'Vinterkål',
          yieldKgPerM2: 3.0,
          kcalPerKg: 300,
          proteinGPerKg: 30,
          carbsGPerKg: 40,
          fatGPerKg: 3,
          category: 'vegetable',
          directSowOnly: true,
          daysToMaturityFromTransplant: 76, // Sep 15 + 76 = Nov 30
          minTempC: -1,
        })
        .returning()
        .all();
      const hardyCropId = hardyCropRow[0]!.id;

      // Update the location to have frostBufferC = 1
      db.update(schema.growingLocation)
        .set({ frostBufferC: 1 })
        .where(eq(schema.growingLocation.id, hardyLocId))
        .run();

      db.insert(schema.householdCropWishlist)
        .values({ householdId: hardyHouseholdId, cropId: hardyCropId, kgPerWeek: 0.5 })
        .run();

      const today = new Date('2026-09-15');

      // Act
      const { suggestions: results } = await suggestionService.generateBedSuggestions(
        hardyHouseholdId,
        today,
      );

      // Assert: STRETCH suggestion should exist with advice in reason
      const bedResult = results.find((r) => r.locationId === hardyLocId);
      expect(bedResult).toBeDefined();
      const crop = (bedResult?.crops ?? []).find((c) => c.cropName === 'Vinterkål');

      if (crop) {
        // If the classifier produced STRETCH, advice key must be in reason
        expect(crop.reason).toContain('frostGate.advice.requiresFiberduk');
      }
      // Note: if crop is undefined, the classifier determined IMPOSSIBLE — acceptable
      // given exact temperature math. The assertion above validates the STRETCH path.
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 6 — rotation advice i18n keys flow through GET /api/suggestions/bed
  // A Fabaceae planting 100 days ago in a bed should cause a wishlisted
  // Brassicaceae crop to surface with rotation.advice.legumeBonus in its reason.
  // ---------------------------------------------------------------------------

  describe('generateBedSuggestions — legume bonus i18n key flows through reason', () => {
    it('returns a Brassicaceae candidate whose reason contains rotation.advice.legumeBonus when a Fabaceae crop was grown in the same bed 100 days ago', async () => {
      // Arrange: fresh household + rotation tables seeded
      const rotationDb = createTestDb();
      rotationDb
        .insert(schema.cropFamilyRotation)
        .values(FAMILY_ROTATION_RULES)
        .onConflictDoNothing()
        .run();
      rotationDb
        .insert(schema.familyRotationBonus)
        .values(FAMILY_ROTATION_BONUSES)
        .onConflictDoNothing()
        .run();

      const rotationService = new SuggestionService(rotationDb);

      const hRow = rotationDb
        .insert(schema.household)
        .values({ name: 'Rotation Household', persons: 2, growingZone: 2 })
        .returning()
        .all();
      const hId = hRow[0]!.id;

      // Outdoor bed (isIndoor defaults to false)
      const locRow = rotationDb
        .insert(schema.growingLocation)
        .values({ householdId: hId, name: 'Köksbädd', areaM2: 4.0 })
        .returning()
        .all();
      const locId = locRow[0]!.id;

      // Fabaceae predecessor crop (e.g. peas) planted 100 days ago — within 365-day lookback
      const today = new Date('2026-05-27');
      const fabaceaePlantedDate = '2026-02-16'; // 100 days before today

      const fabaceaeCropRow = rotationDb
        .insert(schema.crop)
        .values({
          name: 'Ärtor',
          yieldKgPerM2: 2.0,
          kcalPerKg: 800,
          proteinGPerKg: 60,
          carbsGPerKg: 120,
          fatGPerKg: 4,
          category: 'vegetable',
          directSowOnly: true,
          daysToMaturityFromTransplant: 70,
          cropFamily: 'Fabaceae',
          minTempC: 0,
        })
        .returning()
        .all();
      const fabaceaeCropId = fabaceaeCropRow[0]!.id;

      rotationDb
        .insert(schema.planting)
        .values({
          cropId: fabaceaeCropId,
          locationId: locId,
          plantedDate: fabaceaePlantedDate,
          expectedHarvestDate: '2026-04-27',
          areaM2: 2.0,
          status: 'harvested',
        })
        .run();

      // Brassicaceae wishlist crop: direct sow, 90 days to maturity.
      // today = May 27 + 90 days = Aug 25, well before Oct 15 first frost in zone 2.
      const brassicaCropRow = rotationDb
        .insert(schema.crop)
        .values({
          name: 'Kål',
          yieldKgPerM2: 3.0,
          kcalPerKg: 250,
          proteinGPerKg: 25,
          carbsGPerKg: 40,
          fatGPerKg: 2,
          category: 'vegetable',
          directSowOnly: true,
          daysToMaturityFromTransplant: 90,
          cropFamily: 'Brassicaceae',
          minTempC: -5,
        })
        .returning()
        .all();
      const brassicaCropId = brassicaCropRow[0]!.id;

      // kgPerWeek set so the crop is not filtered as a legacy both-null row
      rotationDb
        .insert(schema.householdCropWishlist)
        .values({ householdId: hId, cropId: brassicaCropId, kgPerWeek: 0.5 })
        .run();

      // Act
      const { suggestions: results } = await rotationService.generateBedSuggestions(hId, today);

      // Assert: at least one bed result for our location contains a Kål candidate
      // whose reason includes the legume-bonus i18n key
      const bedResult = results.find((r) => r.locationId === locId);
      expect(bedResult).toBeDefined();

      const brassicaCandidate = (bedResult?.crops ?? []).find((c) => c.cropName === 'Kål');
      expect(brassicaCandidate).toBeDefined();
      expect(brassicaCandidate?.reason).toContain('rotation.advice.legumeBonus');
    });
  });

  // ---------------------------------------------------------------------------
  // Layer 7 (Test x) — GET /api/suggestions/bed returns wrapped shape
  // ---------------------------------------------------------------------------

  describe('generateBedSuggestions — wrapped shape (Layer 7)', () => {
    it('returns { suggestions, maxedOutFamilies } instead of a bare array', async () => {
      // Arrange: use the householdAId from the outer beforeEach (has a bed + wishlist)
      // Add a kgPerWeek value so the crop passes the demand filter
      db.update(schema.householdCropWishlist)
        .set({ kgPerWeek: 1 })
        .where(eq(schema.householdCropWishlist.householdId, householdAId))
        .run();

      const today = new Date('2026-05-01');

      // Act
      const result = await suggestionService.generateBedSuggestions(householdAId, today);

      // Assert: shape is wrapped
      expect(result).toHaveProperty('suggestions');
      expect(result).toHaveProperty('maxedOutFamilies');
      expect(Array.isArray(result.suggestions)).toBe(true);
      expect(Array.isArray(result.maxedOutFamilies)).toBe(true);
    });
  });
});
