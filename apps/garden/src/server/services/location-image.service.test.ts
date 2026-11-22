import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { and, eq } from 'drizzle-orm';
import { LocationImageService } from './location-image.service';
import { ImageService } from './image.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 100, g: 80, b: 200 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('LocationImageService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: LocationImageService;
  let imageService: ImageService;

  beforeEach(() => {
    db = createTestDb();
    service = new LocationImageService(db);
    imageService = new ImageService(db);

    db.insert(schema.household).values({ name: 'Test', persons: 2 }).run();
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 10 })
      .run();
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Pallkrage', areaM2: 1 })
      .run();
  });

  describe('attach()', () => {
    it('inserts a join row and returns it', async () => {
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');
      const result = await service.attach({
        locationId: 1,
        imageId: img.id,
        caption: 'spring view',
      });
      expect(result.locationId).toBe(1);
      expect(result.imageId).toBe(img.id);
      expect(result.caption).toBe('spring view');
      expect(result.sortOrder).toBe(0);
    });

    it('rejects attaching the same image twice to the same location', async () => {
      const img = await imageService.upload(await makeJpeg(200, 150), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id });
      await expect(service.attach({ locationId: 1, imageId: img.id })).rejects.toThrow();
    });
  });

  describe('listByLocation()', () => {
    it('returns an empty array when no images are attached', async () => {
      const result = await service.listByLocation(1);
      expect(result).toEqual([]);
    });

    it('returns rows newest-first by uploadedAt (tiebreaker after sortOrder)', async () => {
      const a = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await new Promise((r) => setTimeout(r, 1100));
      const b = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: a.id });
      await service.attach({ locationId: 1, imageId: b.id });

      const result = await service.listByLocation(1);
      expect(result.map((r) => r.imageId)).toEqual([b.id, a.id]);
    });

    it('does not leak rows across locations', async () => {
      const img1 = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      const img2 = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img1.id });
      await service.attach({ locationId: 2, imageId: img2.id });

      const r1 = await service.listByLocation(1);
      const r2 = await service.listByLocation(2);
      expect(r1.map((r) => r.imageId)).toEqual([img1.id]);
      expect(r2.map((r) => r.imageId)).toEqual([img2.id]);
    });
  });

  describe('patch()', () => {
    it('updates the caption', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id, caption: 'old' });
      const result = await service.patch(1, img.id, { caption: 'new' });
      expect(result!.caption).toBe('new');
    });

    it('returns null when the join row does not exist', async () => {
      const result = await service.patch(1, '00000000-0000-0000-0000-000000000000', {
        caption: 'whatever',
      });
      expect(result).toBeNull();
    });

    it('updates the sortOrder', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id });

      const result = await service.patch(1, img.id, { sortOrder: 7 });

      expect(result!.sortOrder).toBe(7);
    });

    it('explicitly setting caption to null clears it', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id, caption: 'was set' });

      const result = await service.patch(1, img.id, { caption: null });

      expect(result!.caption).toBeNull();
    });

    it('returns the existing row unchanged when given an empty patch', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id, caption: 'unchanged' });

      const result = await service.patch(1, img.id, {});

      expect(result).not.toBeNull();
      expect(result!.caption).toBe('unchanged');
      expect(result!.sortOrder).toBe(0);
    });

    it('returns null when given an empty patch and the row does not exist', async () => {
      const result = await service.patch(1, '00000000-0000-0000-0000-000000000000', {});

      expect(result).toBeNull();
    });
  });

  describe('attach() defaults', () => {
    it('defaults caption to null and sortOrder to 0 when omitted', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');

      const result = await service.attach({ locationId: 1, imageId: img.id });

      expect(result.caption).toBeNull();
      expect(result.sortOrder).toBe(0);
    });

    it('honours an explicit sortOrder', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');

      const result = await service.attach({ locationId: 1, imageId: img.id, sortOrder: 3 });

      expect(result.sortOrder).toBe(3);
    });
  });

  describe('detach()', () => {
    it('is a no-op when the join row does not exist', async () => {
      await expect(
        service.detach(1, '00000000-0000-0000-0000-000000000000'),
      ).resolves.toBeUndefined();
    });

    it('removes the join row but leaves the image intact', async () => {
      const img = await imageService.upload(await makeJpeg(100, 100), 'image/jpeg');
      await service.attach({ locationId: 1, imageId: img.id });

      await service.detach(1, img.id);

      const joins = await db
        .select()
        .from(schema.locationImage)
        .where(
          and(eq(schema.locationImage.locationId, 1), eq(schema.locationImage.imageId, img.id)),
        );
      expect(joins).toHaveLength(0);
      const stillExists = await imageService.getById(img.id);
      expect(stillExists).not.toBeNull();
    });
  });
});
