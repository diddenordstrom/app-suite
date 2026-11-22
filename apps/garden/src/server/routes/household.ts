import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody } from '../http';
import type { AppEnv } from '../context';
import { MembershipService, MembershipError } from '../services/membership.service';
import { clearActiveHousehold, requireOwner, requireHousehold, requireUser } from '../context';
import { HouseholdService } from '../services/household.service';

export function householdRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const membershipService = new MembershipService(db);
  const householdService = new HouseholdService(db);

  app.get(
    '/current',
    handle((c) => requireHousehold(c)),
  );

  app.get(
    '/',
    handle((c) => {
      return membershipService.listForUser(requireUser(c).id);
    }),
  );

  app.post(
    '/',
    handle(async (c) => {
      const user = requireUser(c);
      const body = await readBody(c);

      if (!body.name || typeof body.name !== 'string') {
        throw new ApiError(400, 'name is required');
      }
      if (!Number.isInteger(body.persons) || body.persons <= 0) {
        throw new ApiError(400, 'persons must be a positive integer');
      }
      return membershipService.createHousehold(user.id, { name: body.name, persons: body.persons });
    }),
  );

  app.post(
    '/current/invite',
    handle((c) => {
      const household = requireOwner(c);
      return { inviteCode: membershipService.rotateInvite(household.id) };
    }),
  );

  app.get(
    '/current/members',
    handle((c) => membershipService.members(requireHousehold(c).id)),
  );

  app.delete(
    '/current/members/:userId',
    handle((c) => {
      const user = requireUser(c);
      const userId = Number(c.req.param('userId'));
      const household = userId === user.id ? requireHousehold(c) : requireOwner(c);
      try {
        membershipService.removeMember(household.id, userId);
      } catch (err) {
        if (!(err instanceof MembershipError)) throw err;
        const statusCode = err.code === 'not-a-member' ? 404 : 400;
        throw new ApiError(statusCode, err.code);
      }
      if (userId === user.id) clearActiveHousehold(c);
      return { ok: true };
    }),
  );

  app.delete(
    '/:id',
    handle(async (c) => {
      const household = requireOwner(c);
      if (Number(c.req.param('id')) !== household.id) {
        throw new ApiError(404, 'Household not found');
      }
      await membershipService.deleteHousehold(household.id);
      clearActiveHousehold(c);
      return { success: true };
    }),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid household id');
      }

      const household = await householdService.getById(id);

      if (household === null) {
        throw new ApiError(404, 'Household not found');
      }

      return household;
    }),
  );

  app.put(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid household id');
      }

      const body = await readBody(c);

      const updated = await householdService.update(id, {
        ...(typeof body.name === 'string' && { name: body.name }),
        ...(Number.isInteger(body.persons) && { persons: body.persons }),
        ...(typeof body.defaultPlantingUnit === 'string' && {
          defaultPlantingUnit: body.defaultPlantingUnit,
        }),
        ...('growingZone' in body && {
          growingZone: body.growingZone === null ? null : Number(body.growingZone),
        }),
      });

      if (updated === null) {
        throw new ApiError(404, 'Household not found');
      }

      return updated;
    }),
  );

  return app;
}
