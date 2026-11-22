import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, readBody, getQuery } from '../http';
import type { AppEnv } from '../context';
import { SuggestionService } from '../services/suggestion.service';
import { GardenEventService } from '../services/gardenEvent.service';

export function suggestionsRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const suggestionService = new SuggestionService(db);
  const gardenEventService = new GardenEventService(db);

  app.get(
    '/bed',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'Invalid householdId');
      }

      return suggestionService.generateBedSuggestions(householdId, new Date());
    }),
  );

  app.delete(
    '/dismissals',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'Invalid householdId');
      }

      return suggestionService.clearDismissals(householdId);
    }),
  );

  app.post(
    '/generate',
    handle(async (c) => {
      const body = await readBody(c);

      const householdId = Number(body.householdId);
      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return suggestionService.generateSuccessionSuggestions(householdId);
    }),
  );

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      return gardenEventService.getSuggestions(householdId);
    }),
  );

  return app;
}
