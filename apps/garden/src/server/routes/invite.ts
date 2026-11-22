import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle } from '../http';
import type { AppEnv } from '../context';
import type { Config } from '../config';
import { MembershipService } from '../services/membership.service';
import { requireUser, setActiveHousehold } from '../context';

export function inviteRoutes(db: DB, config: Config) {
  const app = new Hono<AppEnv>();
  const membershipService = new MembershipService(db);

  app.get(
    '/:code',
    handle((c) => {
      const household = membershipService.findByInviteCode(c.req.param('code') ?? '');
      if (!household) throw new ApiError(404, 'Invite link not found');
      return { id: household.id, name: household.name };
    }),
  );

  app.post(
    '/:code/join',
    handle((c) => {
      const user = requireUser(c);
      const household = membershipService.join(c.req.param('code') ?? '', user.id);
      if (!household) throw new ApiError(404, 'Invite link not found');
      setActiveHousehold(c, household.id, config.production);
      return { id: household.id, name: household.name };
    }),
  );

  return app;
}
