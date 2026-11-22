import { and, eq, gte, lt, sql, sum } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  crop,
  expense,
  growingLocation,
  harvestEvent,
  householdCropPrice,
  planting,
} from '../db/schema';

export type PerCropFinances = {
  cropId: number;
  cropName: string;
  pricePerKg: number | null;
  spent: number;
  realized: number;
  forecast: number;
  net: number;
};

export type FinancesTotals = {
  spent: number;
  realized: number;
  forecast: number;
  net: number;
};

export type FinancesSummary = {
  totals: FinancesTotals;
  perCrop: PerCropFinances[];
};

export class FinancesService {
  constructor(private readonly db: DB) {}

  async getSummary(householdId: number, year: number): Promise<FinancesSummary> {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    const priceByCrop = this.getPriceByCrop(householdId);
    const spentByCrop = this.getSpentByCrop(householdId, yearStart, yearEnd);
    const totalSpent = this.getTotalSpent(householdId, yearStart, yearEnd);
    const realizedKgByCrop = this.getRealizedKgByCrop(householdId, yearStart, yearEnd);
    const forecastKgByCrop = this.getForecastKgByCrop(householdId, yearStart, yearEnd);

    const cropIds = new Set<number>([
      ...spentByCrop.keys(),
      ...realizedKgByCrop.keys(),
      ...forecastKgByCrop.keys(),
    ]);

    const cropNames = cropIds.size > 0 ? this.getCropNames(Array.from(cropIds)) : new Map();

    const perCrop: PerCropFinances[] = [];
    for (const cropId of cropIds) {
      const price = priceByCrop.get(cropId) ?? null;
      const spent = spentByCrop.get(cropId) ?? 0;
      const realizedKg = realizedKgByCrop.get(cropId) ?? 0;
      const forecastKg = forecastKgByCrop.get(cropId) ?? 0;

      const realized = price !== null ? round2(realizedKg * price) : 0;
      const forecast = price !== null ? round2(forecastKg * price) : 0;
      const net = round2(realized - spent);

      perCrop.push({
        cropId,
        cropName: cropNames.get(cropId) ?? '',
        pricePerKg: price,
        spent: round2(spent),
        realized,
        forecast,
        net,
      });
    }

    perCrop.sort((a, b) => b.net - a.net);

    // totals.spent uses the household-wide sum (includes crop-less general
    // expenses like compost). Per-crop spent rolls up only attributed spending,
    // so sum-of-perCrop.spent ≤ totals.spent by design.
    const realizedSum = perCrop.reduce((acc, row) => acc + row.realized, 0);
    const forecastSum = perCrop.reduce((acc, row) => acc + row.forecast, 0);

    const totals: FinancesTotals = {
      spent: round2(totalSpent),
      realized: round2(realizedSum),
      forecast: round2(forecastSum),
      net: round2(realizedSum - totalSpent),
    };

    return { totals, perCrop };
  }

  private getPriceByCrop(householdId: number): Map<number, number> {
    const rows = this.db
      .select({ cropId: householdCropPrice.cropId, pricePerKg: householdCropPrice.pricePerKg })
      .from(householdCropPrice)
      .where(eq(householdCropPrice.householdId, householdId))
      .all();
    const map = new Map<number, number>();
    for (const row of rows) map.set(row.cropId, row.pricePerKg);
    return map;
  }

  private getTotalSpent(householdId: number, yearStart: string, yearEnd: string): number {
    const rows = this.db
      .select({ total: sql<number>`COALESCE(SUM(${expense.cost}), 0)` })
      .from(expense)
      .where(
        and(
          eq(expense.householdId, householdId),
          gte(expense.date, yearStart),
          lt(expense.date, yearEnd),
        ),
      )
      .all();
    return Number(rows[0]?.total ?? 0);
  }

  private getSpentByCrop(
    householdId: number,
    yearStart: string,
    yearEnd: string,
  ): Map<number, number> {
    const rows = this.db
      .select({
        cropId: expense.cropId,
        total: sql<number>`COALESCE(SUM(${expense.cost}), 0)`,
      })
      .from(expense)
      .where(
        and(
          eq(expense.householdId, householdId),
          gte(expense.date, yearStart),
          lt(expense.date, yearEnd),
        ),
      )
      .groupBy(expense.cropId)
      .all();

    const map = new Map<number, number>();
    for (const row of rows) {
      if (row.cropId == null) continue;
      map.set(row.cropId, Number(row.total ?? 0));
    }
    return map;
  }

  private getRealizedKgByCrop(
    householdId: number,
    yearStart: string,
    yearEnd: string,
  ): Map<number, number> {
    const rows = this.db
      .select({
        cropId: planting.cropId,
        total: sum(harvestEvent.quantityKg),
      })
      .from(harvestEvent)
      .innerJoin(planting, eq(planting.id, harvestEvent.plantingId))
      .innerJoin(growingLocation, eq(growingLocation.id, planting.locationId))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          gte(harvestEvent.harvestedDate, yearStart),
          lt(harvestEvent.harvestedDate, yearEnd),
        ),
      )
      .groupBy(planting.cropId)
      .all();

    const map = new Map<number, number>();
    for (const row of rows) map.set(row.cropId, Number(row.total ?? 0));
    return map;
  }

  private getForecastKgByCrop(
    householdId: number,
    yearStart: string,
    yearEnd: string,
  ): Map<number, number> {
    const rows = this.db
      .select({
        cropId: planting.cropId,
        plantingMode: planting.plantingMode,
        areaM2: planting.areaM2,
        quantity: planting.quantity,
        yieldKgPerPlantOverride: planting.yieldKgPerPlantOverride,
        yieldKgPerM2: crop.yieldKgPerM2,
        yieldKgPerPlant: crop.yieldKgPerPlant,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(growingLocation.id, planting.locationId))
      .innerJoin(crop, eq(crop.id, planting.cropId))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          gte(planting.expectedHarvestDate, yearStart),
          lt(planting.expectedHarvestDate, yearEnd),
        ),
      )
      .all();

    const map = new Map<number, number>();
    for (const row of rows) {
      const yieldKg = expectedYieldKg(row);
      map.set(row.cropId, (map.get(row.cropId) ?? 0) + yieldKg);
    }
    return map;
  }

  private getCropNames(cropIds: number[]): Map<number, string> {
    if (cropIds.length === 0) return new Map();
    const rows = this.db.select({ id: crop.id, name: crop.name }).from(crop).all();
    const map = new Map<number, string>();
    for (const row of rows) map.set(row.id, row.name);
    return map;
  }
}

function expectedYieldKg(p: {
  plantingMode: string;
  areaM2: number;
  quantity: number | null;
  yieldKgPerPlantOverride: number | null;
  yieldKgPerM2: number;
  yieldKgPerPlant: number | null;
}): number {
  if (p.plantingMode === 'count') {
    const perPlant = p.yieldKgPerPlantOverride ?? p.yieldKgPerPlant ?? 0;
    return (p.quantity ?? 0) * perPlant;
  }
  return p.areaM2 * p.yieldKgPerM2;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
