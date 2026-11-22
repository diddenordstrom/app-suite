import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { createTestDb } from '../test-utils/create-test-db';
import {
  household,
  growingLocation,
  planting,
  crop,
  gardenEvent,
  gardenEventLocation,
  gardenEventPlanting,
} from './schema';

describe('Garden-event junction tables', () => {
  it('garden_event_location stores a many-to-many link and survives a round-trip', () => {
    // Arrange
    const db = createTestDb();
    const hh = db.insert(household).values({ name: 'H', persons: 1 }).returning().all()[0]!;
    const locA = db
      .insert(growingLocation)
      .values({ householdId: hh.id, name: 'Bed A', areaM2: 1 })
      .returning()
      .all()[0]!;
    const locB = db
      .insert(growingLocation)
      .values({ householdId: hh.id, name: 'Bed B', areaM2: 1 })
      .returning()
      .all()[0]!;
    const ev = db
      .insert(gardenEvent)
      .values({ householdId: hh.id, title: 'Vattna allt', date: '2026-05-26' })
      .returning()
      .all()[0]!;

    // Act
    db.insert(gardenEventLocation).values({ eventId: ev.id, locationId: locA.id }).run();
    db.insert(gardenEventLocation).values({ eventId: ev.id, locationId: locB.id }).run();

    // Assert
    const rows = db
      .select()
      .from(gardenEventLocation)
      .where(eq(gardenEventLocation.eventId, ev.id))
      .all();
    expect(rows.map((r) => r.locationId).sort()).toEqual([locA.id, locB.id].sort());
  });

  it('garden_event_planting stores a many-to-many link and survives a round-trip', () => {
    // Arrange
    const db = createTestDb();
    const hh = db.insert(household).values({ name: 'H', persons: 1 }).returning().all()[0]!;
    const loc = db
      .insert(growingLocation)
      .values({ householdId: hh.id, name: 'Bed', areaM2: 1 })
      .returning()
      .all()[0]!;
    const c = db
      .insert(crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 5,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 39,
        fatGPerKg: 2,
        category: 'fruit',
      })
      .returning()
      .all()[0]!;
    const p1 = db
      .insert(planting)
      .values({ cropId: c.id, locationId: loc.id, plantedDate: '2026-05-01', areaM2: 0.5 })
      .returning()
      .all()[0]!;
    const p2 = db
      .insert(planting)
      .values({ cropId: c.id, locationId: loc.id, plantedDate: '2026-05-02', areaM2: 0.5 })
      .returning()
      .all()[0]!;
    const ev = db
      .insert(gardenEvent)
      .values({ householdId: hh.id, title: 'Rensa', date: '2026-05-26' })
      .returning()
      .all()[0]!;

    // Act
    db.insert(gardenEventPlanting).values({ eventId: ev.id, plantingId: p1.id }).run();
    db.insert(gardenEventPlanting).values({ eventId: ev.id, plantingId: p2.id }).run();

    // Assert
    const rows = db
      .select()
      .from(gardenEventPlanting)
      .where(eq(gardenEventPlanting.eventId, ev.id))
      .all();
    expect(rows.map((r) => r.plantingId).sort()).toEqual([p1.id, p2.id].sort());
  });
});
