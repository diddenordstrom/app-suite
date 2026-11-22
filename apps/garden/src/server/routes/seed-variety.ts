import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { SeedVarietyService } from '../services/seed-variety.service';

export function seedVarietyRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const service = new SeedVarietyService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      if (query.cropId) {
        const cropId = Number(query.cropId);
        if (!Number.isInteger(cropId) || cropId <= 0) {
          throw new ApiError(400, 'cropId must be a positive integer');
        }
        return service.getByCropId(cropId);
      }
      return service.getAll();
    }),
  );

  app.post(
    '/',
    handle(
      logged('seed-variety', 'created', async (c) => {
        const body = await readBody(c);

        if (!body.name || typeof body.name !== 'string') {
          throw new ApiError(400, 'name is required');
        }
        if (!Number.isInteger(body.cropId) || body.cropId <= 0) {
          throw new ApiError(400, 'cropId must be a positive integer');
        }

        return service.create({
          cropId: body.cropId,
          name: body.name,
          ...(typeof body.varietyType === 'string' && { varietyType: body.varietyType }),
          ...(typeof body.notes === 'string' && { notes: body.notes }),
        });
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('seed-variety', 'deleted', async (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid id');
        }

        const deleted = await service.delete(id);
        if (!deleted) {
          throw new ApiError(404, 'Seed variety not found');
        }
        return { success: true };
      }),
    ),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid id');
      }
      const variety = await service.getById(id);
      if (!variety) {
        throw new ApiError(404, 'Seed variety not found');
      }
      return variety;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('seed-variety', 'updated', async (c) => {
        const id = Number(c.req.param('id'));
        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid id');
        }

        const body = await readBody(c);
        const updated = await service.update(id, {
          ...(typeof body.name === 'string' && { name: body.name }),
          ...(typeof body.varietyType === 'string' && { varietyType: body.varietyType }),
          ...(typeof body.notes === 'string' && { notes: body.notes }),
        });

        if (!updated) {
          throw new ApiError(404, 'Seed variety not found');
        }
        return updated;
      }),
    ),
  );

  return app;
}
