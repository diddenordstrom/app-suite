/**
 * The trip plan and the logic that walks it: where each day starts, its legs, its rough distance,
 * which calendar day it is, and whether a stop is likely closed. Pure, shared by server and client.
 */
import { estimateLeg, hasCoords, parseLatLon, type LatLon, type MaybeCoords } from "./geo";

export const CATEGORIES = ["fika", "mat", "sova", "se", "fixa"] as const;
export type Category = (typeof CATEGORIES)[number];

export const SLEEP_TYPES = ["tent", "hostel", "hotel", "other"] as const;
export type SleepType = (typeof SLEEP_TYPES)[number];

export const START_MODES = ["home", "here", "custom"] as const;
export type StartMode = (typeof START_MODES)[number];

export const STOP_KINDS = ["stop", "via"] as const;
/** "stop": a place you explore, with todos. "via": a point that only steers the route. */
export type StopKind = (typeof STOP_KINDS)[number];

/** A day's driving above this (minutes) gets a gentle "long day" note. */
export const LONG_DAY_MINUTES = 6 * 60;

export interface Todo { id: number; text: string; category: Category; done: boolean }

/** Inspiration saved on a stop: a video, thread or post and what to look for in it. */
export interface StopLink { id: number; url: string; note: string }

export interface Stop {
  id: number; kind: StopKind; name: string; lat: number | null; lon: number | null; note: string;
  /** Usual season, months 1–12; a range may wrap the new year (11 → 3). Null when unknown. */
  openFrom: number | null; openTo: number | null;
  todos: Todo[];
  links: StopLink[];
  photoUrl: string | null;
}

export interface Sleep { type: SleepType; name: string; lat: number | null; lon: number | null; note: string }

export interface Day {
  id: number; title: string; stops: Stop[]; sleep: Sleep;
  /** Driving time typed in from Google Maps, in minutes; null when not given. */
  driveMinutes: number | null;
}

export interface Plan {
  /** Country or region added to name-only searches so Google Maps finds the right place. */
  area: string;
  startMode: StartMode;
  /** Place name, address or "lat, lon" when startMode is custom. */
  startText: string;
  /** First day, "YYYY-MM-DD", or null when undated. */
  startDate: string | null;
  days: Day[];
}

/** The viewer's own home (set per person in Settings). */
export interface Home { label: string; lat: number | null; lon: number | null }

/** Swedish places offered as quick picks for a custom start. */
export const PLACES: Record<string, { label: string; lat: number; lon: number }> = {
  "jönköping": { label: "Jönköping", lat: 57.7826, lon: 14.1618 },
  "göteborg": { label: "Göteborg", lat: 57.7089, lon: 11.9746 },
  stockholm: { label: "Stockholm", lat: 59.3293, lon: 18.0686 },
  "malmö": { label: "Malmö", lat: 55.605, lon: 13.0038 },
  karlstad: { label: "Karlstad", lat: 59.3793, lon: 13.5036 },
  oslo: { label: "Oslo", lat: 59.9139, lon: 10.7522 },
};

/**
 * A point on the route. `query` is what a Maps link needs: "lat,lon" when known, else name + area.
 * `label` is empty for the device's own location; the client shows its translated name.
 */
export interface RoutePoint { kind: "start" | "stop" | "night"; label: string; lat: number | null; lon: number | null; query: string }

/** Where a trip begins and why its position might be missing. */
export type StartPoint = RoutePoint & { kind: "start"; mode: StartMode; missing: "none" | "here" | "home" | "text" | "position" };

/** "lat,lon" when known, else the name with the trip's area appended. */
export function placeQuery(area: string, p: MaybeCoords & { name: string }): string {
  if (hasCoords(p)) return `${p.lat},${p.lon}`;
  return p.name + (area ? `, ${area}` : "");
}

export function startPoint(plan: Plan, home: Home | null): StartPoint {
  const base = { kind: "start" as const, mode: plan.startMode };
  if (plan.startMode === "here") return { ...base, label: "", lat: null, lon: null, query: "", missing: "here" };
  if (plan.startMode === "custom") {
    const text = plan.startText.trim();
    if (!text) return { ...base, label: "", lat: null, lon: null, query: "", missing: "text" };
    const place = PLACES[text.toLowerCase()];
    const ll = parseLatLon(text) ?? place ?? null;
    if (ll) return { ...base, label: place?.label ?? text, lat: ll.lat, lon: ll.lon, query: `${ll.lat},${ll.lon}`, missing: "none" };
    return { ...base, label: text, lat: null, lon: null, query: text, missing: "position" };
  }
  if (!home || !home.label.trim()) return { ...base, label: "", lat: null, lon: null, query: "", missing: "home" };
  if (hasCoords(home)) return { ...base, label: home.label, lat: home.lat, lon: home.lon, query: `${home.lat},${home.lon}`, missing: "none" };
  return { ...base, label: home.label, lat: null, lon: null, query: home.label, missing: "position" };
}

