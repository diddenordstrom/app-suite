import { eq, ne, isNotNull, and, isNull, inArray, sql } from 'drizzle-orm';
import { RRule } from '../rrule';
import type { DB } from '../db/index';
import {
  gardenEvent,
  gardenEventLocation,
  gardenEventPlanting,
  planting,
  growingLocation,
  crop,
  EVENT_TYPES,
} from '../db/schema';
import type { GardenEvent, NewGardenEvent, EventType } from '../db/schema';

const CHORE_TYPES = EVENT_TYPES.filter((t) => t !== 'general') as readonly Exclude<
  EventType,
  'general'
>[];

export type LastDoneByLocation = Record<Exclude<EventType, 'general'>, string | null>;

export interface TimelineItem {
  type: 'event' | 'harvest';
  id: number;
  date: string;
  title: string;
  completedAt: string | null;
  // Many-to-many attachments. Empty arrays when nothing is attached. For
  // harvest items, these mirror the underlying planting (so the caller doesn't
  // have to special-case the two timeline item types).
  locationIds: number[];
  plantingIds: number[];
  recurringDays: number | null;
  suggestionType: string | null;
  eventType: string | null;
  description: string | null;
  recurrenceRule: string | null;
}

export interface EventAttachments {
  locationIds: number[];
  plantingIds: number[];
}

function addDays(dateStr: string, days: number): string {
  const ms = new Date(dateStr).getTime() + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}

// Returns the next occurrence after `dateStr` for an RFC-5545 RRULE, formatted
// as YYYY-MM-DD. Returns null if the rule has no further occurrences. Anchors
// the rule at midnight UTC of the input date so all-day, timezone-free events
// behave deterministically across DST and locale boundaries.
function nextOccurrenceAfter(dateStr: string, rrule: string): string | null {
  const dtstart = new Date(`${dateStr}T00:00:00.000Z`);
  const rule = RRule.fromString(`DTSTART:${dateStr.replace(/-/g, '')}T000000Z\nRRULE:${rrule}`);
  const next = rule.after(dtstart, false);
  if (!next) return null;
  return next.toISOString().slice(0, 10);
}

export class GardenEventService {
  constructor(private readonly db: DB) {}

  async create(data: NewGardenEvent): Promise<GardenEvent> {
    const rows = this.db.insert(gardenEvent).values(data).returning().all();
    return rows[0]!;
  }

  async getAll(householdId: number): Promise<GardenEvent[]> {
    return this.db
      .select()
      .from(gardenEvent)
      .where(and(eq(gardenEvent.householdId, householdId), isNull(gardenEvent.status)));
  }

  async getSuggestions(householdId: number): Promise<GardenEvent[]> {
    return this.db
      .select()
      .from(gardenEvent)
      .where(and(eq(gardenEvent.householdId, householdId), eq(gardenEvent.status, 'suggestion')));
  }

  async getById(id: number): Promise<GardenEvent | null> {
    const rows = await this.db.select().from(gardenEvent).where(eq(gardenEvent.id, id));
    return rows[0] ?? null;
  }

  async update(id: number, data: Partial<NewGardenEvent>): Promise<GardenEvent | null> {
    const rows = this.db
      .update(gardenEvent)
      .set({ ...data, updatedAt: sql`(datetime('now'))` })
      .where(eq(gardenEvent.id, id))
      .returning()
      .all();
    return rows[0] ?? null;
  }

  async delete(id: number): Promise<boolean> {
    const rows = this.db.delete(gardenEvent).where(eq(gardenEvent.id, id)).returning().all();
    return rows.length > 0;
  }

  async getAttachments(eventId: number): Promise<EventAttachments> {
    const locRows = this.db
      .select({ locationId: gardenEventLocation.locationId })
      .from(gardenEventLocation)
      .where(eq(gardenEventLocation.eventId, eventId))
      .all();
    const plRows = this.db
      .select({ plantingId: gardenEventPlanting.plantingId })
      .from(gardenEventPlanting)
      .where(eq(gardenEventPlanting.eventId, eventId))
      .all();
    return {
      locationIds: locRows.map((r) => r.locationId),
      plantingIds: plRows.map((r) => r.plantingId),
    };
  }

