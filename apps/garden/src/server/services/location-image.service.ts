import { and, eq, desc, asc } from 'drizzle-orm';
import type { DB } from '../db/index';
import { image, locationImage } from '../db/schema';
import type { LocationImage } from '../db/schema';

export interface LocationImageRow {
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
  locationId: number;
  imageId: string;
  caption?: string | null;
  sortOrder?: number;
}

export interface PatchInput {
  caption?: string | null;
  sortOrder?: number;
}

export class LocationImageService {
  constructor(private readonly db: DB) {}

  async attach(input: AttachInput): Promise<LocationImage> {
    const rows = this.db
      .insert(locationImage)
      .values({
        locationId: input.locationId,
        imageId: input.imageId,
        caption: input.caption ?? null,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning()
      .all();
    return rows[0]!;
  }

  async listByLocation(locationId: number): Promise<LocationImageRow[]> {
    const rows = await this.db
      .select({
        imageId: locationImage.imageId,
        caption: locationImage.caption,
        sortOrder: locationImage.sortOrder,
        mime: image.mime,
        width: image.width,
        height: image.height,
        takenAt: image.takenAt,
        uploadedAt: image.uploadedAt,
      })
      .from(locationImage)
      .innerJoin(image, eq(locationImage.imageId, image.id))
      .where(eq(locationImage.locationId, locationId))
      .orderBy(asc(locationImage.sortOrder), desc(image.uploadedAt));
    return rows;
  }

  async patch(
    locationId: number,
    imageId: string,
    patch: PatchInput,
  ): Promise<LocationImage | null> {
    const updates: Partial<LocationImage> = {};
    if ('caption' in patch) {
      updates.caption = patch.caption ?? null;
    }
    if (patch.sortOrder !== undefined) {
      updates.sortOrder = patch.sortOrder;
    }
    if (Object.keys(updates).length === 0) {
      return this.getJoin(locationId, imageId);
    }
    const rows = this.db
      .update(locationImage)
      .set(updates)
      .where(and(eq(locationImage.locationId, locationId), eq(locationImage.imageId, imageId)))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async detach(locationId: number, imageId: string): Promise<void> {
    this.db
      .delete(locationImage)
      .where(and(eq(locationImage.locationId, locationId), eq(locationImage.imageId, imageId)))
      .run();
  }

  private async getJoin(locationId: number, imageId: string): Promise<LocationImage | null> {
    const rows = await this.db
      .select()
      .from(locationImage)
      .where(and(eq(locationImage.locationId, locationId), eq(locationImage.imageId, imageId)));
    return rows[0] ?? null;
  }
}
