export type Units = "metric" | "imperial";

export const KM_PER_MI = 1.609344;

export function distUnit(units: Units): string {
  return units === "imperial" ? "mi" : "km";
}

/** km → the user's unit. */
export function toUserDist(km: number, units: Units): number {
  return units === "imperial" ? km / KM_PER_MI : km;
}

/** The user's unit → km. */
export function fromUserDist(v: number, units: Units): number {
  return units === "imperial" ? v * KM_PER_MI : v;
}

/** `12.4 km`; with a locale its decimal mark (`12,4 km` in sv-SE). */
export function fmtDist(km: number | null | undefined, units: Units, digits = 1, locale?: string): string {
  if (km == null) return "–";
  return `${fmtNum(toUserDist(km, units), digits, digits, locale)} ${distUnit(units)}`;
}

/** A plain number with `min`–`max` decimals, in the locale's decimal mark (no thousands separator). */
export function fmtNum(n: number, min: number, max: number, locale?: string): string {
  if (!locale) return n.toFixed(max);
  return n.toLocaleString(locale, { minimumFractionDigits: min, maximumFractionDigits: max, useGrouping: false });
}

function mmss(totalSec: number): string {
  const s = Math.round(totalSec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Seconds per km → `4:59/km` (or per mile). */
export function fmtPace(secPerKm: number | null | undefined, units: Units): string {
  if (!secPerKm || !Number.isFinite(secPerKm)) return "–";
  const s = units === "imperial" ? secPerKm * KM_PER_MI : secPerKm;
  return `${mmss(s)}/${distUnit(units)}`;
}

/** `1h23` for long durations, `45:10` below an hour. */
export function fmtDuration(sec: number | null | undefined): string {
  if (sec == null) return "–";
  const s = Math.round(sec);
  if (s >= 3600) return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}`;
  return mmss(s);
}

export function fmtClock(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const rest = mmss(s % 3600).padStart(5, "0");
  return h ? `${h}:${rest}` : mmss(s);
}

/** Goal finish time: `3:30` (h:mm) or `3:30:00` (h:mm:ss) → seconds. */
export function parseGoalTime(s: string): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [h, mi, se] = [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)];
  if (mi > 59 || se > 59) return null;
  return h * 3600 + mi * 60 + se;
}

/** `4:41` → 281 seconds per (user unit) converted to per km. */
export function parsePace(s: string, units: Units): number | null {
  const m = s.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m || Number(m[2]) > 59) return null;
  const sec = Number(m[1]) * 60 + Number(m[2]);
  return units === "imperial" ? sec / KM_PER_MI : sec;
}

export function paceFromSpeed(metersPerSec: number | null | undefined): number | null {
  return metersPerSec && metersPerSec > 0 ? 1000 / metersPerSec : null;
}
