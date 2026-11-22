import { desc, eq, and } from 'drizzle-orm';
import type { DB } from '../db/index';
import { activity, type Activity, type NewActivity } from '../db/schema';

export class ActivityService {
  constructor(private readonly db: DB) {}

  async log(data: NewActivity): Promise<Activity> {
    const rows = this.db.insert(activity).values(data).returning().all();
    return rows[0]!;
  }

  async getRecent(householdId: number, limit = 20): Promise<Activity[]> {
    return this.db
      .select()
      .from(activity)
      .where(eq(activity.householdId, householdId))
      .orderBy(desc(activity.createdAt), desc(activity.id))
      .limit(limit);
  }

  async getByEntity(
    householdId: number,
    entityType: string,
    entityId: number,
  ): Promise<Activity[]> {
    return this.db
      .select()
      .from(activity)
      .where(
        and(
          eq(activity.householdId, householdId),
          eq(activity.entityType, entityType),
          eq(activity.entityId, entityId),
        ),
      );
  }

  async getAll(): Promise<Activity[]> {
    return this.db.select().from(activity);
  }
}
