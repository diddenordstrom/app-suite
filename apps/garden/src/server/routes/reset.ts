import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody } from '../http';
import type { AppEnv } from '../context';
import { ResetService } from '../services/reset.service';
import { requireOwner } from '../context';

export function resetRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const resetService = new ResetService(db);

  app.post(
    '/',
    handle(async (c) => {
      requireOwner(c);
      const body = await readBody(c);
      const householdId = Number(body?.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'Invalid householdId');
      }

      await resetService.resetHousehold(householdId);

      return { success: true };
    }),
  );

  return app;
}
