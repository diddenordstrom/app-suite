import { describe, it, expect, beforeEach } from 'vitest';
import { ResetService } from '../../../src/server/services/reset.service';
import { createTestDb, type TestDB } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Reset API (integration)', () => {
  let db: TestDB;
  let service: ResetService;
  let householdId: number;
  let cropId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new ResetService(db);

    const [h] = db.insert(schema.household).values({ name: 'Test', persons: 2 }).returning().all();
    householdId = h!.id;

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

  it('clears all household data in one call', async () => {
    // Arrange — populate every table
    const [loc] = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Bed', areaM2: 10 })
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
    db.insert(schema.storageItem)
      .values({ cropId, householdId, quantityKg: 5, harvestedDate: '2026-04-01' })
      .run();
    db.insert(schema.gardenEvent).values({ householdId, title: 'Water', date: '2026-04-01' }).run();
    db.insert(schema.cropBurnRate).values({ householdId, cropId, kgPerWeek: 1 }).run();
    db.insert(schema.householdCropWishlist).values({ householdId, cropId }).run();
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
    db.insert(schema.expense)
      .values({ householdId, name: 'Seeds', cost: 50, date: '2026-04-01' })
      .run();
    db.insert(schema.activity)
      .values({ householdId, action: 'created', entityType: 'planting', entityId: 1 })
      .run();

    // Act
    await service.resetHousehold(householdId);

    // Assert — all user data gone
    expect(db.select().from(schema.planting).all()).toHaveLength(0);
    expect(db.select().from(schema.growingLocation).all()).toHaveLength(0);
    expect(db.select().from(schema.harvestEvent).all()).toHaveLength(0);
    expect(db.select().from(schema.storageItem).all()).toHaveLength(0);
    expect(db.select().from(schema.gardenEvent).all()).toHaveLength(0);
    expect(db.select().from(schema.cropBurnRate).all()).toHaveLength(0);
    expect(db.select().from(schema.householdCropWishlist).all()).toHaveLength(0);
    expect(db.select().from(schema.macroTarget).all()).toHaveLength(0);
    expect(db.select().from(schema.expense).all()).toHaveLength(0);
    expect(db.select().from(schema.activity).all()).toHaveLength(0);

    // Assert — seeded data preserved
    expect(db.select().from(schema.household).all()).toHaveLength(1);
    expect(db.select().from(schema.crop).all()).toHaveLength(1);
  });
});
