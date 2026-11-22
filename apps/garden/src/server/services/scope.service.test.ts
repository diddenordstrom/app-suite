import { describe, it, expect, beforeEach } from 'vitest';
import { ScopeService } from './scope.service';
import { createTestDb, type TestDB } from '../test-utils/create-test-db';
import * as schema from '../db/schema';
import type { ScopeRef } from '../utils/scope-refs';

describe('ScopeService', () => {
  let db: TestDB;
  let service: ScopeService;
  let ours: number;
  let theirs: number;
  let ids: Record<string, { ours: number; theirs: number }>;

  function insertFor(householdId: number) {
    const crop = db.select().from(schema.crop).get()!;
    const loc = db
      .insert(schema.growingLocation)
      .values({ householdId, name: 'Bed', areaM2: 1 })
      .returning()
      .get();
    const planting = db
      .insert(schema.planting)
      .values({ cropId: crop.id, locationId: loc.id, plantedDate: '2026-05-01', areaM2: 1 })
      .returning()
      .get();
    const one = <T extends { id: number }>(rows: T[]) => rows[0]!.id;
    return {
      location: loc.id,
      planting: planting.id,
      storage: one(
        db
          .insert(schema.storageItem)
          .values({ cropId: crop.id, householdId, quantityKg: 1, harvestedDate: '2026-08-01' })
          .returning()
          .all(),
      ),
      expense: one(
        db
          .insert(schema.expense)
          .values({ householdId, name: 'x', cost: 1, date: '2026-01-01' })
          .returning()
          .all(),
      ),
      'garden-event': one(
        db
          .insert(schema.gardenEvent)
          .values({ householdId, title: 'x', date: '2026-01-01' })
          .returning()
          .all(),
      ),
      garden: one(
        db
          .insert(schema.garden)
          .values({ householdId, widthCm: 100, heightCm: 100 })
          .returning()
          .all(),
      ),
      'macro-target': one(
        db
          .insert(schema.macroTarget)
          .values({
            householdId,
            name: 'x',
            dailyKcal: 1,
            dailyProteinG: 1,
            dailyCarbsG: 1,
            dailyFatG: 1,
          })
          .returning()
          .all(),
      ),
      wishlist: one(
        db
          .insert(schema.householdCropWishlist)
          .values({ householdId, cropId: crop.id })
          .returning()
          .all(),
      ),
    };
  }

  beforeEach(() => {
    db = createTestDb();
    service = new ScopeService(db);
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 1,
        kcalPerKg: 1,
        proteinGPerKg: 1,
        carbsGPerKg: 1,
        fatGPerKg: 1,
        category: 'vegetable',
      })
      .run();
    const households = db
      .insert(schema.household)
      .values([
        { name: 'Ours', persons: 1 },
        { name: 'Theirs', persons: 1 },
      ])
      .returning()
      .all();
    ours = households[0]!.id;
    theirs = households[1]!.id;
    const a = insertFor(ours);
    const b = insertFor(theirs);
    ids = Object.fromEntries(
      Object.keys(a).map((k) => [
        k,
        { ours: a[k as keyof typeof a], theirs: b[k as keyof typeof b] },
      ]),
    );
  });

  it('accepts references to rows owned by the active household', () => {
    // Arrange
    const refs = Object.entries(ids).map(([entity, v]) => ({ entity, id: v.ours }) as ScopeRef);
    refs.push({ entity: 'household', id: ours });

    // Act
    const foreign = service.findForeign(ours, refs);

    // Assert
    expect(foreign).toBeNull();
  });

  it.each([
    'location',
    'planting',
    'storage',
    'expense',
    'garden-event',
    'garden',
    'macro-target',
    'wishlist',
  ] as const)('rejects a %s owned by another household', (entity) => {
    // Arrange
    const refs: ScopeRef[] = [{ entity, id: ids[entity]!.theirs }];

    // Act
    const foreign = service.findForeign(ours, refs);

    // Assert
    expect(foreign).toEqual({ entity, id: ids[entity]!.theirs, reason: 'foreign' });
  });

  it('rejects another household id', () => {
    // Arrange
    const refs: ScopeRef[] = [{ entity: 'household', id: theirs }];

    // Act
    const foreign = service.findForeign(ours, refs);

    // Assert
    expect(foreign?.reason).toBe('foreign');
  });

  it('reports a missing row as missing so handlers can keep returning their own 404', () => {
    // Arrange
    const refs: ScopeRef[] = [{ entity: 'planting', id: 99999 }];

    // Act
    const foreign = service.findForeign(ours, refs);

    // Assert
    expect(foreign).toEqual({ entity: 'planting', id: 99999, reason: 'missing' });
  });
});
