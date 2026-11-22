import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery, activityLogger } from '../http';
import type { AppEnv } from '../context';
import { ExpenseService } from '../services/expense.service';
import type { NewExpense } from '../db/schema';

function buildUpdatePayload(body: Record<string, unknown>): Partial<NewExpense> {
  return {
    ...(typeof body.name === 'string' && { name: body.name }),
    ...(typeof body.cost === 'number' && { cost: body.cost }),
    ...(typeof body.date === 'string' && { date: body.date }),
    ...(typeof body.cropId === 'number' && { cropId: body.cropId }),
    ...(typeof body.locationId === 'number' && { locationId: body.locationId }),
  };
}

function validateRequiredFields(body: Record<string, unknown>): {
  name: string;
  cost: number;
  date: string;
  householdId: number;
} {
  if (!body.name || typeof body.name !== 'string') {
    throw new ApiError(400, 'name is required');
  }
  if (typeof body.cost !== 'number' || body.cost <= 0) {
    throw new ApiError(400, 'cost must be a positive number');
  }
  if (!body.date || typeof body.date !== 'string') {
    throw new ApiError(400, 'date is required');
  }
  const householdId = Number(body.householdId);
  if (!Number.isInteger(householdId) || householdId <= 0) {
    throw new ApiError(400, 'householdId must be a positive integer');
  }
  return { name: body.name, cost: body.cost, date: body.date, householdId };
}

function buildPayload(body: Record<string, unknown>): NewExpense {
  const { name, cost, date, householdId } = validateRequiredFields(body);
  return {
    name,
    cost,
    date,
    householdId,
    ...(typeof body.cropId === 'number' && { cropId: body.cropId }),
    ...(typeof body.locationId === 'number' && { locationId: body.locationId }),
  };
}

export function expenseRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const logged = activityLogger(db);
  const expenseService = new ExpenseService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId must be a positive integer');
      }

      const yearParam = query.year;
      let year: number | undefined;

      if (yearParam !== undefined && yearParam !== '') {
        year = Number(yearParam);
        if (!Number.isInteger(year)) {
          throw new ApiError(400, 'year must be a valid integer');
        }
      }

      return expenseService.getAll(householdId, year);
    }),
  );

  app.post(
    '/',
    handle(
      logged('expense', 'created', async (c) => {
        const body = await readBody(c);
        return expenseService.create(buildPayload(body));
      }),
    ),
  );

  app.delete(
    '/:id',
    handle(
      logged('expense', 'deleted', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid expense id');
        }

        const deleted = await expenseService.delete(id);

        if (!deleted) {
          throw new ApiError(404, 'Expense not found');
        }

        return { success: true };
      }),
    ),
  );

  app.put(
    '/:id',
    handle(
      logged('expense', 'updated', async (c) => {
        const idParam = c.req.param('id');
        const id = Number(idParam);

        if (!Number.isInteger(id) || id <= 0) {
          throw new ApiError(400, 'Invalid expense id');
        }

        const body = await readBody(c);
        const updated = await expenseService.update(id, buildUpdatePayload(body));

        if (updated === null) {
          throw new ApiError(404, 'Expense not found');
        }

        return updated;
      }),
    ),
  );

  return app;
}
