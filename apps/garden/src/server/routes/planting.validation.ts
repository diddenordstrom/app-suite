import { ApiError } from '../http';
export const VALID_STATUSES = ['seedling', 'planted', 'growing', 'harvested'] as const;
export type PlantingStatus = (typeof VALID_STATUSES)[number];

export function isValidStatus(value: unknown): value is PlantingStatus {
  return VALID_STATUSES.includes(value as PlantingStatus);
}

export function assertValidStatus(value: unknown): PlantingStatus {
  if (!isValidStatus(value)) {
    throw new ApiError(400, `status must be one of: ${VALID_STATUSES.join(', ')}`);
  }
  return value;
}

export function assertPositiveInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) <= 0) {
    throw new ApiError(400, `${field} must be a positive integer`);
  }
  return value as number;
}
