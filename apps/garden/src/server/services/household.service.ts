import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { household, type Household, type NewHousehold } from '../db/schema';

export class HouseholdService {
  constructor(private readonly db: DB) {}

  async create(data: NewHousehold): Promise<Household> {
    const rows = this.db.insert(household).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<Household | null> {
    const rows = await this.db.select().from(household).where(eq(household.id, id));
    return rows[0] ?? null;
  }

  async getAll(): Promise<Household[]> {
    return this.db.select().from(household);
  }

  async update(id: number, data: Partial<NewHousehold>): Promise<Household | null> {
    const rows = this.db.update(household).set(data).where(eq(household.id, id)).returning().all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(household).where(eq(household.id, id)).returning().all();
    return rows.length > 0;
  }
}
