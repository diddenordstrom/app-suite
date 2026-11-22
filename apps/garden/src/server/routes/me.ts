import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody } from '../http';
import type { AppEnv } from '../context';
import type { Config } from '../config';
import { MembershipService } from '../services/membership.service';
import { requireUser, setActiveHousehold } from '../context';

export function meRoutes(db: DB, config: Config) {
  const app = new Hono<AppEnv>();
  const membershipService = new MembershipService(db);

  app.put(
    '/household',
    handle(async (c) => {
      const user = requireUser(c);
      const body = await readBody<{ id?: unknown }>(c);
      const id = Number(body?.id);
      if (!Number.isInteger(id) || membershipService.getRole(id, user.id) === null) {
        throw new ApiError(404, 'Household not found');
      }
      setActiveHousehold(c, id, config.production);
      return membershipService.resolveActive(user.id, id);
    }),
  );

  return app;
}
