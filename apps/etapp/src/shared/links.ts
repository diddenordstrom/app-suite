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

/**
 * "Find around here" on a stop: sights and nature, not only services. Google Maps searches work by name or position;
 * the others need a position and open the service's own map there. None needs an API key: they are plain links.
 */
export const DISCOVER = [
  { key: "sights", query: "sevärdheter" },
  { key: "viewpoints", query: "utsiktsplats" },
  { key: "hikes" },
  { key: "birds" },
  { key: "food", query: "restaurang kafé" },
  { key: "tent" },
] as const;
export type DiscoverKey = (typeof DISCOVER)[number]["key"];

/** Links for a place; entries that need a position are left out when it has none. */
export function discoverLinks(place: { lat?: number | null; lon?: number | null; name: string }, area: string): { key: DiscoverKey; url: string }[] {
  const out: { key: DiscoverKey; url: string }[] = [];
  const ll = hasCoords(place) ? { lat: place.lat!.toFixed(4), lon: place.lon!.toFixed(4) } : null;
  for (const d of DISCOVER) {
    if ("query" in d) out.push({ key: d.key, url: nearbyUrl(d.query, place, area, 12) });
    else if (!ll) continue;
    else if (d.key === "hikes") out.push({ key: d.key, url: `https://ut.no/kart#12/${ll.lat}/${ll.lon}` });
    else if (d.key === "birds") out.push({ key: d.key, url: ebirdHotspotsUrl(place.lat!, place.lon!) });
    else if (d.key === "tent") out.push({ key: d.key, url: `https://park4night.com/en/search?lat=${ll.lat}&lng=${ll.lon}&z=12` });
  }
  return out;
}

/**
 * eBird's hotspot explorer around a position. eBird's map pages take the visible area as a box
 * (env.minX/minY/maxX/maxY in degrees), not a centre point; this one is roughly 30 × 30 km.
 */
export function ebirdHotspotsUrl(lat: number, lon: number): string {
  const dLat = 0.15, dLon = 0.15 / Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const f = (n: number) => n.toFixed(4);
  return `https://ebird.org/hotspots?env.minX=${f(lon - dLon)}&env.minY=${f(lat - dLat)}&env.maxX=${f(lon + dLon)}&env.maxY=${f(lat + dLat)}`;
}

/** Which service a saved inspiration link points at, for its icon and label. */
export function linkSource(url: string): "youtube" | "reddit" | "instagram" | "maps" | "web" {
  let host: string;
  try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { return "web"; }
  if (host === "youtu.be" || host.endsWith("youtube.com")) return "youtube";
  if (host.endsWith("reddit.com") || host === "redd.it") return "reddit";
  if (host.endsWith("instagram.com")) return "instagram";
  if (host.startsWith("maps.") || host === "goo.gl" || /google\.[a-z.]+$/.test(host) && url.includes("/maps")) return "maps";
  return "web";
}
