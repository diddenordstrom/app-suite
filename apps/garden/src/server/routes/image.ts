import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle } from '../http';
import type { AppEnv } from '../context';
import { ImageService } from '../services/image.service';

export function imageRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const imageService = new ImageService(db);

  app.post(
    '/',
    handle(async (c) => {
      const form = await c.req.parseBody();
      const file = form.file instanceof File && form.file.name ? form.file : null;

      if (!file || !file.type) {
        throw new ApiError(400, 'file part is required (image upload)');
      }
      if (!file.type.startsWith('image/')) {
        throw new ApiError(415, `unsupported mime: ${file.type}`);
      }

      try {
        const row = await imageService.upload(Buffer.from(await file.arrayBuffer()), file.type);
        return {
          id: row.id,
          mime: row.mime,
          sizeBytes: row.sizeBytes,
          width: row.width,
          height: row.height,
          takenAt: row.takenAt,
          uploadedAt: row.uploadedAt,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : 'image upload failed';
        throw new ApiError(400, message);
      }
    }),
  );

  app.delete(
    '/:id',
    handle(async (c) => {
      const id = c.req.param('id');
      if (!id) {
        throw new ApiError(400, 'image id is required');
      }

      await imageService.delete(id);
      return { success: true };
    }),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const id = c.req.param('id');
      if (!id) {
        throw new ApiError(400, 'image id is required');
      }

      const row = await imageService.getById(id);
      if (!row) {
        throw new ApiError(404, 'image not found');
      }

      // The image bytes are content-addressed by id — they never change for a
      // given id, so we can cache aggressively. If the caller wants a fresh image
      // they must upload a new one (which gets a new id).
      return c.body(new Uint8Array(row.bytes as Buffer), 200, {
        'Content-Type': row.mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: `"${row.id}"`,
      });
    }),
  );

  return app;
}