export function stopPoint(plan: Plan, s: Stop): RoutePoint {
  return { kind: "stop", label: s.name, lat: s.lat, lon: s.lon, query: placeQuery(plan.area, s) };
}

/** The night as a route point, or null when neither a name nor a position is set. */
export function sleepPoint(plan: Plan, d: Day): RoutePoint | null {
  const s = d.sleep;
  if (!s.name.trim() && !hasCoords(s)) return null;
  return { kind: "night", label: s.name, lat: s.lat, lon: s.lon, query: placeQuery(plan.area, s) };
}

/** A day starts where the previous day ended: its night, else its last stop, else further back, else the trip start. */
export function dayStart(plan: Plan, di: number, home: Home | null): RoutePoint {
  for (let i = di - 1; i >= 0; i--) {
    const d = plan.days[i];
    const night = sleepPoint(plan, d);
    if (night) return night;
    if (d.stops.length) return stopPoint(plan, d.stops[d.stops.length - 1]);
  }
  return startPoint(plan, home);
}

/** Start, every stop, then the night (when set): consecutive pairs are the day's legs. */
export function dayPoints(plan: Plan, di: number, home: Home | null): RoutePoint[] {
  const d = plan.days[di];
  const pts = [dayStart(plan, di, home), ...d.stops.map((s) => stopPoint(plan, s))];
  const night = sleepPoint(plan, d);
  if (night) pts.push(night);
  return pts;
}

/** Estimated driving for a day. `known` < `total` means some legs lack positions and are left out. */
export function dayStats(plan: Plan, di: number, home: Home | null): { km: number; hours: number; known: number; total: number } {
  const pts = dayPoints(plan, di, home);
  let km = 0, hours = 0, known = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1];
    if (hasCoords(a) && hasCoords(b)) {
      const e = estimateLeg(a as LatLon, b as LatLon);
      km += e.km; hours += e.hours; known++;
    }
  }
  return { km, hours, known, total: pts.length - 1 };
}

/** Totals for the trip summary. `knownLegs` < `legs` means the distance leaves out legs without positions. */
export function tripStats(plan: Plan, home: Home | null) {
  let km = 0, stops = 0, todos = 0, done = 0, knownLegs = 0, legs = 0;
  plan.days.forEach((d, di) => {
    const ds = dayStats(plan, di, home);
    km += ds.km; knownLegs += ds.known; legs += ds.total;
    stops += d.stops.filter((s) => s.kind === "stop").length;
    for (const s of d.stops) for (const x of s.todos) { todos++; if (x.done) done++; }
  });
  return { days: plan.days.length, stops, km, todos, done, knownLegs, legs };
}

/** Calendar date of day `i` (local time), or null when the trip has no start date. */
export function dayDate(startDate: string | null, i: number): Date | null {
  const m = String(startDate ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + i);
}

/** Index of the day that is today, or -1. */
export function todayIndex(plan: Plan, now = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  for (let i = 0; i < plan.days.length; i++) if (dayDate(plan.startDate, i)?.getTime() === today) return i;
  return -1;
}

/** Number on the first stop of day `di`: stops are numbered through the whole trip like road signs. Vias get none. */
export function firstStopNumber(plan: Plan, di: number): number {
  let n = 1;
  for (let i = 0; i < di; i++) n += plan.days[i].stops.filter((s) => s.kind === "stop").length;
  return n;
}

/** Sign number for each stop of day `di` (null for vias). */
export function stopNumbers(plan: Plan, di: number): (number | null)[] {
  let n = firstStopNumber(plan, di);
  return plan.days[di].stops.map((s) => (s.kind === "stop" ? n++ : null));
}

/** "10:20", "10 h 20 min", "10h", "620" (minutes) → minutes; "" → null; anything else → undefined. */
export function parseDuration(text: string): number | null | undefined {
  const s = text.trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[:.](\d{2})$/);
  if (m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d{1,2})\s*(?:h|t|tim|timmar)\.?)?\s*(?:(\d{1,3})\s*(?:m|min|minuter)\.?)?$/);
  if (m && (m[1] || m[2])) return Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0);
  if (/^\d{1,4}$/.test(s)) return Number(s);
  return undefined;
}

/** Minutes as "10:20" for the input. */
export const formatDuration = (min: number | null) => (min == null ? "" : `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`);

/**
 * Month (1–12) when the stop is outside its usual season on `date`, else null.
 * Unknown seasons or undated days never warn.
 */
export function closedMonth(stop: Pick<Stop, "openFrom" | "openTo">, date: Date | null): number | null {
  if (!date || !stop.openFrom || !stop.openTo) return null;
  const m = date.getMonth() + 1, f = stop.openFrom, o = stop.openTo;
  const open = f <= o ? m >= f && m <= o : m >= f || m <= o;
  return open ? null : m;
}
