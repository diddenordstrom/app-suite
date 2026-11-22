import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import * as oidc from "openid-client";
import { demoConfig } from "./demo";

/**
 * Sign-in shared by the apps: Pocket ID over OIDC (`oidc`), a fixed fake user for local work (`dev`), and the
 * fixed demo user of an instance serving one demo visitor's own database (`demo`, see ./demo.ts). Sessions are
 * server-side rows; the cookie holds a signed random id.
 */

export type AuthMode = "dev" | "oidc" | "demo";
export interface AuthUser { id: number; sub: string; email: string | null; name: string | null }

/** Pocket ID's `groups` claim lists the user's group names; objects with a name are read too, anything else is not a group claim. */
export function groupsFromClaim(v: unknown): string[] | null {
  if (!Array.isArray(v)) return null;
  return v.flatMap((g) => (typeof g === "string" ? [g] : g && typeof (g as { name?: unknown }).name === "string" ? [(g as { name: string }).name] : []));
}
export type AuthEnv = { Variables: { user: AuthUser } };

export interface AuthConfig {
  /** "demo" is never read from the environment: it marks an instance serving one demo visitor's own database. */
  authMode: AuthMode;
  sessionSecret: string;
  publicUrl: string;
  oidc: { issuer: string; clientId: string; clientSecret: string };
  production: boolean;
  /** Demo mode: visitors without an account get their own throwaway database (docs/decisions/demo-mode.md). */
  demo: { enabled: boolean; dir: string };
  /** The Pocket ID user group that counts as admin (`ADMIN_GROUP`). Dev mode is always admin, demo never. */
  adminGroup: string;
}

/** The sign-in part of an app's config, from the environment. Refuses dev mode in production and a weak session secret. */
export function loadAuthConfig(env: NodeJS.ProcessEnv, defaults: { databasePath: string; publicUrl: string }): AuthConfig {
  const production = env.NODE_ENV === "production";
  const authMode = env.AUTH_MODE ?? (production ? "oidc" : "dev");
  if (authMode !== "dev" && authMode !== "oidc") throw new Error("AUTH_MODE must be dev or oidc");
  if (production && authMode === "dev") throw new Error("AUTH_MODE=dev is not allowed in production");
  if (production && (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32))
    throw new Error("SESSION_SECRET (>= 32 chars) is required in production");
  const cfg: AuthConfig = {
    authMode,
    sessionSecret: env.SESSION_SECRET ?? "dev-secret",
    publicUrl: (env.PUBLIC_URL ?? defaults.publicUrl).replace(/\/$/, ""),
    oidc: { issuer: env.OIDC_ISSUER ?? "", clientId: env.OIDC_CLIENT_ID ?? "", clientSecret: env.OIDC_CLIENT_SECRET ?? "" },
    production,
    adminGroup: env.ADMIN_GROUP?.trim() || "admin",
    demo: demoConfig(env, env.DATABASE_PATH ?? defaults.databasePath, production),
  };
  if (authMode === "oidc" && (!cfg.oidc.issuer || !cfg.oidc.clientId))
    throw new Error("OIDC_ISSUER and OIDC_CLIENT_ID are required when AUTH_MODE=oidc");
  return cfg;
}

/** A same-site path to go back to after login, never another origin; "/" for anything else. */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  return value;
}

/** The users and sessions tables; every app exports these from its schema so its migrations include them. */
export function authTables() {
  const users = sqliteTable("users", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sub: text("sub").notNull().unique(),
    email: text("email"),
    name: text("name"),
    createdAt: integer("created_at").notNull(),
  });
  const sessions = sqliteTable("sessions", {
    id: text("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
  });
  return { users, sessions };
}
type Tables = ReturnType<typeof authTables>;

