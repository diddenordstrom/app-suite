import { and, eq, inArray, isNotNull, ne, or, sum } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  crop,
  growingLocation,
  harvestEvent,
  householdCropWishlist,
  planting,
  storageItem,
} from '../db/schema';

interface LocationDetail {
  id: number;
  name: string;
  areaM2: number;
  description: string | null;
}

interface PlantingSummaryEntry {
  plantingId: number;
  cropName: string;
  plantingMode: string;
  areaM2: number;
  quantity: number | null;
  expectedYieldKg: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface LocationSummary {
  location: LocationDetail;
  plantings: PlantingSummaryEntry[];
  totals: { kcal: number; proteinG: number; carbsG: number; fatG: number };
}

export interface MacroSummary {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface LocationMacroSummary {
  locationId: number;
  locationName: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface SelfSufficiencyCrop {
  cropId: number;
  cropName: string;
  annualDemandKg: number;
  storageKg: number;
  expectedYieldKg: number;
  coveredKg: number;
  coveragePct: number;
}

export interface SelfSufficiencyResult {
  crops: SelfSufficiencyCrop[];
  averagePct: number;
}

const ZERO_MACROS: MacroSummary = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

interface ActivePlanting {
  plantingId: number;
  cropId: number;
  locationId: number;
  locationName: string;
  plantingMode: string;
  areaM2: number;
  quantity: number | null;
  yieldKgPerPlantOverride: number | null;
  yieldKgPerM2: number;
  yieldKgPerPlant: number | null;
  kcalPerKg: number;
  proteinGPerKg: number;
  carbsGPerKg: number;
  fatGPerKg: number;
}

interface ActivePlantingWithCrop extends ActivePlanting {
  cropName: string;
}

export class DashboardService {
  constructor(private readonly db: DB) {}

  async getSelfSufficiency(householdId: number): Promise<SelfSufficiencyResult> {
    const wishlistRows = this.db
      .select({
        cropId: householdCropWishlist.cropId,
        cropName: crop.name,
        kgPerWeek: householdCropWishlist.kgPerWeek,
        kgPerYear: householdCropWishlist.kgPerYear,
      })
      .from(householdCropWishlist)
      .innerJoin(crop, eq(householdCropWishlist.cropId, crop.id))
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          or(
            isNotNull(householdCropWishlist.kgPerWeek),
            isNotNull(householdCropWishlist.kgPerYear),
          ),
        ),
      )
      .all();

    if (wishlistRows.length === 0) return { crops: [], averagePct: 0 };

    const storageByCrop = this.getStorageByCrop(householdId);
    const yieldByCrop = this.getExpectedYieldByCrop(householdId);

    const crops: SelfSufficiencyCrop[] = wishlistRows.map((row) => {
      const annualDemandKg = (row.kgPerWeek ?? 0) * 52 + (row.kgPerYear ?? 0);
      const storageKg = storageByCrop.get(row.cropId) ?? 0;
      const expectedYieldKg = yieldByCrop.get(row.cropId) ?? 0;
      const coveredKg = storageKg + expectedYieldKg;
      const coveragePct = annualDemandKg > 0 ? Math.round((coveredKg / annualDemandKg) * 100) : 0;
      return {
        cropId: row.cropId,
        cropName: row.cropName,
        annualDemandKg,
        storageKg,
        expectedYieldKg,
        coveredKg,
        coveragePct,
      };
    });

    const averagePct =
      crops.length > 0
        ? Math.round(crops.reduce((s, c) => s + c.coveragePct, 0) / crops.length)
        : 0;

    return { crops, averagePct };
  }

  private getStorageByCrop(householdId: number): Map<number, number> {
    const rows = this.db
      .select({ cropId: storageItem.cropId, total: sum(storageItem.quantityKg) })
      .from(storageItem)
      .where(eq(storageItem.householdId, householdId))
      .groupBy(storageItem.cropId)
      .all();
    const map = new Map<number, number>();
    for (const row of rows) map.set(row.cropId, Number(row.total ?? 0));
    return map;
  }

  private getExpectedYieldByCrop(householdId: number): Map<number, number> {
    const activePlantings = this.fetchActivePlantings(householdId);
    const map = new Map<number, number>();
    for (const p of activePlantings) {
      const yieldKg = this.getExpectedKg(p);
      map.set(p.cropId, (map.get(p.cropId) ?? 0) + yieldKg);
    }
    return map;
  }

