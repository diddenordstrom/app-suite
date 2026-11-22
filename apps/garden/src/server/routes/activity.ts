import { Hono } from 'hono';
import type { DB } from '../db/index';
import { handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { requireHousehold } from '../context';
import { ActivityService } from '../services/activity.service';

export function activityRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const activityService = new ActivityService(db);

  app.get(
    '/',
    handle(async (c) => {
      const householdId = requireHousehold(c).id;
      const query = getQuery(c);

      const entityType = typeof query.entityType === 'string' ? query.entityType : undefined;
      const entityId =
        typeof query.entityId === 'string' && query.entityId !== ''
          ? Number(query.entityId)
          : undefined;

      if (entityType !== undefined && entityId !== undefined) {
        return activityService.getByEntity(householdId, entityType, entityId);
      }

      const limit =
        typeof query.limit === 'string' && query.limit !== '' ? Number(query.limit) : undefined;

      return activityService.getRecent(householdId, limit);
    }),
  );

  return app;
}
