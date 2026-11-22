import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { CompanionService } from '../services/companion.service';
import { CropService } from '../services/crop.service';

export function cropsRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const companionService = new CompanionService(db);
  const cropService = new CropService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const category = query.category;

      if (typeof category === 'string' && category.length > 0) {
        return cropService.getCropsByCategory(category);
      }

      return cropService.getAllCrops();
    }),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid crop id');
      }

      const crop = await cropService.getCropById(id);

      if (crop === null) {
        throw new ApiError(404, 'Crop not found');
      }

      return crop;
    }),
  );

  app.get(
    '/:id/companions',
    handle(async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'invalid crop id');
      }
      return companionService.listForCrop(id);
    }),
  );

  return app;
}
