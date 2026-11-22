import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { HarvestEventService } from '../services/harvest-event.service';
import { PlantingService } from '../services/planting.service';
import { StorageService } from '../services/storage.service';
import { HarvestService, type HarvestResult } from '../services/harvest.service';
import { PlantingImageService } from '../services/planting-image.service';
import {
  isValidStatus,
  type PlantingStatus,
  assertPositiveInteger,
  assertValidStatus,
} from './planting.validation';
import { requireHousehold } from '../context';
import type { NewPlanting } from '../db/schema';

function validateHarvestBody(body: Record<string, unknown>): void {
  if (typeof body.quantityKg !== 'number' || body.quantityKg <= 0) {
    throw new ApiError(400, 'quantityKg must be a positive number');
  }
  if (!body.harvestedDate || typeof body.harvestedDate !== 'string') {
    throw new ApiError(400, 'harvestedDate is required');
  }
  if (!Number.isInteger(body.householdId) || (body.householdId as number) <= 0) {
    throw new ApiError(400, 'householdId must be a positive integer');
  }
  if (typeof body.isFinalHarvest !== 'boolean') {
    throw new ApiError(400, 'isFinalHarvest must be a boolean');
  }
  if (typeof body.addToStorage !== 'boolean') {
    throw new ApiError(400, 'addToStorage must be a boolean');
  }
}

function handleResult(result: HarvestResult) {
  if (result === null) {
    throw new ApiError(404, 'Planting not found');
  }
  if ('error' in result && result.error === 'already_harvested') {
    throw new ApiError(400, 'Planting is already harvested');
  }
  return result;
}

function buildUpdatePayload(body: Record<string, unknown>): Partial<NewPlanting> {
  return {
    ...(Number.isInteger(body.locationId) &&
      (body.locationId as number) > 0 && { locationId: body.locationId as number }),
    ...(typeof body.plantedDate === 'string' && { plantedDate: body.plantedDate }),
    ...(typeof body.expectedHarvestDate === 'string' && {
      expectedHarvestDate: body.expectedHarvestDate,
    }),
    ...(typeof body.areaM2 === 'number' && body.areaM2 > 0 && { areaM2: body.areaM2 }),
    ...(isValidStatus(body.status) && { status: body.status as PlantingStatus }),
    ...(Number.isInteger(body.quantity) &&
      (body.quantity as number) > 0 && { quantity: body.quantity as number }),
    ...(typeof body.yieldKgPerPlantOverride === 'number' && {
      yieldKgPerPlantOverride: body.yieldKgPerPlantOverride,
    }),
    ...(Number.isInteger(body.seedVarietyId) &&
      (body.seedVarietyId as number) > 0 && { seedVarietyId: body.seedVarietyId as number }),
    ...(body.seedVarietyId === null && { seedVarietyId: null }),
  };
}

function validateBody(body: Record<string, unknown>): void {
  if (!body.plantedDate || typeof body.plantedDate !== 'string') {
    throw new ApiError(400, 'plantedDate is required');
  }
  if (typeof body.areaM2 !== 'number' || body.areaM2 < 0) {
    throw new ApiError(400, 'areaM2 must be a non-negative number');
  }
  const plantingMode = body.plantingMode === 'count' ? 'count' : 'area';
  if (
    plantingMode === 'count' &&
    (!Number.isInteger(body.quantity) || (body.quantity as number) <= 0)
  ) {
    throw new ApiError(400, 'quantity must be a positive integer for count-mode plantings');
  }
}

function buildCreatePayload(
  body: Record<string, unknown>,
  cropId: number,
  locationId: number,
): NewPlanting {
  const status = body.status !== undefined ? assertValidStatus(body.status) : 'planted';
  const plantingMode = body.plantingMode === 'count' ? 'count' : 'area';
  return {
    cropId,
    locationId,
    plantedDate: body.plantedDate as string,
    areaM2: body.areaM2 as number,
    plantingMode,
    status,
    ...(Number.isInteger(body.quantity) &&
      (body.quantity as number) > 0 && { quantity: body.quantity as number }),
    ...(typeof body.yieldKgPerPlantOverride === 'number' && {
      yieldKgPerPlantOverride: body.yieldKgPerPlantOverride,
    }),
    ...(typeof body.expectedHarvestDate === 'string' && {
      expectedHarvestDate: body.expectedHarvestDate,
    }),
    ...(Number.isInteger(body.seedVarietyId) &&
      (body.seedVarietyId as number) > 0 && { seedVarietyId: body.seedVarietyId as number }),
  };
}

