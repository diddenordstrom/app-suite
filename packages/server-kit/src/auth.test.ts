import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import { setSignedCookie } from "hono/cookie";
import { describe, expect, it } from "vitest";
import { authTables, createAuth, groupsFromClaim, loadAuthConfig, safeReturnTo, type AuthConfig, type AuthEnv } from "./auth";

const DEFAULTS = { databasePath: "/data/app.db", publicUrl: "http://localhost:5173" };
const OIDC = { AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" };

/** An app with the shared tables, /api/auth and one route behind requireUser. */
function setup(config: AuthConfig) {
  const sqlite = new Database(":memory:");
  sqlite.exec(`create table users (id integer primary key autoincrement, sub text not null unique, email text, name text, created_at integer not null);
    create table sessions (id text primary key, user_id integer not null references users(id) on delete cascade, expires_at integer not null);`);
  const tables = authTables();
  const auth = createAuth(drizzle(sqlite, { schema: tables }), config, tables);
  const app = new Hono<AuthEnv>();
  app.route("/api/auth", auth.routes());
  app.get("/api/private", auth.requireUser, (c) => c.json(c.get("user")));
  app.get("/api/admin", auth.requireAdmin, (c) => c.json({ ok: true }));
  return { app, auth, sqlite };
}
/** A cookie signed like the app's own, for a session row or a groups claim a test plants. */
async function signed(secret: string, name: string, value: string) {
  const a = new Hono();
  a.get("/", async (c) => { await setSignedCookie(c, name, value, secret); return c.text("ok"); });
  return (await a.request("/")).headers.get("set-cookie")!.split(";")[0];
}
const me = async (app: Hono<AuthEnv>, cookie = "") => (await app.request("/api/auth/me", { headers: { cookie } })).json();

describe("loadAuthConfig", () => {
  it("defaults to dev locally and oidc in production", () => {
    expect(loadAuthConfig({}, DEFAULTS).authMode).toBe("dev");
    const prod = { NODE_ENV: "production", SESSION_SECRET: "x".repeat(32), ...OIDC };
    expect(loadAuthConfig(prod, DEFAULTS)).toMatchObject({ authMode: "oidc", production: true, demo: { enabled: false } });
  });
  it("refuses dev mode in production, a short secret, missing oidc settings and demo from the environment", () => {
    expect(() => loadAuthConfig({ NODE_ENV: "production", AUTH_MODE: "dev", SESSION_SECRET: "x".repeat(32) }, DEFAULTS)).toThrow();
    expect(() => loadAuthConfig({ NODE_ENV: "production", SESSION_SECRET: "short", ...OIDC }, DEFAULTS)).toThrow();
    expect(() => loadAuthConfig({ AUTH_MODE: "oidc" }, DEFAULTS)).toThrow();
    expect(() => loadAuthConfig({ AUTH_MODE: "demo" }, DEFAULTS)).toThrow();
  });
  it("strips a trailing slash from the public URL", () => {
    expect(loadAuthConfig({ PUBLIC_URL: "https://x.dev/" }, DEFAULTS).publicUrl).toBe("https://x.dev");
  });
});

describe("safeReturnTo", () => {
  it("keeps same-site paths and sends everything else to /", () => {
    expect(safeReturnTo("/join/abc?auto=1")).toBe("/join/abc?auto=1");
    for (const bad of [undefined, "", "https://evil.example", "//evil.example", "/\\evil.example", 42]) expect(safeReturnTo(bad)).toBe("/");
  });
});

describe("createAuth", () => {
  it("goes back to a same-site returnTo after login, never another origin", async () => {
    const { app } = setup(loadAuthConfig({}, DEFAULTS));
    const login = (to: string) => app.request(`/api/auth/login?returnTo=${encodeURIComponent(to)}`);
    expect((await login("/join/abc?auto=1")).headers.get("location")).toBe("/join/abc?auto=1");
    expect((await login("//evil.example")).headers.get("location")).toBe("/");
  });

  it("signs in the dev user in dev mode, and acts signed out after logout until login", async () => {
    const { app } = setup(loadAuthConfig({}, DEFAULTS));
    expect(await me(app)).toMatchObject({ authMode: "dev", user: { sub: "dev-user" } });
    const out = await app.request("/api/auth/logout", { method: "POST" });
    const anon = out.headers.get("set-cookie")!.split(";")[0];
    expect(await me(app, anon)).toEqual({ authMode: "dev", user: null, isAdmin: false });
    expect((await app.request("/api/private", { headers: { cookie: anon } })).status).toBe(401);
    const back = await app.request("/api/auth/login", { headers: { cookie: anon } });
    expect(back.headers.get("location")).toBe("/");
    expect(back.headers.get("set-cookie")).toContain("dev_anon=;");
  });

  it("has one fixed demo user in demo mode", async () => {
    const { app, auth } = setup({ ...loadAuthConfig({}, DEFAULTS), authMode: "demo" });
    const user = auth.demoUser();
    expect(user).toMatchObject({ sub: "demo-user", name: "Demo" });
    expect(await (await app.request("/api/private")).json()).toEqual(user);
    expect((await app.request("/api/auth/login")).headers.get("location")).toBe("/");
  });

  it("needs a session in oidc mode and ignores a made-up cookie", async () => {
    const { app } = setup(loadAuthConfig(OIDC, DEFAULTS));
    expect(await me(app)).toEqual({ authMode: "oidc", user: null, isAdmin: false });
    expect((await app.request("/api/private", { headers: { cookie: "sid=abc" } })).status).toBe(401);
  });
});

describe("admin group", () => {
  it("makes the dev user an admin and nobody in a demo", async () => {
    const dev = setup(loadAuthConfig({}, DEFAULTS));
    expect(await me(dev.app)).toMatchObject({ isAdmin: true });
    expect((await dev.app.request("/api/admin")).status).toBe(200);
    const demo = setup({ ...loadAuthConfig({}, DEFAULTS), authMode: "demo" });
    expect(await me(demo.app)).toMatchObject({ isAdmin: false });
    expect((await demo.app.request("/api/admin")).status).toBe(403);
  });

  it("reads the groups the provider sent at sign-in, for the same user only, in the configured group", async () => {
    const config = loadAuthConfig({ ...OIDC, ADMIN_GROUP: "owners" }, DEFAULTS);
    const { app, sqlite } = setup(config);
    sqlite.exec("insert into users (id, sub, created_at) values (1, 'alice', 0), (2, 'bob', 0);" +
      ` insert into sessions (id, user_id, expires_at) values ('a', 1, ${Date.now() + 1e6}), ('b', 2, ${Date.now() + 1e6});`);
    const as = async (sid: string, sub: string, groups: unknown) =>
      `${await signed(config.sessionSecret, "sid", sid)}; ${await signed(config.sessionSecret, "grp", JSON.stringify({ sub, groups }))}`;
    const status = async (cookie: string) => (await app.request("/api/admin", { headers: { cookie } })).status;
    expect(await status(await as("a", "alice", ["owners", "other"]))).toBe(200);
    expect(await status(await as("a", "alice", ["admin"]))).toBe(403);
    expect(await status(await as("a", "alice", []))).toBe(403);
    // Alice's groups on Bob's session don't make Bob an admin.
    expect(await status(await as("b", "alice", ["owners"]))).toBe(403);
    // A groups cookie that isn't signed by the app counts for nothing.
    expect(await status(`${await signed(config.sessionSecret, "sid", "a")}; grp=${encodeURIComponent(JSON.stringify({ sub: "alice", groups: ["owners"] }))}`)).toBe(403);
    expect((await app.request("/api/admin")).status).toBe(401);
  });

  it("reads group names from a claim of names or of objects", () => {
    expect(groupsFromClaim(["admin", "users"])).toEqual(["admin", "users"]);
    expect(groupsFromClaim([{ name: "admin" }, { id: 3 }, 7])).toEqual(["admin"]);
    expect(groupsFromClaim("admin")).toBeNull();
    expect(groupsFromClaim(undefined)).toBeNull();
  });
});

