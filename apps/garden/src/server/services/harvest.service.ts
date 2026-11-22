import type { Planting, StorageItem } from '../db/schema';
import type { PlantingService } from './planting.service';
import type { StorageService } from './storage.service';
import type { HarvestEventService } from './harvest-event.service';

export type HarvestResult =
  { planting: Planting; storageItem: StorageItem | null } | { error: 'already_harvested' } | null;

export class HarvestService {
  constructor(
    private readonly plantingService: PlantingService,
    private readonly storageService: StorageService,
    private readonly harvestEventService: HarvestEventService,
  ) {}

  async harvest(
    plantingId: number,
    householdId: number,
    quantityKg: number,
    harvestedDate: string,
    isFinalHarvest: boolean,
    addToStorage: boolean,
  ): Promise<HarvestResult> {
    const planting = await this.plantingService.getById(plantingId);

    if (planting === null) {
      return null;
    }

    if (planting.status === 'harvested') {
      return { error: 'already_harvested' };
    }

    const newStatus = isFinalHarvest ? 'harvested' : planting.status;
    const updatedPlanting = await this.plantingService.update(plantingId, {
      status: newStatus,
    });

    const createdItem = addToStorage
      ? await this.storageService.create({
          cropId: planting.cropId,
          plantingId,
          householdId,
          quantityKg,
          harvestedDate,
        })
      : null;

    await this.harvestEventService.create(plantingId, quantityKg, harvestedDate, addToStorage);

    return {
      planting: updatedPlanting!,
      storageItem: createdItem,
    };
  }
}
