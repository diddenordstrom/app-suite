import { describe, it, expect, beforeEach } from 'vitest';
import { CropService } from './crop.service';
import { createTestDb } from '../test-utils/create-test-db';
import * as schema from '../db/schema';

const testCrops: schema.NewCrop[] = [
  {
    name: 'Potatis',
    yieldKgPerM2: 4.5,
    kcalPerKg: 770,
    proteinGPerKg: 20,
    carbsGPerKg: 170,
    fatGPerKg: 1,
    category: 'root',
  },
  {
    name: 'Morötter',
    yieldKgPerM2: 3.5,
    kcalPerKg: 410,
    proteinGPerKg: 9,
    carbsGPerKg: 96,
    fatGPerKg: 2,
    category: 'root',
  },
  {
    name: 'Ärtor',
    yieldKgPerM2: 0.8,
    kcalPerKg: 810,
    proteinGPerKg: 55,
    carbsGPerKg: 140,
    fatGPerKg: 4,
    category: 'legume',
  },
  {
    name: 'Tomat',
    yieldKgPerM2: 8.0,
    kcalPerKg: 180,
    proteinGPerKg: 9,
    carbsGPerKg: 39,
    fatGPerKg: 2,
    category: 'fruit',
  },
];

describe('CropService', () => {
  let db: ReturnType<typeof createTestDb>;
  let service: CropService;

  beforeEach(() => {
    db = createTestDb();
    service = new CropService(db);
    db.insert(schema.crop).values(testCrops).run();
  });

  describe('getAllCrops()', () => {
    it('returns all crops', async () => {
      const crops = await service.getAllCrops();
      expect(crops).toHaveLength(4);
    });

    it('returns crops with correct shape', async () => {
      const crops = await service.getAllCrops();
      const potato = crops.find((c) => c.name === 'Potatis');
      expect(potato).toBeDefined();
      expect(potato?.yieldKgPerM2).toBe(4.5);
      expect(potato?.category).toBe('root');
    });

    it('returns an empty array when no crops exist', async () => {
      const emptyDb = createTestDb();
      const emptyService = new CropService(emptyDb);
      const crops = await emptyService.getAllCrops();
      expect(crops).toHaveLength(0);
    });
  });

  describe('getCropById()', () => {
    it('returns the crop for a valid id', async () => {
      const all = await service.getAllCrops();
      const id = all[0]!.id;
      const crop = await service.getCropById(id);
      expect(crop).not.toBeNull();
      expect(crop?.id).toBe(id);
    });

    it('returns null for an unknown id', async () => {
      const crop = await service.getCropById(99999);
      expect(crop).toBeNull();
    });

    it('returns the correct crop by id', async () => {
      const all = await service.getAllCrops();
      const carrot = all.find((c) => c.name === 'Morötter');
      expect(carrot).toBeDefined();
      const found = await service.getCropById(carrot!.id);
      expect(found?.name).toBe('Morötter');
      expect(found?.category).toBe('root');
    });
  });

  describe('getCropsByCategory()', () => {
    it('returns only crops in the given category', async () => {
      const roots = await service.getCropsByCategory('root');
      expect(roots).toHaveLength(2);
      roots.forEach((c) => expect(c.category).toBe('root'));
    });

    it('returns crops across a different category', async () => {
      const legumes = await service.getCropsByCategory('legume');
      expect(legumes).toHaveLength(1);
      expect(legumes[0]!.name).toBe('Ärtor');
    });

    it('returns an empty array for an unknown category', async () => {
      const result = await service.getCropsByCategory('grain');
      expect(result).toHaveLength(0);
    });
  });
});
