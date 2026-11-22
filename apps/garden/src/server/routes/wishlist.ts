import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { WishlistService } from '../services/wishlist.service';

function parsePositive(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function wishlistRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const wishlistService = new WishlistService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return wishlistService.getForHousehold(householdId);
    }),
  );

  app.post(
    '/',
    handle(
      logged('wishlist', 'created', async (c) => {
        const body = await readBody(c);

        const householdId = Number(body.householdId);
        if (!Number.isInteger(householdId) || householdId <= 0) {
          throw new ApiError(400, 'householdId is required');
        }

        const cropId = Number(body.cropId);
        if (!Number.isInteger(cropId) || cropId <= 0) {
          throw new ApiError(400, 'cropId is required');
        }

        try {
          return await wishlistService.add(householdId, cropId, {
            kgPerWeek: parsePositive(body.kgPerWeek),
            kgPerYear: parsePositive(body.kgPerYear),
          });
        } catch (err) {
          if (err instanceof Error && /demand/i.test(err.message)) {
            throw new ApiError(400, err.message);
          }
          throw err;
        }
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('wishlist', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid wishlist entry id');
        }

        const deleted = await wishlistService.removeById(id);

        if (!deleted) {
          throw new ApiError(404, 'Wishlist entry not found');
        }

        return { success: true };
      }),
    ),
  );

  app.put(
    '/:id',
    handle(
      logged('wishlist', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid wishlist entry id');
        }

        const body = await readBody(c);
        const demand = {
          kgPerWeek: parsePositive(body.kgPerWeek),
          kgPerYear: parsePositive(body.kgPerYear),
        };

        let updated;
        try {
          updated = await wishlistService.updateDemand(id, demand);
        } catch (err) {
          if (err instanceof Error && /demand/i.test(err.message)) {
            throw new ApiError(400, err.message);
          }
          throw err;
        }

        if (!updated) {
          throw new ApiError(404, 'Wishlist entry not found');
        }

        return updated;
      }),
    ),
  );

  return app;
}
