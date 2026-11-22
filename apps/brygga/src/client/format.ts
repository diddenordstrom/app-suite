import { formatNumber } from "@/shared/format";
import { locale, t } from "./i18n";

/** "1 234 567 kr" in the visitor's language. */
export const kr = (v: number) => `${formatNumber(v, "money", locale)} kr`;

/** Millions with at most one decimal, for the chart axis ("12,5"). */
export const mkr = (v: number) => (Math.round(v / 1e5) / 10 || 0).toLocaleString(locale, { maximumFractionDigits: 1 });

export const pct = (v: number) => v.toLocaleString(locale, { maximumFractionDigits: 2 });

export const age = (n: number) => t("age", { n: Math.round(n * 10) / 10 });