  // Replace semantics: deletes all existing rows for the event, then inserts
  // the new set. Callers always pass the full desired state.
  async setAttachedLocations(eventId: number, locationIds: number[]): Promise<void> {
    this.db.delete(gardenEventLocation).where(eq(gardenEventLocation.eventId, eventId)).run();
    if (locationIds.length === 0) return;
    this.db
      .insert(gardenEventLocation)
      .values(locationIds.map((locationId) => ({ eventId, locationId })))
      .run();
  }

  async setAttachedPlantings(eventId: number, plantingIds: number[]): Promise<void> {
    this.db.delete(gardenEventPlanting).where(eq(gardenEventPlanting.eventId, eventId)).run();
    if (plantingIds.length === 0) return;
    this.db
      .insert(gardenEventPlanting)
      .values(plantingIds.map((plantingId) => ({ eventId, plantingId })))
      .run();
  }

  async accept(id: number): Promise<GardenEvent | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    // Transplant suggestions perform the seedling → planted transition in place:
    // the source seedling planting takes the suggested outdoor location and
    // date, and its status flips to 'planted'. Attachments live in junction tables.
    if (existing.suggestionType === 'transplant') {
      const attachments = await this.getAttachments(id);
      const targetLocationId = attachments.locationIds[0] ?? null;
      const seedlingPlantingId = attachments.plantingIds[0] ?? null;

      if (targetLocationId !== null && seedlingPlantingId !== null) {
        this.db
          .update(planting)
          .set({
            status: 'planted',
            locationId: targetLocationId,
            plantedDate: existing.date,
            updatedAt: sql`(datetime('now'))`,
          })
          .where(eq(planting.id, seedlingPlantingId))
          .run();

        // Derive a harden-off reminder 7 days before the transplant date.
        const cropRows = this.db
          .select({ name: crop.name })
          .from(crop)
          .where(eq(crop.id, existing.cropId ?? 0))
          .all();
        const cropName = cropRows[0]?.name ?? '';
        const hardenOffRows = this.db
          .insert(gardenEvent)
          .values({
            householdId: existing.householdId,
            title: cropName ? `Härda av ${cropName}` : 'Härda av plantor',
            date: addDays(existing.date, -7),
            cropId: existing.cropId ?? undefined,
            suggestionType: 'harden_off',
          })
          .returning()
          .all();
        if (hardenOffRows[0]) {
          await this.setAttachedLocations(hardenOffRows[0].id, [targetLocationId]);
          await this.setAttachedPlantings(hardenOffRows[0].id, [seedlingPlantingId]);
        }
      }
    }

