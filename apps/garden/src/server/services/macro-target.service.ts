import { and, eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { macroTarget, type MacroTarget, type NewMacroTarget } from '../db/schema';

export class MacroTargetService {
  constructor(private readonly db: DB) {}

  private async deactivateAllForHousehold(householdId: number): Promise<void> {
    await this.db
      .update(macroTarget)
      .set({ active: false })
      .where(eq(macroTarget.householdId, householdId));
  }

  async create(data: NewMacroTarget): Promise<MacroTarget> {
    if (data.active) {
      await this.deactivateAllForHousehold(data.householdId);
    }
    const rows = this.db.insert(macroTarget).values(data).returning().all();
    return rows[0]!;
  }

  async getById(id: number): Promise<MacroTarget | null> {
    const rows = await this.db.select().from(macroTarget).where(eq(macroTarget.id, id));
    return rows[0] ?? null;
  }

  async getByHouseholdId(householdId: number): Promise<MacroTarget[]> {
    return this.db.select().from(macroTarget).where(eq(macroTarget.householdId, householdId));
  }

  async getActiveByHouseholdId(householdId: number): Promise<MacroTarget | null> {
    const rows = await this.db
      .select()
      .from(macroTarget)
      .where(and(eq(macroTarget.householdId, householdId), eq(macroTarget.active, true)));
    return rows[0] ?? null;
  }

  async update(id: number, data: Partial<NewMacroTarget>): Promise<MacroTarget | null> {
    if (data.active) {
      const existing = await this.getById(id);
      if (existing) {
        await this.deactivateAllForHousehold(existing.householdId);
      }
    }
    const rows = this.db
      .update(macroTarget)
      .set(data)
      .where(eq(macroTarget.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(macroTarget).where(eq(macroTarget.id, id)).returning().all();
    return rows.length > 0;
  }

  async setActive(id: number): Promise<MacroTarget | null> {
    const existing = await this.getById(id);
    if (!existing) {
      return null;
    }
    await this.deactivateAllForHousehold(existing.householdId);
    const rows = this.db
      .update(macroTarget)
      .set({ active: true })
      .where(eq(macroTarget.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }
}
