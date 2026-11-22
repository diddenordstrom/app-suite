import { and, eq, isNotNull, or } from 'drizzle-orm';
import type { DB } from '../db/index';
import { storageItem, householdCropWishlist, type StorageItem } from '../db/schema';

export interface DepletionResult {
  storageItemId: number;
  cropId: number;
  quantityKg: number;
  kgPerWeek: number | null;
  depletionDate: string | null;
  weeksRemaining: number | null;
}

function addWeeksToDate(date: Date, weeks: number): string {
  const days = Math.round(weeks * 7);
  const ms = date.getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function buildDepletionResult(
  item: StorageItem,
  totalQtyByCrop: Map<number, number>,
  kgPerWeekByCrop: Map<number, number>,
): DepletionResult {
  const kgPerWeek = kgPerWeekByCrop.get(item.cropId);
  const totalQty = totalQtyByCrop.get(item.cropId) ?? item.quantityKg;

  if (kgPerWeek == null) {
    return {
      storageItemId: item.id,
      cropId: item.cropId,
      quantityKg: item.quantityKg,
      kgPerWeek: null,
      depletionDate: null,
      weeksRemaining: null,
    };
  }

  const weeksRemaining = totalQty / kgPerWeek;

  return {
    storageItemId: item.id,
    cropId: item.cropId,
    quantityKg: item.quantityKg,
    kgPerWeek,
    weeksRemaining,
    depletionDate: null,
  };
}

export class StorageDepletionService {
  constructor(private readonly db: DB) {}

  async getDepletionForHousehold(
    householdId: number,
    today: Date = new Date(),
  ): Promise<DepletionResult[]> {
    const items = await this.db
      .select()
      .from(storageItem)
      .where(eq(storageItem.householdId, householdId));

    if (items.length === 0) return [];

    const wishlistRows = await this.db
      .select({
        cropId: householdCropWishlist.cropId,
        kgPerWeek: householdCropWishlist.kgPerWeek,
        kgPerYear: householdCropWishlist.kgPerYear,
      })
      .from(householdCropWishlist)
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          or(
            isNotNull(householdCropWishlist.kgPerWeek),
            isNotNull(householdCropWishlist.kgPerYear),
          ),
        ),
      );

    // Effective weekly burn rate combines weekly (eat-as-grown) and yearly
    // (preservation crops like vitlök) demand into a single per-week
    // consumption number for depletion projection. A row with only kgPerYear=3
    // burns ≈ 0.058 kg/week → ~17 weeks from a 1kg stash. Without this the
    // depletion projection would be "unknown" for every preservation crop.
    const kgPerWeekByCrop = new Map<number, number>();
    for (const row of wishlistRows) {
      const effectiveWeekly = (row.kgPerWeek ?? 0) + (row.kgPerYear ?? 0) / 52;
      if (effectiveWeekly > 0) {
        kgPerWeekByCrop.set(row.cropId, effectiveWeekly);
      }
    }

    const totalQtyByCrop = new Map<number, number>();
    for (const item of items) {
      const current = totalQtyByCrop.get(item.cropId) ?? 0;
      totalQtyByCrop.set(item.cropId, current + item.quantityKg);
    }

    return items.map((item) => {
      const partial = buildDepletionResult(item, totalQtyByCrop, kgPerWeekByCrop);
      if (partial.weeksRemaining !== null) {
        return { ...partial, depletionDate: addWeeksToDate(today, partial.weeksRemaining) };
      }
      return partial;
    });
  }
}
