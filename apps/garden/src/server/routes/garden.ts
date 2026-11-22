import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { GardenService } from '../services/garden.service';
import type { NewGarden } from '../db/schema';

function buildUpdatePayload(body: Record<string, unknown>): Partial<Omit<NewGarden, 'layout'>> {
  return {
    ...(typeof body.name === 'string' && { name: body.name }),
    ...(Number.isInteger(body.widthCm) &&
      (body.widthCm as number) > 0 && { widthCm: body.widthCm as number }),
    ...(Number.isInteger(body.heightCm) &&
      (body.heightCm as number) > 0 && { heightCm: body.heightCm as number }),
    ...(Number.isInteger(body.cellSizeCm) &&
      (body.cellSizeCm as number) >= 1 && { cellSizeCm: body.cellSizeCm as number }),
  };
}

export function gardenRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const gardenService = new GardenService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId must be a positive integer');
      }

      const garden = await gardenService.getByHouseholdId(householdId);

      if (!garden) {
        throw new ApiError(404, 'No garden found for this household');
      }

      return garden;
    }),
  );

  app.post(
    '/',
    handle(
      logged('garden', 'created', async (c) => {
        const body = await readBody(c);

        if (!Number.isInteger(body.householdId) || body.householdId <= 0) {
          throw new ApiError(400, 'householdId must be a positive integer');
        }

        if (!Number.isInteger(body.widthCm) || body.widthCm <= 0) {
          throw new ApiError(400, 'widthCm must be a positive integer');
        }

        if (!Number.isInteger(body.heightCm) || body.heightCm <= 0) {
          throw new ApiError(400, 'heightCm must be a positive integer');
        }

        return gardenService.create({
          householdId: body.householdId,
          widthCm: body.widthCm,
          heightCm: body.heightCm,
          ...(typeof body.name === 'string' && { name: body.name }),
          ...(Number.isInteger(body.cellSizeCm) &&
            body.cellSizeCm >= 1 && { cellSizeCm: body.cellSizeCm }),
        });
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('garden', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden id');
        }

        const deleted = await gardenService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Garden not found');
        }

        return { success: true };
      }),
    ),
  );

  app.patch(
    '/:id',
    handle(
      logged('garden', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden id');
        }

        const body = await readBody(c);
        const updated = await gardenService.update(id, buildUpdatePayload(body));

        if (updated === null) {
          throw new ApiError(404, 'Garden not found');
        }

        return updated;
      }),
    ),
  );

  app.put(
    '/:id/layout',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid garden id');
      }

      const body = await readBody(c);

      if (!body || typeof body.cells !== 'object' || typeof body.colors !== 'object') {
        throw new ApiError(400, 'Body must include cells and colors objects');
      }

      const updated = await gardenService.updateLayout(id, {
        cells: body.cells,
        colors: body.colors,
      });

      if (updated === null) {
        throw new ApiError(404, 'Garden not found');
      }

      return updated;
    }),
  );

  return app;
}
