import { describe, it, expect, beforeEach } from 'vitest';
import { CompanionService } from './companion.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

describe('CompanionService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: CompanionService;

  let tomatId: number;
  let basilikaId: number;
  let morotId: number;
  let potatisId: number;

  beforeEach(() => {
    db = createTestDb();
    service = new CompanionService(db);

    const seed = (name: string): number => {
      const rows = db
        .insert(schema.crop)
        .values({
          name,
          yieldKgPerM2: 1,
          kcalPerKg: 100,
          proteinGPerKg: 1,
          carbsGPerKg: 1,
          fatGPerKg: 1,
          category: 'vegetable',
        })
        .returning()
        .all();
      return rows[0]!.id;
    };
    tomatId = seed('Tomat');
    basilikaId = seed('Basilika');
    morotId = seed('Morot');
    potatisId = seed('Potatis');
  });

  describe('upsert()', () => {
    it('stores a pair with mandatory fields', async () => {
      // Act
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/source',
      });

      // Assert
      const rows = await db.select().from(schema.companionPlanting);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.source).toBe('https://example.com/source');
    });

    it('normalises pair order so (a,b) and (b,a) collapse to one row', async () => {
      // Act
      await service.upsert({
        cropAId: basilikaId, // intentionally non-canonical order
        cropBId: tomatId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/a',
      });
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/b',
      });

      // Assert — only one row, stored with smaller id first
      const rows = await db.select().from(schema.companionPlanting);
      expect(rows).toHaveLength(1);
      const [a, b] = [tomatId, basilikaId].sort((x, y) => x - y);
      expect(rows[0]!.cropAId).toBe(a);
      expect(rows[0]!.cropBId).toBe(b);
    });

    it('rejects self-pairing', async () => {
      await expect(
        service.upsert({
          cropAId: tomatId,
          cropBId: tomatId,
          relationship: 'good',
          evidenceLevel: 'strong',
          source: 'https://example.com',
        }),
      ).rejects.toThrow();
    });
  });

  describe('listForCrop()', () => {
    it('returns an empty result when the crop has no companions', async () => {
      const result = await service.listForCrop(tomatId);
      expect(result.good).toEqual([]);
      expect(result.bad).toEqual([]);
    });

    it('returns the partner crop name regardless of pair-order direction', async () => {
      // Arrange — basilikaId may be < or > tomatId; either side is valid
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com',
      });

      // Act — query from both sides of the pair
      const fromTomat = await service.listForCrop(tomatId);
      const fromBasilika = await service.listForCrop(basilikaId);

      // Assert
      expect(fromTomat.good).toHaveLength(1);
      expect(fromTomat.good[0]!.otherCropName).toBe('Basilika');
      expect(fromBasilika.good).toHaveLength(1);
      expect(fromBasilika.good[0]!.otherCropName).toBe('Tomat');
    });

    it('separates good and bad relationships', async () => {
      // Arrange
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/good',
      });
      await service.upsert({
        cropAId: tomatId,
        cropBId: potatisId,
        relationship: 'bad',
        evidenceLevel: 'strong',
        source: 'https://example.com/bad',
        note: 'Shares blight susceptibility',
      });

      // Act
      const result = await service.listForCrop(tomatId);

      // Assert
      expect(result.good).toHaveLength(1);
      expect(result.good[0]!.otherCropName).toBe('Basilika');
      expect(result.bad).toHaveLength(1);
      expect(result.bad[0]!.otherCropName).toBe('Potatis');
      expect(result.bad[0]!.note).toBe('Shares blight susceptibility');
    });

    it('sorts entries alphabetically by other-crop name', async () => {
      // Arrange — insert in non-alphabetical order
      await service.upsert({
        cropAId: tomatId,
        cropBId: morotId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/1',
      });
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com/2',
      });

      // Act
      const result = await service.listForCrop(tomatId);

      // Assert
      expect(result.good.map((e) => e.otherCropName)).toEqual(['Basilika', 'Morot']);
    });

    it('does not leak companions from unrelated crops', async () => {
      // Arrange — basilika ↔ morot (unrelated to tomat)
      await service.upsert({
        cropAId: basilikaId,
        cropBId: morotId,
        relationship: 'good',
        evidenceLevel: 'strong',
        source: 'https://example.com',
      });

      // Act
      const fromTomat = await service.listForCrop(tomatId);

      // Assert
      expect(fromTomat.good).toEqual([]);
    });

    it('preserves source and evidenceLevel on every returned entry', async () => {
      // Arrange
      await service.upsert({
        cropAId: tomatId,
        cropBId: basilikaId,
        relationship: 'good',
        evidenceLevel: 'traditional',
        source: 'https://rhs.org.uk/companion',
      });

      // Act
      const result = await service.listForCrop(tomatId);

      // Assert
      expect(result.good[0]!.source).toBe('https://rhs.org.uk/companion');
      expect(result.good[0]!.evidenceLevel).toBe('traditional');
    });
  });
});
