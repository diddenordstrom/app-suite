/**
 * Links out to Google Maps and yr.no. The app plans; real maps, routing and weather live there.
 * Search words are Swedish because that is what the travellers type and read.
 */
import { hasCoords, midpoint, type LatLon } from "./geo";
import { dayStart, sleepPoint, startPoint, stopPoint, type Home, type Plan, type RoutePoint } from "./plan";

/** Google Maps directions take at most 9 waypoints in a URL. */
export const MAX_WAYPOINTS = 9;

/** Driving directions. An empty origin lets Google Maps use the device's location. */
export function directionsUrl(origin: string, destination: string, waypoints: string[] = []): string {
  let u = `https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=${encodeURIComponent(destination)}`;
  if (origin) u += `&origin=${encodeURIComponent(origin)}`;
  if (waypoints.length) u += `&waypoints=${encodeURIComponent(waypoints.slice(0, MAX_WAYPOINTS).join("|"))}`;
  return u;
}

/** Search for something around a place: a map view at the position, else a text search "… nära <name> <area>". */
export function nearbyUrl(query: string, near: { lat?: number | null; lon?: number | null; name?: string }, area: string, zoom = 13): string {
  if (hasCoords(near)) return `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${near.lat},${near.lon},${zoom}z`;
  const q = `${query} nära ${near.name ?? ""}${area ? ` ${area}` : ""}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Plain place search, used to find a stop that has no position yet. */
export function placeSearchUrl(name: string, area: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name + (area ? `, ${area}` : ""))}`;
}

/** What "find nearby" and "along the way" offer: a key for the client's label and the search words. */
export const NEARBY = [
  { key: "fika", query: "kafé bageri" },
  { key: "food", query: "restaurang" },
  { key: "camping", query: "camping" },
  { key: "restArea", query: "rastplats" },
  { key: "fuel", query: "bensinstation laddstation" },
  { key: "grocery", query: "matbutik" },
] as const;
export type NearbyKey = (typeof NEARBY)[number]["key"];

/** Where to look for a night: shown under each day's sleep block. */
export const SLEEP_SEARCHES = [
  { key: "camping", query: "camping" },
  { key: "hostel", query: "vandrarhem hostel" },
  { key: "hotel", query: "hotell" },
] as const;

/** Directions for one leg. */
export const legUrl = (from: RoutePoint, to: RoutePoint) => directionsUrl(from.query, to.query);

/** Searches near the middle of a leg; null unless both ends have positions. */
export function alongTheWay(from: RoutePoint, to: RoutePoint, area: string): { key: NearbyKey; url: string }[] | null {
  if (!hasCoords(from) || !hasCoords(to)) return null;
  const mid = midpoint(from as LatLon, to as LatLon);
  return NEARBY.map((n) => ({ key: n.key, url: nearbyUrl(n.query, mid, area, 9) }));
}

/** The day's whole route: start → stops → night (or the last stop). Null for a day with nothing on it. */
export function dayRouteUrl(plan: Plan, di: number, home: Home | null): string | null {
  const d = plan.days[di];
  const from = dayStart(plan, di, home);
  const stops = d.stops.map((s) => stopPoint(plan, s).query);
  const night = sleepPoint(plan, d);
  if (night) return directionsUrl(from.query, night.query, stops);
  if (!stops.length) return null;
  return directionsUrl(from.query, stops[stops.length - 1], stops.slice(0, -1));
}

/** The whole trip in one link. Google Maps keeps only the first 9 waypoints. */
export function tripRouteUrl(plan: Plan, home: Home | null): string | null {
  const seq: string[] = [];
  for (const d of plan.days) {
    for (const s of d.stops) seq.push(stopPoint(plan, s).query);
    const night = sleepPoint(plan, d);
    if (night) seq.push(night.query);
  }
  if (!seq.length) return null;
  return directionsUrl(startPoint(plan, home).query, seq[seq.length - 1], seq.slice(0, -1));
}

/**
 * Weather for the day, at the night if it has a position, else the last positioned stop:
 * a yr.no forecast with coordinates, else a web search by name. Null for an empty day.
 */
export function weatherLink(plan: Plan, di: number): { kind: "yr" | "search"; url: string } | null {
  const d = plan.days[di];
  const night = sleepPoint(plan, d);
  const candidates = [...(night ? [night] : []), ...d.stops.map((s) => stopPoint(plan, s)).reverse()];
  const at = candidates.find((c) => hasCoords(c));
  if (at) return { kind: "yr", url: `https://www.yr.no/en/forecast/daily-table/${at.lat!.toFixed(4)},${at.lon!.toFixed(4)}` };
  const name = candidates[0]?.label;
  if (!name) return null;
  return { kind: "search", url: `https://www.google.com/search?q=${encodeURIComponent(`väder ${name}${plan.area ? ` ${plan.area}` : ""}`)}` };
}
