import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { GardenEventService } from '../services/gardenEvent.service';

export function timelineRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const gardenEventService = new GardenEventService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return gardenEventService.getTimeline(householdId);
    }),
  );

  return app;
}
