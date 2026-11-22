/** Macro totals and how far they cover a daily target over a year. */
export interface MacroSummary { kcal: number; proteinG: number; carbsG: number; fatG: number }
export interface MacroTarget { id: number; dailyKcal: number; dailyProteinG: number; dailyCarbsG: number; dailyFatG: number }

export const emptyMacro: MacroSummary = { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 };

/** Percent of a year's need (daily target × 365) that `annualTotal` covers, rounded. */
export function annualCoveragePercent(annualTotal: number, dailyTarget: number): number {
  if (dailyTarget <= 0) return 0;
  return Math.round((annualTotal / (dailyTarget * 365)) * 100);
}

export function macroCoverage(growing: MacroSummary, onHand: MacroSummary, target: MacroTarget | null) {
  const combined = {
    kcal: growing.kcal + onHand.kcal,
    proteinG: growing.proteinG + onHand.proteinG,
    carbsG: growing.carbsG + onHand.carbsG,
    fatG: growing.fatG + onHand.fatG,
  };
  const pct = (total: number, daily: number | undefined) => (target && daily !== undefined ? annualCoveragePercent(total, daily) : 0);
  return {
    combined,
    daysOfRunway: target && target.dailyKcal > 0 ? Math.floor(onHand.kcal / target.dailyKcal) : null,
    coveragePercent: pct(combined.kcal, target?.dailyKcal),
    proteinPercent: pct(combined.proteinG, target?.dailyProteinG),
    carbsPercent: pct(combined.carbsG, target?.dailyCarbsG),
    fatPercent: pct(combined.fatG, target?.dailyFatG),
  };
}