export function plantingRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const harvestEventService = new HarvestEventService(db);
  const plantingService = new PlantingService(db);
  const storageService = new StorageService(db);
  const harvestService = new HarvestService(plantingService, storageService, harvestEventService);
  const plantingImageService = new PlantingImageService(db);

  app.get(
    '/',
    handle(async (c) => {
      return plantingService.getByHouseholdId(requireHousehold(c).id);
    }),
  );

  app.post(
    '/',
    handle(
      logged('planting', 'created', async (c) => {
        const body = await readBody(c);
        const cropId = assertPositiveInteger(body.cropId, 'cropId');
        const locationId = assertPositiveInteger(body.locationId, 'locationId');
        validateBody(body);
        return plantingService.create(buildCreatePayload(body, cropId, locationId));
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('planting', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid planting id');
        }

        const deleted = await plantingService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Planting not found');
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
        throw new ApiError(400, 'Invalid planting id');
      }

      const planting = await plantingService.getById(id);

      if (planting === null) {
        throw new ApiError(404, 'Planting not found');
      }

      return planting;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('planting', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid planting id');
        }

        const body = await readBody(c);

        if (body.status !== undefined && !isValidStatus(body.status)) {
          throw new ApiError(400, 'status must be one of: planted, growing, harvested');
        }

        const updated = await plantingService.update(id, buildUpdatePayload(body));

        if (updated === null) {
          throw new ApiError(404, 'Planting not found');
        }

        return updated;
      }),
    ),
  );

  app.get(
    '/:id/harvest',
    handle(async (c) => {
      const id = Number(c.req.param('id'));
      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'invalid planting id');
      }
      return harvestEventService.listByPlanting(id);
    }),
  );

  app.post(
    '/:id/harvest',
    handle(
      logged('planting', 'harvested', async (c) => {
        const idParam = c.req.param('id');
        const plantingId = Number(idParam);

        if (!Number.isInteger(plantingId) || plantingId <= 0) {
          throw new ApiError(400, 'Invalid planting id');
        }

        const body = await readBody(c);
        validateHarvestBody(body);

        const result = await harvestService.harvest(
          plantingId,
          body.householdId as number,
          body.quantityKg as number,
          body.harvestedDate as string,
          body.isFinalHarvest as boolean,
          body.addToStorage as boolean,
        );

        return handleResult(result);
      }),
    ),
  );

  app.get(
    '/:id/image',
    handle(async (c) => {
      const plantingId = Number(c.req.param('id'));
      if (!Number.isInteger(plantingId) || plantingId <= 0) {
        throw new ApiError(400, 'invalid planting id');
      }
      return plantingImageService.listByPlanting(plantingId);
    }),
  );

  app.post(
    '/:id/image',
    handle(async (c) => {
      const plantingId = Number(c.req.param('id'));
      if (!Number.isInteger(plantingId) || plantingId <= 0) {
        throw new ApiError(400, 'invalid planting id');
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
        return await plantingImageService.attach({
          plantingId,
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

  app.delete(
    '/:id/image/:imageId',
    handle(async (c) => {
      const plantingId = Number(c.req.param('id'));
      const imageId = c.req.param('imageId');
      if (!Number.isInteger(plantingId) || plantingId <= 0) {
        throw new ApiError(400, 'invalid planting id');
      }
      if (!imageId) {
        throw new ApiError(400, 'invalid image id');
      }

      await plantingImageService.detach(plantingId, imageId);
      return { success: true };
    }),
  );

  app.patch(
    '/:id/image/:imageId',
    handle(async (c) => {
      const plantingId = Number(c.req.param('id'));
      const imageId = c.req.param('imageId');
      if (!Number.isInteger(plantingId) || plantingId <= 0) {
        throw new ApiError(400, 'invalid planting id');
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

      const updated = await plantingImageService.patch(plantingId, imageId, patch);
      if (!updated) {
        throw new ApiError(404, 'planting image not found');
      }
      return updated;
    }),
  );

  return app;
}
