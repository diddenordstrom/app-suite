import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { MacroTargetService } from '../services/macro-target.service';
import { buildUpdateData, validateCreateBody, buildCreateData } from './macro-target.validation';

export function macroTargetRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const macroTargetService = new MacroTargetService(db);

  app.get(
    '/active',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId query param must be a positive integer');
      }

      const target = await macroTargetService.getActiveByHouseholdId(householdId);

      if (target === null) {
        throw new ApiError(404, 'No active macro target found');
      }

      return target;
    }),
  );

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId query param must be a positive integer');
      }

      return macroTargetService.getByHouseholdId(householdId);
    }),
  );

  app.post(
    '/',
    handle(
      logged('macro_target', 'created', async (c) => {
        const body = await readBody(c);

        validateCreateBody(body as Record<string, unknown>);

        return macroTargetService.create(buildCreateData(body as Record<string, unknown>));
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('macro_target', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid macro target id');
        }

        const deleted = await macroTargetService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Macro target not found');
        }

        return { success: true, id };
      }),
    ),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid macro target id');
      }

      const target = await macroTargetService.getById(id);

      if (target === null) {
        throw new ApiError(404, 'Macro target not found');
      }

      return target;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('macro_target', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid macro target id');
        }

        const body = await readBody(c);
        const updated = await macroTargetService.update(
          id,
          buildUpdateData(body as Record<string, unknown>),
        );

        if (updated === null) {
          throw new ApiError(404, 'Macro target not found');
        }

        return updated;
      }),
    ),
  );

  app.post(
    '/:id/activate',
    handle(
      logged('macro_target', 'activated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid macro target id');
        }

        const target = await macroTargetService.setActive(id);

        if (target === null) {
          throw new ApiError(404, 'Macro target not found');
        }

        return target;
      }),
    ),
  );

  return app;
}
