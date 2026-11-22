/**
 * The calendar's recurrence picker and the RRULE it stores. "custom" stands for a rule the picker can't show
 * (one imported, say): it is kept as it was on save instead of being overwritten.
 */
export const RECURRENCE_PRESETS = ["none", "daily", "weekdays", "weekly", "biweekly", "monthly", "every_n_days"] as const;
export type RecurrencePreset = (typeof RECURRENCE_PRESETS)[number] | "custom";

export function presetToRRule(preset: RecurrencePreset, intervalDays?: number): string | null {
  switch (preset) {
    case "daily": return "FREQ=DAILY";
    case "every_n_days": return `FREQ=DAILY;INTERVAL=${intervalDays && intervalDays > 1 ? intervalDays : 2}`;
    case "weekdays": return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "weekly": return "FREQ=WEEKLY";
    case "biweekly": return "FREQ=WEEKLY;INTERVAL=2";
    case "monthly": return "FREQ=MONTHLY";
    default: return null;
  }
}

export function rruleToPreset(rrule: string | null): { preset: RecurrencePreset; intervalDays?: number } {
  if (!rrule) return { preset: "none" };
  const known: Record<string, RecurrencePreset> = {
    "FREQ=DAILY": "daily",
    "FREQ=WEEKLY": "weekly",
    "FREQ=WEEKLY;INTERVAL=2": "biweekly",
    "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR": "weekdays",
    "FREQ=MONTHLY": "monthly",
  };
  if (known[rrule]) return { preset: known[rrule] };
  const everyN = /^FREQ=DAILY;INTERVAL=(\d+)$/.exec(rrule);
  if (everyN && Number(everyN[1]) > 1) return { preset: "every_n_days", intervalDays: Number(everyN[1]) };
  return { preset: "custom" };
}
