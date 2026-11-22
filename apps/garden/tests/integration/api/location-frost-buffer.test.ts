// @vitest-environment node
/**
 * Integration tests: frostBufferC round-trips through POST and PUT.
 * Phase 3 — Smart frost gate UI layer.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocationService } from '../../../src/server/services/location.service';
import { createTestDb } from '../../../src/server/test-utils/create-test-db';
import * as schema from '../../../src/server/db/schema';

describe('Location frostBufferC round-trip', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: LocationService;

  beforeEach(() => {
    db = createTestDb();
    db.insert(schema.household).values({ name: 'Test Family', persons: 4 }).run();
    service = new LocationService(db);
  });

  describe('POST — create with frostBufferC', () => {
    it('defaults frostBufferC to 0 when not provided', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Öppen bädd',
        areaM2: 4.0,
      });

      // Assert
      expect(result.frostBufferC).toBe(0);
    });

    it('persists frostBufferC = 1 (row cover)', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Fiberduksbädd',
        areaM2: 4.0,
        frostBufferC: 1,
      });

      // Assert
      expect(result.frostBufferC).toBe(1);
    });

    it('persists frostBufferC = 2 (cold frame)', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Drivbänk',
        areaM2: 3.0,
        frostBufferC: 2,
      });

      // Assert
      expect(result.frostBufferC).toBe(2);
    });

    it('persists frostBufferC = 3 (polytunnel)', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Polytunnel',
        areaM2: 8.0,
        frostBufferC: 3,
      });

      // Assert
      expect(result.frostBufferC).toBe(3);
    });

    it('persists frostBufferC = 5 (unheated greenhouse)', async () => {
      // Arrange & Act
      const result = await service.create({
        householdId: 1,
        name: 'Växthus',
        areaM2: 12.0,
        frostBufferC: 5,
      });

      // Assert
      expect(result.frostBufferC).toBe(5);
    });
  });

  describe('PUT — update frostBufferC', () => {
    it('updates frostBufferC from 0 to 3', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Bädd',
        areaM2: 4.0,
        frostBufferC: 0,
      });

      // Act
      const updated = await service.update(created.id, { frostBufferC: 3 });

      // Assert
      expect(updated!.frostBufferC).toBe(3);
    });

    it('updates frostBufferC back to 0 (open ground)', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Polytunnel',
        areaM2: 4.0,
        frostBufferC: 3,
      });

      // Act
      const updated = await service.update(created.id, { frostBufferC: 0 });

      // Assert
      expect(updated!.frostBufferC).toBe(0);
    });

    it('preserves frostBufferC when updating other fields', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Drivbänk',
        areaM2: 4.0,
        frostBufferC: 2,
      });

      // Act — update name only
      const updated = await service.update(created.id, { name: 'Ny drivbänk' });

      // Assert — frostBufferC is unchanged
      expect(updated!.frostBufferC).toBe(2);
      expect(updated!.name).toBe('Ny drivbänk');
    });

    it('getById returns the persisted frostBufferC', async () => {
      // Arrange
      const created = await service.create({
        householdId: 1,
        name: 'Polytunnel',
        areaM2: 6.0,
        frostBufferC: 3,
      });

      // Act
      const found = await service.getById(created.id);

      // Assert
      expect(found!.frostBufferC).toBe(3);
    });
  });
});
