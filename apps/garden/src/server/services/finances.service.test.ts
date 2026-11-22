import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { FinancesService } from './finances.service';
import { CropPriceService } from './crop-price.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('FinancesService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: FinancesService;
  let prices: CropPriceService;

  beforeEach(() => {
    db = createTestDb();
    service = new FinancesService(db);
    prices = new CropPriceService(db);

    db.insert(schema.household).values({ name: 'Test', persons: 4 }).run();
    db.insert(schema.household).values({ name: 'Other', persons: 2 }).run();

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
    db.insert(schema.crop)
      .values({
        name: 'Potatis',
        yieldKgPerM2: 4,
        kcalPerKg: 770,
        proteinGPerKg: 20,
        carbsGPerKg: 170,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();

    db.insert(schema.growingLocation).values({ householdId: 1, name: 'Bädd 1', areaM2: 10 }).run();
  });

  describe('getSummary()', () => {
    it('returns zero totals and empty perCrop when nothing exists', async () => {
      const result = await service.getSummary(1, 2026);

      expect(result.totals).toEqual({ spent: 0, realized: 0, forecast: 0, net: 0 });
      expect(result.perCrop).toEqual([]);
    });

    it('counts a logged expense in spent (no price, no harvest)', async () => {
      db.insert(schema.expense)
        .values({
          householdId: 1,
          name: 'Frön',
          cost: 49.9,
          date: '2026-03-01',
          cropId: 1,
        })
        .run();

      const result = await service.getSummary(1, 2026);

      expect(result.totals.spent).toBe(49.9);
      expect(result.perCrop).toHaveLength(1);
      expect(result.perCrop[0]).toMatchObject({
        cropId: 1,
        cropName: 'Tomat',
        pricePerKg: null,
        spent: 49.9,
        realized: 0,
        forecast: 0,
      });
    });

    it('counts a crop-less expense (general spend like "Kompost") in totals.spent', async () => {
      // Arrange — a general expense with no cropId
      db.insert(schema.expense)
        .values({
          householdId: 1,
          name: 'Kompost',
          cost: 500,
          date: '2026-04-01',
        })
        .run();

      // Act
      const result = await service.getSummary(1, 2026);

      // Assert — total spend reflects the general expense even though no perCrop row owns it
      expect(result.totals.spent).toBe(500);
    });

    it('values realized harvest using pricePerKg', async () => {
      await prices.upsert(1, 1, 30);

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 2,
        })
        .run();

      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 5, harvestedDate: '2026-07-15' })
        .run();

      const result = await service.getSummary(1, 2026);

      // 5 kg × 30 kr = 150 kr realized
      expect(result.totals.realized).toBe(150);
      expect(result.perCrop[0]?.realized).toBe(150);
    });

    it('values forecast using expectedHarvestDate year and expected yield', async () => {
      await prices.upsert(1, 1, 30);

      // 2 m² × 8 kg/m² = 16 kg expected
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 2,
        })
        .run();

      const result = await service.getSummary(1, 2026);

      // 16 kg × 30 kr = 480 kr forecast
      expect(result.totals.forecast).toBe(480);
      expect(result.perCrop[0]?.forecast).toBe(480);
    });

    it('computes net as realized minus spent', async () => {
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
          areaM2: 2,
        })
        .run();
      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 5, harvestedDate: '2026-07-15' })
        .run();

      const result = await service.getSummary(1, 2026);

      expect(result.totals.net).toBe(100); // 150 realized − 50 spent
      expect(result.perCrop[0]?.net).toBe(100);
    });

    it('excludes value totals when no price is set but still tracks spent', async () => {
      // No price for crop 1.
      db.insert(schema.expense)
        .values({ householdId: 1, name: 'Frön', cost: 50, date: '2026-03-01', cropId: 1 })
        .run();
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 2,
        })
        .run();
      db.insert(schema.harvestEvent)
        .values({ plantingId: 1, quantityKg: 5, harvestedDate: '2026-07-15' })
        .run();

      const result = await service.getSummary(1, 2026);

      expect(result.totals.spent).toBe(50);
      expect(result.totals.realized).toBe(0);
      expect(result.totals.forecast).toBe(0);
      expect(result.totals.net).toBe(-50);
      expect(result.perCrop[0]).toMatchObject({
        pricePerKg: null,
        spent: 50,
        realized: 0,
        forecast: 0,
        net: -50,
      });
    });

    it('isolates year — picks harvests by harvestedDate, forecasts by expectedHarvestDate', async () => {
      await prices.upsert(1, 1, 30);

      // 2025 planting harvested in 2025
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
        .values({ plantingId: 1, quantityKg: 4, harvestedDate: '2025-07-01' })
        .run();

      // 2026 planting, no harvest yet
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 2,
        })
        .run();

      const result2025 = await service.getSummary(1, 2025);
      const result2026 = await service.getSummary(1, 2026);

      // 2025: realized 4kg × 30 = 120, forecast 1×8×30 = 240
      expect(result2025.totals.realized).toBe(120);
      expect(result2025.totals.forecast).toBe(240);

      // 2026: no realized, forecast 2×8×30 = 480
      expect(result2026.totals.realized).toBe(0);
      expect(result2026.totals.forecast).toBe(480);
    });

    it('isolates households', async () => {
      await prices.upsert(2, 1, 30);
      db.insert(schema.expense)
        .values({ householdId: 2, name: 'Frön', cost: 50, date: '2026-03-01', cropId: 1 })
        .run();

      const result = await service.getSummary(1, 2026);

      expect(result.totals).toEqual({ spent: 0, realized: 0, forecast: 0, net: 0 });
      expect(result.perCrop).toEqual([]);
    });

    it('sorts perCrop by net descending', async () => {
      await prices.upsert(1, 1, 30);
      await prices.upsert(1, 2, 20);

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
        .values({ plantingId: 1, quantityKg: 10, harvestedDate: '2026-07-01' })
        .run();

      db.insert(schema.planting)
        .values({
          cropId: 2,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 1,
        })
        .run();
      db.insert(schema.harvestEvent)
        .values({ plantingId: 2, quantityKg: 5, harvestedDate: '2026-07-01' })
        .run();

      const result = await service.getSummary(1, 2026);

      // Tomat: 10×30 = 300, Potatis: 5×20 = 100 → Tomat first
      expect(result.perCrop[0]?.cropName).toBe('Tomat');
      expect(result.perCrop[1]?.cropName).toBe('Potatis');
    });

    it('excludes plantings with null expectedHarvestDate from forecast', async () => {
      await prices.upsert(1, 1, 30);

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: null,
          areaM2: 2,
        })
        .run();

      const result = await service.getSummary(1, 2026);

      expect(result.totals.forecast).toBe(0);
    });

    it('handles count-mode planting using yieldKgPerPlant on the crop', async () => {
      // Update Tomat with yieldKgPerPlant
      db.update(schema.crop).set({ yieldKgPerPlant: 3 }).where(eq(schema.crop.id, 1)).run();
      await prices.upsert(1, 1, 30);

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-08-01',
          areaM2: 0,
          plantingMode: 'count',
          quantity: 4,
        })
        .run();

      const result = await service.getSummary(1, 2026);

      // 4 plants × 3 kg × 30 kr = 360
      expect(result.totals.forecast).toBe(360);
    });
  });
});
