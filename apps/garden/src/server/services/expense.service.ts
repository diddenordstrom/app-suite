import { and, eq, sql, gte, lt } from 'drizzle-orm';
import type { DB } from '../db/index';
import { expense } from '../db/schema';
import type { Expense, NewExpense } from '../db/schema';

export class ExpenseService {
  constructor(private readonly db: DB) {}

  async create(data: NewExpense): Promise<Expense> {
    const rows = this.db.insert(expense).values(data).returning().all();
    return rows[0]!;
  }

  async getAll(householdId: number, year?: number): Promise<Expense[]> {
    const conditions = [eq(expense.householdId, householdId)];

    if (year !== undefined) {
      conditions.push(gte(expense.date, `${year}-01-01`));
      conditions.push(lt(expense.date, `${year + 1}-01-01`));
    }

    return this.db
      .select()
      .from(expense)
      .where(and(...conditions));
  }

  async getById(id: number): Promise<Expense | null> {
    const rows = await this.db.select().from(expense).where(eq(expense.id, id));
    return rows[0] ?? null;
  }

  async update(id: number, data: Partial<NewExpense>): Promise<Expense | null> {
    const rows = this.db
      .update(expense)
      .set({ ...data, updatedAt: sql`(datetime('now'))` })
      .where(eq(expense.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(expense).where(eq(expense.id, id)).returning().all();
    return rows.length > 0;
  }

  async getTotalByYear(householdId: number, year: number): Promise<number> {
    const rows = this.db
      .select({ total: sql<number>`COALESCE(SUM(${expense.cost}), 0)` })
      .from(expense)
      .where(
        and(
          eq(expense.householdId, householdId),
          gte(expense.date, `${year}-01-01`),
          lt(expense.date, `${year + 1}-01-01`),
        ),
      )
      .all();
    return rows[0]?.total ?? 0;
  }
}
