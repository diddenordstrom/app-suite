import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { StorageService } from '../services/storage.service';
import { and, eq } from 'drizzle-orm';
import { storageItem } from '../db/schema';
import { ConsumeService } from '../services/consume.service';
import { StorageDepletionService } from '../services/storage-depletion.service';
import { requireHousehold } from '../context';
import { assertPositiveInteger } from './planting.validation';
import type { NewStorageItem } from '../db/schema';

function buildUpdatePayload(body: Record<string, unknown>): Partial<NewStorageItem> {
  return {
    ...(typeof body.quantityKg === 'number' &&
      body.quantityKg > 0 && { quantityKg: body.quantityKg }),
    ...(typeof body.harvestedDate === 'string' && { harvestedDate: body.harvestedDate }),
  };
}

export function storageRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const storageService = new StorageService(db);
  const consumeService = new ConsumeService(db);
  const storageDepletionService = new StorageDepletionService(db);

  app.post(
    '/consume',
    handle(async (c) => {
      const body = await readBody(c);
      const cropId = Number(body.cropId);
      const householdId = Number(body.householdId);
      const kg = Number(body.kg);

      if (!cropId || !householdId || body.kg === undefined || body.kg === null) {
        throw new ApiError(400, 'cropId, householdId and kg are required');
      }

      if (kg < 0) {
        throw new ApiError(400, 'kg must be a non-negative number');
      }

      const items = db
        .select()
        .from(storageItem)
        .where(and(eq(storageItem.cropId, cropId), eq(storageItem.householdId, householdId)))
        .all();

      if (items.length === 0) {
        throw new ApiError(404, 'No storage items found for this crop and household');
      }

      await consumeService.consume(items, cropId, kg);

      return storageService.getGroupedStorage(householdId);
    }),
  );

  app.get(
    '/depletion',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId query param must be a positive integer');
      }

      return storageDepletionService.getDepletionForHousehold(householdId);
    }),
  );

  app.get(
    '/grouped',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId query param must be a positive integer');
      }

      return storageService.getGroupedStorage(householdId);
    }),
  );

  app.get(
    '/',
    handle(async (c) => {
      return storageService.getByHouseholdId(requireHousehold(c).id);
    }),
  );

  app.post(
    '/',
    handle(
      logged('storage_item', 'created', async (c) => {
        const body = await readBody(c);

        const cropId = assertPositiveInteger(body.cropId, 'cropId');
        const householdId = assertPositiveInteger(body.householdId, 'householdId');

        if (typeof body.quantityKg !== 'number' || body.quantityKg <= 0) {
          throw new ApiError(400, 'quantityKg must be a positive number');
        }

        if (!body.harvestedDate || typeof body.harvestedDate !== 'string') {
          throw new ApiError(400, 'harvestedDate is required');
        }

        const plantingId =
          body.plantingId !== undefined
            ? assertPositiveInteger(body.plantingId, 'plantingId')
            : undefined;

        return storageService.create({
          cropId,
          householdId,
          quantityKg: body.quantityKg,
          harvestedDate: body.harvestedDate,
          ...(plantingId !== undefined && { plantingId }),
        });
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('storage_item', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid storage item id');
        }

        const deleted = await storageService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Storage item not found');
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
        throw new ApiError(400, 'Invalid storage item id');
      }

      const item = await storageService.getById(id);

      if (item === null) {
        throw new ApiError(404, 'Storage item not found');
      }

      return item;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('storage_item', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid storage item id');
        }

        const body = await readBody(c);
        const updated = await storageService.update(id, buildUpdatePayload(body));

        if (updated === null) {
          throw new ApiError(404, 'Storage item not found');
        }

        return updated;
      }),
    ),
  );

  return app;
}
