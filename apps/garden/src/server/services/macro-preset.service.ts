import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { macroPreset, type MacroPreset } from '../db/schema';

export class MacroPresetService {
  constructor(private readonly db: DB) {}

  async getAll(): Promise<MacroPreset[]> {
    return this.db.select().from(macroPreset);
  }

  async getById(id: number): Promise<MacroPreset | null> {
    const rows = await this.db.select().from(macroPreset).where(eq(macroPreset.id, id));
    return rows[0] ?? null;
  }
}
