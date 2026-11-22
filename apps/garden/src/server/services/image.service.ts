import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import exifReader from 'exif-reader';
import { eq } from 'drizzle-orm';
import type { DB } from '../db/index';
import { image } from '../db/schema';
import type { Image } from '../db/schema';

const MAX_LONG_EDGE_PX = 1600;
const WEBP_QUALITY = 80;
const OUTPUT_MIME = 'image/webp';

export class ImageService {
  constructor(private readonly db: DB) {}

  async upload(buffer: Buffer, mime: string): Promise<Image> {
    if (!mime.startsWith('image/')) {
      throw new Error(`Unsupported mime type: ${mime}`);
    }

    const takenAt = await extractTakenAt(buffer);

    const { data, info } = await sharp(buffer)
      .rotate()
      .resize({
        width: MAX_LONG_EDGE_PX,
        height: MAX_LONG_EDGE_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });

    const id = randomUUID();
    const rows = this.db
      .insert(image)
      .values({
        id,
        bytes: data,
        mime: OUTPUT_MIME,
        sizeBytes: data.length,
        width: info.width,
        height: info.height,
        takenAt,
      })
      .returning()
      .all();
    return rows[0]!;
  }

  async getById(id: string): Promise<Image | null> {
    const rows = await this.db.select().from(image).where(eq(image.id, id));
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<void> {
    this.db.delete(image).where(eq(image.id, id)).run();
  }
}

async function extractTakenAt(buffer: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(buffer).metadata();
    if (!meta.exif) {
      return null;
    }
    const parsed = exifReader(meta.exif);
    const dt = parsed?.Photo?.DateTimeOriginal;
    if (!dt) {
      return null;
    }
    const d = dt instanceof Date ? dt : new Date(dt);
    if (Number.isNaN(d.getTime())) {
      return null;
    }
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}
