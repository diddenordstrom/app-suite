/**
 * Swedish tax rules the simulation needs, in one place and labelled with the tax year.
 * Sources: Skatteverket "Belopp och procent – inkomstår 2026" and "Teknisk beskrivning för
 * skatteberäkning 2026" (SKV 433, utgåva 36), sections 6.1–6.2 (grundavdrag) and 7.5.2
 * (jobbskatteavdrag). Checked 2026-11-09.
 *
 * All amounts are in 2026 kronor. The simulation runs in nominal kronor and indexes every
 * threshold with inflation: tax(x) in year t = defl · taxReal(x / defl).
 */

export const TAX_YEAR = 2026;

export const RULES_2026 = {
  /** Prisbasbelopp. */
  pbb: 59_200,
  /** Skiktgräns for state income tax, on taxable earned income (after grundavdrag). */
  stateThreshold: 643_000,
  stateRate: 0.2,
  /** Skattereduktion för förvärvsinkomst: 0.75 % of taxable income above 40 000, at most 1 500. */
  earnedReduction: { from: 40_000, to: 240_000, rate: 0.0075 },
  /** Public service-avgift: 1 % of taxable income, at most 1 184 kr. */
  publicService: { rate: 0.01, max: 1_184 },
  /** ISK: schablonintäkt = statslåneränta + 1 pp, at least 1.25 %, taxed at 30 %. */
  isk: { spread: 1, floor: 1.25, rate: 0.3 },
  /** Higher grundavdrag and no ordinary jobbskatteavdrag from the year one has turned 66 at its start. */
  seniorAge: 66,
  /**
   * Earliest age for drawing the public pension: riktåldern (67 for 2026–2030) minus three.
   * It follows the riktålder upwards for later cohorts; the app uses today's value as the floor.
   */
  earliestPublicPension: 64,
} as const;

/** The parameters a user can change; defaults are today's values. */
export interface TaxParams {
  /** Kommunal skattesats in percent (municipal + regional, without church and burial fees). */
  municipalRate: number;
  /** Statslåneränta the 30th of November the year before, in percent (sets the ISK tax). */
  govRate: number;
  /** ISK tax-free allowance per person, kronor. */
  iskAllowance: number;
}

export const DEFAULT_TAX: TaxParams = {
  municipalRate: 32.38, // national average 2026
  govRate: 2.55, // 2025-11-30, for inkomstår 2026
  iskAllowance: 300_000,
};

const R = RULES_2026;
const ceil100 = (x: number) => Math.ceil(x / 100) * 100;
const floor100 = (x: number) => Math.floor(x / 100) * 100;

/** Ordinary grundavdrag, unrounded, as a function of fastställd förvärvsinkomst. */
function baseAllowance(ffi: number): number {
  const p = R.pbb;
  if (ffi <= 0.99 * p) return 0.423 * p;
  if (ffi <= 2.72 * p) return 0.423 * p + 0.2 * (ffi - 0.99 * p);
  if (ffi <= 3.11 * p) return 0.77 * p;
  if (ffi <= 7.88 * p) return 0.77 * p - 0.1 * (ffi - 3.11 * p);
  return 0.293 * p;
}

/** The extra (förhöjt) part of grundavdraget from 66, unrounded. */
function seniorExtra(ffi: number): number {
  const p = R.pbb;
  if (ffi <= 0.91 * p) return 0.687 * p;
  if (ffi <= 1.11 * p) return 0.885 * p - 0.2 * ffi;
  if (ffi <= 1.965 * p) return 0.6 * p + 0.057 * ffi;
  if (ffi <= 2.72 * p) return 0.333 * p + 0.1949 * ffi;
  if (ffi <= 3.11 * p) return 0.3949 * ffi - 0.212 * p;
  if (ffi <= 3.24 * p) return 0.4949 * ffi - 0.523 * p;
  if (ffi <= 5 * p) return 0.356 * ffi - 0.073 * p;
  if (ffi <= 7.88 * p) return 0.017 * p + 0.338 * ffi;
  if (ffi <= 8.08 * p) return 0.703 * p + 0.251 * ffi;
  if (ffi <= 11.16 * p) return 2.732 * p;
  if (ffi <= 12.84 * p) return 9.651 * p - 0.62 * ffi;
  return 1.691 * p;
}

/** Grundavdrag (with the higher allowance from 66), rounded up to whole hundreds and never above the income. */
export function grundavdrag(ffi: number, age: number): number {
  if (ffi <= 0) return 0;
  const raw = baseAllowance(ffi) + (age >= R.seniorAge ? seniorExtra(ffi) : 0);
  return Math.min(ceil100(raw), ffi);
}

/** Jobbskatteavdrag for someone under 66; kr is the municipal rate as a fraction. */
export function jobbskatteavdrag(work: number, ga: number, kr: number): number {
  const p = R.pbb;
  const ai = floor100(work);
  if (ai <= 0) return 0;
  let base: number;
  if (ai <= 0.91 * p) base = ai;
  else if (ai <= 3.24 * p) base = 0.91 * p + 0.3874 * (ai - 0.91 * p);
  else if (ai <= 8.08 * p) base = 1.813 * p + 0.251 * (ai - 3.24 * p);
  else base = 3.027 * p;
  return Math.max(0, Math.floor((base - ga) * kr));
}

export interface TaxBreakdown {
  total: number;
  municipal: number;
  state: number;
  jobDeduction: number;
}

/**
 * Yearly income tax in 2026 kronor on earned income: `work` (salary) and `pension`
 * (public, occupational and private pension payouts). `age` is the age at the start of the year.
 */
export function incomeTaxReal(work: number, pension: number, age: number, p: TaxParams): TaxBreakdown {
  const ffi = floor100(Math.max(0, work) + Math.max(0, pension));
  if (ffi <= 0) return { total: 0, municipal: 0, state: 0, jobDeduction: 0 };
  const kr = p.municipalRate / 100;
  const ga = grundavdrag(ffi, age);
  const bfi = floor100(ffi - ga);
  const municipalGross = bfi * kr;
  const state = Math.max(0, bfi - R.stateThreshold) * R.stateRate;
  const jobDeduction = age < R.seniorAge && work > 0 ? Math.min(jobbskatteavdrag(work, ga, kr), municipalGross) : 0;
  const er = R.earnedReduction;
  const earned = Math.min(Math.max(0, (Math.min(bfi, er.to) - er.from) * er.rate), municipalGross - jobDeduction);
  const municipal = municipalGross - jobDeduction - earned;
  const ps = Math.min(bfi * R.publicService.rate, R.publicService.max);
  return { total: municipal + state + ps, municipal, state, jobDeduction };
}

/** Same as incomeTaxReal().total, for nominal amounts in a year whose price level is `defl` times today's. */
export function incomeTax(work: number, pension: number, age: number, p: TaxParams, defl: number): number {
  return incomeTaxReal(work / defl, pension / defl, age, p).total * defl;
}

/** Net monthly salary today, for the savings consistency check. */
export function netMonthlySalary(yearly: number, age: number, p: TaxParams): number {
  return (yearly - incomeTaxReal(yearly, 0, age, p).total) / 12;
}

/** Effective ISK tax rate on the capital base above the allowance (fraction). */
export function iskRate(p: TaxParams): number {
  return (Math.max(p.govRate + R.isk.spread, R.isk.floor) / 100) * R.isk.rate;
}

/** Yearly ISK tax on a capital base (average of the quarter values), allowance indexed by `defl`. */
export function iskTax(base: number, p: TaxParams, defl = 1): number {
  return Math.max(0, base - p.iskAllowance * defl) * iskRate(p);
}
