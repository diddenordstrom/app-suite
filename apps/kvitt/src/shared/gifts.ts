/**
 * Bjudningar (treats). A gift is an expense that never creates a debt; the scoreboard is derived from
 * gift expenses, there is no table for it. Dates are "YYYY-MM-DD" and compare as strings.
 */

/**
 * Five fixed category slots offered as chips in the expense form. Households can rename them (`categoryLabels`)
 * but not add or remove any; default labels come from i18n (`category.<key>`).
 */
export const CATEGORY_KEYS = ["home", "drinks", "restaurant", "activity", "other"] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];

/** Categories that default to "bjudet"; the household can change this. Only "home" is a treat by default, drinks are shared. */
export const DEFAULT_GIFT_CATEGORIES: CategoryKey[] = ["home"];

export const MAX_LABEL_LENGTH = 24;

export const MAX_GUESTS = 20;

/** Is a new expense in this category a gift by default? Free-text or missing categories are not. */
export function giftByDefault(category: string | null | undefined, giftCategories: readonly string[]): boolean {
  return category != null && giftCategories.includes(category);
}

/** Parse the stored JSON array of gift categories; anything unreadable falls back to the defaults. */
export function parseGiftCategories(json: string): string[] {
  try {
    const v: unknown = JSON.parse(json);
    if (Array.isArray(v) && v.every((x) => typeof x === "string")) return v;
  } catch { /* fall through */ }
  return [...DEFAULT_GIFT_CATEGORIES];
}

/** Parse the stored JSON map of custom slot names; only known keys with a non-empty label of sane length survive. */
export function parseCategoryLabels(json: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const v: unknown = JSON.parse(json);
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of CATEGORY_KEYS) {
        const l = (v as Record<string, unknown>)[k];
        if (typeof l === "string" && l.trim() && l.trim().length <= MAX_LABEL_LENGTH) out[k] = l.trim();
      }
    }
  } catch { /* no labels */ }
  return out;
}

/** The latest gift date per host. */
export function lastGiftByMember(gifts: { payerId: number; date: string }[]): Map<number, string> {
  const last = new Map<number, string>();
  for (const g of gifts) if (g.date > (last.get(g.payerId) ?? "")) last.set(g.payerId, g.date);
  return last;
}

/** `date` plus whole calendar months; the day is clamped to the target month's length (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const idx = y * 12 + (m - 1) + months;
  const ty = Math.floor(idx / 12);
  const tm = (idx % 12) + 1;
  const day = Math.min(d, new Date(Date.UTC(ty, tm, 0)).getUTCDate());
  return `${String(ty).padStart(4, "0")}-${String(tm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Time for the quiet "someone could host" hint? Only after at least one bjudning has been logged (a new
 * household is not nagged), and once `months` (minimum 1) calendar months have passed since the latest one.
 */
export function hintDue(latestGiftDate: string | null, today: string, months: number): boolean {
  if (!latestGiftDate) return false;
  return today >= addMonths(latestGiftDate, Math.max(1, Math.floor(months)));
}
