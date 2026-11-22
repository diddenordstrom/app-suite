import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AuthEnv } from "@homelab/server-kit";

export const router = () => new Hono<AuthEnv>();

export class BadRequest extends HTTPException {
  constructor(message: string) { super(400, { message }); }
}

export const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

export function date(v: unknown, name = "date"): string {
  if (!isDate(v)) throw new BadRequest(`${name} must be YYYY-MM-DD`);
  return v;
}

export function optNum(v: unknown, name: string, min: number, max: number): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < min || n > max) throw new BadRequest(`${name} must be between ${min} and ${max}`);
  return n;
}

export function num(v: unknown, name: string, min: number, max: number): number {
  const n = optNum(v, name, min, max);
  if (n === null) throw new BadRequest(`${name} is required`);
  return n;
}

export function optStr(v: unknown, name: string, max: number): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || v.length > max) throw new BadRequest(`${name} must be text up to ${max} characters`);
  return v.trim() || null;
}

export function oneOf<T extends string>(v: unknown, opts: readonly T[], name: string): T {
  if (typeof v !== "string" || !opts.includes(v as T)) throw new BadRequest(`${name} must be one of ${opts.join(", ")}`);
  return v as T;
}

export async function body(c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> {
  const b = await c.req.json().catch(() => null);
  if (!b || typeof b !== "object" || Array.isArray(b)) throw new BadRequest("JSON body required");
  return b as Record<string, unknown>;
}

export function idParam(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new BadRequest("bad id");
  return n;
}
