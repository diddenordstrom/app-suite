import type { Model } from "../engine";

/** Draft 4's inputs, flat, with its ids. */
export interface Draft4Inputs {
  age: number; retAge: number; salary: number; allmStart: number; tjStart: number;
  stocks: number; stockSave: number; priv: number; privSave: number; tjanst: number; allm: number;
  house: number; loan: number; loanRate: number; amort: number; expensesNow: number; expensesAfter: number;
  stockRet: number; privRet: number; tjRet: number; allmRet: number; houseGrowth: number;
  salaryGrowth: number; inflation: number; allmPct: number; divisor: number; tjPct: number; tjDivisor: number;
  bryggRet: number; margin: number; swr: number;
}

/** Draft 4's example values. */
export const DRAFT4_DEFAULTS: Draft4Inputs = {
  age: 35, retAge: 60, salary: 600000,
  allmStart: 65, tjStart: 65,
  stocks: 500000, stockSave: 5000, priv: 200000, privSave: 1000, tjanst: 300000, allm: 400000,
  house: 3000000, loan: 2000000, loanRate: 3, amort: 2,
  expensesNow: 30000, expensesAfter: 30000,
  stockRet: 7, privRet: 5, tjRet: 5, allmRet: 3, houseGrowth: 3,
  salaryGrowth: 3, inflation: 2,
  allmPct: 18.5, divisor: 18, tjPct: 4.5, tjDivisor: 20,
  bryggRet: 3, margin: 20, swr: 4,
};

/** Draft 4 as a model: one person, no tax. */
export function draft4Model(over: Partial<Draft4Inputs> = {}): Model {
  const i = { ...DRAFT4_DEFAULTS, ...over };
  return {
    people: [{
      age: i.age, retAge: i.retAge, salary: i.salary, salaryGrowth: i.salaryGrowth, allmStart: i.allmStart, tjStart: i.tjStart,
      stocks: i.stocks, stockSave: i.stockSave, priv: i.priv, privSave: i.privSave, tjanst: i.tjanst, allm: i.allm,
    }],
    household: { house: i.house, loan: i.loan, loanRate: i.loanRate, amort: i.amort, expensesNow: i.expensesNow, expensesAfter: i.expensesAfter },
    assumptions: {
      stockRet: i.stockRet, privRet: i.privRet, tjRet: i.tjRet, allmRet: i.allmRet, houseGrowth: i.houseGrowth, inflation: i.inflation,
      allmPct: i.allmPct, divisor: i.divisor, tjPct: i.tjPct, tjDivisor: i.tjDivisor, bryggRet: i.bryggRet, margin: i.margin, swr: i.swr,
    },
    tax: null,
  };
}
