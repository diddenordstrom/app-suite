import { Hono } from 'hono';
import type { DB } from '../db/index';
import { ApiError, handle, getQuery } from '../http';
import type { AppEnv } from '../context';
import { DashboardService } from '../services/dashboard.service';
import { HarvestEventService } from '../services/harvest-event.service';
import { ExpenseService } from '../services/expense.service';

export function dashboardRoutes(db: DB) {
  const app = new Hono<AppEnv>();
  const dashboardService = new DashboardService(db);
  const harvestEventService = new HarvestEventService(db);
  const expenseService = new ExpenseService(db);

  app.get(
    '/',
    handle(async (c) => {
      const query = getQuery(c);
      const householdId = Number(query.householdId);

      if (!Number.isInteger(householdId) || householdId <= 0) {
        throw new ApiError(400, 'householdId must be a positive integer');
      }

      const currentYear = new Date().getFullYear();

      const [growing, onHand, byLocation, producedThisYearKg, expensesThisYear, selfSufficiency] =
        await Promise.all([
          dashboardService.getGrowingMacros(householdId),
          dashboardService.getOnHandMacros(householdId),
          dashboardService.getMacrosByLocation(householdId),
          harvestEventService.sumByHouseholdAndYear(householdId, currentYear),
          expenseService.getTotalByYear(householdId, currentYear),
          dashboardService.getSelfSufficiency(householdId),
        ]);

      return { growing, onHand, byLocation, producedThisYearKg, expensesThisYear, selfSufficiency };
    }),
  );

  return app;
}
