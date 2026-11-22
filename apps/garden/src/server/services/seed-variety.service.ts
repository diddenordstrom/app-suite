import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { seedVariety, type SeedVariety, type NewSeedVariety } from '../db/schema';

export class SeedVarietyService {
  constructor(private readonly db: DB) {}

  async create(data: NewSeedVariety): Promise<SeedVariety> {
    const rows = this.db.insert(seedVariety).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<SeedVariety | null> {
    const rows = await this.db.select().from(seedVariety).where(eq(seedVariety.id, id));
    return rows[0] ?? null;
  }

  async getByCropId(cropId: number): Promise<SeedVariety[]> {
    return this.db.select().from(seedVariety).where(eq(seedVariety.cropId, cropId));
  }

  async getAll(): Promise<SeedVariety[]> {
    return this.db.select().from(seedVariety);
  }

  async update(id: number, data: Partial<NewSeedVariety>): Promise<SeedVariety | null> {
    const rows = this.db
      .update(seedVariety)
      .set(data)
      .where(eq(seedVariety.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(seedVariety).where(eq(seedVariety.id, id)).returning().all();
    return rows.length > 0;
  }
}
