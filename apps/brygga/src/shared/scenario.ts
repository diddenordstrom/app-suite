/**
 * The scenario a visitor edits and the browser stores: one versioned object, single or duo.
 * Both people are always kept, so switching to single and back loses nothing.
 */
import type { Assumptions, Household, Model, Person } from "./engine";
import { monthlyPayment } from "./engine";
import { DEFAULT_TAX, RULES_2026, netMonthlySalary, type TaxParams } from "./tax";

export type Mode = "single" | "duo";

export interface Scenario {
  v: 1;
  mode: Mode;
  people: [Person, Person];
  household: Household;
  assumptions: Assumptions;
  tax: TaxParams;
}

export const SCENARIO_VERSION = 1;

/** Draft 4's example person. */
const YOU: Person = {
  age: 35, retAge: 60, salary: 600000, salaryGrowth: 3, allmStart: 65, tjStart: 65,
  stocks: 500000, stockSave: 5000, priv: 200000, privSave: 1000, tjanst: 300000, allm: 400000,
};

const PARTNER: Person = {
  age: 33, retAge: 60, salary: 480000, salaryGrowth: 3, allmStart: 65, tjStart: 65,
  stocks: 300000, stockSave: 3000, priv: 0, privSave: 0, tjanst: 200000, allm: 300000,
};

export function defaultScenario(): Scenario {
  return {
    v: 1,
    mode: "single",
    people: [{ ...YOU }, { ...PARTNER }],
    household: { house: 3000000, loan: 2000000, loanRate: 3, amort: 2, expensesNow: 24000, expensesAfter: 25000 },
    assumptions: {
      stockRet: 7, privRet: 5, tjRet: 5, allmRet: 3, houseGrowth: 3, inflation: 2,
      allmPct: 18.5, divisor: 18, tjPct: 4.5, tjDivisor: 20,
      bryggRet: 3, margin: 20, swr: 4,
    },
    tax: { ...DEFAULT_TAX },
  };
}

/** Bounds every number is clamped to when a scenario is loaded or imported. */
export interface Bounds { min: number; max: number }

export const PERSON_BOUNDS: Record<keyof Person, Bounds> = {
  age: { min: 18, max: 80 },
  retAge: { min: 40, max: 75 },
  salary: { min: 0, max: 50_000_000 },
  salaryGrowth: { min: -10, max: 20 },
  allmStart: { min: RULES_2026.earliestPublicPension, max: 75 },
  tjStart: { min: 55, max: 75 },
  stocks: { min: 0, max: 1e9 },
  stockSave: { min: 0, max: 10_000_000 },
  priv: { min: 0, max: 1e9 },
  privSave: { min: 0, max: 10_000_000 },
  tjanst: { min: 0, max: 1e9 },
  allm: { min: 0, max: 1e9 },
};

export const HOUSEHOLD_BOUNDS: Record<keyof Household, Bounds> = {
  house: { min: 0, max: 1e9 },
  loan: { min: 0, max: 1e9 },
  loanRate: { min: 0, max: 30 },
  amort: { min: 0, max: 100 },
  expensesNow: { min: 0, max: 10_000_000 },
  expensesAfter: { min: 0, max: 10_000_000 },
};

export const ASSUMPTION_BOUNDS: Record<keyof Assumptions, Bounds> = {
  stockRet: { min: -20, max: 30 },
  privRet: { min: -20, max: 30 },
  tjRet: { min: -20, max: 30 },
  allmRet: { min: -20, max: 30 },
  houseGrowth: { min: -20, max: 30 },
  inflation: { min: -5, max: 30 },
  allmPct: { min: 0, max: 50 },
  divisor: { min: 1, max: 50 },
  tjPct: { min: 0, max: 50 },
  tjDivisor: { min: 1, max: 50 },
  bryggRet: { min: -10, max: 30 },
  margin: { min: 0, max: 90 },
  swr: { min: 0.1, max: 20 },
};

export const TAX_BOUNDS: Record<keyof TaxParams, Bounds> = {
  municipalRate: { min: 0, max: 50 },
  govRate: { min: -5, max: 20 },
  iskAllowance: { min: 0, max: 100_000_000 },
};

function clean<T extends object>(raw: unknown, fallback: T, bounds: Record<keyof T, Bounds>): T {
  const src = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...fallback };
  for (const key of Object.keys(bounds) as (keyof T & string)[]) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) {
      const b = bounds[key];
      (out as Record<string, number>)[key] = Math.min(b.max, Math.max(b.min, v));
    }
  }
  return out;
}

/** Reads anything (stored or imported JSON) into a valid scenario; unknown or broken parts fall back to the defaults. Null if it is not a Brygga scenario at all. */
export function parseScenario(raw: unknown): Scenario | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== SCENARIO_VERSION) return null;
  const d = defaultScenario();
  const people = Array.isArray(r.people) ? r.people : [];
  return {
    v: 1,
    mode: r.mode === "duo" ? "duo" : "single",
    people: [clean(people[0], d.people[0], PERSON_BOUNDS), clean(people[1], d.people[1], PERSON_BOUNDS)],
    household: clean(r.household, d.household, HOUSEHOLD_BOUNDS),
    assumptions: clean(r.assumptions, d.assumptions, ASSUMPTION_BOUNDS),
    tax: clean(r.tax, d.tax, TAX_BOUNDS),
  };
}

/** The people who count in the current mode. */
export const activePeople = (s: Scenario): Person[] => (s.mode === "duo" ? s.people : [s.people[0]]);

export function toModel(s: Scenario): Model {
  return { people: activePeople(s), household: s.household, assumptions: s.assumptions, tax: s.tax };
}

export interface SavingsCheck {
  /** Net salary per month, all active people. */
  netSalary: number;
  /** What should be left to save: net salary − expenses today − mortgage payment. */
  implied: number;
  /** Stated monthly savings (stocks + private pension). */
  stated: number;
  /** implied − stated: positive means money unaccounted for, negative means saving more than is left. */
  gap: number;
  ok: boolean;
}

/**
 * Model change 3: expenses today were never used in draft 4. They now check that net salary,
 * expenses and the mortgage leave about what the visitor says they save each month.
 */
export function savingsCheck(s: Scenario): SavingsCheck {
  const people = activePeople(s);
  const netSalary = people.reduce((acc, p) => acc + netMonthlySalary(p.salary, p.age, s.tax), 0);
  const implied = netSalary - s.household.expensesNow - monthlyPayment(s.household);
  const stated = people.reduce((acc, p) => acc + p.stockSave + p.privSave, 0);
  const gap = implied - stated;
  const tolerance = Math.max(1000, 0.05 * netSalary);
  return { netSalary, implied, stated, gap, ok: Math.abs(gap) <= tolerance };
}
