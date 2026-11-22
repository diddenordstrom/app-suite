import { and, eq, desc, asc } from 'drizzle-orm';
import type { DB } from '../db/index';
import { image, plantingImage } from '../db/schema';
import type { PlantingImage } from '../db/schema';

export interface PlantingImageRow {
  imageId: string;
  caption: string | null;
  sortOrder: number;
  mime: string;
  width: number;
  height: number;
  takenAt: string | null;
  uploadedAt: string | null;
}

export interface AttachInput {
  plantingId: number;
  imageId: string;
  caption?: string | null;
  sortOrder?: number;
}

export interface PatchInput {
  caption?: string | null;
  sortOrder?: number;
}

export class PlantingImageService {
  constructor(private readonly db: DB) {}

  async attach(input: AttachInput): Promise<PlantingImage> {
    const rows = this.db
      .insert(plantingImage)
      .values({
        plantingId: input.plantingId,
        imageId: input.imageId,
        caption: input.caption ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()
      .all();
    return rows[0]!;
  }

  async listByPlanting(plantingId: number): Promise<PlantingImageRow[]> {
    const rows = await this.db
      .select({
        imageId: plantingImage.imageId,
        caption: plantingImage.caption,
        sortOrder: plantingImage.sortOrder,
        mime: image.mime,
        width: image.width,
        height: image.height,
        takenAt: image.takenAt,
        uploadedAt: image.uploadedAt,
      })
      .from(plantingImage)
      .innerJoin(image, eq(plantingImage.imageId, image.id))
      .where(eq(plantingImage.plantingId, plantingId))
      .orderBy(asc(plantingImage.sortOrder), desc(image.uploadedAt));
    return rows;
  }

  async patch(
    plantingId: number,
    imageId: string,
    patch: PatchInput,
  ): Promise<PlantingImage | null> {
    const updates: Partial<PlantingImage> = {};
    if ('caption' in patch) {
      updates.caption = patch.caption ?? null;
    }
    if (patch.sortOrder !== undefined) {
      updates.sortOrder = patch.sortOrder;
    }
    if (Object.keys(updates).length === 0) {
      return this.getJoin(plantingId, imageId);
    }
    const rows = this.db
      .update(plantingImage)
      .set(updates)
      .where(and(eq(plantingImage.plantingId, plantingId), eq(plantingImage.imageId, imageId)))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async detach(plantingId: number, imageId: string): Promise<void> {
    this.db
      .delete(plantingImage)
      .where(and(eq(plantingImage.plantingId, plantingId), eq(plantingImage.imageId, imageId)))
      .run();
  }

  private async getJoin(plantingId: number, imageId: string): Promise<PlantingImage | null> {
    const rows = await this.db
      .select()
      .from(plantingImage)
      .where(and(eq(plantingImage.plantingId, plantingId), eq(plantingImage.imageId, imageId)));
    return rows[0] ?? null;
  }
}
