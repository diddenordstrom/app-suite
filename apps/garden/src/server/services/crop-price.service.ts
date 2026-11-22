import { and, eq, sql } from 'drizzle-orm';
import type { DB } from '../db/index';
import { householdCropPrice, type HouseholdCropPrice } from '../db/schema';

function assertValidPrice(pricePerKg: number): void {
  if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
    throw new Error('pricePerKg must be a finite number greater than 0.');
  }
}

export class CropPriceService {
  constructor(private readonly db: DB) {}

  async upsert(
    householdId: number,
    cropId: number,
    pricePerKg: number,
  ): Promise<HouseholdCropPrice> {
    assertValidPrice(pricePerKg);

    const rows = this.db
      .insert(householdCropPrice)
      .values({ householdId, cropId, pricePerKg })
      .onConflictDoUpdate({
        target: [householdCropPrice.householdId, householdCropPrice.cropId],
        set: {
          pricePerKg,
          updatedAt: sql`(datetime('now'))`,
        },
      })
      .returning()
      .all();
    return rows[0]!;
  }

  async getPrice(householdId: number, cropId: number): Promise<HouseholdCropPrice | null> {
    const rows = await this.db
      .select()
      .from(householdCropPrice)
      .where(
        and(eq(householdCropPrice.householdId, householdId), eq(householdCropPrice.cropId, cropId)),
      );
    return rows[0] ?? null;
  }

  async listForHousehold(householdId: number): Promise<HouseholdCropPrice[]> {
    return this.db
      .select()
      .from(householdCropPrice)
      .where(eq(householdCropPrice.householdId, householdId));
  }

  async remove(householdId: number, cropId: number): Promise<boolean> {
    const rows = this.db
      .delete(householdCropPrice)
      .where(
        and(eq(householdCropPrice.householdId, householdId), eq(householdCropPrice.cropId, cropId)),
      )
      .returning()
      .all();
    return rows.length > 0;
  }
}
