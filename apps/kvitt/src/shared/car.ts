/**
 * Car costs (bilutgift): a small calculator in the expense form that turns a drive into an amount.
 * Pure and tested; amounts in minor units, distances in Swedish mil (10 km). See docs/decisions/kvitt-plånbok-och-bil.md.
 */

export type CarMode = "fuel" | "rate";

/** Stored on an expense (`expenses.car`, JSON) so the calculation can be reopened and edited. */
export interface CarCalc {
  mode: CarMode;
  /** One way, in mil. */
  distanceMil: number;
  /** Doubles the distance. */
  roundTrip: boolean;
  /** Fuel mode: litres per mil and price per litre (kr). */
  consumption: number | null;
  fuelPrice: number | null;
  /** Rate mode: kr per mil (milersättning). */
  rate: number | null;
  /** Expenses already logged for this drive (e.g. a tankning on the way) that are subtracted from the cost. */
  deductIds: number[];
  /** Their combined amount (minor units) at the time of saving. */
  deducted: number;
}

export const CAR_LIMITS = { distanceMil: 10000, consumption: 10, fuelPrice: 1000, rate: 1000 } as const;

/** Parse "0,65", "19.50" or "1 234" into a number; null if empty or invalid. */
export function parseDecimal(input: string): number | null {
  const s = input.replace(/[\s\u00a0]/g, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

/** Total distance in mil. */
export const carDistance = (c: Pick<CarCalc, "distanceMil" | "roundTrip">): number => c.distanceMil * (c.roundTrip ? 2 : 1);

/** Cost of the drive before deductions, in minor units rounded to whole kronor (nobody swishes öre), or null if a needed value is missing. */
export function carGross(c: Pick<CarCalc, "mode" | "distanceMil" | "roundTrip" | "consumption" | "fuelPrice" | "rate">): number | null {
  if (!(c.distanceMil > 0)) return null;
  const mil = carDistance(c);
  if (c.mode === "rate") return c.rate && c.rate > 0 ? Math.round(mil * c.rate) * 100 : null;
  if (!c.consumption || c.consumption <= 0 || !c.fuelPrice || c.fuelPrice <= 0) return null;
  return Math.round(mil * c.consumption * c.fuelPrice) * 100;
}

/** The amount to log: the gross cost minus what was already logged for the drive, never below zero. */
export function carTotal(c: CarCalc): number | null {
  const gross = carGross(c);
  return gross === null ? null : Math.max(0, gross - c.deducted);
}

/**
 * Titles that look like a tankning or a charge, offered (never applied silently) as deductions.
 * Kvitt's categories are five fixed slots with no fuel slot, so a title match is the cheapest signal.
 */
const FUEL_WORDS = /tank|bensin|diesel|soppa|br[äa]nsle|\bfuel\b|\bpetrol\b|\bgas\b|laddning|\bladda|charg/i;
export const looksLikeFuel = (title: string): boolean => FUEL_WORDS.test(title);
