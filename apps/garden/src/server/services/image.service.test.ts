import { describe, it, expect, beforeEach } from 'vitest';
import sharp, { type Sharp } from 'sharp';
import { eq } from 'drizzle-orm';
import { ImageService } from './image.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 80, b: 80 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

async function makeJpegWithExif(
  width: number,
  height: number,
  exif: Parameters<Sharp['withExif']>[0],
): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 50, g: 120, b: 50 } },
  })
    .withExif(exif)
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('ImageService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: ImageService;

  beforeEach(() => {
    db = createTestDb();
    service = new ImageService(db);
  });

  // ---------------------------------------------------------------------------
  // upload()
  // ---------------------------------------------------------------------------

  describe('upload()', () => {
    it('stores a JPEG as WebP with correct dimensions and metadata', async () => {
      // Arrange
      const buf = await makeJpeg(400, 300);

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
      expect(result.mime).toBe('image/webp');
      expect(result.width).toBe(400);
      expect(result.height).toBe(300);
      expect(result.sizeBytes).toBeGreaterThan(0);
      expect(result.uploadedAt).toBeTruthy();
    });

    it('persists the row to the database', async () => {
      // Arrange
      const buf = await makeJpeg(200, 150);

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      const rows = await db.select().from(schema.image).where(eq(schema.image.id, result.id));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.mime).toBe('image/webp');
      expect(rows[0]!.bytes).toBeInstanceOf(Buffer);
    });

    it('resizes images larger than 1600px on the long edge down', async () => {
      // Arrange
      const buf = await makeJpeg(3200, 2400);

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      expect(result.width).toBe(1600);
      expect(result.height).toBe(1200);
    });

    it('does not enlarge images smaller than 1600px', async () => {
      // Arrange
      const buf = await makeJpeg(800, 600);

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      expect(result.width).toBe(800);
      expect(result.height).toBe(600);
    });

    it('rejects non-image mime types', async () => {
      // Arrange
      const buf = Buffer.from('hello world', 'utf8');

      // Act + Assert
      await expect(service.upload(buf, 'text/plain')).rejects.toThrow(/mime/i);
    });

    it('rejects buffers that are not valid images even if mime claims so', async () => {
      // Arrange
      const buf = Buffer.from('not an image', 'utf8');

      // Act + Assert
      await expect(service.upload(buf, 'image/jpeg')).rejects.toThrow();
    });

    it('strips EXIF metadata from the stored bytes', async () => {
      // Arrange
      const buf = await makeJpegWithExif(400, 300, {
        IFD0: { Software: 'Test Camera v1.0' },
      });

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      const rows = await db.select().from(schema.image).where(eq(schema.image.id, result.id));
      const stored = rows[0]!.bytes as Buffer;
      const meta = await sharp(stored).metadata();
      // EXIF should be absent or empty after stripping.
      expect(meta.exif).toBeUndefined();
    });

    it('leaves takenAt null when EXIF has no DateTimeOriginal', async () => {
      // Arrange
      const buf = await makeJpeg(200, 200);

      // Act
      const result = await service.upload(buf, 'image/jpeg');

      // Assert
      expect(result.takenAt).toBeNull();
    });

    // NOTE: EXIF DateTimeOriginal extraction and orientation honouring are
    // verified via E2E with a real phone-photo fixture (see tests/e2e).
    // Sharp's `withExif()` strips/normalizes those fields when applied to
    // synthetic images, making them impossible to assert from generated
    // fixtures here.
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------

  describe('getById()', () => {
    it('returns the stored row including the bytes buffer', async () => {
      // Arrange
      const buf = await makeJpeg(200, 150);
      const uploaded = await service.upload(buf, 'image/jpeg');

      // Act
      const result = await service.getById(uploaded.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result!.id).toBe(uploaded.id);
      expect(result!.bytes).toBeInstanceOf(Buffer);
      expect((result!.bytes as Buffer).length).toBeGreaterThan(0);
      expect(result!.mime).toBe('image/webp');
    });

    it('returns null for an unknown id', async () => {
      // Act
      const result = await service.getById('00000000-0000-0000-0000-000000000000');

      // Assert
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('removes the image row', async () => {
      // Arrange
      const buf = await makeJpeg(200, 150);
      const uploaded = await service.upload(buf, 'image/jpeg');

      // Act
      await service.delete(uploaded.id);

      // Assert
      const found = await service.getById(uploaded.id);
      expect(found).toBeNull();
    });

    it('cascades to remove planting_image join rows', async () => {
      // Arrange
      db.insert(schema.household).values({ name: 'Test', persons: 2 }).run();
      db.insert(schema.crop)
        .values({
          name: 'Tomat',
          yieldKgPerM2: 8,
          kcalPerKg: 180,
          proteinGPerKg: 9,
          carbsGPerKg: 35,
          fatGPerKg: 2,
          category: 'vegetable',
        })
        .run();
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Köksträdgård', areaM2: 10 })
        .run();
      db.insert(schema.planting)
        .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-01', areaM2: 1 })
        .run();
      const buf = await makeJpeg(200, 150);
      const uploaded = await service.upload(buf, 'image/jpeg');
      db.insert(schema.plantingImage)
        .values({ plantingId: 1, imageId: uploaded.id, caption: 'first true leaves' })
        .run();

      // Act
      await service.delete(uploaded.id);

      // Assert
      const joins = await db
        .select()
        .from(schema.plantingImage)
        .where(eq(schema.plantingImage.imageId, uploaded.id));
      expect(joins).toHaveLength(0);
    });

    it('is a no-op for unknown ids', async () => {
      // Act + Assert
      await expect(service.delete('00000000-0000-0000-0000-000000000000')).resolves.toBeUndefined();
    });
  });
});
