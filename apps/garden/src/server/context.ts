import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { createMiddleware } from 'hono/factory';
import type { Auth, AuthUser } from '@homelab/server-kit';
import type { DB } from './db/index';
import { ApiError, getQuery } from './http';
import { MembershipService, type MembershipHousehold } from './services/membership.service';
import { ScopeService } from './services/scope.service';
import { collectScopeRefs } from './utils/scope-refs';
import { defaultHouseholdName } from './utils/household-name';

export type AppEnv = { Variables: { user: AuthUser; household: MembershipHousehold } };

export const HOUSEHOLD_COOKIE = 'garden_household';
const YEAR_S = 365 * 24 * 3600;

export function setActiveHousehold(c: Context, householdId: number, secure: boolean): void {
  setCookie(c, HOUSEHOLD_COOKIE, String(householdId), {
    httpOnly: true,
    sameSite: 'Lax',
    secure,
    path: '/',
    maxAge: YEAR_S,
  });
}

export function clearActiveHousehold(c: Context): void {
  deleteCookie(c, HOUSEHOLD_COOKIE, { path: '/' });
}

export function requireUser(c: Context<AppEnv>): AuthUser {
  const user = c.get('user');
  if (!user) throw new ApiError(401, 'Not logged in');
  return user;
}

export function requireHousehold(c: Context<AppEnv>): MembershipHousehold {
  const household = c.get('household');
  if (!household) throw new ApiError(401, 'Not logged in');
  return household;
}

/** Only the owner may rotate the invite link, remove members, reset or delete. */
export function requireOwner(c: Context<AppEnv>): MembershipHousehold {
  const household = requireHousehold(c);
  if (household.role !== 'owner') throw new ApiError(403, 'Only the household owner can do this');
  return household;
}

async function jsonBody(c: Context): Promise<unknown> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) return undefined;
  if (!c.req.header('content-type')?.includes('application/json')) return undefined;
  return c.req.json().catch(() => undefined);
}

/**
 * Every /api request past sign-in needs a logged-in user and runs against their active household.
 * Ids in the path, query and body must belong to that household (404 otherwise).
 *
 * Invite routes only get the user: joining through a link must not create a household of one's own
 * first. Everyone else gets a household the first time they have none.
 */
export function householdMiddleware(db: DB, auth: Auth) {
  const memberships = new MembershipService(db);
  const scope = new ScopeService(db);
  return createMiddleware<AppEnv>(async (c, next) => {
    const path = c.req.path;
    // The invite preview is public: the code is the secret.
    if (c.req.method === 'GET' && /^\/api\/invite\/[\w-]+$/.test(path)) return next();
    const user = await auth.currentUser(c);
    if (!user) throw new ApiError(401, 'Not logged in');
    c.set('user', user);
    if (path.startsWith('/api/invite/')) return next();

    memberships.ensureHome(user.id, defaultHouseholdName(user.name));
    const requested = Number(getCookie(c, HOUSEHOLD_COOKIE)) || undefined;
    c.set('household', memberships.resolveActive(user.id, requested)!);
    if (path.startsWith('/api/me/')) return next();

    const refs = collectScopeRefs({ path, query: getQuery(c), body: await jsonBody(c) });
    if (scope.findForeign(c.get('household').id, refs)?.reason === 'foreign') {
      throw new ApiError(404, 'Not found');
    }
    return next();
  });
}
