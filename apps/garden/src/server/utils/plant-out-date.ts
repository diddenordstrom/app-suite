import { getLastFrostDate } from './growing-zones';

/**
 * Calculates the recommended plant-out date.
 * Returns the later of: (sowDate + weeksToTransplant) vs lastFrostDate for the zone.
 *
 * @param sowDate - Date when seeds were started indoors
 * @param weeksToTransplant - Weeks from sow to transplant-ready
 * @param zone - Odlingszon 1-8
 * @param year - The year (used to get zone frost dates)
 */
export function calculatePlantOutDate(
  sowDate: Date,
  weeksToTransplant: number,
  zone: number,
  year: number,
): Date {
  const readyDate = new Date(sowDate);
  readyDate.setDate(readyDate.getDate() + weeksToTransplant * 7);

  const lastFrost = getLastFrostDate(zone, year);

  return readyDate > lastFrost ? readyDate : lastFrost;
}
