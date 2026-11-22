/**
 * Number input and output as in draft 4: money accepts spaces and the suffixes k (thousand)
 * and M (million), e.g. "3M", "500k", "1,5M"; both comma and point work as decimal mark.
 */
export type Kind = "money" | "percent" | "years" | "number";

export function parseNumber(input: string, kind: Kind): number {
  let s = input.trim().toLowerCase().replace(/[\s\u00a0\u202f]/g, "");
  let mult = 1;
  if (kind === "money") {
    if (s.endsWith("m")) { mult = 1e6; s = s.slice(0, -1); }
    else if (s.endsWith("k")) { mult = 1e3; s = s.slice(0, -1); }
  }
  if (kind === "percent") s = s.replace(/%$/, "");
  // "1,5" and "1.5" are decimals; a money value like "1,500,000" or "1.500.000" uses grouping marks.
  const marks = s.match(/[.,]/g) ?? [];
  if (marks.length > 1 || (kind === "money" && mult === 1 && /^\d{1,3}([.,]\d{3})+$/.test(s))) s = s.replace(/[.,]/g, "");
  else s = s.replace(",", ".");
  if (!/^-?\d*\.?\d+$|^-?\d+\.?$/.test(s)) return NaN;
  return Number(s) * mult;
}

export function formatNumber(v: number, kind: Kind, locale: string): string {
  if (!Number.isFinite(v)) return "";
  if (kind === "money") return Math.round(v).toLocaleString(locale);
  return (Math.round(v * 100) / 100).toLocaleString(locale, { maximumFractionDigits: 2 });
}
