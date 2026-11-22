import { eq } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { DB } from '../db/index';
import {
  expense,
  garden,
  gardenEvent,
  growingLocation,
  householdCropWishlist,
  macroTarget,
  planting,
  storageItem,
} from '../db/schema';
import type { ScopedEntity, ScopeRef } from '../utils/scope-refs';

export type ScopeViolation = ScopeRef & { reason: 'foreign' | 'missing' };

type Lookup = (db: DB, id: number) => number | undefined;

type Owned = SQLiteTable & { id: SQLiteColumn; householdId: SQLiteColumn };

const byHouseholdColumn =
  (table: Owned): Lookup =>
  (db, id) =>
    db.select({ h: table.householdId }).from(table).where(eq(table.id, id)).get()?.h as
      number | undefined;

const OWNER_LOOKUPS: Record<Exclude<ScopedEntity, 'household'>, Lookup> = {
  location: byHouseholdColumn(growingLocation),
  storage: byHouseholdColumn(storageItem),
  expense: byHouseholdColumn(expense),
  'garden-event': byHouseholdColumn(gardenEvent),
  garden: byHouseholdColumn(garden),
  'macro-target': byHouseholdColumn(macroTarget),
  wishlist: byHouseholdColumn(householdCropWishlist),
  planting: (db, id) =>
    db
      .select({ h: growingLocation.householdId })
      .from(planting)
      .innerJoin(growingLocation, eq(growingLocation.id, planting.locationId))
      .where(eq(planting.id, id))
      .get()?.h,
};

/** Checks that every referenced row belongs to the active household. */
export class ScopeService {
  constructor(private readonly db: DB) {}

  ownerOf(ref: ScopeRef): number | undefined {
    if (ref.entity === 'household') return ref.id;
    return OWNER_LOOKUPS[ref.entity](this.db, ref.id);
  }

  /** The first reference outside `householdId`, or null when all are in scope. */
  findForeign(householdId: number, refs: ScopeRef[]): ScopeViolation | null {
    for (const ref of refs) {
      const owner = this.ownerOf(ref);
      if (owner === undefined) return { ...ref, reason: 'missing' };
      if (owner !== householdId) return { ...ref, reason: 'foreign' };
    }
    return null;
  }
}
