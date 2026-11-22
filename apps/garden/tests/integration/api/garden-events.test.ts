// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { GardenEventService } from '../../../src/server/services/gardenEvent.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Garden Events API (integration)', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: GardenEventService;

  beforeEach(() => {
    db = createTestDb();
    // Seed prerequisites
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
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
    db.insert(schema.growingLocation)
      .values({ householdId: 1, name: 'Köksträdgård', areaM2: 12.5 })
      .run();
    service = new GardenEventService(db);
  });

  // ---------------------------------------------------------------------------
  // Create then getAll
  // ---------------------------------------------------------------------------

  describe('create → getAll', () => {
    it('created event appears in getAll result', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-10',
      });

      // Act
      const all = await service.getAll(1);

      // Assert
      expect(all).toHaveLength(1);
      expect(all[0]?.id).toBe(created.id);
      expect(all[0]?.title).toBe('Vattna');
    });
  });

  // ---------------------------------------------------------------------------
  // Create then getById
  // ---------------------------------------------------------------------------

  describe('create → getById', () => {
    it('getById returns the created event', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Gödsla',
        date: '2026-04-12',
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.title).toBe('Gödsla');
      expect(found?.date).toBe('2026-04-12');
    });
  });

  // ---------------------------------------------------------------------------
  // Create then update then getById
  // ---------------------------------------------------------------------------

  describe('create → update → getById', () => {
    it('getById shows updated fields after update', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Ursprunglig',
        date: '2026-04-10',
      });

      // Act
      await service.update(created.id, { title: 'Uppdaterad', date: '2026-04-20' });
      const found = await service.getById(created.id);

      // Assert
      expect(found?.title).toBe('Uppdaterad');
      expect(found?.date).toBe('2026-04-20');
    });
  });

  // ---------------------------------------------------------------------------
  // Create then delete then getById
  // ---------------------------------------------------------------------------

  describe('create → delete → getById', () => {
    it('getById returns null after delete', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Tillfällig',
        date: '2026-04-10',
      });

      // Act
      await service.delete(created.id);
      const found = await service.getById(created.id);

      // Assert
      expect(found).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // Complete recurring event — creates next occurrence
  // ---------------------------------------------------------------------------

  describe('create recurring → complete → getAll', () => {
    it('shows 2 events: original (completed) + new occurrence', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Vattna',
        date: '2026-04-01',
        recurringDays: 7,
      });

      // Act
      await service.complete(created.id);
      const all = await service.getAll(1);

      // Assert
      expect(all).toHaveLength(2);

      const original = all.find((e) => e.id === created.id);
      const next = all.find((e) => e.id !== created.id);

      expect(original?.completedAt).not.toBeNull();
      expect(next?.completedAt).toBeNull();
      expect(next?.date).toBe('2026-04-08');
      expect(next?.title).toBe('Vattna');
      expect(next?.recurringDays).toBe(7);
    });
  });

  // ---------------------------------------------------------------------------
  // getTimeline — mixed gardenEvents and active plantings
  // ---------------------------------------------------------------------------

  describe('getTimeline', () => {
    it('returns unified sorted list of events and harvest dates', async () => {
      // Arrange — one event and one planting with harvest date
      await service.create({ householdId: 1, title: 'Gödsla', date: '2026-05-15' });

      db.insert(schema.planting)
        .values({
          cropId: 1,
          locationId: 1,
          plantedDate: '2026-04-01',
          expectedHarvestDate: '2026-04-30',
          areaM2: 2.0,
          status: 'planted',
        })
        .run();

      // Act
      const timeline = await service.getTimeline(1);

      // Assert — harvest (2026-04-30) before event (2026-05-15)
      expect(timeline).toHaveLength(2);
      expect(timeline[0]?.date).toBe('2026-04-30');
      expect(timeline[0]?.type).toBe('harvest');
      expect(timeline[1]?.date).toBe('2026-05-15');
      expect(timeline[1]?.type).toBe('event');
    });
  });

  // ---------------------------------------------------------------------------
  // Status field support
  // ---------------------------------------------------------------------------

  describe('status field support', () => {
    it('creates an event with status: suggestion and returns it with that status', async () => {
      // Arrange + Act
      const created = await service.create({
        householdId: 1,
        title: 'Starta tomater',
        date: '2026-04-10',
        status: 'suggestion',
      });

      // Assert
      expect(created.status).toBe('suggestion');
      const found = await service.getById(created.id);
      expect(found?.status).toBe('suggestion');
    });

    it('getAll excludes suggestions — use getSuggestions for those', async () => {
      // Arrange
      await service.create({ householdId: 1, title: 'Normal event', date: '2026-04-10' });
      await service.create({
        householdId: 1,
        title: 'Suggestion',
        date: '2026-04-11',
        status: 'suggestion',
      });

      // Act
      const all = await service.getAll(1);
      const suggestions = await service.getSuggestions(1);

      // Assert — getAll only returns status=null events; suggestions are separate
      expect(all).toHaveLength(1);
      expect(all[0]?.title).toBe('Normal event');
      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]?.status).toBe('suggestion');
    });

    it('accept sets status to null', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Starta tomater',
        date: '2026-04-10',
        status: 'suggestion',
      });

      // Act
      const accepted = await service.accept(created.id);

      // Assert
      expect(accepted?.status).toBeNull();
    });

    it('accept returns null for unknown id', async () => {
      // Act
      const result = await service.accept(99999);

      // Assert
      expect(result).toBeNull();
    });

    it('dismiss sets status to dismissed', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        title: 'Starta tomater',
        date: '2026-04-10',
        status: 'suggestion',
      });

      // Act
      const dismissed = await service.dismiss(created.id);

      // Assert
      expect(dismissed?.status).toBe('dismissed');
    });

    it('dismiss returns null for unknown id', async () => {
      // Act
      const result = await service.dismiss(99999);

      // Assert
      expect(result).toBeNull();
    });
  });
});
