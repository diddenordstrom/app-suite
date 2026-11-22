import { and, eq, or, isNotNull } from 'drizzle-orm';
import type { DB } from '../db/index';
import { householdCropWishlist, type HouseholdCropWishlist } from '../db/schema';

export type WishlistDemand = {
  kgPerWeek?: number | null;
  kgPerYear?: number | null;
};

function annualizeDemand(row: { kgPerWeek: number | null; kgPerYear: number | null }): number {
  return (row.kgPerWeek ?? 0) * 52 + (row.kgPerYear ?? 0);
}

function assertHasDemand(demand: WishlistDemand | undefined): void {
  const week = demand?.kgPerWeek;
  const year = demand?.kgPerYear;
  const hasWeek = typeof week === 'number' && Number.isFinite(week) && week > 0;
  const hasYear = typeof year === 'number' && Number.isFinite(year) && year > 0;
  if (!hasWeek && !hasYear) {
    throw new Error('At least one of kgPerWeek or kgPerYear must be set as demand.');
  }
}

export class WishlistService {
  constructor(private readonly db: DB) {}

  async add(
    householdId: number,
    cropId: number,
    demand: WishlistDemand,
  ): Promise<HouseholdCropWishlist> {
    assertHasDemand(demand);
    const kgPerWeek = demand.kgPerWeek ?? null;
    const kgPerYear = demand.kgPerYear ?? null;

    const rows = this.db
      .insert(householdCropWishlist)
      .values({ householdId, cropId, kgPerWeek, kgPerYear })
      .onConflictDoNothing()
      .returning()
      .all();
    if (rows.length > 0) return rows[0]!;

    // Already existed — return the existing row
    const existing = await this.db
      .select()
      .from(householdCropWishlist)
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          eq(householdCropWishlist.cropId, cropId),
        ),
      );
    return existing[0]!;
  }

  async updateDemand(id: number, demand: WishlistDemand): Promise<HouseholdCropWishlist | null> {
    assertHasDemand(demand);
    const kgPerWeek = demand.kgPerWeek ?? null;
    const kgPerYear = demand.kgPerYear ?? null;

    const rows = this.db
      .update(householdCropWishlist)
      .set({ kgPerWeek, kgPerYear })
      .where(eq(householdCropWishlist.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  // Returns annualized demand in kg per crop, combining weekly × 52 + yearly.
  // Excludes legacy rows where both demand fields are null — they're surfaced
  // to the user via the "missing demand" badge instead of silently ranked at 0.
  async getAnnualDemandMap(householdId: number): Promise<Map<number, number>> {
    const rows = await this.db
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
    const map = new Map<number, number>();
    for (const row of rows) {
      map.set(row.cropId, annualizeDemand(row));
    }
    return map;
  }

  async removeById(id: number): Promise<boolean> {
    const rows = this.db
      .delete(householdCropWishlist)
      .where(eq(householdCropWishlist.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  async remove(householdId: number, cropId: number): Promise<boolean> {
    const rows = this.db
      .delete(householdCropWishlist)
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          eq(householdCropWishlist.cropId, cropId),
        ),
      )
      .returning()
      .all();
    return rows.length > 0;
  }

  async getForHousehold(householdId: number): Promise<HouseholdCropWishlist[]> {
    return this.db
      .select()
      .from(householdCropWishlist)
      .where(eq(householdCropWishlist.householdId, householdId));
  }

  async isOnWishlist(householdId: number, cropId: number): Promise<boolean> {
    const rows = await this.db
      .select()
      .from(householdCropWishlist)
      .where(
        and(
          eq(householdCropWishlist.householdId, householdId),
          eq(householdCropWishlist.cropId, cropId),
        ),
      );
    return rows.length > 0;
  }

  async clear(householdId: number): Promise<void> {
    this.db
      .delete(householdCropWishlist)
      .where(eq(householdCropWishlist.householdId, householdId))
      .run();
  }
}
