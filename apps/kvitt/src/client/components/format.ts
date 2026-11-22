import type { ListColor } from "@/shared/api";
import { locale } from "../i18n";

/** Minor units → plain input string ("120" or "120.50"). */
export const toInput = (minor: number) => (minor / 100).toFixed(minor % 100 === 0 ? 0 : 2);

export const today = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleDateString(locale, { day: "numeric", month: "short", year: new Date(ms).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });

export const fmtDateTime = (ms: number) =>
  new Date(ms).toLocaleString(locale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export const fmtDay = (ymd: string) => fmtDate(new Date(`${ymd}T12:00:00`).getTime());

/** Static class names so Tailwind sees them. */
export const listBg: Record<ListColor, string> = {
  default: "bg-list-default",
  red: "bg-list-red",
  orange: "bg-list-orange",
  yellow: "bg-list-yellow",
  green: "bg-list-green",
  teal: "bg-list-teal",
  blue: "bg-list-blue",
  purple: "bg-list-purple",
  pink: "bg-list-pink",
};
