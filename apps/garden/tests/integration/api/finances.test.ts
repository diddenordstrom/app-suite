// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { FinancesService } from '../../../src/server/services/finances.service';
import { CropPriceService } from '../../../src/server/services/crop-price.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Finances API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: FinancesService;
  let prices: CropPriceService;

  beforeEach(() => {
    db = createTestDb();
    service = new FinancesService(db);
    prices = new CropPriceService(db);

    db.insert(schema.household).values({ name: 'Test', persons: 4 }).run();
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
      })
      .run();
    db.insert(schema.growingLocation).values({ householdId: 1, name: 'Bädd', areaM2: 10 }).run();
  });

  it('returns the expected summary shape', async () => {
    await prices.upsert(1, 1, 30);
    db.insert(schema.expense)
      .values({ householdId: 1, name: 'Frön', cost: 50, date: '2026-03-01', cropId: 1 })
      .run();
    db.insert(schema.planting)
      .values({
        cropId: 1,
        locationId: 1,
        plantedDate: '2026-04-01',
        expectedHarvestDate: '2026-08-01',
        areaM2: 1,
      })
      .run();
    db.insert(schema.harvestEvent)
      .values({ plantingId: 1, quantityKg: 5, harvestedDate: '2026-07-01' })
      .run();

    const result = await service.getSummary(1, 2026);

    expect(result).toMatchObject({
      totals: { spent: 50, realized: 150, forecast: 240, net: 100 },
    });
    expect(result.perCrop).toHaveLength(1);
    expect(result.perCrop[0]).toMatchObject({ cropId: 1, cropName: 'Tomat', pricePerKg: 30 });
  });

  it('filters by year independently', async () => {
    await prices.upsert(1, 1, 10);
    db.insert(schema.planting)
      .values({
        cropId: 1,
        locationId: 1,
        plantedDate: '2025-04-01',
        expectedHarvestDate: '2025-08-01',
        areaM2: 1,
      })
      .run();
    db.insert(schema.harvestEvent)
      .values({ plantingId: 1, quantityKg: 3, harvestedDate: '2025-07-01' })
      .run();

    const r2025 = await service.getSummary(1, 2025);
    const r2026 = await service.getSummary(1, 2026);

    expect(r2025.totals.realized).toBe(30);
    expect(r2026.totals.realized).toBe(0);
  });
});
