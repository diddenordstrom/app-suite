import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { GardenEventService } from './gardenEvent.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('GardenEventService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: GardenEventService;

  // Helper: insert a gardenEvent row AND a junction row in one call so tests
  // don't need to touch the dropped location_id / planting_id columns.
  async function seedEventWithLocation(
    eventData: Parameters<typeof service.create>[0],
    locationId: number,
  ) {
    const ev = await service.create(eventData);
    await service.setAttachedLocations(ev.id, [locationId]);
    return ev;
  }

  beforeEach(() => {
    db = createTestDb();
    service = new GardenEventService(db);

    // Seed household so FK constraints are satisfied
    db.insert(schema.household).values({ name: 'Familjen Svensson', persons: 4 }).run();

    // Seed a second household for isolation tests
    db.insert(schema.household).values({ name: 'Familjen Andersson', persons: 2 }).run();

    // Seed a crop so planting.crop_id FK is satisfied
    db.insert(schema.crop)
      .values({
        name: 'Tomat',
        yieldKgPerM2: 8.0,
        kcalPerKg: 180,
        proteinGPerKg: 9,
        carbsGPerKg: 35,
        fatGPerKg: 2,
        category: 'vegetable',
      })
      .run();

    // Seed a growing location for household 1
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
  });

  // ---------------------------------------------------------------------------
  // create()
  // ---------------------------------------------------------------------------

  describe('create()', () => {
    it('returns created event with all fields matching input', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Vattna tomaterna',
        date: '2026-04-10',
        recurringDays: 7,
      };

      // Act
      const result = await service.create(input);
      await service.setAttachedLocations(result.id, [1]);

      // Assert
      expect(result.id).toBeDefined();
      expect(result.householdId).toBe(1);
      expect(result.title).toBe('Vattna tomaterna');
      expect(result.date).toBe('2026-04-10');
      expect(result.recurringDays).toBe(7);
      expect(result.completedAt).toBeNull();
      // Location attachment lives in the junction table now.
      const attachments = await service.getAttachments(result.id);
      expect(attachments.locationIds).toEqual([1]);
    });

    it('nullable fields (recurringDays) default to null when omitted', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Gödsla',
        date: '2026-04-15',
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.recurringDays).toBeNull();
      // Junction tables return empty arrays (not null) when nothing is attached.
      const attachments = await service.getAttachments(result.id);
      expect(attachments.locationIds).toEqual([]);
      expect(attachments.plantingIds).toEqual([]);
    });

    it('persists eventType when provided', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Vattna polytunneln',
        date: '2026-05-10',
        eventType: 'watering' as const,
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.eventType).toBe('watering');
    });

    it('defaults eventType to "general" when omitted', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Random todo',
        date: '2026-05-10',
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.eventType).toBe('general');
    });

    it('persists description (notes) when provided', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Vattna',
        date: '2026-05-10',
        description: 'Glöm inte gurkorna i bakgården',
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.description).toBe('Glöm inte gurkorna i bakgården');
    });

    it('description defaults to null when omitted', async () => {
      // Arrange
      const input = {
        householdId: 1,
        title: 'Vattna',
        date: '2026-05-10',
      };

      // Act
      const result = await service.create(input);

      // Assert
      expect(result.description).toBeNull();
    });

    it('multiple creates get unique ids', async () => {
      // Arrange
      const input = { householdId: 1, title: 'Vattna', date: '2026-04-10' };

      // Act
      const first = await service.create(input);
      const second = await service.create({ ...input, date: '2026-04-11' });

      // Assert
      expect(first.id).not.toBe(second.id);
    });
  });

  // ---------------------------------------------------------------------------
  // getAll()
  // ---------------------------------------------------------------------------

  describe('getAll()', () => {
    it('returns all events for a given household', async () => {
      // Arrange
      await service.create({ householdId: 1, title: 'Vattna', date: '2026-04-10' });
      await service.create({ householdId: 1, title: 'Gödsla', date: '2026-04-12' });

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(2);
    });

    it('returns empty array when none exist', async () => {
      // Arrange — no events seeded

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(0);
    });

    it('does NOT return events from a different household', async () => {
      // Arrange
      await service.create({ householdId: 1, title: 'Vattna', date: '2026-04-10' });
      await service.create({ householdId: 2, title: 'Rensa ogräs', date: '2026-04-11' });

      // Act
      const result = await service.getAll(1);

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0]?.householdId).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // getById()
  // ---------------------------------------------------------------------------

  describe('getById()', () => {
    it('returns event for valid id', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Vattna');
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const found = await service.getById(99999);

      // Assert
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // update()
  // ---------------------------------------------------------------------------

  describe('update()', () => {
    it('partial update (title only) preserves other fields', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
        recurringDays: 7,
      });

      // Act
      const updated = await service.update(created.id, { title: 'Vattna noga' });

      // Assert
      expect(updated?.title).toBe('Vattna noga');
      expect(updated?.date).toBe('2026-04-10');
      expect(updated?.recurringDays).toBe(7);
    });

    it('can update the description (notes) field', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-05-10',
      });
      expect(created.description).toBeNull();

      // Act
      const updated = await service.update(created.id, {
        description: 'Kom ihåg dropptidsinställningen',
      });

      // Assert
      expect(updated?.description).toBe('Kom ihåg dropptidsinställningen');
    });

    it('can update date and recurringDays', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
      });

      // Act
      const updated = await service.update(created.id, {
        date: '2026-04-20',
        recurringDays: 14,
      });

      // Assert
      expect(updated?.date).toBe('2026-04-20');
      expect(updated?.recurringDays).toBe(14);
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const result = await service.update(99999, { title: 'Okänt' });

      // Assert
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // delete()
  // ---------------------------------------------------------------------------

  describe('delete()', () => {
    it('returns true and event no longer appears in getAll', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
      });

      // Act
      const deleted = await service.delete(created.id);

      // Assert
      expect(deleted).toBe(true);
      const all = await service.getAll(1);
      expect(all).toHaveLength(0);
    });

    it('returns false for unknown id', async () => {
      // Arrange — empty db

      // Act
      const deleted = await service.delete(99999);

      // Assert
      expect(deleted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // complete()
  // ---------------------------------------------------------------------------

  describe('complete()', () => {
    it('non-recurring: sets completedAt to a non-null string and returns event', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
      });

      // Act
      const result = await service.complete(created.id);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.completedAt).not.toBeNull();
      expect(typeof result?.completedAt).toBe('string');
    });

    it('recurring: sets completedAt on original and creates next occurrence with date = original + recurringDays', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-01',
        recurringDays: 14,
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);

      // Assert — original is completed, new occurrence exists
      expect(all).toHaveLength(2);

      const original = all.find((e) => e.id === created.id);
      const next = all.find((e) => e.id !== created.id);

      expect(original?.completedAt).not.toBeNull();
      expect(next?.completedAt).toBeNull();
      expect(next?.date).toBe('2026-04-15');
    });

    it('recurring: next occurrence preserves householdId, title, and recurringDays', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna regelbundet',
        date: '2026-04-01',
        recurringDays: 7,
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.householdId).toBe(1);
      expect(next?.title).toBe('Vattna regelbundet');
      expect(next?.recurringDays).toBe(7);
    });

    it('date arithmetic: event with date 2026-04-01 + recurringDays=14 produces next date 2026-04-15', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Gödsla',
        date: '2026-04-01',
        recurringDays: 14,
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.date).toBe('2026-04-15');
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const result = await service.complete(99999);

      // Assert
      expect(result).toBeNull();
    });

    // -------------------------------------------------------------------------
    // RRULE-native recurring (RFC-5545). recurrenceRule is the new way; the
    // legacy recurringDays counter still works for backwards compat.
    // -------------------------------------------------------------------------

    it('FREQ=DAILY: completing on 2026-04-10 spawns next occurrence on 2026-04-11', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Daglig vattning',
        date: '2026-04-10',
        recurrenceRule: 'FREQ=DAILY',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.date).toBe('2026-04-11');
      expect(next?.recurrenceRule).toBe('FREQ=DAILY');
    });

    it('FREQ=WEEKLY;BYDAY=MO: completing on a Monday spawns next Monday', async () => {
      // Arrange — 2026-04-06 is a Monday
      const created = await service.create({
        householdId: 1,
        title: 'Måndagsgödsling',
        date: '2026-04-06',
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert — next Monday is 2026-04-13
      expect(next?.date).toBe('2026-04-13');
    });

    it('FREQ=WEEKLY;INTERVAL=2: spawns event 14 days later', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Varannan vecka',
        date: '2026-04-01',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.date).toBe('2026-04-15');
    });

    it('FREQ=MONTHLY: spawns event one month later', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Månadskoll',
        date: '2026-03-15',
        recurrenceRule: 'FREQ=MONTHLY',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.date).toBe('2026-04-15');
    });

    it('recurrenceRule wins over legacy recurringDays when both are set', async () => {
      // Arrange — recurringDays would say +30 days, RRULE says +1 day
      const created = await service.create({
        householdId: 1,
        title: 'Mixad',
        date: '2026-04-10',
        recurringDays: 30,
        recurrenceRule: 'FREQ=DAILY',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert — RRULE-native is the source of truth
      expect(next?.date).toBe('2026-04-11');
    });

    it('does NOT spawn a next occurrence when the RRULE has already terminated', async () => {
      // Arrange — RRULE limited to a single occurrence; completing it must not spawn another
      const created = await service.create({
        householdId: 1,
        title: 'One-shot recurring',
        date: '2026-04-10',
        eventType: 'watering',
        recurrenceRule: 'FREQ=DAILY;COUNT=1',
      });

      // Act
      await service.complete(created.id);

      // Assert — still only the original event exists
      const all = await service.getAll(1);
      expect(all).toHaveLength(1);
      expect(all[0]!.id).toBe(created.id);
    });

    it('preserves recurrenceRule on the spawned occurrence so it keeps repeating', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Återkommande',
        date: '2026-04-01',
        recurrenceRule: 'FREQ=WEEKLY;INTERVAL=2',
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);
      const next = all.find((e) => e.id !== created.id);

      // Assert
      expect(next?.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=2');
    });
  });

  // ---------------------------------------------------------------------------
  // getTimeline()
  // ---------------------------------------------------------------------------

  describe('getTimeline()', () => {
    it('returns gardenEvents merged with active planting expectedHarvestDates', async () => {
      // Arrange — one event and one active planting with harvest date
      await service.create({ householdId: 1, title: 'Vattna', date: '2026-06-01' });

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-07-01',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(2);
    });

    it('excludes plantings with status = "harvested"', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-07-01',
          areaM2: 2.0,
          status: 'harvested',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(0);
    });

    it('excludes plantings with expectedHarvestDate = null', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          areaM2: 2.0,
          status: 'planted',
          // expectedHarvestDate intentionally omitted
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(0);
    });

    it('returns empty array when no events and no active plantings', async () => {
      // Arrange — nothing seeded

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(0);
    });

    it('exposes eventType on each event TimelineItem', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        title: 'Vattna polytunneln',
        date: '2026-06-01',
        eventType: 'watering',
      });

      // Act
      const timeline = await service.getTimeline(1);

      // Assert — typed events round-trip through the timeline so the UI can
      // pick the right chip without a second round-trip.
      const event = timeline.find((t) => t.type === 'event');
      expect(event?.eventType).toBe('watering');
    });

    it('eventType on harvest TimelineItems is null (harvests are not chores)', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-07-01',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      const harvest = timeline.find((t) => t.type === 'harvest');
      expect(harvest?.eventType).toBeNull();
    });

    it('exposes recurrenceRule on each event TimelineItem so the form can populate the picker on edit', async () => {
      // Arrange
      await service.create({
        householdId: 1,
        title: 'Veckokoll',
        date: '2026-06-01',
        recurrenceRule: 'FREQ=WEEKLY',
      });

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      const event = timeline.find((t) => t.type === 'event');
      expect(event?.recurrenceRule).toBe('FREQ=WEEKLY');
    });

    it('result is sorted by date ascending', async () => {
      // Arrange
      await service.create({ householdId: 1, title: 'Gödsla', date: '2026-07-10' });
      await service.create({ householdId: 1, title: 'Vattna', date: '2026-05-01' });

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-06-15',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline[0]?.date).toBe('2026-05-01');
      expect(timeline[1]?.date).toBe('2026-06-15');
      expect(timeline[2]?.date).toBe('2026-07-10');
    });

    it('gardenEvent items have type = "event"', async () => {
      // Arrange
      await service.create({ householdId: 1, title: 'Vattna', date: '2026-05-01' });

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline[0]?.type).toBe('event');
    });

    it('exposes suggestionType on event timeline items so the UI can differentiate harden_off / transplant_due', async () => {
      // Arrange — manually insert a harden_off event (mimics what accept() creates)
      const hardenOffRows = db
        .insert(schema.gardenEvent)
        .values({
          householdId: 1,
          title: 'Härda av Tomat',
          date: '2026-05-01',
          cropId: 1,
          suggestionType: 'harden_off',
          // status: null — real event, not a suggestion
        })
        .returning()
        .all();
      await service.setAttachedLocations(hardenOffRows[0]!.id, [1]);

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(1);
      expect(timeline[0]?.type).toBe('event');
      expect(timeline[0]?.suggestionType).toBe('harden_off');
    });

    it('harvest items have type = "harvest", completedAt = null, recurringDays = null', async () => {
      // Arrange
      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-07-01',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);
      const harvestItem = timeline[0];

      // Assert
      expect(harvestItem?.type).toBe('harvest');
      expect(harvestItem?.completedAt).toBeNull();
      expect(harvestItem?.recurringDays).toBeNull();
    });

    it('does NOT include items from other households', async () => {
      // Arrange — event for household 2, planting location is household 1 but its planting scoped via household
      await service.create({ householdId: 2, title: 'Rensa', date: '2026-06-01' });

      // Seed location for household 2
      db.insert(schema.growingLocation)
        .values({ householdId: 2, name: 'Trädgård 2', areaM2: 5.0 })
        .run();

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 2,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-07-01',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert
      expect(timeline).toHaveLength(0);
    });
  });

  // ---------------------------------------------------------------------------
  // accept() — transplant suggestions perform the seedling → planted
  // transition in addition to clearing the suggestion flag.
  // ---------------------------------------------------------------------------

  describe('accept() — transplant suggestion', () => {
    it('updates the source seedling planting in place when accepting a transplant suggestion', async () => {
      // Arrange — indoor location holding a tomato seedling
      const indoorLoc = db
        .insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Inomhus', areaM2: 1, isIndoor: true })
        .returning()
        .all();
      const seedling = db
        .insert(schema.planting)
        .values({
          cropId: 1,
          locationId: indoorLoc[0]!.id,
          plantedDate: '2026-03-10',
          areaM2: 0.2,
          status: 'seedling',
        })
        .returning()
        .all();
      // Outdoor bed already seeded as locationId=1 in beforeEach
      const event = db
        .insert(schema.gardenEvent)
        .values({
          householdId: 1,
          title: 'Plantera ut TestTomat',
          date: '2026-05-08',
          cropId: 1,
          suggestionType: 'transplant',
          status: 'suggestion',
        })
        .returning()
        .all();
      await service.setAttachedLocations(event[0]!.id, [1]);
      await service.setAttachedPlantings(event[0]!.id, [seedling[0]!.id]);

      // Act
      const result = await service.accept(event[0]!.id);

      // Assert — event accepted (status cleared)
      expect(result?.status).toBeNull();

      // Assert — seedling planting row updated in place
      const updatedPlanting = db
        .select()
        .from(schema.planting)
        .where(eq(schema.planting.id, seedling[0]!.id))
        .all();
      expect(updatedPlanting[0]?.status).toBe('planted');
      expect(updatedPlanting[0]?.locationId).toBe(1);
      expect(updatedPlanting[0]?.plantedDate).toBe('2026-05-08');
    });

    it('leaves non-transplant suggestions (sow/succession) untouched on planting rows', async () => {
      // Arrange — a sow suggestion (suggestionType='empty_bed', no plantingId)
      const event = db
        .insert(schema.gardenEvent)
        .values({
          householdId: 1,
          title: 'Plantera bönor',
          date: '2026-05-15',
          cropId: 1,
          suggestionType: 'empty_bed',
          status: 'suggestion',
        })
        .returning()
        .all();
      await service.setAttachedLocations(event[0]!.id, [1]);

      // Act
      const result = await service.accept(event[0]!.id);

      // Assert — accept just clears the suggestion flag, no planting created or modified
      expect(result?.status).toBeNull();
      const plantings = db.select().from(schema.planting).all();
      expect(plantings).toHaveLength(0);
    });

    it('auto-generates a harden_off event 7 days before the transplant date when accepting a transplant', async () => {
      // Arrange — same setup as the transplant accept happy path
      const indoorLoc = db
        .insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Inomhus', areaM2: 1, isIndoor: true })
        .returning()
        .all();
      const seedling = db
        .insert(schema.planting)
        .values({
          cropId: 1,
          locationId: indoorLoc[0]!.id,
          plantedDate: '2026-03-10',
          areaM2: 0.2,
          status: 'seedling',
        })
        .returning()
        .all();
      const event = db
        .insert(schema.gardenEvent)
        .values({
          householdId: 1,
          title: 'Plantera ut Tomat',
          date: '2026-05-08',
          cropId: 1,
          suggestionType: 'transplant',
          status: 'suggestion',
        })
        .returning()
        .all();
      await service.setAttachedLocations(event[0]!.id, [1]);
      await service.setAttachedPlantings(event[0]!.id, [seedling[0]!.id]);

      // Act
      await service.accept(event[0]!.id);

      // Assert — a harden_off event exists with date = transplant date − 7 days
      const hardenOff = db
        .select()
        .from(schema.gardenEvent)
        .where(eq(schema.gardenEvent.suggestionType, 'harden_off'))
        .all();
      expect(hardenOff).toHaveLength(1);
      expect(hardenOff[0]?.date).toBe('2026-05-01');
      expect(hardenOff[0]?.householdId).toBe(1);
      expect(hardenOff[0]?.cropId).toBe(1);
      expect(hardenOff[0]?.status).toBeNull();
      // Attachments are stored in junction tables.
      const hardenOffAttachments = await service.getAttachments(hardenOff[0]!.id);
      expect(hardenOffAttachments.locationIds).toEqual([1]);
      expect(hardenOffAttachments.plantingIds).toEqual([seedling[0]!.id]);
    });

    it('does not auto-generate a harden_off event when accepting a sow suggestion', async () => {
      // Arrange — sow suggestion (no plantingId)
      const event = db
        .insert(schema.gardenEvent)
        .values({
          householdId: 1,
          title: 'Direktså Spenat',
          date: '2026-05-15',
          cropId: 1,
          suggestionType: 'empty_bed',
          status: 'suggestion',
        })
        .returning()
        .all();
      await service.setAttachedLocations(event[0]!.id, [1]);

      // Act
      await service.accept(event[0]!.id);

      // Assert — no harden_off event created
      const hardenOff = db
        .select()
        .from(schema.gardenEvent)
        .where(eq(schema.gardenEvent.suggestionType, 'harden_off'))
        .all();
      expect(hardenOff).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // getLastDoneByLocation() — per-chore-type "last done" history per location
  // ---------------------------------------------------------------------------

  describe('getLastDoneByLocation()', () => {
    it('returns the most recent completed-event date per chore type for the given location', async () => {
      // Arrange — three watering events on location 1, one fertilizing.
      // Only completedAt-flagged rows count; status='suggestion' is excluded.
      const w1 = await seedEventWithLocation(
        { householdId: 1, title: 'Watering 1', date: '2026-04-10', eventType: 'watering' },
        1,
      );
      const w2 = await seedEventWithLocation(
        { householdId: 1, title: 'Watering 2', date: '2026-04-15', eventType: 'watering' },
        1,
      );
      const f1 = await seedEventWithLocation(
        { householdId: 1, title: 'Fertilizing 1', date: '2026-04-12', eventType: 'fertilizing' },
        1,
      );
      // One uncompleted row should NOT show up
      await seedEventWithLocation(
        { householdId: 1, title: 'Watering future', date: '2026-04-20', eventType: 'watering' },
        1,
      );
      await service.complete(w1.id);
      await service.complete(w2.id);
      await service.complete(f1.id);

      // Act
      const lastDone = await service.getLastDoneByLocation(1);

      // Assert — most recent completed date per type
      expect(lastDone.watering).toBe('2026-04-15');
      expect(lastDone.fertilizing).toBe('2026-04-12');
      expect(lastDone.pruning).toBeNull();
    });

    it('does NOT include events from a different location', async () => {
      // Arrange — second location for the same household
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Polytunneln', areaM2: 8.0 })
        .run();
      const created = await seedEventWithLocation(
        { householdId: 1, title: 'Watering location 2', date: '2026-04-15', eventType: 'watering' },
        2,
      );
      await service.complete(created.id);

      // Act
      const lastDone = await service.getLastDoneByLocation(1);

      // Assert — location 1 sees nothing
      expect(lastDone.watering).toBeNull();
    });

    it('returns null per type when no completed events exist for that location', async () => {
      // Arrange — empty db

      // Act
      const lastDone = await service.getLastDoneByLocation(1);

      // Assert — every chore type maps to null
      expect(lastDone.watering).toBeNull();
      expect(lastDone.fertilizing).toBeNull();
      expect(lastDone.pruning).toBeNull();
      expect(lastDone.weeding).toBeNull();
      expect(lastDone.pest_check).toBeNull();
    });

    it("ignores completed events whose eventType is 'general' (non-chore)", async () => {
      // Arrange — a completed 'general' event should not surface as any chore-type's last-done date
      const general = await seedEventWithLocation(
        { householdId: 1, title: 'One-off observation', date: '2026-04-12', eventType: 'general' },
        1,
      );
      await service.complete(general.id);

      // Act
      const lastDone = await service.getLastDoneByLocation(1);

      // Assert — every chore-type bucket remains null
      expect(lastDone.watering).toBeNull();
      expect(lastDone.fertilizing).toBeNull();
      expect(lastDone.pruning).toBeNull();
      expect(lastDone.weeding).toBeNull();
      expect(lastDone.pest_check).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // dismiss() — sets dismissedAt timestamp
  // ---------------------------------------------------------------------------

  describe('dismiss()', () => {
    it('sets status to dismissed AND dismissedAt to a non-null ISO string', async () => {
      // Arrange
      const before = new Date();
      const created = await service.create({
        householdId: 1,
        title: 'Förslag: Tomat i Köksträdgård',
        date: '2026-05-01',
        status: 'suggestion',
      });

      // Act
      const result = await service.dismiss(created.id);

      // Assert
      const after = new Date();
      expect(result).not.toBeNull();
      expect(result?.status).toBe('dismissed');
      expect(result?.dismissedAt).not.toBeNull();
      expect(typeof result?.dismissedAt).toBe('string');
      // dismissedAt should be a valid ISO timestamp within our test window
      const dismissedAtMs = new Date(result!.dismissedAt!).getTime();
      expect(dismissedAtMs).toBeGreaterThanOrEqual(before.getTime() - 1000);
      expect(dismissedAtMs).toBeLessThanOrEqual(after.getTime() + 1000);
    });

    it('returns null for unknown id', async () => {
      // Arrange — empty db

      // Act
      const result = await service.dismiss(99999);

      // Assert
      expect(result).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Many-to-many attachments (junction tables)
  // ---------------------------------------------------------------------------

  describe('attachments', () => {
    it('getAttachments returns empty arrays for an event with no junction rows', async () => {
      // Arrange
      const ev = await service.create({ householdId: 1, title: 'Lös', date: '2026-04-10' });

      // Act
      const result = await service.getAttachments(ev.id);

      // Assert
      expect(result).toEqual({ locationIds: [], plantingIds: [] });
    });

    it('setAttachedLocations replaces existing attachments with the given ids', async () => {
      // Arrange — seed a second location for household 1.
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Polytunnel', areaM2: 6 })
        .run();
      const ev = await service.create({ householdId: 1, title: 'Vattna', date: '2026-04-10' });

      // Act — attach two, then replace with one.
      await service.setAttachedLocations(ev.id, [1, 2]);
      let attached = await service.getAttachments(ev.id);
      expect(attached.locationIds.sort()).toEqual([1, 2]);

      await service.setAttachedLocations(ev.id, [2]);
      attached = await service.getAttachments(ev.id);

      // Assert — full replace semantics: only [2] remains.
      expect(attached.locationIds).toEqual([2]);
    });

    it('setAttachedPlantings replaces existing attachments with the given ids', async () => {
      // Arrange — two plantings on the seeded bed.
      const p1 = db
        .insert(schema.planting)
        .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-01', areaM2: 0.5 })
        .returning()
        .all()[0]!;
      const p2 = db
        .insert(schema.planting)
        .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-02', areaM2: 0.5 })
        .returning()
        .all()[0]!;
      const ev = await service.create({ householdId: 1, title: 'Rensa', date: '2026-04-10' });

      // Act
      await service.setAttachedPlantings(ev.id, [p1.id, p2.id]);
      let attached = await service.getAttachments(ev.id);
      expect(attached.plantingIds.sort()).toEqual([p1.id, p2.id].sort());

      await service.setAttachedPlantings(ev.id, [p2.id]);
      attached = await service.getAttachments(ev.id);

      // Assert
      expect(attached.plantingIds).toEqual([p2.id]);
    });

    it('getTimeline returns locationIds and plantingIds arrays from the junction tables', async () => {
      // Arrange — second location, one planting, one event with two attachments each.
      db.insert(schema.growingLocation)
        .values({ householdId: 1, name: 'Polytunnel', areaM2: 6 })
        .run();
      const p = db
        .insert(schema.planting)
        .values({ cropId: 1, locationId: 1, plantedDate: '2026-04-01', areaM2: 0.5 })
        .returning()
        .all()[0]!;
      const ev = await service.create({
        householdId: 1,
        title: 'Multi-event',
        date: '2026-04-10',
      });
      await service.setAttachedLocations(ev.id, [1, 2]);
      await service.setAttachedPlantings(ev.id, [p.id]);

      // Act
      const timeline = await service.getTimeline(1);
      const item = timeline.find((t) => t.id === ev.id && t.type === 'event');

      // Assert
      expect(item).toBeDefined();
      expect(item!.locationIds.sort()).toEqual([1, 2]);
      expect(item!.plantingIds).toEqual([p.id]);
    });
  });
});