  private getExpectedKg(p: ActivePlanting): number {
    if (p.plantingMode === 'count') {
      const yieldPerPlant = p.yieldKgPerPlantOverride ?? p.yieldKgPerPlant ?? 0;
      return (p.quantity ?? 0) * yieldPerPlant;
    }
    return p.areaM2 * p.yieldKgPerM2;
  }

  private fetchActivePlantings(householdId: number): ActivePlanting[] {
    return this.db
      .select({
        plantingId: planting.id,
        cropId: planting.cropId,
        locationId: growingLocation.id,
        locationName: growingLocation.name,
        plantingMode: planting.plantingMode,
        areaM2: planting.areaM2,
        quantity: planting.quantity,
        yieldKgPerPlantOverride: planting.yieldKgPerPlantOverride,
        yieldKgPerM2: crop.yieldKgPerM2,
        yieldKgPerPlant: crop.yieldKgPerPlant,
        kcalPerKg: crop.kcalPerKg,
        proteinGPerKg: crop.proteinGPerKg,
        carbsGPerKg: crop.carbsGPerKg,
        fatGPerKg: crop.fatGPerKg,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .where(and(eq(growingLocation.householdId, householdId), ne(planting.status, 'harvested')))
      .all();
  }

  private buildHarvestMap(plantingIds: number[]): Map<number, number> {
    const harvestTotals = this.db
      .select({ plantingId: harvestEvent.plantingId, total: sum(harvestEvent.quantityKg) })
      .from(harvestEvent)
      .where(inArray(harvestEvent.plantingId, plantingIds))
      .groupBy(harvestEvent.plantingId)
      .all();

    const harvestMap = new Map<number, number>();
    for (const row of harvestTotals) {
      harvestMap.set(row.plantingId, Number(row.total ?? 0));
    }
    return harvestMap;
  }

  async getGrowingMacros(householdId: number): Promise<MacroSummary> {
    const activePlantings = this.fetchActivePlantings(householdId);

    if (activePlantings.length === 0) {
      return { ...ZERO_MACROS };
    }

    const plantingIds = activePlantings.map((p) => p.plantingId);
    const harvestMap = this.buildHarvestMap(plantingIds);

    return this.sumGrowingMacros(activePlantings, harvestMap);
  }

  async getMacrosByLocation(householdId: number): Promise<LocationMacroSummary[]> {
    const activePlantings = this.fetchActivePlantings(householdId);

    if (activePlantings.length === 0) {
      return [];
    }

    const plantingIds = activePlantings.map((p) => p.plantingId);
    const harvestMap = this.buildHarvestMap(plantingIds);

    return this.groupByLocation(activePlantings, harvestMap);
  }

  private groupByLocation(
    plantings: ActivePlanting[],
    harvestMap: Map<number, number>,
  ): LocationMacroSummary[] {
    const locationMap = new Map<number, LocationMacroSummary>();

    for (const p of plantings) {
      const remainingKg = this.getRemainingKg(p, harvestMap.get(p.plantingId) ?? 0);
      const existing = locationMap.get(p.locationId);

      if (existing) {
        existing.kcal += remainingKg * p.kcalPerKg;
        existing.proteinG += remainingKg * p.proteinGPerKg;
        existing.carbsG += remainingKg * p.carbsGPerKg;
        existing.fatG += remainingKg * p.fatGPerKg;
      } else {
        locationMap.set(p.locationId, {
          locationId: p.locationId,
          locationName: p.locationName,
          kcal: remainingKg * p.kcalPerKg,
          proteinG: remainingKg * p.proteinGPerKg,
          carbsG: remainingKg * p.carbsGPerKg,
          fatG: remainingKg * p.fatGPerKg,
        });
      }
    }

    return Array.from(locationMap.values()).map((entry) => ({
      ...entry,
      kcal: Math.round(entry.kcal),
      proteinG: Math.round(entry.proteinG),
      carbsG: Math.round(entry.carbsG),
      fatG: Math.round(entry.fatG),
    }));
  }

  async getOnHandMacros(householdId: number): Promise<MacroSummary> {
    const items = this.db
      .select({
        quantityKg: storageItem.quantityKg,
        kcalPerKg: crop.kcalPerKg,
        proteinGPerKg: crop.proteinGPerKg,
        carbsGPerKg: crop.carbsGPerKg,
        fatGPerKg: crop.fatGPerKg,
      })
      .from(storageItem)
      .innerJoin(crop, eq(storageItem.cropId, crop.id))
      .where(eq(storageItem.householdId, householdId))
      .all();

    if (items.length === 0) {
      return { ...ZERO_MACROS };
    }

    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;

    for (const item of items) {
      kcal += item.quantityKg * item.kcalPerKg;
      proteinG += item.quantityKg * item.proteinGPerKg;
      carbsG += item.quantityKg * item.carbsGPerKg;
      fatG += item.quantityKg * item.fatGPerKg;
    }

    return {
      kcal: Math.round(kcal),
      proteinG: Math.round(proteinG),
      carbsG: Math.round(carbsG),
      fatG: Math.round(fatG),
    };
  }

  private getRemainingKg(p: ActivePlanting, totalHarvested: number): number {
    if (p.plantingMode === 'count') {
      const yieldPerPlant = p.yieldKgPerPlantOverride ?? p.yieldKgPerPlant ?? 0;
      return Math.max(0, (p.quantity ?? 0) * yieldPerPlant - totalHarvested);
    }
    return Math.max(0, p.areaM2 * p.yieldKgPerM2 - totalHarvested);
  }

  private sumGrowingMacros(
    plantings: ActivePlanting[],
    harvestMap: Map<number, number>,
  ): MacroSummary {
    let kcal = 0;
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;

    for (const p of plantings) {
      const remainingKg = this.getRemainingKg(p, harvestMap.get(p.plantingId) ?? 0);
      kcal += remainingKg * p.kcalPerKg;
      proteinG += remainingKg * p.proteinGPerKg;
      carbsG += remainingKg * p.carbsGPerKg;
      fatG += remainingKg * p.fatGPerKg;
    }

    return {
      kcal: Math.round(kcal),
      proteinG: Math.round(proteinG),
      carbsG: Math.round(carbsG),
      fatG: Math.round(fatG),
    };
  }

  private fetchPlantingsForLocation(locationId: number): ActivePlantingWithCrop[] {
    return this.db
      .select({
        plantingId: planting.id,
        cropId: planting.cropId,
        locationId: growingLocation.id,
        locationName: growingLocation.name,
        cropName: crop.name,
        plantingMode: planting.plantingMode,
        areaM2: planting.areaM2,
        quantity: planting.quantity,
        yieldKgPerPlantOverride: planting.yieldKgPerPlantOverride,
        yieldKgPerM2: crop.yieldKgPerM2,
        yieldKgPerPlant: crop.yieldKgPerPlant,
        kcalPerKg: crop.kcalPerKg,
        proteinGPerKg: crop.proteinGPerKg,
        carbsGPerKg: crop.carbsGPerKg,
        fatGPerKg: crop.fatGPerKg,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .where(and(eq(planting.locationId, locationId), ne(planting.status, 'harvested')))
      .all();
  }

  private buildPlantingEntry(
    p: ActivePlantingWithCrop,
    harvestMap: Map<number, number>,
  ): PlantingSummaryEntry {
    const expectedYieldKg = this.getRemainingKg(p, harvestMap.get(p.plantingId) ?? 0);
    return {
      plantingId: p.plantingId,
      cropName: p.cropName,
      plantingMode: p.plantingMode,
      areaM2: p.areaM2,
      quantity: p.quantity,
      expectedYieldKg,
      kcal: Math.round(expectedYieldKg * p.kcalPerKg),
      proteinG: Math.round(expectedYieldKg * p.proteinGPerKg),
      carbsG: Math.round(expectedYieldKg * p.carbsGPerKg),
      fatG: Math.round(expectedYieldKg * p.fatGPerKg),
    };
  }

  async getLocationSummary(locationId: number): Promise<LocationSummary | null> {
    const locationRow = this.db
      .select({
        id: growingLocation.id,
        name: growingLocation.name,
        areaM2: growingLocation.areaM2,
        description: growingLocation.description,
      })
      .from(growingLocation)
      .where(eq(growingLocation.id, locationId))
      .get();

    if (!locationRow) return null;

    const activePlantings = this.fetchPlantingsForLocation(locationId);

    if (activePlantings.length === 0) {
      return { location: locationRow, plantings: [], totals: { ...ZERO_MACROS } };
    }

    const plantingIds = activePlantings.map((p) => p.plantingId);
    const harvestMap = this.buildHarvestMap(plantingIds);
    const plantings = activePlantings.map((p) => this.buildPlantingEntry(p, harvestMap));

    const totals = plantings.reduce(
      (acc, entry) => ({
        kcal: acc.kcal + entry.kcal,
        proteinG: acc.proteinG + entry.proteinG,
        carbsG: acc.carbsG + entry.carbsG,
        fatG: acc.fatG + entry.fatG,
      }),
      { ...ZERO_MACROS },
    );

    return { location: locationRow, plantings, totals };
  }
}
