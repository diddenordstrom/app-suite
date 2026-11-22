import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createDemo } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { trips } from "./db/schema";
import { openDemo } from "./demo";
import type { MeResponse } from "../shared/api";

const ORIGIN = "http://localhost:5173";
const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "etapp-demo-"));
  dirs.push(dir);
  const uploads = path.join(dir, "real-uploads");
  const config = { ...loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv), uploadsDir: uploads };
  const realDb = createDb(":memory:");
  const app = new Hono();
  createDemo({ dir: path.join(dir, "demo"), secret: config.sessionSecret, secure: false, open: (file, fresh) => openDemo(file, fresh, config) }).mount(app);
  app.route("/", createApp(realDb, config));
  return { app, realDb, uploads };
}

async function start(app: Hono) {
  const r = await app.request("/demo", { headers: { "cf-connecting-ip": "9.9.9.9" } });
  expect(r.headers.get("location")).toBe("/");
  return r.headers.get("set-cookie")!.split(";")[0];
}

describe("etapp demo", () => {
  it("gives a visitor the demo trip in their own database and never touches the real one", async () => {
    const { app, realDb } = setup();
    const cookie = await start(app);
    const me = (await (await app.request("/api/me", { headers: { cookie } })).json()) as MeResponse;
    expect(me.authMode).toBe("demo");
    expect(me.trips.map((t) => t.name)).toEqual(["Bilresa Norge"]);
    expect((await app.request(`/api/t/${me.trips[0].id}/plan`, { headers: { cookie } })).status).toBe(200);
    expect(realDb.select({ n: sql<number>`count(*)` }).from(trips).get()!.n).toBe(0);
  });

  it("refuses photo uploads in the demo, so nothing lands in the real uploads", async () => {
    const { app, uploads } = setup();
    const cookie = await start(app);
    const me = (await (await app.request("/api/me", { headers: { cookie } })).json()) as MeResponse;
    const tid = me.trips[0].id;
    const plan = (await (await app.request(`/api/t/${tid}/plan`, { headers: { cookie } })).json()) as { days: { id: number }[] };
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const r = await app.request(`/api/t/${tid}/days/${plan.days[0].id}/photo`, { method: "PUT", body: png, headers: { cookie, origin: ORIGIN, "content-type": "image/png" } });
    expect(r.status).toBe(403);
    expect(fs.existsSync(uploads)).toBe(false);
  });
});
