import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { growingLocation, type GrowingLocation, type NewGrowingLocation } from '../db/schema';
import type { PlantingService } from './planting.service';

export interface MoveResult {
  moved: number;
  deleted: boolean;
}

export class LocationService {
  constructor(private readonly db: DB) {}

  async create(data: NewGrowingLocation): Promise<GrowingLocation> {
    const rows = this.db.insert(growingLocation).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<GrowingLocation | null> {
    const rows = await this.db.select().from(growingLocation).where(eq(growingLocation.id, id));
    return rows[0] ?? null;
  }

  async getAll(): Promise<GrowingLocation[]> {
    return this.db.select().from(growingLocation);
  }

  async getByHouseholdId(householdId: number): Promise<GrowingLocation[]> {
    return this.db
      .select()
      .from(growingLocation)
      .where(eq(growingLocation.householdId, householdId));
  }

  async update(id: number, data: Partial<NewGrowingLocation>): Promise<GrowingLocation | null> {
    const rows = this.db
      .update(growingLocation)
      .set(data)
      .where(eq(growingLocation.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db
      .delete(growingLocation)
      .where(eq(growingLocation.id, id))
      .returning()
      .all();
    return rows.length > 0;
  }

  async movePlantingsAndDelete(
    sourceId: number,
    targetId: number,
    plantingService: PlantingService,
  ): Promise<MoveResult> {
    if (sourceId === targetId) {
      throw new Error('Target location must be different from source');
    }

    const source = await this.getById(sourceId);
    if (!source) {
      return { moved: 0, deleted: false };
    }

    const target = await this.getById(targetId);
    if (!target) {
      throw new Error('Target location not found');
    }

    const plantings = await plantingService.getByLocationId(sourceId);

    for (const p of plantings) {
      await plantingService.update(p.id, { locationId: targetId });
    }

    await this.delete(sourceId);

    return { moved: plantings.length, deleted: true };
  }
}
