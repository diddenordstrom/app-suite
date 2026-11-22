import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDemo } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb, type Db } from "./db";
import * as t from "./db/schema";
import { openDemo } from "./demo";

const ORIGIN = "http://localhost:5173";
const count = (db: Db, tbl: typeof t.users | typeof t.activities) => db.select({ n: sql<number>`count(*)` }).from(tbl).get()!.n;
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/** The real app needs a login (oidc), like in production; demo visitors get their own file. */
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fartlek-demo-"));
  dirs.push(dir);
  const config = loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv);
  const realDb = createDb(":memory:");
  const app = new Hono();
  createDemo({ dir, secret: config.sessionSecret, secure: false, open: (file, fresh) => openDemo(file, fresh, config) }).mount(app);
  app.route("/", createApp(realDb, config));
  const start = async () => {
    const r = await app.request("/demo", { headers: { "cf-connecting-ip": "9.9.9.9" } });
    return { location: r.headers.get("location"), cookie: r.headers.get("set-cookie")!.split(";")[0] };
  };
  return { app, realDb, dir, start };
}

describe("fartlek demo", () => {
  it("fills a visitor's own database and never touches the real one", async () => {
    const { app, realDb, dir, start } = setup();
    const { cookie, location } = await start();
    expect(location).toBe("/");
    const me = await (await app.request("/api/auth/me", { headers: { cookie } })).json();
    expect(me).toMatchObject({ authMode: "demo", user: { name: "Demo" } });
    const home = await app.request("/api/home", { headers: { cookie } });
    expect(home.status).toBe(200);
    const [file] = fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
    expect(count(createDb(path.join(dir, file)), t.activities)).toBeGreaterThan(50);
    expect(count(realDb, t.users)).toBe(0);
  });

  it("leaves visitors without the cookie to the real app", async () => {
    const { app } = setup();
    expect(await (await app.request("/api/auth/me")).json()).toEqual({ user: null, authMode: "oidc", isAdmin: false });
    expect((await app.request("/api/home")).status).toBe(401);
  });

  it("does not take Garmin keys in the demo", async () => {
    const { app, start } = setup();
    const { cookie } = await start();
    const r = await app.request("/api/garmin", { method: "PUT", body: JSON.stringify({ apiKey: "abcdefghijkl" }), headers: { cookie, origin: ORIGIN, "content-type": "application/json" } });
    expect(r.status).toBe(403);
  });
});
