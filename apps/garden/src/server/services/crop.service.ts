import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { crop, type Crop } from '../db/schema';

export class CropService {
  constructor(private readonly db: DB) {}

  async getAllCrops(): Promise<Crop[]> {
    return this.db.select().from(crop);
  }

  async getCropById(id: number): Promise<Crop | null> {
    const results = await this.db.select().from(crop).where(eq(crop.id, id));
    return results[0] ?? null;
  }

  async getCropsByCategory(category: string): Promise<Crop[]> {
    return this.db.select().from(crop).where(eq(crop.category, category));
  }
}
