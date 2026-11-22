import { and, desc, eq, gte, inArray, lt, sum } from 'drizzle-orm';
import type { DB } from '../db/index';
import { growingLocation, harvestEvent, planting, type HarvestEvent } from '../db/schema';

export class HarvestEventService {
  constructor(private readonly db: DB) {}

  async create(
    plantingId: number,
    quantityKg: number,
    harvestedDate: string,
    addedToStorage: boolean,
  ): Promise<HarvestEvent> {
    const rows = this.db
      .insert(harvestEvent)
      .values({ plantingId, quantityKg, harvestedDate, addedToStorage })
      .returning()
      .all();
    return rows[0]!;
  }

  async listByPlanting(plantingId: number): Promise<HarvestEvent[]> {
    return this.db
      .select()
      .from(harvestEvent)
      .where(eq(harvestEvent.plantingId, plantingId))
      .orderBy(desc(harvestEvent.harvestedDate), desc(harvestEvent.id));
  }

  async sumByPlantingId(plantingId: number): Promise<number> {
    const rows = this.db
      .select({ total: sum(harvestEvent.quantityKg) })
      .from(harvestEvent)
      .where(eq(harvestEvent.plantingId, plantingId))
      .all();
    return Number(rows[0]?.total ?? 0);
  }

  async sumByPlantingIds(plantingIds: number[]): Promise<Map<number, number>> {
    const result = new Map<number, number>();
    for (const id of plantingIds) {
      result.set(id, 0);
    }

    if (plantingIds.length === 0) {
      return result;
    }

    const rows = this.db
      .select({ plantingId: harvestEvent.plantingId, total: sum(harvestEvent.quantityKg) })
      .from(harvestEvent)
      .where(inArray(harvestEvent.plantingId, plantingIds))
      .groupBy(harvestEvent.plantingId)
      .all();

    for (const row of rows) {
      result.set(row.plantingId, Number(row.total ?? 0));
    }

    return result;
  }

  async sumByHouseholdAndYear(householdId: number, year: number): Promise<number> {
    const startDate = `${year}-01-01`;
    const endDate = `${year + 1}-01-01`;

    const rows = this.db
      .select({ total: sum(harvestEvent.quantityKg) })
      .from(harvestEvent)
      .innerJoin(planting, eq(harvestEvent.plantingId, planting.id))
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          gte(harvestEvent.harvestedDate, startDate),
          lt(harvestEvent.harvestedDate, endDate),
        ),
      )
      .all();

    return Number(rows[0]?.total ?? 0);
  }
}
