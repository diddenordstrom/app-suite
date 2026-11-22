/**
 * Brygga's model: when can we stop working, given that liquid capital has to carry the
 * household until the public pension starts? Grown from draft 4
 * (docs/raw/fire-calculator-draft-4.html): a pure month-by-month simulation over one input
 * object, for a household of one or two people. With `tax: null` and one person it gives
 * exactly draft 4's numbers (see engine.test.ts).
 *
 * Amounts are kronor, rates percent, ages years. Returns are nominal; results are reported
 * in today's kronor (deflated by the inflation assumption).
 */
import { RULES_2026, incomeTax, iskTax, type TaxParams } from "./tax";

export interface Person {
  age: number;
  /** Chosen stop age. */
  retAge: number;
  /** Gross salary per year. */
  salary: number;
  /** Salary growth, percent per year. */
  salaryGrowth: number;
  allmStart: number;
  tjStart: number;
  /** Stocks and funds, assumed to be on an ISK. */
  stocks: number;
  stockSave: number;
  priv: number;
  privSave: number;
  tjanst: number;
  allm: number;
}

/** Shared by the household. Expenses are per month and exclude the mortgage. */
export interface Household {
  house: number;
  loan: number;
  loanRate: number;
  amort: number;
  expensesNow: number;
  expensesAfter: number;
}

export interface Assumptions {
  stockRet: number;
  privRet: number;
  tjRet: number;
  allmRet: number;
  houseGrowth: number;
  inflation: number;
  allmPct: number;
  divisor: number;
  tjPct: number;
  tjDivisor: number;
  bryggRet: number;
  margin: number;
  swr: number;
}

export interface Model {
  people: Person[];
  household: Household;
  assumptions: Assumptions;
  /** null: no tax at all (draft 4). */
  tax: TaxParams | null;
}

/** One point per year from now, in today's kronor. */
export interface Point {
  /** Years from now. */
  t: number;
  ages: number[];
  nw: number;
  liquid: number;
  pension: number;
}

export interface PathResult {
  /** The stop age per person this path was run for. */
  stops: number[];
  pts: Point[];
  /** Liquid capital (stocks + private pension) when the first person stops, today's kronor. */
  liqRealA: number;
  /** Present value of what the bridge has to cover, today's kronor. */
  need: number;
  marginOk: boolean;
  bridgeShort: boolean;
  shortfall: boolean;
  bridgeOk: boolean;
  ok: boolean;
  /** Lowest liquid capital during the bridge, today's kronor. */
  minBridge: number;
  fire4: boolean;
  /** Net worth when the first person stops, today's kronor. */
  nwAtStop: number;
  /** Household pension per month when every public pension has started, today's kronor. */
  pensionGross: number;
  pensionNet: number;
  /** Tax the model paid over the whole path (income tax on modelled income + ISK), today's kronor. */
  incomeTaxPaid: number;
  iskTaxPaid: number;
  /** Years from now: first stop, and end of the bridge (last public pension start). */
  bridgeFrom: number;
  bridgeTo: number;
}

/** Why a stop age fails, as a message key the UI translates. */
export type FailReason = "reason.bridgeShort" | "reason.margin" | "reason.runsOut";

export const STOP_AGE_MAX = 75;
export const HORIZON_AGE = 100;

const mr = (r: number) => Math.pow(1 + r / 100, 1 / 12) - 1;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

/** Interest + amortisation in the first month. */
export function monthlyPayment(h: Household): number {
  return (h.loan * (h.loanRate + h.amort)) / 100 / 12;
}

/** Months from now until a person reaches `age` (rounded, like draft 4). */
const monthsTo = (p: Person, age: number) => Math.round((age - p.age) * 12);

/** A person's public pension balance (nominal) the month it starts: today's balance grown with the index, plus contributions until the stop age. */
function publicBalanceAtStart(p: Person, stop: number, a: Assumptions): number {
  const rA = mr(a.allmRet);
  let bal = p.allm;
  const end = monthsTo(p, p.allmStart);
  for (let m = 0; m < end; m++) {
    const working = p.age + m / 12 < stop;
    const salaryM = working ? (p.salary * Math.pow(1 + p.salaryGrowth / 100, m / 12)) / 12 : 0;
    bal = bal * (1 + rA) + salaryM * (a.allmPct / 100);
  }
  return bal;
}

/**
 * Present value, in today's kronor, of what the bridge has to cover: from the first person
 * stopping until the last public pension starts. Each month needs the expenses plus the
 * mortgage payment, less the net salary of anyone still working and the net public pension of
 * anyone who has started it. Occupational pension is left out, to be safe.
 */
