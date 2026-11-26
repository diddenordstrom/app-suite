import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import type { Config } from "./config";
import type { Db } from "./db";
import { memberships } from "./db/schema";
import type { Auth } from "@homelab/server-kit";
import { forbidden, notFound } from "./http";
import type { Member } from "../shared/api";
import type { User } from "../shared/types";

export type Membership = typeof memberships.$inferSelect;

export interface Viewer {
  user: User | null;
  /** Active memberships reachable via the OIDC user or the member-token cookie. */
  memberships: Membership[];
}

export type AppEnv = { Variables: { viewer: Viewer; member: Membership; hid: number } };

const MEMBER_COOKIE = "mtok";
const MEMBER_COOKIE_MAX_AGE = 400 * 24 * 3600;
const MAX_TOKENS = 50;

export async function readMemberTokens(c: Context, config: Config): Promise<string[]> {
  const raw = await getSignedCookie(c, config.sessionSecret, MEMBER_COOKIE);
  return raw ? raw.split(",").filter(Boolean) : [];
}

function activeByTokens(db: Db, tokens: string[]): Membership[] {
  if (tokens.length === 0) return [];
  return db.select().from(memberships).where(and(inArray(memberships.token, tokens), isNull(memberships.removedAt))).all();
}

/** Add a membership token to this device's cookie, dropping tokens that no longer resolve. */
export async function addMemberToken(c: Context, db: Db, config: Config, token: string): Promise<void> {
  const existing = await readMemberTokens(c, config);
  const live = new Set(activeByTokens(db, existing).map((m) => m.token));
  const tokens = [...existing.filter((t) => live.has(t) && t !== token), token].slice(-MAX_TOKENS);
  await setSignedCookie(c, MEMBER_COOKIE, tokens.join(","), config.sessionSecret, {
    httpOnly: true, sameSite: "Lax", secure: config.production, path: "/", maxAge: MEMBER_COOKIE_MAX_AGE,
  });
}

export function viewerMiddleware(db: Db, config: Config, auth: Auth) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = await auth.currentUser(c);
    const tokens = await readMemberTokens(c, config);
    const conds = [
      user ? eq(memberships.userId, user.id) : undefined,
      tokens.length ? inArray(memberships.token, tokens) : undefined,
    ].filter((x) => x !== undefined);
    const rows = conds.length
      ? db.select().from(memberships).where(and(isNull(memberships.removedAt), or(...conds))).orderBy(memberships.id).all()
      : [];
    c.set("viewer", { user, memberships: rows });
    await next();
  });
}

/** For /h/:hid/*: the viewer must be an active member of the household. */
export const householdMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const hid = Number(c.req.param("hid"));
  if (!Number.isSafeInteger(hid) || hid <= 0) throw notFound();
  const member = c.get("viewer").memberships.find((m) => m.householdId === hid);
  if (!member) throw forbidden("not a member of this household");
  c.set("hid", hid);
  c.set("member", member);
  await next();
});

export function requireAdmin(c: Context<AppEnv>): Membership {
  const m = c.get("member");
  if (m.role !== "admin") throw forbidden("admin only");
  return m;
}

export const toMember = (m: Membership): Member => ({
  id: m.id, name: m.name, role: m.role, swishNumber: m.swishNumber, removed: m.removedAt !== null, walletId: m.walletId, managed: m.managed,
});

export const recoveryUrl = (config: Config, token: string) => `${config.publicUrl}/api/recover/${token}`;
