/**
 * The Trender view of Statistik (docs/decisions/fartlek-period-stats.md): curves over a window that
 * follows the chosen period, with a figure on top about that period.
 */
import { daysBetween, toDate, type ISODate } from "@/shared/dates";
import type { Period } from "@/shared/periodstats";

/** Weeks of curve to fetch: about four times the longest period, at least 12 weeks, reaching back past
 *  the earliest period shown. Rounded up to four weeks so nearby choices share a window; at most 104. */
export function trendWeeks(periods: Period[], today: ISODate): number {
  const len = Math.max(1, ...periods.map((p) => daysBetween(p.from, p.to) + 1));
  const back = Math.max(1, ...periods.map((p) => daysBetween(p.from, today) + 1));
  const weeks = Math.max(12, Math.ceil((len * 4) / 7), Math.ceil(back / 7) + 1);
  return Math.min(104, Math.ceil(weeks / 4) * 4);
}

type Dated = { date: ISODate; value: number | null | undefined };
const inside = (p: Period) => (d: Dated): d is { date: ISODate; value: number } => d.value != null && d.date >= p.from && d.date <= p.to;

/** Mean of the values dated in the period, or null without any. */
export function meanIn(points: Dated[], p: Period): number | null {
  const v = points.filter(inside(p));
  return v.length ? v.reduce((a, x) => a + x.value, 0) / v.length : null;
}

/** The first and the last value dated in the period. */
export function endsIn(points: Dated[], p: Period): { first: number; last: number; firstDate: ISODate; lastDate: ISODate } | null {
  const v = points.filter(inside(p)).sort((a, b) => a.date.localeCompare(b.date));
  return v.length ? { first: v[0]!.value, last: v.at(-1)!.value, firstDate: v[0]!.date, lastDate: v.at(-1)!.date } : null;
}

/** Shading for a chart: the chosen period, and the other one when comparing (lavender). */
export function periodBands(a: Period, b: Period | null, labelA: string, labelB: string) {
  const ms = (d: ISODate) => toDate(d).getTime();
  // A period of one day still gets a visible strip: it spans its own day.
  const band = (p: Period, label: string, color?: string) => ({ from: ms(p.from), to: ms(p.to), label, color });
  return [...(b ? [band(b, labelB, "var(--stats-b)")] : []), band(a, labelA)];
}
