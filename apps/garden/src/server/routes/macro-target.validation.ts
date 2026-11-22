import { ApiError } from '../http';
import type { NewMacroTarget } from '../db/schema';

type MacroTargetBody = Record<string, unknown>;

function validateHouseholdId(body: MacroTargetBody): void {
  if (!Number.isInteger(body.householdId) || (body.householdId as number) <= 0) {
    throw new ApiError(400, 'householdId must be a positive integer');
  }
}

function validateName(body: MacroTargetBody): void {
  if (!body.name || typeof body.name !== 'string') {
    throw new ApiError(400, 'name is required');
  }
}

function validateMacros(body: MacroTargetBody): void {
  if (typeof body.dailyKcal !== 'number' || body.dailyKcal <= 0) {
    throw new ApiError(400, 'dailyKcal must be a positive number');
  }
  if (typeof body.dailyProteinG !== 'number' || body.dailyProteinG < 0) {
    throw new ApiError(400, 'dailyProteinG must be a non-negative number');
  }
  if (typeof body.dailyCarbsG !== 'number' || body.dailyCarbsG < 0) {
    throw new ApiError(400, 'dailyCarbsG must be a non-negative number');
  }
  if (typeof body.dailyFatG !== 'number' || body.dailyFatG < 0) {
    throw new ApiError(400, 'dailyFatG must be a non-negative number');
  }
}

export function validateCreateBody(body: MacroTargetBody): void {
  validateHouseholdId(body);
  validateName(body);
  validateMacros(body);
}

export function buildCreateData(body: MacroTargetBody): NewMacroTarget {
  return {
    householdId: body.householdId as number,
    name: body.name as string,
    dailyKcal: body.dailyKcal as number,
    dailyProteinG: body.dailyProteinG as number,
    dailyCarbsG: body.dailyCarbsG as number,
    dailyFatG: body.dailyFatG as number,
    ...(typeof body.active === 'boolean' && { active: body.active }),
  };
}

function pickNumericField<K extends string>(
  body: MacroTargetBody,
  key: K,
  min: number,
): Partial<Record<K, number>> {
  const val = body[key];
  return typeof val === 'number' && val >= min
    ? ({ [key]: val } as Partial<Record<K, number>>)
    : {};
}

export function buildUpdateData(body: MacroTargetBody): Partial<NewMacroTarget> {
  return {
    ...(typeof body.name === 'string' && { name: body.name }),
    ...pickNumericField(body, 'dailyKcal', 1),
    ...pickNumericField(body, 'dailyProteinG', 0),
    ...pickNumericField(body, 'dailyCarbsG', 0),
    ...pickNumericField(body, 'dailyFatG', 0),
    ...(typeof body.active === 'boolean' && { active: body.active }),
  };
}
