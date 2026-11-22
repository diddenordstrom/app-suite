import { eq, and } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  planting,
  storageItem,
  growingLocation,
  type Planting,
  type NewPlanting,
} from '../db/schema';

export class PlantingService {
  constructor(private readonly db: DB) {}

  async create(data: NewPlanting): Promise<Planting> {
    if (data.plantingMode === 'count' && (data.quantity == null || data.quantity <= 0)) {
      throw new Error('quantity must be a positive integer for count-mode plantings');
    }
    const rows = this.db.insert(planting).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<Planting | null> {
    const rows = await this.db.select().from(planting).where(eq(planting.id, id));
    return rows[0] ?? null;
  }

  async getAll(): Promise<Planting[]> {
    return this.db.select().from(planting);
  }

  async getByHouseholdId(householdId: number): Promise<Planting[]> {
    return this.db
      .select({ planting })
      .from(planting)
      .innerJoin(growingLocation, eq(growingLocation.id, planting.locationId))
      .where(eq(growingLocation.householdId, householdId))
      .all()
      .map((row) => row.planting);
  }

  async getByLocationId(locationId: number): Promise<Planting[]> {
    return this.db.select().from(planting).where(eq(planting.locationId, locationId));
  }

  async update(id: number, data: Partial<NewPlanting>): Promise<Planting | null> {
    const rows = this.db.update(planting).set(data).where(eq(planting.id, id)).returning().all();
    return rows[0] ?? null;
  }

  async getByHouseholdAndStatus(householdId: number, status: string): Promise<Planting[]> {
    const rows = await this.db
      .select({ planting })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(and(eq(growingLocation.householdId, householdId), eq(planting.status, status)));
    return rows.map((r) => r.planting);
  }

  async delete(id: number): Promise<boolean> {
    // Nullify nullable FK references before deleting the planting.
    // The garden_event_planting junction table cascades on delete, so no
    // explicit cleanup is needed there.
    this.db
      .update(storageItem)
      .set({ plantingId: null })
      .where(eq(storageItem.plantingId, id))
      .run();
    const rows = this.db.delete(planting).where(eq(planting.id, id)).returning().all();
    return rows.length > 0;
  }
}
