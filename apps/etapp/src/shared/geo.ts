/** Coordinates and rough driving estimates. Pure, no I/O. */

export interface LatLon { lat: number; lon: number }
/** Anything that may or may not have a position (stops and nights are often added by name first). */
export interface MaybeCoords { lat?: number | null; lon?: number | null }

export function hasCoords(p: MaybeCoords | null | undefined): p is LatLon {
  return !!p && typeof p.lat === "number" && typeof p.lon === "number" && Number.isFinite(p.lat) && Number.isFinite(p.lon);
}

const validLatLon = (lat: number, lon: number) => Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

/** "61.8366, 8.5667" (comma, semicolon or space between) → LatLon. Null when the text is anything else. */
export function parseLatLon(s: string | null | undefined): LatLon | null {
  const m = String(s ?? "").trim().match(/^(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return validLatLon(lat, lon) ? { lat, lon } : null;
}

/** Four decimals (about 10 m), the form the position fields show. Empty without a position. */
export function formatLatLon(p: MaybeCoords | null | undefined): string {
  return hasCoords(p) ? `${p.lat.toFixed(4)}, ${p.lon.toFixed(4)}` : "";
}

/** Great-circle distance in km. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const R = 6371, r = Math.PI / 180;
  const dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Roads wind: straight-line distance times this is a fair guess at road distance. */
export const ROAD_FACTOR = 1.3;
/** Average speed including slow mountain roads and ferries, km/h. */
export const AVG_KMH = 70;

/** Rough road distance and driving time. Google Maps gives the real numbers. */
export function estimateLeg(a: LatLon, b: LatLon): { km: number; hours: number } {
  const km = haversineKm(a, b) * ROAD_FACTOR;
  return { km, hours: km / AVG_KMH };
}

/** Distance as shown: nearest 5 km, at least 5. */
export const roundKm = (km: number) => Math.max(5, Math.round(km / 5) * 5);

/** Driving time as shown: nearest 15 minutes, at least 15. */
export const roundMinutes = (hours: number) => Math.max(15, Math.round((hours * 60) / 15) * 15);

export const midpoint = (a: LatLon, b: LatLon): LatLon => ({ lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 });

/**
 * Pull a position out of a pasted Google Maps URL. Long URLs carry it as `@lat,lon`, `!3dlat!4dlon` or `?q=lat,lon`.
 * Returns "short" for maps.app.goo.gl / goo.gl links, which carry no coordinates at all.
 */
export function coordsFromMapsUrl(url: string): LatLon | "short" | null {
  if (/^https?:\/\/(maps\.app\.goo\.gl|goo\.gl)\//i.test(url)) return "short";
  const m = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
    ?? url.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/)
    ?? url.match(/[?&](?:q|query|ll)=(-?\d+\.\d+)(?:,|%2C)(-?\d+\.\d+)/i);
  if (!m) return null;
  const lat = Number(m[1]), lon = Number(m[2]);
  return validLatLon(lat, lon) ? { lat, lon } : null;
}
