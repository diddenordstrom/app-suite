import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { crop, household, householdCropWishlist, macroTarget } from '../db/schema';

export type MacroType = 'protein' | 'carbs' | 'fat';

export interface CropSuggestion {
  cropId: number;
  cropName: string;
  valuePerKg: number;
}

export interface MacroAdvisory {
  totalWishlistEntries: number;
  // Entries that have at least one of (kgPerWeek, kgPerYear) set. Renamed
  // from entriesWithKgPerWeek when the wishlist demand model became two-axis;
  // the semantic is now "has demand", not "has weekly demand".
  entriesWithDemand: number;
  projectedCoverage: {
    proteinPct: number;
    carbsPct: number;
    fatPct: number;
  } | null;
  weakestMacro: MacroType | null;
  weakestPct: number | null;
  suggestions: CropSuggestion[];
}

const THRESHOLD_PCT = 50;
const MAX_SUGGESTIONS = 3;

// Nordic moderate defaults (per person per day)
const NORDIC_DEFAULTS = {
  proteinG: 95,
  carbsG: 310,
  fatG: 85,
};

export class MacroAdvisoryService {
  constructor(private readonly db: DB) {}

  async getAdvisory(householdId: number): Promise<MacroAdvisory> {
    const wishlistRows = this.getWishlistEntries(householdId);

    const totalWishlistEntries = wishlistRows.length;
    const withDemand = wishlistRows.filter((r) => r.kgPerWeek !== null || r.kgPerYear !== null);
    const entriesWithDemand = withDemand.length;

    if (totalWishlistEntries === 0 || entriesWithDemand < totalWishlistEntries) {
      return {
        totalWishlistEntries,
        entriesWithDemand,
        projectedCoverage: null,
        weakestMacro: null,
        weakestPct: null,
        suggestions: [],
      };
    }

    const dailyTarget = this.getDailyTarget(householdId);
    const projected = this.computeProjectedMacros(withDemand);
    const coverage = this.computeCoverage(projected, dailyTarget);
    const weakest = this.findWeakest(coverage);

    const suggestions = weakest !== null ? this.getSuggestions(householdId, weakest.macro) : [];

    return {
      totalWishlistEntries,
      entriesWithDemand,
      projectedCoverage: coverage,
      weakestMacro: weakest?.macro ?? null,
      weakestPct: weakest?.pct ?? null,
      suggestions,
    };
  }

  private getWishlistEntries(householdId: number) {
    return this.db
      .select({
        cropId: householdCropWishlist.cropId,
        kgPerWeek: householdCropWishlist.kgPerWeek,
        kgPerYear: householdCropWishlist.kgPerYear,
        proteinGPerKg: crop.proteinGPerKg,
        carbsGPerKg: crop.carbsGPerKg,
        fatGPerKg: crop.fatGPerKg,
      })
      .from(householdCropWishlist)
      .innerJoin(crop, eq(householdCropWishlist.cropId, crop.id))
      .where(eq(householdCropWishlist.householdId, householdId))
      .all();
  }

  private getDailyTarget(householdId: number): {
    proteinG: number;
    carbsG: number;
    fatG: number;
  } {
    const active = this.db
      .select({
        dailyProteinG: macroTarget.dailyProteinG,
        dailyCarbsG: macroTarget.dailyCarbsG,
        dailyFatG: macroTarget.dailyFatG,
      })
      .from(macroTarget)
      .where(and(eq(macroTarget.householdId, householdId), eq(macroTarget.active, true)))
      .get();

    if (active) {
      return {
        proteinG: active.dailyProteinG,
        carbsG: active.dailyCarbsG,
        fatG: active.dailyFatG,
      };
    }

    const persons = this.getPersons(householdId);
    return {
      proteinG: NORDIC_DEFAULTS.proteinG * persons,
      carbsG: NORDIC_DEFAULTS.carbsG * persons,
      fatG: NORDIC_DEFAULTS.fatG * persons,
    };
  }

  private getPersons(householdId: number): number {
    const row = this.db
      .select({ persons: household.persons })
      .from(household)
      .where(eq(household.id, householdId))
      .get();
    return row?.persons ?? 1;
  }

  private computeProjectedMacros(
    entries: Array<{
      kgPerWeek: number | null;
      kgPerYear: number | null;
      proteinGPerKg: number;
      carbsGPerKg: number;
      fatGPerKg: number;
    }>,
  ): { proteinG: number; carbsG: number; fatG: number } {
    let proteinG = 0;
    let carbsG = 0;
    let fatG = 0;

    for (const e of entries) {
      const annualKg = (e.kgPerWeek ?? 0) * 52 + (e.kgPerYear ?? 0);
      proteinG += annualKg * e.proteinGPerKg;
      carbsG += annualKg * e.carbsGPerKg;
      fatG += annualKg * e.fatGPerKg;
    }

    return { proteinG, carbsG, fatG };
  }

  private computeCoverage(
    projected: { proteinG: number; carbsG: number; fatG: number },
    daily: { proteinG: number; carbsG: number; fatG: number },
  ): { proteinPct: number; carbsPct: number; fatPct: number } {
    return {
      proteinPct: this.pct(projected.proteinG, daily.proteinG * 365),
      carbsPct: this.pct(projected.carbsG, daily.carbsG * 365),
      fatPct: this.pct(projected.fatG, daily.fatG * 365),
    };
  }

  private pct(value: number, target: number): number {
    if (target <= 0) return 0;
    return Math.round((value / target) * 100);
  }

  private findWeakest(coverage: {
    proteinPct: number;
    carbsPct: number;
    fatPct: number;
  }): { macro: MacroType; pct: number } | null {
    const entries: Array<{ macro: MacroType; pct: number }> = [
      { macro: 'protein', pct: coverage.proteinPct },
      { macro: 'carbs', pct: coverage.carbsPct },
      { macro: 'fat', pct: coverage.fatPct },
    ];

    const weakest = entries.reduce((min, e) => (e.pct < min.pct ? e : min));
    if (weakest.pct >= THRESHOLD_PCT) return null;
    return weakest;
  }

  private getSuggestions(householdId: number, weakMacro: MacroType): CropSuggestion[] {
    const wishlistCropIds = this.db
      .select({ cropId: householdCropWishlist.cropId })
      .from(householdCropWishlist)
      .where(eq(householdCropWishlist.householdId, householdId))
      .all()
      .map((r) => r.cropId);

    const macroColumn = this.getMacroColumn(weakMacro);

    const allCrops = this.db
      .select({
        cropId: crop.id,
        cropName: crop.name,
        valuePerKg: macroColumn,
        isPerennial: crop.isPerennial,
      })
      .from(crop)
      .where(eq(crop.isPerennial, false))
      .all();

    const wishlistSet = new Set(wishlistCropIds);

    return allCrops
      .filter((c) => !wishlistSet.has(c.cropId))
      .sort((a, b) => b.valuePerKg - a.valuePerKg)
      .slice(0, MAX_SUGGESTIONS)
      .map((c) => ({
        cropId: c.cropId,
        cropName: c.cropName,
        valuePerKg: c.valuePerKg,
      }));
  }

  private getMacroColumn(macro: MacroType) {
    switch (macro) {
      case 'protein':
        return crop.proteinGPerKg;
      case 'carbs':
        return crop.carbsGPerKg;
      case 'fat':
        return crop.fatGPerKg;
    }
  }
}