export function pvBridge(model: Model, stops: number[]): number {
  const { people, household: h, assumptions: a, tax } = model;
  const from = Math.min(...people.map((p, k) => monthsTo(p, stops[k])));
  const to = Math.max(...people.map((p) => monthsTo(p, p.allmStart)));
  const n = Math.max(0, to - Math.max(0, from));
  if (n === 0) return 0;
  const r = Math.pow(1 + a.bryggRet / 100, 1 / 12) - 1;
  const e = h.expensesAfter + (h.loan > 0 ? monthlyPayment(h) : 0);
  let pv = 0;
  const realGrowth = (g: number, yrs: number) => Math.pow((1 + g / 100) / (1 + a.inflation / 100), yrs);
  // Public pension per year in today's kronor (a fixed nominal payout, deflated to its start).
  const publicReal = people.map((p, k) =>
    people.length > 1 ? publicBalanceAtStart(p, stops[k], a) / a.divisor / Math.pow(1 + a.inflation / 100, monthsTo(p, p.allmStart) / 12) : 0);
  for (let j = 1; j <= n; j++) {
    const m = Math.max(0, from) + j - 1;
    let income = 0;
    if (people.length > 1) {
      people.forEach((p, k) => {
        const age = p.age + m / 12;
        if (age < stops[k]) {
          const yearly = p.salary * realGrowth(p.salaryGrowth, m / 12);
          income += (yearly - (tax ? incomeTax(yearly, 0, Math.floor(age), tax, 1) : 0)) / 12;
        } else if (age >= p.allmStart) {
          const yearly = publicReal[k];
          income += (yearly - (tax ? incomeTax(0, yearly, Math.floor(age), tax, 1) : 0)) / 12;
        }
      });
    }
    pv += Math.max(0, e - income) / Math.pow(1 + r, j);
  }
  return pv;
}

interface Ledger {
  workOut: number; // salary outside the cash flow (savings regime)
  workIn: number; // salary paid into the cash flow
  pension: number; // pension payouts + private pension withdrawals, gross
  withheld: number;
  iskSamples: number[];
  ageAtStart: number;
}

const newLedger = (age: number): Ledger => ({ workOut: 0, workIn: 0, pension: 0, withheld: 0, iskSamples: [], ageAtStart: Math.floor(age) });

