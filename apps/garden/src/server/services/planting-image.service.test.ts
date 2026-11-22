import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { PlantingImageService } from './planting-image.service';
import { ImageService } from './image.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 0, g: 100, b: 0 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('PlantingImageService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: PlantingImageService;
  let imageService: ImageService;

  beforeEach(() => {
    db = createTestDb();
    service = new PlantingImageService(db);
    imageService = new ImageService(db);

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
    db.insert(schema.planting)
      .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-02', areaM2: 1 })
      .run();
  });

  // ---------------------------------------------------------------------------
  // attach()
  // ---------------------------------------------------------------------------

  describe('attach()', () => {
    it('inserts a join row and returns it', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');

      // Act
      const result = await service.attach({
        plantingId: 1,
        imageId: img.id,
        caption: 'first true leaves',
      });

      // Assert
      expect(result.plantingId).toBe(1);
      expect(result.imageId).toBe(img.id);
      expect(result.caption).toBe('first true leaves');
      expect(result.sortOrder).toBe(0);
    });

    it('defaults caption to null when omitted', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');

      // Act
      const result = await service.attach({ plantingId: 1, imageId: img.id });

      // Assert
      expect(result.caption).toBeNull();
    });

    it('rejects attaching the same image twice to the same planting', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id });

      // Act + Assert
      await expect(service.attach({ plantingId: 1, imageId: img.id })).rejects.toThrow();
    });

    it('allows attaching the same image to two different plantings', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');

      // Act + Assert
      await service.attach({ plantingId: 1, imageId: img.id });
      await expect(service.attach({ plantingId: 2, imageId: img.id })).resolves.toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // listByPlanting()
  // ---------------------------------------------------------------------------

  describe('listByPlanting()', () => {
    it('returns an empty array when no images are attached', async () => {
      // Act
      const result = await service.listByPlanting(1);

      // Assert
      expect(result).toEqual([]);
    });

    it('returns joined image metadata without the bytes payload', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(400, 300), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id, caption: 'wide shot' });

      // Act
      const result = await service.listByPlanting(1);

      // Assert
      expect(result).toHaveLength(1);
      const row = result[0]!;
      expect(row.imageId).toBe(img.id);
      expect(row.caption).toBe('wide shot');
      expect(row.mime).toBe('image/webp');
      expect(row.width).toBe(400);
      expect(row.height).toBe(300);
      expect(row.uploadedAt).toBeTruthy();
      expect('bytes' in row).toBe(false);
    });

    it('orders by sortOrder asc, then uploadedAt desc as a tiebreaker', async () => {
      // Arrange — three images, two with same sortOrder=0, one with sortOrder=10.
      const a = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      // Ensure a non-zero delta in uploadedAt so the desc tiebreaker is deterministic
      await new Promise((r) => setTimeout(r, 1100));
      const b = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      const c = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');

      await service.attach({ plantingId: 1, imageId: a.id, sortOrder: 0 });
      await service.attach({ plantingId: 1, imageId: b.id, sortOrder: 0 });
      await service.attach({ plantingId: 1, imageId: c.id, sortOrder: 10 });

      // Act
      const result = await service.listByPlanting(1);

      // Assert — b (newer, sortOrder 0) first, then a (older, sortOrder 0), then c.
      expect(result.map((r) => r.imageId)).toEqual([b.id, a.id, c.id]);
    });

    it('does not leak rows across plantings', async () => {
      // Arrange
      const img1 = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      const img2 = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img1.id });
      await service.attach({ plantingId: 2, imageId: img2.id });

      // Act
      const result1 = await service.listByPlanting(1);
      const result2 = await service.listByPlanting(2);

      // Assert
      expect(result1.map((r) => r.imageId)).toEqual([img1.id]);
      expect(result2.map((r) => r.imageId)).toEqual([img2.id]);
    });
  });

  // ---------------------------------------------------------------------------
  // patch()
  // ---------------------------------------------------------------------------

  describe('patch()', () => {
    it('updates the caption', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id, caption: 'old' });

      // Act
      const result = await service.patch(1, img.id, { caption: 'new and better' });

      // Assert
      expect(result).not.toBeNull();
      expect(result!.caption).toBe('new and better');
    });

    it('updates the sortOrder', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id });

      // Act
      const result = await service.patch(1, img.id, { sortOrder: 5 });

      // Assert
      expect(result!.sortOrder).toBe(5);
    });

    it('returns null when the join row does not exist', async () => {
      // Act
      const result = await service.patch(1, '00000000-0000-0000-0000-000000000000', {
        caption: 'whatever',
      });

      // Assert
      expect(result).toBeNull();
    });

    it('explicitly setting caption to null clears it', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id, caption: 'was set' });

      // Act
      const result = await service.patch(1, img.id, { caption: null });

      // Assert
      expect(result!.caption).toBeNull();
    });

    it('returns the existing row unchanged when given an empty patch', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id, caption: 'unchanged' });

      // Act
      const result = await service.patch(1, img.id, {});

      // Assert
      expect(result).not.toBeNull();
      expect(result!.caption).toBe('unchanged');
      expect(result!.sortOrder).toBe(0);
    });

    it('returns null when given an empty patch and the row does not exist', async () => {
      // Act
      const result = await service.patch(1, '00000000-0000-0000-0000-000000000000', {});

      // Assert
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // detach()
  // ---------------------------------------------------------------------------

  describe('detach()', () => {
    it('removes the join row but leaves the image intact', async () => {
      // Arrange
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ plantingId: 1, imageId: img.id });

      // Act
      await service.detach(1, img.id);

      // Assert
      const joins = await db
        .select()
        .from(schema.plantingImage)
        .where(
          and(eq(schema.plantingImage.plantingId, 1), eq(schema.plantingImage.imageId, img.id)),
        );
      expect(joins).toHaveLength(0);

      const stillExists = await imageService.getById(img.id);
      expect(stillExists).not.toBeNull();
    });

    it('is a no-op when the join row does not exist', async () => {
      // Act + Assert
      await expect(
        service.detach(1, '00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });
  });
});
