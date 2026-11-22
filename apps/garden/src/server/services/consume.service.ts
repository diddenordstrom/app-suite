import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { storageItem, type StorageItem } from '../db/schema';

export class ConsumeService {
  constructor(private readonly db: DB) {}

  async consume(items: StorageItem[], _cropId: number, kg: number): Promise<void> {
    const sorted = [...items].sort((a, b) => a.harvestedDate.localeCompare(b.harvestedDate));
    let remaining = kg;

    for (const batch of sorted) {
      if (remaining <= 0) break;

      if (remaining >= batch.quantityKg) {
        remaining -= batch.quantityKg;
        this.db.delete(storageItem).where(eq(storageItem.id, batch.id)).run();
      } else {
        const newQty = batch.quantityKg - remaining;
        remaining = 0;
        this.db
          .update(storageItem)
          .set({ quantityKg: newQty })
          .where(eq(storageItem.id, batch.id))
          .run();
      }
    }
  }
}
