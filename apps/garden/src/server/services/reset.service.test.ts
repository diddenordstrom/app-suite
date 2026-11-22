import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { ResetService } from './reset.service';
import { createTestDb, type TestDB } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('ResetService', () => {
  let db: TestDB;
  let service: ResetService;
  let householdId: number;
  let cropId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new ResetService(db);

    // Seed a household
    const [h] = db.insert(schema.household).values({ name: 'Test', persons: 2 }).returning().all();
    householdId = h!.id;

    // Seed a crop
    const [c] = db
      .insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
      })
      .returning()
      .all();
    cropId = c!.id;
  });

  describe('resetHousehold', () => {
    it('deletes plantings and locations for the household', async () => {
      // Arrange
      const [loc] = db
        .insert(schema.growingLocation)
        .values({ householdId, name: 'Bed 1', areaM2: 10 })
        .returning()
        .all();
      db.insert(schema.planting)
        .values({ cropId, locationId: loc!.id, plantedDate: '2026-04-01', areaM2: 5 })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const plantings = db.select().from(schema.planting).all();
      const locations = db.select().from(schema.growingLocation).all();
      expect(plantings).toHaveLength(0);
      expect(locations).toHaveLength(0);
    });

    it('deletes storage items for the household', async () => {
      // Arrange
      db.insert(schema.storageItem)
        .values({ cropId, householdId, quantityKg: 5, harvestedDate: '2026-04-01' })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const items = db.select().from(schema.storageItem).all();
      expect(items).toHaveLength(0);
    });

    it('deletes garden events for the household', async () => {
      // Arrange
      db.insert(schema.gardenEvent)
        .values({ householdId, title: 'Water', date: '2026-04-01' })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const events = db.select().from(schema.gardenEvent).all();
      expect(events).toHaveLength(0);
    });

    it('deletes burn rates for the household', async () => {
      // Arrange
      db.insert(schema.cropBurnRate).values({ householdId, cropId, kgPerWeek: 1.5 }).run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const rates = db.select().from(schema.cropBurnRate).all();
      expect(rates).toHaveLength(0);
    });

    it('deletes macro targets for the household', async () => {
      // Arrange
      db.insert(schema.macroTarget)
        .values({
          householdId,
          name: 'Normal',
          dailyKcal: 2000,
          dailyProteinG: 150,
          dailyCarbsG: 250,
          dailyFatG: 70,
        })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const targets = db.select().from(schema.macroTarget).all();
      expect(targets).toHaveLength(0);
    });

    it('deletes wishlist entries for the household', async () => {
      // Arrange
      db.insert(schema.householdCropWishlist).values({ householdId, cropId }).run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const entries = db.select().from(schema.householdCropWishlist).all();
      expect(entries).toHaveLength(0);
    });

    it('deletes expenses for the household', async () => {
      // Arrange
      db.insert(schema.expense)
        .values({ householdId, name: 'Seeds', cost: 50, date: '2026-04-01' })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const expenses = db.select().from(schema.expense).all();
      expect(expenses).toHaveLength(0);
    });

    it('deletes harvest events linked to household plantings', async () => {
      // Arrange
      const [loc] = db
        .insert(schema.growingLocation)
        .values({ householdId, name: 'Bed 1', areaM2: 10 })
        .returning()
        .all();
      const [p] = db
        .insert(schema.planting)
        .values({ cropId, locationId: loc!.id, plantedDate: '2026-04-01', areaM2: 5 })
        .returning()
        .all();
      db.insert(schema.harvestEvent)
        .values({ plantingId: p!.id, quantityKg: 2, harvestedDate: '2026-08-01' })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const harvests = db.select().from(schema.harvestEvent).all();
      expect(harvests).toHaveLength(0);
    });

    it("clears only this household's activity log", async () => {
      // Arrange
      const [other] = db
        .insert(schema.household)
        .values({ name: 'Other', persons: 1 })
        .returning()
        .all();
      db.insert(schema.activity)
        .values([
          { householdId, action: 'created', entityType: 'planting', entityId: 1 },
          { householdId: other!.id, action: 'created', entityType: 'planting', entityId: 2 },
        ])
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const activities = db.select().from(schema.activity).all();
      expect(activities.map((a) => a.householdId)).toEqual([other!.id]);
    });

    it('preserves the household itself', async () => {
      // Act
      await service.resetHousehold(householdId);

      // Assert
      const households = db.select().from(schema.household).all();
      expect(households).toHaveLength(1);
      expect(households[0]!.id).toBe(householdId);
    });

    it('preserves crops (seeded data)', async () => {
      // Act
      await service.resetHousehold(householdId);

      // Assert
      const crops = db.select().from(schema.crop).all();
      expect(crops).toHaveLength(1);
    });

    it('preserves macro presets (seeded data)', async () => {
      // Arrange
      db.insert(schema.macroPreset)
        .values({
          name: 'Normal',
          kcalPerPerson: 2000,
          proteinG: 150,
          carbsG: 250,
          fatG: 70,
          activityLevel: 'moderate',
        })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const presets = db.select().from(schema.macroPreset).all();
      expect(presets).toHaveLength(1);
    });

    it('deletes gardens for the household', async () => {
      // Arrange
      db.insert(schema.garden)
        .values({ householdId, name: 'Trädgård', widthCm: 500, heightCm: 300 })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const gardens = db.select().from(schema.garden).all();
      expect(gardens).toHaveLength(0);
    });

    it('handles storage items linked to plantings (FK order)', async () => {
      // Arrange — storage item references a planting via plantingId
      const [loc] = db
        .insert(schema.growingLocation)
        .values({ householdId, name: 'Bed 1', areaM2: 10 })
        .returning()
        .all();
      const [p] = db
        .insert(schema.planting)
        .values({ cropId, locationId: loc!.id, plantedDate: '2026-04-01', areaM2: 5 })
        .returning()
        .all();
      db.insert(schema.storageItem)
        .values({
          cropId,
          householdId,
          quantityKg: 3,
          harvestedDate: '2026-08-01',
          plantingId: p!.id,
        })
        .run();

      // Act — should not throw FK violation
      await service.resetHousehold(householdId);

      // Assert
      const items = db.select().from(schema.storageItem).all();
      const plantings = db.select().from(schema.planting).all();
      expect(items).toHaveLength(0);
      expect(plantings).toHaveLength(0);
    });

    it('is a no-op for a household with no locations at all', async () => {
      // Arrange — a brand-new household with no plantings, no locations, no children at all
      const [empty] = db
        .insert(schema.household)
        .values({ name: 'Brand new', persons: 1 })
        .returning()
        .all();

      // Act + Assert — should not throw and should leave the household intact
      await expect(service.resetHousehold(empty!.id)).resolves.toBeUndefined();
      const stillThere = db
        .select()
        .from(schema.household)
        .where(eq(schema.household.id, empty!.id))
        .all();
      expect(stillThere).toHaveLength(1);
    });

    it('handles a household that has locations but no plantings', async () => {
      // Arrange — household with a single empty bed and no plantings inside it
      db.insert(schema.growingLocation).values({ householdId, name: 'Empty bed', areaM2: 4 }).run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const locations = db.select().from(schema.growingLocation).all();
      const plantings = db.select().from(schema.planting).all();
      expect(locations).toHaveLength(0);
      expect(plantings).toHaveLength(0);
    });

    it('does not affect a different household', async () => {
      // Arrange
      const [h2] = db
        .insert(schema.household)
        .values({ name: 'Other', persons: 1 })
        .returning()
        .all();
      db.insert(schema.storageItem)
        .values({ cropId, householdId: h2!.id, quantityKg: 3, harvestedDate: '2026-04-01' })
        .run();

      // Act
      await service.resetHousehold(householdId);

      // Assert
      const items = db.select().from(schema.storageItem).all();
      expect(items).toHaveLength(1);
      expect(items[0]!.householdId).toBe(h2!.id);
    });
  });
});
