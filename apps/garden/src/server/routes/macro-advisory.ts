import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { MacroAdvisoryService } from '../services/macro-advisory.service';

export function macroAdvisoryRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const service = new MacroAdvisoryService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId query param must be a positive integer');
      }

      return service.getAdvisory(householdId);
    }),
  );

  return app;
}
