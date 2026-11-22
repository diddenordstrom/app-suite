/** Calendar dates are plain `YYYY-MM-DD` strings; maths is done in UTC to avoid DST drift. */
export type ISODate = string;
export type WeekStart = "monday" | "sunday";

const DAY = 86_400_000;

export function toDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function iso(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return iso(new Date(toDate(d).getTime() + n * DAY));
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(d: ISODate): number {
  return toDate(d).getUTCDay();
}

export function weekStartOf(d: ISODate, start: WeekStart = "monday"): ISODate {
  const wd = weekday(d);
  const back = start === "monday" ? (wd + 6) % 7 : wd;
  return addDays(d, -back);
}

/** ISO 8601 week number (Monday weeks, week 1 holds the year's first Thursday). */
export function isoWeek(d: ISODate): number {
  const thursday = addDays(d, 3 - ((weekday(d) + 6) % 7));
  return Math.floor(daysBetween(`${thursday.slice(0, 4)}-01-01`, thursday) / 7) + 1;
}

/**
 * The week number shown for a week starting on `weekStart`. Its Thursday decides, so a week that
 * starts on Sunday (the user's setting) gets the number of the Monday week it mostly overlaps.
 */
export function weekNumber(weekStart: ISODate): number {
  return isoWeek(addDays(weekStart, 3));
}

export function monthStart(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function monthEnd(d: ISODate): ISODate {
  const dt = toDate(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return addDays(iso(dt), -1);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const dt = toDate(monthStart(d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return iso(dt);
}

export function todayIn(timeZone: string, now = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  } catch {
    return iso(now);
  }
}

/** Date part of a Garmin local timestamp like `2026-11-08 07:12:00`. */
export function localDate(startTimeLocal: string): ISODate {
  return startTimeLocal.slice(0, 10);
}

export function range(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
