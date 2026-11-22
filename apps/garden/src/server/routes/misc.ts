import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { SuggestionService } from '../services/suggestion.service';
import { sql } from 'drizzle-orm';
import { image } from '../db/schema';
import { FinancesService } from '../services/finances.service';
import type Database from 'better-sqlite3';

export function miscRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const suggestionService = new SuggestionService(db);
  const financesService = new FinancesService(db);

  app.get(
    '/bed-nudges',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);
      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }
      return suggestionService.getBedNudges(householdId);
    }),
  );

  app.get(
    '/db-stats',
    handle(() => {
      // SQLite tracks its on-disk size as `page_count * page_size` regardless of
      // whether the DB file is on a real filesystem or `:memory:`. We can read
      // both via PRAGMAs without touching the file system, which keeps this
      // endpoint working in tests too.
      const sqlite = (db as unknown as { $client: Database.Database }).$client;
      const pageSize = sqlite.pragma('page_size', { simple: true }) as number;
      const pageCount = sqlite.pragma('page_count', { simple: true }) as number;
      const totalBytes = pageSize * pageCount;

      const result = db
        .select({ total: sql<number>`COALESCE(SUM(LENGTH(${image.bytes})), 0)` })
        .from(image)
        .get();
      const imageBytes = Number(result?.total ?? 0);

      return { totalBytes, imageBytes };
    }),
  );

  app.get(
    '/finances',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);
      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId is required');
      }

      const year = Number(query.year);
      if (!Number.isInteger(year) || year < 1900 || year > 9999) {
        throw new ApiError(400, 'year is required');
      }

      return financesService.getSummary(householdId, year);
    }),
  );

  return app;
}
