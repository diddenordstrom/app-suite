import { Hono, type Context } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { LocationImageService } from '../services/location-image.service';
import { GardenEventService } from '../services/gardenEvent.service';
import { LocationService } from '../services/location.service';
import { PlantingService } from '../services/planting.service';
import { DashboardService } from '../services/dashboard.service';
import { requireHousehold } from '../context';

function parseIds(c: Context, body: Record<string, unknown>) {
  const sourceId = Number(c.req.param('id'));
  const targetId = Number(body?.targetLocationId);
  return { sourceId, targetId };
}

async function validateLocations(
  locationService: LocationService,
  sourceId: number,
  targetId: number,
) {
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw new ApiError(400, 'Invalid location id');
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    throw new ApiError(400, 'targetLocationId must be a positive integer');
  }
  if (sourceId === targetId) {
    throw new ApiError(400, 'Target location must be different from source');
  }
  const source = await locationService.getById(sourceId);
  if (!source) {
    throw new ApiError(404, 'Location not found');
  }
  const target = await locationService.getById(targetId);
  if (!target) {
    throw new ApiError(400, 'Target location not found');
  }
}

export function locationRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const locationImageService = new LocationImageService(db);
  const gardenEventService = new GardenEventService(db);
  const locationService = new LocationService(db);
  const plantingService = new PlantingService(db);
  const dashboardService = new DashboardService(db);

  app.get(
    '/',
    handle(async (c) => {
      return locationService.getByHouseholdId(requireHousehold(c).id);
    }),
  );

  app.post(
    '/',
    handle(
      logged('location', 'created', async (c) => {
        const body = await readBody(c);

        if (!body.name || typeof body.name !== 'string') {
          throw new ApiError(400, 'name is required');
        }
        if (typeof body.areaM2 !== 'number' || body.areaM2 <= 0) {
          throw new ApiError(400, 'areaM2 must be a positive number');
        }
        if (!Number.isInteger(body.householdId) || body.householdId <= 0) {
          throw new ApiError(400, 'householdId must be a positive integer');
        }

        return locationService.create({
          name: body.name,
          areaM2: body.areaM2,
          householdId: body.householdId,
          ...(typeof body.description === 'string' && { description: body.description }),
          ...(typeof body.isIndoor === 'boolean' && { isIndoor: body.isIndoor }),
          ...(typeof body.frostBufferC === 'number' && { frostBufferC: body.frostBufferC }),
        });
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('location', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid location id');
        }

        let deleted: boolean;
        try {
          deleted = await locationService.delete(id);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : '';
          if (message.includes('FOREIGN KEY constraint failed')) {
            throw new ApiError(409, 'Cannot delete location with active plantings');
          }
          throw err;
        }

        if (!deleted) {
          throw new ApiError(404, 'Location not found');
        }

        return { success: true };
      }),
    ),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid location id');
      }

      const location = await locationService.getById(id);

      if (location === null) {
        throw new ApiError(404, 'Location not found');
      }

      return location;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('location', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid location id');
        }

        const body = await readBody(c);

        const updated = await locationService.update(id, {
          ...(typeof body.name === 'string' && { name: body.name }),
          ...(typeof body.areaM2 === 'number' && body.areaM2 > 0 && { areaM2: body.areaM2 }),
          ...(typeof body.description === 'string' && { description: body.description }),
          ...(typeof body.isIndoor === 'boolean' && { isIndoor: body.isIndoor }),
          ...(typeof body.frostBufferC === 'number' && { frostBufferC: body.frostBufferC }),
        });

        if (updated === null) {
          throw new ApiError(404, 'Location not found');
        }

        return updated;
      }),
    ),
  );

  app.get(
    '/:id/image',
    handle(async (c) => {
      const locationId = Number(c.req.param('id'));
      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new ApiError(400, 'invalid location id');
      }
      return locationImageService.listByLocation(locationId);
    }),
  );

  app.post(
    '/:id/image',
    handle(async (c) => {
      const locationId = Number(c.req.param('id'));
      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new ApiError(400, 'invalid location id');
      }

      const body = await readBody<{
        imageId?: unknown;
        caption?: unknown;
        sortOrder?: unknown;
      }>(c);

      if (typeof body.imageId !== 'string' || body.imageId.length === 0) {
        throw new ApiError(400, 'imageId is required');
      }
      if (body.caption !== undefined && body.caption !== null && typeof body.caption !== 'string') {
        throw new ApiError(400, 'caption must be a string or null');
      }
      if (body.sortOrder !== undefined && typeof body.sortOrder !== 'number') {
        throw new ApiError(400, 'sortOrder must be a number');
      }

      try {
        return await locationImageService.attach({
          locationId,
          imageId: body.imageId,
          caption: body.caption as string | null | undefined,
          sortOrder: body.sortOrder as number | undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'failed to attach image';
        throw new ApiError(400, message);
      }
    }),
  );

  app.get(
    '/:id/last-done',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid location id');
      }

      return gardenEventService.getLastDoneByLocation(id);
    }),
  );

  app.post(
    '/:id/move-plantings',
    handle(
      logged('location', 'deleted', async (c) => {
        const body = await readBody(c);
        const { sourceId, targetId } = parseIds(c, body as Record<string, unknown>);

        await validateLocations(locationService, sourceId, targetId);

        const result = await locationService.movePlantingsAndDelete(
          sourceId,
          targetId,
          plantingService,
        );

        return { moved: result.moved, deleted: result.deleted, id: sourceId };
      }),
    ),
  );

  app.get(
    '/:id/summary',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid location id');
      }

      const summary = await dashboardService.getLocationSummary(id);

      if (summary === null) {
        throw new ApiError(404, 'Location not found');
      }

      return summary;
    }),
  );

  app.delete(
    '/:id/image/:imageId',
    handle(async (c) => {
      const locationId = Number(c.req.param('id'));
      const imageId = c.req.param('imageId');
      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new ApiError(400, 'invalid location id');
      }
      if (!imageId) {
        throw new ApiError(400, 'invalid image id');
      }

      await locationImageService.detach(locationId, imageId);
      return { success: true };
    }),
  );

  app.patch(
    '/:id/image/:imageId',
    handle(async (c) => {
      const locationId = Number(c.req.param('id'));
      const imageId = c.req.param('imageId');
      if (!Number.isInteger(locationId) || locationId <= 0) {
        throw new ApiError(400, 'invalid location id');
      }
      if (!imageId) {
        throw new ApiError(400, 'invalid image id');
      }

      const body = await readBody<{
        caption?: unknown;
        sortOrder?: unknown;
      }>(c);

      const patch: { caption?: string | null; sortOrder?: number } = {};
      if ('caption' in body) {
        if (body.caption !== null && typeof body.caption !== 'string') {
          throw new ApiError(400, 'caption must be a string or null');
        }
        patch.caption = body.caption as string | null;
      }
      if (body.sortOrder !== undefined) {
        if (typeof body.sortOrder !== 'number') {
          throw new ApiError(400, 'sortOrder must be a number');
        }
        patch.sortOrder = body.sortOrder;
      }

      const updated = await locationImageService.patch(locationId, imageId, patch);
      if (!updated) {
        throw new ApiError(404, 'location image not found');
      }
      return updated;
    }),
  );

  return app;
}
