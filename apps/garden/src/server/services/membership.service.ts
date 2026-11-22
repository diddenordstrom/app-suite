import { randomBytes } from 'node:crypto';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { DB } from '../db/index';
import {
  users,
  household,
  householdCropPrice,
  householdMember,
  type Household,
  type HouseholdRole,
} from '../db/schema';
import { ResetService } from './reset.service';

export type MembershipHousehold = Household & { role: HouseholdRole };

export interface Member {
  userId: number;
  name: string | null;
  email: string | null;
  role: HouseholdRole;
}

export type MembershipErrorCode = 'owner-cannot-leave' | 'not-a-member';

export class MembershipError extends Error {
  constructor(readonly code: MembershipErrorCode) {
    super(code);
  }
}

const newInviteCode = () => randomBytes(16).toString('base64url');
const memberOrder = sql`${householdMember.createdAt}, ${householdMember}.rowid`;

/** Who belongs to which household, invite links and household lifecycle. */
export class MembershipService {
  constructor(private readonly db: DB) {}

  createHousehold(userId: number, data: { name: string; persons: number }): Household {
    const created = this.db
      .insert(household)
      .values({ ...data, inviteCode: newInviteCode() })
      .returning()
      .get();
    this.db
      .insert(householdMember)
      .values({ householdId: created.id, userId, role: 'owner' })
      .run();
    return created;
  }

  /** Every account gets its own household the first time it has none. */
  ensureHome(userId: number, name: string): MembershipHousehold[] {
    const existing = this.listForUser(userId);
    if (existing.length > 0) return existing;
    this.createHousehold(userId, { name, persons: 1 });
    return this.listForUser(userId);
  }

  listForUser(userId: number): MembershipHousehold[] {
    return this.db
      .select({ h: household, role: householdMember.role })
      .from(householdMember)
      .innerJoin(household, eq(household.id, householdMember.householdId))
      .where(eq(householdMember.userId, userId))
      .orderBy(memberOrder)
      .all()
      .map((row) => ({ ...row.h, role: row.role }));
  }

  /** The requested household if the user belongs to it, otherwise their first one. */
  resolveActive(userId: number, requested: number | undefined): MembershipHousehold | null {
    const households = this.listForUser(userId);
    return households.find((h) => h.id === requested) ?? households[0] ?? null;
  }

  getRole(householdId: number, userId: number): HouseholdRole | null {
    const row = this.db
      .select({ role: householdMember.role })
      .from(householdMember)
      .where(and(eq(householdMember.householdId, householdId), eq(householdMember.userId, userId)))
      .get();
    return row?.role ?? null;
  }

  findByInviteCode(code: string): Household | null {
    return this.db.select().from(household).where(eq(household.inviteCode, code)).get() ?? null;
  }

  join(code: string, userId: number): Household | null {
    const found = this.findByInviteCode(code);
    if (!found) return null;
    this.db
      .insert(householdMember)
      .values({ householdId: found.id, userId, role: 'member' })
      .onConflictDoNothing()
      .run();
    return found;
  }

  rotateInvite(householdId: number): string {
    const code = newInviteCode();
    this.db.update(household).set({ inviteCode: code }).where(eq(household.id, householdId)).run();
    return code;
  }

  members(householdId: number): Member[] {
    return this.db
      .select({
        userId: householdMember.userId,
        name: users.name,
        email: users.email,
        role: householdMember.role,
      })
      .from(householdMember)
      .innerJoin(users, eq(users.id, householdMember.userId))
      .where(eq(householdMember.householdId, householdId))
      .orderBy(asc(sql`${householdMember.role} != 'owner'`), memberOrder)
      .all();
  }

  /** Removes a member (or lets a member leave). The owner stays until the household is deleted. */
  removeMember(householdId: number, userId: number): void {
    const role = this.getRole(householdId, userId);
    if (role === null) throw new MembershipError('not-a-member');
    if (role === 'owner') throw new MembershipError('owner-cannot-leave');
    this.db
      .delete(householdMember)
      .where(and(eq(householdMember.householdId, householdId), eq(householdMember.userId, userId)))
      .run();
  }

  async deleteHousehold(householdId: number): Promise<void> {
    await new ResetService(this.db).resetHousehold(householdId);
    this.db.delete(householdCropPrice).where(eq(householdCropPrice.householdId, householdId)).run();
    this.db.delete(household).where(eq(household.id, householdId)).run();
  }
}
