import type { Context, Handler } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { DB } from './db/index';
import { ActivityService } from './services/activity.service';
import type { AppEnv } from './context';

/** Thrown from handlers; app.onError turns it into `{ error }` with the status. */
export class ApiError extends Error {
  constructor(
    public status: ContentfulStatusCode,
    message: string,
  ) {
    super(message);
  }
}

type RouteFn = (c: Context<AppEnv>) => unknown;

/**
 * Handlers return plain values like they did under Nitro: objects become JSON, a Buffer or Response
 * is sent as is, and null/undefined is an empty 204.
 */
export const handle =
  (fn: RouteFn): Handler<AppEnv> =>
  async (c) => {
    const result = await fn(c);
    if (result instanceof Response) return result;
    if (result === undefined || result === null) return c.body(null, 204);
    if (Buffer.isBuffer(result)) return c.body(new Uint8Array(result));
    return c.json(result as object);
  };

/** The JSON body (loosely typed, the handlers validate it), or an empty object when there is none. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function readBody<T = any>(c: Context): Promise<T> {
  if (!c.req.header('content-type')?.includes('application/json')) return {} as T;
  try {
    return (await c.req.json()) as T;
  } catch {
    throw new ApiError(400, 'invalid JSON body');
  }
}

/** The query string; repeated keys become arrays. */
export function getQuery(c: Context): Record<string, string | string[]> {
  const all = c.req.queries();
  return Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.length === 1 ? v[0]! : v]));
}

/** Wraps a handler so a successful write is recorded in the household's activity log. */
export function activityLogger(db: DB) {
  const activity = new ActivityService(db);
  return (entityType: string, action: string, fn: RouteFn): RouteFn =>
    async (c) => {
      const result = await fn(c);
      const id = entityId(result, c.req.param('id'));
      if (id !== null) {
        await activity.log({
          householdId: c.get('household')?.id ?? null,
          action,
          entityType,
          entityId: id,
          metadata: JSON.stringify(result),
        });
      }
      return result;
    };
}

function entityId(result: unknown, param: string | undefined): number | null {
  if (
    typeof result === 'object' &&
    result !== null &&
    typeof (result as { id?: unknown }).id === 'number'
  ) {
    return (result as { id: number }).id;
  }
  const parsed = Number(param);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
