import { eq, inArray } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  harvestEvent,
  garden,
  gardenEvent,
  storageItem,
  expense,
  cropBurnRate,
  householdCropWishlist,
  macroTarget,
  planting,
  growingLocation,
  activity,
} from '../db/schema';

export class ResetService {
  constructor(private readonly db: DB) {}

  async resetHousehold(householdId: number): Promise<void> {
    const locations = this.db
      .select({ id: growingLocation.id })
      .from(growingLocation)
      .where(eq(growingLocation.householdId, householdId))
      .all();
    const locationIds = locations.map((l) => l.id);

    if (locationIds.length > 0) {
      const plantings = this.db
        .select({ id: planting.id })
        .from(planting)
        .where(inArray(planting.locationId, locationIds))
        .all();
      const plantingIds = plantings.map((p) => p.id);

      if (plantingIds.length > 0) {
        this.db.delete(harvestEvent).where(inArray(harvestEvent.plantingId, plantingIds)).run();
      }

      // Delete storage items before plantings (storageItem.plantingId FK)
      this.db.delete(storageItem).where(eq(storageItem.householdId, householdId)).run();
      this.db.delete(planting).where(inArray(planting.locationId, locationIds)).run();
    }

    // Delete household-scoped data (order respects FK constraints)
    this.db.delete(gardenEvent).where(eq(gardenEvent.householdId, householdId)).run();
    this.db.delete(storageItem).where(eq(storageItem.householdId, householdId)).run();
    this.db.delete(expense).where(eq(expense.householdId, householdId)).run();
    this.db.delete(cropBurnRate).where(eq(cropBurnRate.householdId, householdId)).run();
    this.db
      .delete(householdCropWishlist)
      .where(eq(householdCropWishlist.householdId, householdId))
      .run();
    this.db.delete(macroTarget).where(eq(macroTarget.householdId, householdId)).run();
    this.db.delete(garden).where(eq(garden.householdId, householdId)).run();
    this.db.delete(growingLocation).where(eq(growingLocation.householdId, householdId)).run();

    this.db.delete(activity).where(eq(activity.householdId, householdId)).run();
  }
}
