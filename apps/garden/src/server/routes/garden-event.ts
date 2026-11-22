import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { GardenEventService } from '../services/gardenEvent.service';
import { RRule } from '../rrule';
import { EVENT_TYPES, type EventType, type NewGardenEvent } from '../db/schema';

function buildUpdatePayload(body: Record<string, unknown>): Partial<NewGardenEvent> {
  if (body.recurringDays !== undefined) {
    const rd = body.recurringDays;
    if (typeof rd !== 'number' || !Number.isInteger(rd) || rd <= 0) {
      throw new ApiError(400, 'recurringDays must be a positive integer');
    }
  }
  let eventType: EventType | undefined;
  if (body.eventType !== undefined) {
    if (
      typeof body.eventType !== 'string' ||
      !(EVENT_TYPES as readonly string[]).includes(body.eventType)
    ) {
      throw new ApiError(400, `eventType must be one of: ${EVENT_TYPES.join(', ')}`);
    }
    eventType = body.eventType as EventType;
  }
  return {
    ...(typeof body.title === 'string' && { title: body.title }),
    ...(typeof body.date === 'string' && { date: body.date }),
    ...(typeof body.recurringDays === 'number' && { recurringDays: body.recurringDays }),
    ...(typeof body.status === 'string' && { status: body.status }),
    ...(body.status === null && { status: null }),
    ...(eventType !== undefined && { eventType }),
    ...(typeof body.description === 'string' && { description: body.description }),
    ...(body.description === null && { description: null }),
    ...(typeof body.recurrenceRule === 'string' &&
      body.recurrenceRule.length > 0 && {
        recurrenceRule: validateRecurrenceRuleString(body.recurrenceRule),
      }),
    ...(body.recurrenceRule === null && { recurrenceRule: null }),
  };
}

function validateRecurrenceRuleString(value: string): string {
  try {
    RRule.fromString(`RRULE:${value}`);
  } catch {
    throw new ApiError(400, 'recurrenceRule is not a valid RFC-5545 rule');
  }
  return value;
}

function resolveAttachmentIds(
  body: Record<string, unknown>,
  key: 'locationIds' | 'plantingIds',
): number[] | undefined {
  if (!(key in body)) return undefined;
  const val = body[key];
  return Array.isArray(val)
    ? val.filter((n): n is number => typeof n === 'number' && Number.isInteger(n))
    : [];
}

function validateRequiredFields(body: Record<string, unknown>): {
  title: string;
  date: string;
  householdId: number;
} {
  if (!body.title || typeof body.title !== 'string') {
    throw new ApiError(400, 'title is required');
  }
  if (!body.date || typeof body.date !== 'string') {
    throw new ApiError(400, 'date is required');
  }
  const householdId = Number(body.householdId);
  if (!Number.isInteger(householdId) || householdId <= 0) {
    throw new ApiError(400, 'householdId is required');
  }
  return { title: body.title, date: body.date, householdId };
}

function validateRecurringDays(value: unknown): void {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, 'recurringDays must be a positive integer');
  }
}

function validateEventType(value: unknown): EventType | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !(EVENT_TYPES as readonly string[]).includes(value)) {
    throw new ApiError(400, `eventType must be one of: ${EVENT_TYPES.join(', ')}`);
  }
  return value as EventType;
}

function validateRecurrenceRule(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string' || value.length === 0) {
    throw new ApiError(400, 'recurrenceRule must be a string');
  }
  try {
    RRule.fromString(`RRULE:${value}`);
  } catch {
    throw new ApiError(400, 'recurrenceRule is not a valid RFC-5545 rule');
  }
  return value;
}

function buildPayload(body: Record<string, unknown>): NewGardenEvent {
  const { title, date, householdId } = validateRequiredFields(body);
  validateRecurringDays(body.recurringDays);
  const eventType = validateEventType(body.eventType);
  const recurrenceRule = validateRecurrenceRule(body.recurrenceRule);
  return {
    title,
    date,
    householdId,
    ...(typeof body.recurringDays === 'number' && { recurringDays: body.recurringDays }),
    ...(typeof body.status === 'string' && { status: body.status }),
    ...(eventType !== undefined && { eventType }),
    ...(typeof body.description === 'string' && { description: body.description }),
    ...(body.description === null && { description: null }),
    ...(recurrenceRule !== undefined && { recurrenceRule }),
  };
}

function attachmentIdsOrEmpty(
  body: Record<string, unknown>,
  key: 'locationIds' | 'plantingIds',
): number[] {
  const val = body[key];
  if (!Array.isArray(val)) return [];
  return val.filter((n): n is number => typeof n === 'number' && Number.isInteger(n));
}

export function gardenEventRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const gardenEventService = new GardenEventService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return gardenEventService.getAll(householdId);
    }),
  );

  app.post(
    '/',
    handle(
      logged('gardenEvent', 'created', async (c) => {
        const body = await readBody(c);
        const created = await gardenEventService.create(buildPayload(body));
        const locationIds = attachmentIdsOrEmpty(body, 'locationIds');
        const plantingIds = attachmentIdsOrEmpty(body, 'plantingIds');
        await gardenEventService.setAttachedLocations(created.id, locationIds);
        await gardenEventService.setAttachedPlantings(created.id, plantingIds);
        return created;
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('gardenEvent', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden c id');
        }

        const deleted = await gardenEventService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Garden c not found');
        }

        return { success: true };
      }),
    ),
  );

  app.get(
    '/:id',
    handle(async (c) => {
      const idParam = c.req.param('id');
      const id = Number(idParam);

      if (!Number.isInteger(id) || id <= 0) {
        throw new ApiError(400, 'Invalid garden c id');
      }

      const found = await gardenEventService.getById(id);

      if (found === null) {
        throw new ApiError(404, 'Garden c not found');
      }

      return found;
    }),
  );

  app.put(
    '/:id',
    handle(
      logged('gardenEvent', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden c id');
        }

        const body = await readBody(c);
        const updated = await gardenEventService.update(id, buildUpdatePayload(body));

        if (updated === null) {
          throw new ApiError(404, 'Garden c not found');
        }

        const locationIds = resolveAttachmentIds(body, 'locationIds');
        const plantingIds = resolveAttachmentIds(body, 'plantingIds');
        if (locationIds !== undefined) {
          await gardenEventService.setAttachedLocations(id, locationIds);
        }
        if (plantingIds !== undefined) {
          await gardenEventService.setAttachedPlantings(id, plantingIds);
        }

        return updated;
      }),
    ),
  );

  app.post(
    '/:id/accept',
    handle(
      logged('gardenEvent', 'accepted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden c id');
        }

        const result = await gardenEventService.accept(id);

        if (result === null) {
          throw new ApiError(404, 'Garden c not found');
        }

        return result;
      }),
    ),
  );

  app.post(
    '/:id/complete',
    handle(
      logged('gardenEvent', 'completed', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden c id');
        }

        const result = await gardenEventService.complete(id);

        if (result === null) {
          throw new ApiError(404, 'Garden c not found');
        }

        return result;
      }),
    ),
  );

  app.post(
    '/:id/dismiss',
    handle(
      logged('gardenEvent', 'dismissed', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid garden c id');
        }

        const result = await gardenEventService.dismiss(id);

        if (result === null) {
          throw new ApiError(404, 'Garden c not found');
        }

        return result;
      }),
    ),
  );

  return app;
}
