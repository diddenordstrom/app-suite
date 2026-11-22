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

export function currency(v: unknown): string {
  if (typeof v !== "string" || !/^[A-Za-z]{3}$/.test(v)) throw badRequest("currency must be a 3-letter code");
  return v.toUpperCase();
}