    return this.update(id, { status: null });
  }

  async dismiss(id: number): Promise<GardenEvent | null> {
    const existing = await this.getById(id);
    if (!existing) return null;
    return this.update(id, { status: 'dismissed', dismissedAt: new Date().toISOString() });
  }

  async complete(id: number): Promise<GardenEvent | null> {
    const existing = await this.getById(id);
    if (!existing) return null;

    const rows = this.db
      .update(gardenEvent)
      .set({ completedAt: sql`(datetime('now'))`, updatedAt: sql`(datetime('now'))` })
      .where(eq(gardenEvent.id, id))
      .returning()
      .all();

    const updated = rows[0] ?? null;

    // Spawn the next occurrence: RRULE wins over the legacy recurringDays
    // counter when both are set, so users who upgrade old events by attaching
    // a richer RRULE see the new schedule take effect on the next completion.
    if (existing.recurrenceRule) {
      const nextDate = nextOccurrenceAfter(existing.date, existing.recurrenceRule);
      if (nextDate) {
        const next = await this.create({
          householdId: existing.householdId,
          title: existing.title,
          date: nextDate,
          eventType: existing.eventType,
          description: existing.description ?? undefined,
          recurrenceRule: existing.recurrenceRule,
        });
        const { locationIds, plantingIds } = await this.getAttachments(id);
        if (locationIds.length > 0) await this.setAttachedLocations(next.id, locationIds);
        if (plantingIds.length > 0) await this.setAttachedPlantings(next.id, plantingIds);
      }
    } else if (existing.recurringDays) {
      const next = await this.create({
        householdId: existing.householdId,
        title: existing.title,
        date: addDays(existing.date, existing.recurringDays),
        eventType: existing.eventType,
        description: existing.description ?? undefined,
        recurringDays: existing.recurringDays,
      });
      const { locationIds, plantingIds } = await this.getAttachments(id);
      if (locationIds.length > 0) await this.setAttachedLocations(next.id, locationIds);
      if (plantingIds.length > 0) await this.setAttachedPlantings(next.id, plantingIds);
    }

    return updated;
  }

  // For each chore type (everything except 'general'), returns the date of
  // the most recent COMPLETED event at this location, or null if none. Powers
  // the "Senast utförd" stat row on the location detail page so the user can
  // see at a glance whether a bed is overdue for watering / fertilizing / etc.
  async getLastDoneByLocation(locationId: number): Promise<LastDoneByLocation> {
    const rows = this.db
      .select({
        eventType: gardenEvent.eventType,
        date: gardenEvent.date,
      })
      .from(gardenEvent)
      .innerJoin(gardenEventLocation, eq(gardenEventLocation.eventId, gardenEvent.id))
      .where(
        and(
          eq(gardenEventLocation.locationId, locationId),
          isNotNull(gardenEvent.completedAt),
          isNull(gardenEvent.status),
        ),
      )
      .all();

    const result = Object.fromEntries(
      CHORE_TYPES.map((t) => [t, null as string | null]),
    ) as LastDoneByLocation;

    for (const row of rows) {
      const t = row.eventType as Exclude<EventType, 'general'>;
      if (!CHORE_TYPES.includes(t)) continue;
      const current = result[t];
      if (current === null || row.date > current) {
        result[t] = row.date;
      }
    }
    return result;
  }

  async getTimeline(householdId: number): Promise<TimelineItem[]> {
    const events = await this.getAll(householdId);

    // Batch-load attachments for all events at once.
    const eventIds = events.map((e) => e.id);
    const locByEvent = new Map<number, number[]>();
    const plByEvent = new Map<number, number[]>();
    if (eventIds.length > 0) {
      const locRows = this.db
        .select()
        .from(gardenEventLocation)
        .where(inArray(gardenEventLocation.eventId, eventIds))
        .all();
      for (const r of locRows) {
        const arr = locByEvent.get(r.eventId) ?? [];
        arr.push(r.locationId);
        locByEvent.set(r.eventId, arr);
      }
      const plRows = this.db
        .select()
        .from(gardenEventPlanting)
        .where(inArray(gardenEventPlanting.eventId, eventIds))
        .all();
      for (const r of plRows) {
        const arr = plByEvent.get(r.eventId) ?? [];
        arr.push(r.plantingId);
        plByEvent.set(r.eventId, arr);
      }
    }

    const eventItems: TimelineItem[] = events.map((e) => ({
      type: 'event',
      id: e.id,
      date: e.date,
      title: e.title,
      completedAt: e.completedAt ?? null,
      locationIds: locByEvent.get(e.id) ?? [],
      plantingIds: plByEvent.get(e.id) ?? [],
      recurringDays: e.recurringDays ?? null,
      suggestionType: e.suggestionType ?? null,
      eventType: e.eventType,
      description: e.description ?? null,
      recurrenceRule: e.recurrenceRule ?? null,
    }));

    const harvestRows = this.db
      .select({
        id: planting.id,
        date: planting.expectedHarvestDate,
        locationId: planting.locationId,
        cropName: crop.name,
      })
      .from(planting)
      .innerJoin(growingLocation, eq(planting.locationId, growingLocation.id))
      .innerJoin(crop, eq(planting.cropId, crop.id))
      .where(
        and(
          eq(growingLocation.householdId, householdId),
          ne(planting.status, 'harvested'),
          isNotNull(planting.expectedHarvestDate),
        ),
      )
      .all();

    const harvestItems: TimelineItem[] = harvestRows.map((r) => ({
      type: 'harvest',
      id: r.id,
      date: r.date!,
      title: r.cropName,
      completedAt: null,
      locationIds: [r.locationId],
      plantingIds: [r.id],
      recurringDays: null,
      suggestionType: null,
      eventType: null,
      description: null,
      recurrenceRule: null,
    }));

    return [...eventItems, ...harvestItems].sort((a, b) => a.date.localeCompare(b.date));
  }
}
