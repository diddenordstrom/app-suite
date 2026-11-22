import { describe, it, expect, beforeEach } from 'vitest';
import { MembershipError, MembershipService } from './membership.service';
import { createTestDb, type TestDB } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('MembershipService', () => {
  let db: TestDB;
  let service: MembershipService;
  let anna: number;
  let bo: number;

  beforeEach(() => {
    db = createTestDb();
    service = new MembershipService(db);
    const addUser = (sub: string, name: string) =>
      db.insert(schema.users).values({ sub, name, createdAt: Date.now() }).returning().get().id;
    anna = addUser('anna', 'Anna');
    bo = addUser('bo', 'Bo');
  });

  describe('ensureHome', () => {
    it('creates an owned household with an invite code for a user without one', () => {
      // Arrange — Anna has no households yet

      // Act
      const households = service.ensureHome(anna, 'Annas trädgård');

      // Assert
      expect(households).toHaveLength(1);
      expect(households[0]).toMatchObject({ name: 'Annas trädgård', persons: 1, role: 'owner' });
      expect(households[0]!.inviteCode).toMatch(/^[\w-]{22}$/);
    });

    it('does nothing when the user already belongs to a household', () => {
      // Arrange
      service.ensureHome(anna, 'Annas trädgård');

      // Act
      const households = service.ensureHome(anna, 'Annas trädgård');

      // Assert
      expect(households).toHaveLength(1);
      expect(db.select().from(schema.household).all()).toHaveLength(1);
    });
  });

  describe('listForUser', () => {
    it('lists only the households the user is a member of, with their role', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 2 });
      service.createHousehold(bo, { name: 'Bos', persons: 1 });
      service.join(annas.inviteCode!, bo);

      // Act
      const forBo = service.listForUser(bo);

      // Assert
      expect(forBo.map((h) => [h.name, h.role])).toEqual([
        ['Bos', 'owner'],
        ['Annas', 'member'],
      ]);
    });
  });

  describe('resolveActive', () => {
    it('returns the requested household when the user is a member', () => {
      // Arrange
      service.createHousehold(anna, { name: 'First', persons: 1 });
      const second = service.createHousehold(anna, { name: 'Second', persons: 1 });

      // Act
      const active = service.resolveActive(anna, second.id);

      // Assert
      expect(active?.id).toBe(second.id);
    });

    it('falls back to the first membership for a household the user is not in', () => {
      // Arrange
      const first = service.createHousehold(anna, { name: 'First', persons: 1 });
      const bos = service.createHousehold(bo, { name: 'Bos', persons: 1 });

      // Act
      const active = service.resolveActive(anna, bos.id);

      // Assert
      expect(active?.id).toBe(first.id);
      expect(active?.role).toBe('owner');
    });

    it('falls back to the first membership when nothing is requested', () => {
      // Arrange
      const first = service.createHousehold(anna, { name: 'First', persons: 1 });

      // Act
      const active = service.resolveActive(anna, undefined);

      // Assert
      expect(active?.id).toBe(first.id);
    });

    it('returns null for a user without households', () => {
      // Arrange — Anna has no households

      // Act
      const active = service.resolveActive(anna, undefined);

      // Assert
      expect(active).toBeNull();
    });
  });

  describe('invites', () => {
    it('findByInviteCode returns the household for a valid code and null otherwise', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act
      const found = service.findByInviteCode(annas.inviteCode!);
      const missing = service.findByInviteCode('nope');

      // Assert
      expect(found?.id).toBe(annas.id);
      expect(missing).toBeNull();
    });

    it('join adds the user as a member', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act
      const joined = service.join(annas.inviteCode!, bo);

      // Assert
      expect(joined?.id).toBe(annas.id);
      expect(service.getRole(annas.id, bo)).toBe('member');
    });

    it('join keeps the existing role when the user is already a member', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act
      service.join(annas.inviteCode!, anna);

      // Assert
      expect(service.getRole(annas.id, anna)).toBe('owner');
    });

    it('join returns null for an unknown code', () => {
      // Arrange — no households

      // Act
      const joined = service.join('nope', bo);

      // Assert
      expect(joined).toBeNull();
    });

    it('rotateInvite replaces the code so the old link stops working', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });
      const oldCode = annas.inviteCode!;

      // Act
      const newCode = service.rotateInvite(annas.id);

      // Assert
      expect(newCode).not.toBe(oldCode);
      expect(service.findByInviteCode(oldCode)).toBeNull();
      expect(service.findByInviteCode(newCode)?.id).toBe(annas.id);
    });
  });

  describe('members', () => {
    it('lists members with name, email and role, owner first', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });
      service.join(annas.inviteCode!, bo);

      // Act
      const members = service.members(annas.id);

      // Assert
      expect(members.map((m) => [m.userId, m.name, m.role])).toEqual([
        [anna, 'Anna', 'owner'],
        [bo, 'Bo', 'member'],
      ]);
    });

    it('getRole returns null for a non-member', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act
      const role = service.getRole(annas.id, bo);

      // Assert
      expect(role).toBeNull();
    });
  });

  describe('removeMember', () => {
    it('removes a member', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });
      service.join(annas.inviteCode!, bo);

      // Act
      service.removeMember(annas.id, bo);

      // Assert
      expect(service.getRole(annas.id, bo)).toBeNull();
    });

    it('refuses to remove the owner', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act + Assert
      expect(() => service.removeMember(annas.id, anna)).toThrow(MembershipError);
      expect(service.getRole(annas.id, anna)).toBe('owner');
    });

    it('throws not-a-member for a user outside the household', () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });

      // Act + Assert
      expect(() => service.removeMember(annas.id, bo)).toThrow('not-a-member');
    });
  });

  describe('deleteHousehold', () => {
    it('deletes the household, its members and its data but leaves other households alone', async () => {
      // Arrange
      const annas = service.createHousehold(anna, { name: 'Annas', persons: 1 });
      const bos = service.createHousehold(bo, { name: 'Bos', persons: 1 });
      service.join(annas.inviteCode!, bo);
      db.insert(schema.growingLocation)
        .values([
          { householdId: annas.id, name: 'A', areaM2: 1 },
          { householdId: bos.id, name: 'B', areaM2: 1 },
        ])
        .run();
      db.insert(schema.activity)
        .values({ householdId: annas.id, action: 'created', entityType: 'location', entityId: 1 })
        .run();

      // Act
      await service.deleteHousehold(annas.id);

      // Assert
      expect(
        db
          .select()
          .from(schema.household)
          .all()
          .map((h) => h.id),
      ).toEqual([bos.id]);
      expect(
        db
          .select()
          .from(schema.growingLocation)
          .all()
          .map((l) => l.name),
      ).toEqual(['B']);
      expect(service.listForUser(bo).map((h) => h.id)).toEqual([bos.id]);
      expect(db.select().from(schema.activity).all()).toHaveLength(0);
    });
  });
});
