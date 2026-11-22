import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { CropPriceService } from '../services/crop-price.service';

export function cropPricesRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const cropPriceService = new CropPriceService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return cropPriceService.listForHousehold(householdId);
    }),
  );

  app.post(
    '/',
    handle(
      logged('crop_price', 'created', async (c) => {
        const body = await readBody(c);

        const householdId = Number(body.householdId);
        if (!Number.isInteger(householdId) || householdId <= 0) {
          throw new ApiError(400, 'householdId is required');
        }

        const cropId = Number(body.cropId);
        if (!Number.isInteger(cropId) || cropId <= 0) {
          throw new ApiError(400, 'cropId is required');
        }

        const pricePerKg = Number(body.pricePerKg);
        if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
          throw new ApiError(400, 'pricePerKg must be a finite number greater than 0.');
        }

        return cropPriceService.upsert(householdId, cropId, pricePerKg);
      }),
    ),
  );

  app.delete(
    '/:cropId',
    handle(
      logged('crop_price', 'deleted', async (c) => {
        const cropIdParam = c.req.param('cropId');
        const cropId = Number(cropIdParam);
        if (!Number.isInteger(cropId) || cropId <= 0) {
          throw new ApiError(400, 'Invalid cropId');
        }

        const query = getQuery(c);
        const householdId = Number(query.householdId);
        if (!Number.isInteger(householdId) || householdId <= 0) {
          throw new ApiError(400, 'householdId is required');
        }

        const removed = await cropPriceService.remove(householdId, cropId);
        if (!removed) {
          throw new ApiError(404, 'Crop price not found');
        }
        return { success: true };
      }),
    ),
  );

  app.patch(
    '/:cropId',
    handle(
      logged('crop_price', 'updated', async (c) => {
        const cropIdParam = c.req.param('cropId');
        const cropId = Number(cropIdParam);
        if (!Number.isInteger(cropId) || cropId <= 0) {
          throw new ApiError(400, 'Invalid cropId');
        }

        const body = await readBody(c);
        const householdId = Number(body.householdId);
        if (!Number.isInteger(householdId) || householdId <= 0) {
          throw new ApiError(400, 'householdId is required');
        }

        const pricePerKg = Number(body.pricePerKg);
        if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
          throw new ApiError(400, 'pricePerKg must be a finite number greater than 0.');
        }

        return cropPriceService.upsert(householdId, cropId, pricePerKg);
      }),
    ),
  );

  return app;
}
