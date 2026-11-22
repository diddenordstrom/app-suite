import crypto from "node:crypto";
import type { Context } from "hono";

/** Thrown from handlers; app.onError turns it into `{ error }` with the status. */
export class ApiError extends Error {
  constructor(public status: 400 | 401 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

export const badRequest = (msg: string) => new ApiError(400, msg);
export const forbidden = (msg = "forbidden") => new ApiError(403, msg);
export const notFound = (msg = "not found") => new ApiError(404, msg);
export const conflict = (msg: string) => new ApiError(409, msg);

export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export type Body = Record<string, unknown>;

export async function readBody(c: Context): Promise<Body> {
  let v: unknown;
  try {
    v = await c.req.json();
  } catch {
    throw badRequest("invalid JSON body");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw badRequest("body must be an object");
  return v as Body;
}

/** Route param as a positive integer id, else 404. */
export function idParam(c: Context, name: string): number {
  const n = Number(c.req.param(name));
  if (!Number.isSafeInteger(n) || n <= 0) throw notFound();
  return n;
}

/** Required, trimmed, non-empty string. */
export function str(b: Body, key: string, max = 200): string {
  const v = b[key];
  if (typeof v !== "string" || !v.trim()) throw badRequest(`${key} is required`);
  if (v.trim().length > max) throw badRequest(`${key} is too long`);
  return v.trim();
}

/** Optional string: undefined when absent, null when null/blank. */
export function optStr(b: Body, key: string, max = 200): string | null | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string") throw badRequest(`${key} must be a string`);
  if (v.trim().length > max) throw badRequest(`${key} is too long`);
  return v.trim() || null;
}

export function int(v: unknown, key: string, min = 0): number {
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min) throw badRequest(`${key} must be an integer >= ${min}`);
  return v;
}

export function oneOf<T extends string>(v: unknown, key: string, allowed: readonly T[]): T {
  if (!allowed.includes(v as T)) throw badRequest(`${key} must be one of ${allowed.join(", ")}`);
  return v as T;
}

export function arr(v: unknown, key: string, max = 500): unknown[] {
  if (!Array.isArray(v)) throw badRequest(`${key} must be an array`);
  if (v.length > max) throw badRequest(`${key} has too many entries`);
  return v;
}


/** Optional free text: undefined when absent, "" when null/blank. For NOT NULL text columns. */
export function optText(b: Body, key: string, max = 500): string | undefined {
  const v = optStr(b, key, max);
  return v === undefined ? undefined : (v ?? "");
}

/**
 * Optional position from `${prefix}Lat`/`${prefix}Lon` (or lat/lon): undefined when both absent,
 * null when both null, else a valid pair. One without the other is a 400.
 */
export function optLatLon(b: Body, latKey = "lat", lonKey = "lon"): { lat: number | null; lon: number | null } | undefined {
  const lat = b[latKey], lon = b[lonKey];
  if (lat === undefined && lon === undefined) return undefined;
  if (lat === null && lon === null) return { lat: null, lon: null };
  if (typeof lat !== "number" || typeof lon !== "number" || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180)
    throw badRequest(`${latKey} and ${lonKey} must be a valid position or both null`);
  return { lat, lon };
}

/** Optional month 1–12 or null. */
export function optMonth(b: Body, key: string): number | null | undefined {
  const v = b[key];
  if (v === undefined || v === null) return v as undefined | null;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1 || v > 12) throw badRequest(`${key} must be a month 1-12 or null`);
  return v;
}

/** Optional "YYYY-MM-DD" (a real date) or null. */
export function optDate(b: Body, key: string): string | null | undefined {
  const v = b[key];
  if (v === undefined || v === null) return v as undefined | null;
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)))
    throw badRequest(`${key} must be YYYY-MM-DD or null`);
  return v;
}

export function optBool(b: Body, key: string): boolean | undefined {
  const v = b[key];
  if (v === undefined) return undefined;
  if (typeof v !== "boolean") throw badRequest(`${key} must be true or false`);
  return v;
}