/** Simulates month by month until the youngest is 100, with `stops[k]` as person k's stop age. */
export function runPath(model: Model, stops: number[]): PathResult {
  const { people, household: h, assumptions: a, tax } = model;
  const n = people.length;
  const infl = a.inflation / 100;
  const rS = mr(a.stockRet), rP = mr(a.privRet), rT = mr(a.tjRet), rA = mr(a.allmRet), rH = mr(a.houseGrowth);
  const L0 = h.loan, rL = h.loanRate / 100 / 12, amortM = (L0 * h.amort) / 100 / 12, payM0 = monthlyPayment(h);
  let H = h.house, L = L0;
  const S = people.map((p) => p.stocks);
  const P = people.map((p) => p.priv);
  const T = people.map((p) => p.tjanst);
  const A = people.map((p) => p.allm);
  const allmPay = people.map(() => 0), tjPay = people.map(() => 0);
  const allmOn = people.map(() => false), tjOn = people.map(() => false);
  const months = Math.max(0, ...people.map((p) => Math.round((HORIZON_AGE - p.age) * 12)));
  const swr = a.swr / 100;

  const bridgeTo = Math.max(...people.map((p) => monthsTo(p, p.allmStart))) / 12;
  let bridgeFrom = Infinity;
  const pts: Point[] = [];
  let bridgeShort = false, shortfall = false, minBridge = Infinity;
  let liqAtA: number | null = null, nwAtStop = 0, fire4: boolean | null = null;
  let pensionGross = 0, pensionNet = 0, incomeTaxPaid = 0, iskTaxPaid = 0;

  // Tax state: per person, this year's ledger, the average rate withheld on pensions and the
  // marginal rate used to gross up private pension withdrawals. Settled at each year's end.
  let ledgers = people.map((p) => newLedger(p.age));
  const wPension = people.map(() => 0), wPriv = people.map(() => 0), wSalary = people.map(() => 0);
  const lastPriv = people.map(() => 0);
  const lastPrivYtd = people.map(() => 0);

  const ageAt = (k: number, m: number) => people[k].age + m / 12;

  const estimateRates = (m: number, defl: number) => {
    if (!tax) return;
    const yrs = m / 12;
    people.forEach((p, k) => {
      const age = Math.floor(ageAt(k, m));
      const working = ageAt(k, m) < stops[k];
      const work = working ? p.salary * Math.pow(1 + p.salaryGrowth / 100, yrs) : 0;
      const pens = 12 * ((allmOn[k] ? allmPay[k] : 0) + (tjOn[k] ? tjPay[k] : 0));
      const priv = lastPriv[k] * (1 + infl);
      const base = incomeTax(work, 0, age, tax, defl);
      const withP = incomeTax(work, pens + priv, age, tax, defl);
      wPension[k] = pens + priv > 0 ? (withP - base) / (pens + priv) : 0;
      const step = 10_000 * defl;
      wPriv[k] = Math.min(0.9, (incomeTax(work, pens + priv + step, age, tax, defl) - withP) / step);
      wSalary[k] = work > 0 ? base / work : 0;
    });
  };

  /** Takes `net` kronor of cash from the household's liquid capital: ISK first, then private pension (grossed up for tax). Returns what could not be covered. */
  const withdraw = (net: number): number => {
    let rest = net;
    const totS = sum(S);
    if (totS > 0 && rest > 0) {
      const take = Math.min(totS, rest);
      for (let k = 0; k < n; k++) S[k] -= take * (S[k] / totS);
      rest -= take;
    }
    const netP = P.map((x, k) => x * (1 - wPriv[k]));
    const totP = sum(netP);
    if (totP > 0 && rest > 0) {
      const take = Math.min(totP, rest);
      for (let k = 0; k < n; k++) {
        if (netP[k] <= 0) continue;
        const netK = take * (netP[k] / totP);
        const gross = netK / (1 - wPriv[k]);
        P[k] = Math.max(0, P[k] - gross);
        ledgers[k].pension += gross;
        ledgers[k].withheld += gross - netK;
        lastPrivYtd[k] += gross;
      }
      rest -= take;
    }
    return rest;
  };

  const deposit = (amount: number) => {
    for (let k = 0; k < n; k++) S[k] += amount / n;
  };

  estimateRates(0, 1);

  for (let m = 0; m <= months; m++) {
    const yrs = m / 12;
    const ages = people.map((_, k) => ageAt(k, m));
    const working = ages.map((age, k) => age < stops[k]);
    const allWorking = working.every(Boolean);
    const defl = Math.pow(1 + infl, yrs);
    const inBridge = !allWorking && people.some((p, k) => ages[k] < p.allmStart);

    if (m % 12 === 0) {
      if (m > 0) {
        ledgers = people.map((_, k) => newLedger(ages[k]));
        estimateRates(m, defl);
      }
      pts.push({ t: yrs, ages, nw: (sum(S) + H - L + sum(P) + sum(T) + sum(A)) / defl, liquid: (sum(S) + sum(P)) / defl, pension: (sum(A) + sum(T)) / defl });
    }
    if (m % 3 === 0) people.forEach((_, k) => ledgers[k].iskSamples.push(S[k]));
    if (liqAtA === null && !allWorking) {
      liqAtA = sum(S) + sum(P);
      bridgeFrom = yrs;
      nwAtStop = (sum(S) + H - L + sum(P) + sum(T) + sum(A)) / defl;
      estimateRates(m, defl);
    }
    if (inBridge) minBridge = Math.min(minBridge, (sum(S) + sum(P)) / defl);

    let started = false;
    people.forEach((p, k) => {
      if (!allmOn[k] && ages[k] >= p.allmStart) { allmOn[k] = true; allmPay[k] = A[k] / (a.divisor * 12); started = true; }
      if (!tjOn[k] && ages[k] >= p.tjStart) { tjOn[k] = true; tjPay[k] = T[k] / (a.tjDivisor * 12); started = true; }
    });
    if (started) estimateRates(m, defl);
    if (fire4 === null && allmOn.every(Boolean)) {
      const gross = sum(people.map((_, k) => allmPay[k] + tjPay[k]));
      const net = sum(people.map((_, k) => (allmPay[k] + tjPay[k]) * (1 - wPension[k])));
      pensionGross = gross / defl;
      pensionNet = net / defl;
      fire4 = (sum(S) + sum(P)) * swr / 12 / defl + net / defl >= h.expensesAfter;
    }

    // Pension payouts (cash, gross) and what is withheld for tax
    const pA = people.map((_, k) => (allmOn[k] ? Math.min(allmPay[k], A[k]) : 0));
    const pT = people.map((_, k) => (tjOn[k] ? Math.min(tjPay[k], T[k]) : 0));
    const cashPension = people.map((_, k) => {
      const gross = pA[k] + pT[k];
      const w = gross * wPension[k];
      ledgers[k].pension += gross;
      ledgers[k].withheld += w;
      return gross - w;
    });

    // Salary and pension contributions (working years only)
    const salaryM = people.map((p, k) => (working[k] ? (p.salary * Math.pow(1 + p.salaryGrowth / 100, yrs)) / 12 : 0));

    // Mortgage
    const wasPaidOff = L0 > 0 && L <= 0.5;
    const interest = L * rL;
    const princ = Math.min(L, amortM);
    L -= princ;
    const mortCash = interest + princ;

    // Growth and payouts
    for (let k = 0; k < n; k++) {
      S[k] *= 1 + rS;
      P[k] *= 1 + rP;
      T[k] = Math.max(0, T[k] * (1 + rT) - pT[k] + salaryM[k] * (a.tjPct / 100));
      A[k] = Math.max(0, A[k] * (1 + rA) - pA[k] + salaryM[k] * (a.allmPct / 100));
    }
    H *= 1 + rH;

    if (allWorking) {
      // Everyone works: the stated savings go in, the mortgage is paid from salary, and a
      // paid-off mortgage's payment is saved instead.
      const freed = wasPaidOff ? payM0 : 0;
      people.forEach((p, k) => {
        S[k] += p.stockSave + freed / n + cashPension[k];
        P[k] += p.privSave;
        ledgers[k].workOut += salaryM[k];
      });
    } else {
      // Someone has stopped: the household lives on salaries, pensions and capital.
      const salaryNet = people.map((_, k) => {
        if (!working[k]) return 0;
        ledgers[k].workIn += salaryM[k];
        const w = salaryM[k] * wSalary[k];
        ledgers[k].withheld += w;
        return salaryM[k] - w;
      });
      const net = h.expensesAfter * defl + mortCash - sum(cashPension) - sum(salaryNet);
      if (net > 0) {
        if (withdraw(net) > 0.5) {
          shortfall = true;
          if (inBridge) bridgeShort = true;
        }
      } else {
        deposit(-net);
      }
    }

    // Year end: settle income tax on the modelled income and pay the ISK tax.
    if (tax && (m % 12 === 11 || m === months)) {
      let due = 0;
      people.forEach((_, k) => {
        const l = ledgers[k];
        const work = l.workOut + l.workIn;
        const owed = incomeTax(work, l.pension, l.ageAtStart, tax, defl) - incomeTax(l.workOut, 0, l.ageAtStart, tax, defl);
        // Capital base: the quarter values averaged over the year (a short last year counts its quarters only).
        const isk = iskTax(sum(l.iskSamples) / 4, tax, defl);
        incomeTaxPaid += owed / defl;
        iskTaxPaid += isk / defl;
        const diff = owed - l.withheld + isk;
        // Pay from the person's own ISK first; a refund goes back to it.
        const own = Math.min(Math.max(0, S[k]), Math.max(0, diff));
        S[k] -= diff > 0 ? own : diff;
        due += Math.max(0, diff) - own;
        lastPriv[k] = lastPrivYtd[k];
        lastPrivYtd[k] = 0;
      });
      if (due > 0 && withdraw(due) > 0.5) {
        shortfall = true;
        if (inBridge) bridgeShort = true;
      }
    }
  }

  const liqRealA = liqAtA === null ? 0 : liqAtA / Math.pow(1 + infl, bridgeFrom);
  const need = pvBridge(model, stops);
  const marginOk = liqRealA * (1 - a.margin / 100) >= need;
  const bridgeOk = !bridgeShort && marginOk;
  return {
    stops, pts, liqRealA, need, marginOk, bridgeShort, shortfall, bridgeOk,
    ok: bridgeOk && !shortfall,
    minBridge: minBridge === Infinity ? liqRealA : minBridge,
    fire4: !!fire4,
    nwAtStop, pensionGross, pensionNet, incomeTaxPaid, iskTaxPaid,
    bridgeFrom: bridgeFrom === Infinity ? 0 : bridgeFrom,
    bridgeTo,
  };
}

export function reason(c: PathResult): FailReason {
  if (c.bridgeShort) return "reason.bridgeShort";
  if (!c.marginOk) return "reason.margin";
  return "reason.runsOut";
}

export interface Candidate extends PathResult {
  /** The stop age tried for the person being varied. */
  a: number;
}

/** Every whole stop age for person `k` from next year to 75, the others at their chosen age. */
export function candidates(model: Model, k = 0): Candidate[] {
  const out: Candidate[] = [];
  const chosen = model.people.map((p) => p.retAge);
  for (let a = Math.floor(model.people[k].age) + 1; a <= STOP_AGE_MAX; a++) {
    const stops = chosen.map((s, j) => (j === k ? a : s));
    out.push({ ...runPath(model, stops), a });
  }
  return out;
}

export function earliestStop(model: Model, k = 0): number | null {
  return candidates(model, k).find((c) => c.ok)?.a ?? null;
}

export const chosenPath = (model: Model) => runPath(model, model.people.map((p) => p.retAge));

/** The earliest public pension age under today's rules (riktålder − 3). */
export const EARLIEST_PUBLIC_PENSION = RULES_2026.earliestPublicPension;