const SESSION_COOKIE = "sid";
const FLOW_COOKIE = "oidc_flow";
/** The groups the identity provider sent at sign-in, signed with the user's `sub` so another user's cookie never counts. */
const GROUPS_COOKIE = "grp";
/** Makes dev mode act signed out, so flows for people without an account can be tried locally. */
const DEV_ANON_COOKIE = "dev_anon";
const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const DEV_USER = { sub: "dev-user", email: "dev@example.com", name: "Dev User" };
const DEMO_USER = { sub: "demo-user", email: null, name: "Demo" };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createAuth(db: BetterSQLite3Database<any>, config: AuthConfig, { users, sessions }: Tables) {
  function upsertUser(p: { sub: string; email?: string | null; name?: string | null }): AuthUser {
    db.insert(users)
      .values({ sub: p.sub, email: p.email ?? null, name: p.name ?? null, createdAt: Date.now() })
      .onConflictDoUpdate({ target: users.sub, set: { email: p.email ?? null, name: p.name ?? null } })
      .run();
    const row = db.select().from(users).where(eq(users.sub, p.sub)).get()!;
    return { id: row.id, sub: row.sub, email: row.email, name: row.name };
  }

  function createSession(userId: number): string {
    const id = crypto.randomBytes(32).toString("hex");
    db.insert(sessions).values({ id, userId, expiresAt: Date.now() + SESSION_TTL_MS }).run();
    return id;
  }

  function userFromSession(sid: string | undefined | false): AuthUser | null {
    if (!sid) return null;
    const row = db.select({ s: sessions, u: users }).from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId)).where(eq(sessions.id, sid)).get();
    if (!row) return null;
    if (row.s.expiresAt < Date.now()) {
      db.delete(sessions).where(eq(sessions.id, sid)).run();
      return null;
    }
    return { id: row.u.id, sub: row.u.sub, email: row.u.email, name: row.u.name };
  }

  /** The one user of a demo database; also what demo data is seeded for. */
  const demoUser = () => upsertUser(DEMO_USER);

  /** The signed-in user, or null. */
  async function currentUser(c: Context): Promise<AuthUser | null> {
    if (config.authMode === "demo") return demoUser();
    if (config.authMode === "dev") return getCookie(c, DEV_ANON_COOKIE) ? null : upsertUser(DEV_USER);
    return userFromSession(await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE));
  }

  /** For routes that need a signed-in user: 401 otherwise, and `c.get("user")` inside. */
  const requireUser = createMiddleware<AuthEnv>(async (c, next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    c.set("user", user);
    await next();
  });

  /** Groups of the signed-in user: from the identity provider at sign-in (oidc), everything in dev, nothing in a demo. */
  async function groupsOf(c: Context, user: AuthUser): Promise<string[]> {
    if (config.authMode === "dev") return [config.adminGroup];
    if (config.authMode === "demo") return [];
    const raw = await getSignedCookie(c, config.sessionSecret, GROUPS_COOKIE);
    if (!raw) return [];
    try {
      const v = JSON.parse(raw) as { sub?: unknown; groups?: unknown };
      return v.sub === user.sub ? groupsFromClaim(v.groups) ?? [] : [];
    } catch { return []; }
  }
  const isAdmin = async (c: Context, user: AuthUser) => (await groupsOf(c, user)).includes(config.adminGroup);

  /** For routes only an admin may use: 401 without a user, 403 for a user outside the admin group. */
  const requireAdmin = createMiddleware<AuthEnv>(async (c, next) => {
    const user = await currentUser(c);
    if (!user) return c.json({ error: "unauthorized" }, 401);
    if (!(await isAdmin(c, user))) return c.json({ error: "forbidden" }, 403);
    c.set("user", user);
    await next();
  });

  /** Mount at /api/auth: me, login, callback, logout. Ending a demo and leaving it to sign in are handled by ./demo.ts. */
  function routes() {
    const app = new Hono();
    const redirectUri = `${config.publicUrl}/api/auth/callback`;
    let oidcConfig: Promise<oidc.Configuration> | undefined;
    const getOidc = () =>
      (oidcConfig ??= oidc.discovery(
        new URL(config.oidc.issuer),
        config.oidc.clientId,
        config.oidc.clientSecret || undefined,
        config.oidc.clientSecret ? undefined : oidc.None(),
      ));
    const cookieOpts = { httpOnly: true, sameSite: "Lax" as const, secure: config.production, path: "/" };

    app.get("/me", async (c) => {
      const user = await currentUser(c);
      return c.json({ user, authMode: config.authMode, isAdmin: user ? await isAdmin(c, user) : false });
    });

    // `?returnTo=/some/path` comes back to that page after signing in (an invite link, say).
    app.get("/login", async (c) => {
      const returnTo = safeReturnTo(c.req.query("returnTo"));
      if (config.authMode !== "oidc") {
        deleteCookie(c, DEV_ANON_COOKIE, { path: "/" });
        return c.redirect(returnTo);
      }
      const cfg = await getOidc();
      const verifier = oidc.randomPKCECodeVerifier();
      const state = oidc.randomState();
      const url = oidc.buildAuthorizationUrl(cfg, {
        redirect_uri: redirectUri,
        scope: ["openid", "profile", "email", ...(cfg.serverMetadata().scopes_supported?.includes("groups") ? ["groups"] : [])].join(" "),
        code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
        code_challenge_method: "S256",
        state,
      });
      await setSignedCookie(c, FLOW_COOKIE, JSON.stringify({ verifier, state, returnTo }), config.sessionSecret, { ...cookieOpts, maxAge: 600 });
      return c.redirect(url.href);
    });

    app.get("/callback", async (c) => {
      if (config.authMode !== "oidc") return c.redirect("/");
      const raw = await getSignedCookie(c, config.sessionSecret, FLOW_COOKIE);
      if (!raw) return c.text("Login expired, try again", 400);
      const { verifier, state, returnTo } = JSON.parse(raw) as { verifier: string; state: string; returnTo?: string };
      deleteCookie(c, FLOW_COOKIE, { path: "/" });
      const cfg = await getOidc();
      const callbackUrl = new URL(redirectUri);
      callbackUrl.search = new URL(c.req.url).search;
      let tokens;
      try {
        tokens = await oidc.authorizationCodeGrant(cfg, callbackUrl, { pkceCodeVerifier: verifier, expectedState: state });
      } catch (err) {
        console.error("OIDC code exchange failed:", err instanceof Error ? `${err.message} ${JSON.stringify((err as { cause?: unknown }).cause ?? "")}` : err);
        return c.text("Login failed", 400);
      }
      const claims = tokens.claims();
      if (!claims) return c.text("Login failed", 400);
      const user = upsertUser({
        sub: claims.sub,
        email: typeof claims.email === "string" ? claims.email : null,
        name: typeof claims.name === "string" ? claims.name : typeof claims.preferred_username === "string" ? claims.preferred_username : null,
      });
      // Groups come in the ID token when the provider puts them there, else from the userinfo endpoint.
      let groups = groupsFromClaim(claims.groups);
      if (!groups) {
        try { groups = groupsFromClaim((await oidc.fetchUserInfo(cfg, tokens.access_token, claims.sub)).groups); } catch { groups = null; }
      }
      const maxAge = SESSION_TTL_MS / 1000;
      await setSignedCookie(c, SESSION_COOKIE, createSession(user.id), config.sessionSecret, { ...cookieOpts, maxAge });
      await setSignedCookie(c, GROUPS_COOKIE, JSON.stringify({ sub: user.sub, groups: groups ?? [] }), config.sessionSecret, { ...cookieOpts, maxAge });
      return c.redirect(safeReturnTo(returnTo));
    });

    app.post("/logout", async (c) => {
      if (config.authMode === "dev") setCookie(c, DEV_ANON_COOKIE, "1", { ...cookieOpts });
      const sid = await getSignedCookie(c, config.sessionSecret, SESSION_COOKIE);
      if (sid) db.delete(sessions).where(eq(sessions.id, sid)).run();
      deleteCookie(c, SESSION_COOKIE, { path: "/" });
      deleteCookie(c, GROUPS_COOKIE, { path: "/" });
      return c.json({ ok: true });
    });

    return app;
  }

  return { currentUser, requireUser, requireAdmin, isAdmin, routes, demoUser, upsertUser };
}

export type Auth = ReturnType<typeof createAuth>;
