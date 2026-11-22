export interface Coordinates {
  latitude: number;
  longitude: number;
}

const SWEDEN_BOUNDS = {
  minLat: 55.2,
  maxLat: 69.1,
  minLng: 10.9,
  maxLng: 24.2,
};

/**
 * Estimates Swedish growing zone (1–8) from GPS coordinates.
 * Uses latitude bands with adjustments for islands, mountains, and northern coast.
 * Returns null if the coordinates fall outside Sweden.
 */
export function detectGrowingZone(coords: Coordinates): number | null {
  const { latitude, longitude } = coords;

  if (!isWithinSweden(latitude, longitude)) return null;
  if (isGotland(latitude, longitude)) return 1;
  if (isOland(latitude, longitude)) return 1;

  let zone = baseZoneFromLatitude(latitude);
  if (isMountainArea(latitude, longitude)) zone += 2;
  if (isNorthernCoast(latitude, longitude)) zone -= 1;

  return clamp(zone, 1, 8);
}

function isWithinSweden(lat: number, lng: number): boolean {
  if (lat < SWEDEN_BOUNDS.minLat || lat > SWEDEN_BOUNDS.maxLat) return false;
  if (lng < SWEDEN_BOUNDS.minLng || lng > SWEDEN_BOUNDS.maxLng) return false;
  // Southern Sweden narrows — exclude Danish side of Öresund
  if (lat < 56.5 && lng < 12.6) return false;
  return true;
}

function isGotland(lat: number, lng: number): boolean {
  return lat > 56.9 && lat < 58.0 && lng > 18.0 && lng < 19.4;
}

function isOland(lat: number, lng: number): boolean {
  return lat > 56.2 && lat < 57.4 && lng > 16.5 && lng < 17.2;
}

function baseZoneFromLatitude(lat: number): number {
  if (lat < 56.5) return 1;
  if (lat < 57.8) return 2;
  if (lat < 59.8) return 3;
  if (lat < 61.0) return 4;
  if (lat < 62.5) return 5;
  if (lat < 65.0) return 6;
  if (lat < 66.5) return 7;
  return 8;
}

function isMountainArea(lat: number, lng: number): boolean {
  return (lat >= 62 && lat < 66 && lng < 14) || (lat >= 66 && lng < 16);
}

function isNorthernCoast(lat: number, lng: number): boolean {
  return (lat > 62.5 && lat <= 65 && lng > 18.5) || (lat > 65 && lng > 21);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
