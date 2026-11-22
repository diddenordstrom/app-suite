import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { createAuth, createDemo } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { households, sessions, users } from "./db/schema";
import { openDemo, seedKvittDemo } from "./demo";
import type { BalancesResponse, MeResponse } from "../shared/api";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kvitt-demo-"));
  dirs.push(dir);
  const config = loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv);
  const realDb = createDb(":memory:");
  const app = new Hono();
  createDemo({ dir, secret: config.sessionSecret, secure: false, open: (file, fresh) => openDemo(file, fresh, config) }).mount(app);
  app.route("/", createApp(realDb, config));
  return { app, realDb };
}

describe("kvitt demo", () => {
  it("gives a visitor a filled household of their own and never touches the real database", async () => {
    const { app, realDb } = setup();
    const r = await app.request("/demo", { headers: { "cf-connecting-ip": "9.9.9.9" } });
    expect(r.headers.get("location")).toBe("/");
    const cookie = r.headers.get("set-cookie")!.split(";")[0];
    const me = (await (await app.request("/api/me", { headers: { cookie } })).json()) as MeResponse;
    expect(me.authMode).toBe("demo");
    expect(me.households).toHaveLength(1);
    const hid = me.households[0].id;
    for (const p of ["", "/balances", "/expenses", "/stats"]) {
      expect((await app.request(`/api/h/${hid}${p}`, { headers: { cookie } })).status, p).toBe(200);
    }
    expect(realDb.select({ n: sql<number>`count(*)` }).from(households).get()!.n).toBe(0);
    expect(((await (await app.request("/api/me")).json()) as MeResponse).authMode).toBe("oidc");
  });

  it("seeds lists, a finished trip, expenses and a settlement, so every page has something", async () => {
    const db = createDb(":memory:");
    const config = { ...loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv), authMode: "demo" as const };
    seedKvittDemo(db, createAuth(db, config, { users, sessions }).demoUser().id);
    const app = createApp(db, config);
    const me = (await (await app.request("/api/me")).json()) as MeResponse;
    const hid = me.households[0].id;
    const bal = (await (await app.request(`/api/h/${hid}/balances`)).json()) as BalancesResponse;
    expect(bal.settlements).toHaveLength(1);
    expect(bal.simplified.length).toBeGreaterThan(0);
    const exp = (await (await app.request(`/api/h/${hid}/expenses`)).json()) as { gift: boolean; guests: number }[];
    expect(exp).toHaveLength(8); // 4 shared, a pizza night with one guest, 3 treats
    expect(exp.filter((e) => e.gift)).toHaveLength(3);
    expect(exp.filter((e) => e.guests === 1)).toHaveLength(1);
    // the treats and the guest's share never reach the ledger, so the plan still covers only real members
    expect(bal.totals).toHaveLength(3);
    const gifts = (await (await app.request(`/api/h/${hid}/gifts`)).json()) as { gifts: unknown[]; hint: boolean };
    expect(gifts.gifts).toHaveLength(3);
    expect(gifts.hint).toBe(false);
  });
});
