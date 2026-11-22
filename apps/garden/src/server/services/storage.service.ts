import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { storageItem, crop, type StorageItem, type NewStorageItem } from '../db/schema';

export interface StorageBatch {
  id: number;
  quantityKg: number;
  harvestedDate: string;
  expiresAt: string | null;
  plantingId: number | null;
}

export interface StorageGroup {
  cropId: number;
  cropName: string;
  totalKg: number;
  defaultConsumeKg: number;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  batches: StorageBatch[];
}

function addWeeksToDate(dateStr: string, weeks: number): string {
  const date = new Date(dateStr + 'T00:00:00Z');
  const ms = date.getTime() + Math.round(weeks * 7) * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

function diffDays(from: Date, toStr: string): number {
  const to = new Date(toStr + 'T00:00:00Z');
  return Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

export class StorageService {
  constructor(private readonly db: DB) {}

  async create(data: NewStorageItem): Promise<StorageItem> {
    const rows = this.db.insert(storageItem).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<StorageItem | null> {
    const rows = await this.db.select().from(storageItem).where(eq(storageItem.id, id));
    return rows[0] ?? null;
  }

  async getAll(): Promise<StorageItem[]> {
    return this.db.select().from(storageItem);
  }

  async getByHouseholdId(householdId: number): Promise<StorageItem[]> {
    return this.db.select().from(storageItem).where(eq(storageItem.householdId, householdId));
  }

  async update(id: number, data: Partial<NewStorageItem>): Promise<StorageItem | null> {
    const rows = this.db
      .update(storageItem)
      .set(data)
      .where(eq(storageItem.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(storageItem).where(eq(storageItem.id, id)).returning().all();
    return rows.length > 0;
  }

  async getGroupedStorage(householdId: number, today: Date = new Date()): Promise<StorageGroup[]> {
    const rows = this.db
      .select({
        item: storageItem,
        cropName: crop.name,
        shelfLifeWeeks: crop.shelfLifeWeeks,
        defaultConsumeKg: crop.defaultConsumeKg,
      })
      .from(storageItem)
      .innerJoin(crop, eq(storageItem.cropId, crop.id))
      .where(eq(storageItem.householdId, householdId))
      .all();

    if (rows.length === 0) return [];

    const groupMap = new Map<number, StorageGroup>();

    for (const row of rows) {
      const { item, cropName, shelfLifeWeeks, defaultConsumeKg } = row;
      const expiresAt =
        shelfLifeWeeks != null ? addWeeksToDate(item.harvestedDate, shelfLifeWeeks) : null;

      const batch: StorageBatch = {
        id: item.id,
        quantityKg: item.quantityKg,
        harvestedDate: item.harvestedDate,
        expiresAt,
        plantingId: item.plantingId ?? null,
      };

      const existing = groupMap.get(item.cropId);
      if (existing) {
        existing.totalKg += item.quantityKg;
        existing.batches.push(batch);
      } else {
        groupMap.set(item.cropId, {
          cropId: item.cropId,
          cropName,
          totalKg: item.quantityKg,
          defaultConsumeKg: defaultConsumeKg ?? 0,
          expiresAt: null,
          daysUntilExpiry: null,
          batches: [batch],
        });
      }
    }

    for (const group of groupMap.values()) {
      group.batches.sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));

      const expiries = group.batches
        .map((b) => b.expiresAt)
        .filter((e): e is string => e !== null)
        .sort();

      group.expiresAt = expiries[0] ?? null;
      group.daysUntilExpiry = group.expiresAt !== null ? diffDays(today, group.expiresAt) : null;
    }

    return [...groupMap.values()].sort((a, b) => {
      if (a.expiresAt === null && b.expiresAt === null) return 0;
      if (a.expiresAt === null) return 1;
      if (b.expiresAt === null) return -1;
      return a.expiresAt.localeCompare(b.expiresAt);
    });
  }
}
