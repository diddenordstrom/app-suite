import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { AuthEnv } from "./auth";
import { createCipher } from "./crypto";
import { createPush, dailyDue, localNow, parseTime, pushTables } from "./push";

function setup(send: (sub: { endpoint: string }, payload: string) => Promise<unknown>, cipher = false) {
  const sqlite = new Database(":memory:");
  sqlite.exec(`create table users (id integer primary key autoincrement);
    insert into users default values; insert into users default values;
    create table push_subscriptions (id integer primary key autoincrement, user_id integer not null references users(id) on delete cascade, endpoint text not null, p256dh text not null, auth text not null, lang text not null default 'sv', created_at integer not null);
    create unique index push_subscriptions_endpoint on push_subscriptions (endpoint);
    create table push_keys (id integer primary key, public_key text not null, private_key text not null);`);
  const users = { id: { name: "id" } };
  const tables = pushTables(users);
  const db = drizzle(sqlite, { schema: tables });
  const push = createPush(db, { publicUrl: "https://app.example.com", authMode: "dev", env: {} }, tables,
    { send: send as never, cipher: cipher ? createCipher("k".repeat(32)) : undefined });
  const app = new Hono<AuthEnv>();
  app.use("*", async (c, next) => { c.set("user", { id: Number(c.req.header("x-user") ?? 1) } as never); await next(); });
  app.route("/api", push.routes());
  return { app, push, sqlite };
}
const body = (b: unknown, method = "POST", user = 1) => ({ method, body: JSON.stringify(b), headers: { "content-type": "application/json", "x-user": String(user) } });
const sub = (n: number, lang = "sv") => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: "p".repeat(20), auth: "a".repeat(10) }, lang });

describe("push", () => {
  it("makes the VAPID keys once, keeps the private key encrypted with a cipher, and shows the public key", async () => {
    const { app, sqlite } = setup(async () => ({}), true);
    const a = await (await app.request("/api/push")).json();
    const b = await (await app.request("/api/push")).json();
    expect(a.publicKey).toMatch(/^[A-Za-z0-9_-]{80,}$/);
    expect(b.publicKey).toBe(a.publicKey);
    const row = sqlite.prepare("select private_key as k from push_keys").get() as { k: string };
    expect(row.k.length).toBeGreaterThan(60); // encrypted, not the 43-character key
  });

  it("subscribes devices, sends in each device's language, and drops a gone subscription", async () => {
    const sent: { endpoint: string; payload: string }[] = [];
    const { app, push } = setup(async (s, payload) => {
      if (s.endpoint.endsWith("/3")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: s.endpoint, payload });
      return {};
    });
    expect((await app.request("/api/push/subscriptions", body(sub(1)))).status).toBe(200);
    await app.request("/api/push/subscriptions", body(sub(2, "en")));
    await app.request("/api/push/subscriptions", body(sub(3)));
    expect((await app.request("/api/push/subscriptions", body({ endpoint: "http://insecure" }))).status).toBe(400);
    expect((await (await app.request("/api/push")).json()).devices).toBe(3);

    const res = await push.sendTo(1, (lang) => ({ title: lang, body: "b" }));
    expect(res).toEqual({ sent: 2, removed: 1, failed: 0 });
    expect(sent.map((s) => JSON.parse(s.payload).title)).toEqual(["sv", "en"]);
    expect(JSON.parse(sent[0].payload).url).toBe("/");
    expect(push.subscribedUsers()).toEqual([1]);

    // The same browser signing in as someone else takes the endpoint over.
    await app.request("/api/push/subscriptions", body(sub(2), "POST", 2));
    expect(push.subscribedUsers().sort()).toEqual([1, 2]);
    await app.request("/api/push/subscriptions", body({ endpoint: sub(1).endpoint }, "DELETE"));
    expect((await (await app.request("/api/push")).json()).devices).toBe(0);
  });
});

describe("daily schedule", () => {
  const at = (iso: string) => new Date(iso);
  it("reads the local time in the user's zone", () => {
    expect(localNow(at("2026-11-20T06:05:00Z"), "Europe/Stockholm")).toEqual({ date: "2026-11-20", time: "07:05" });
    expect(localNow(at("2026-11-20T06:05:00Z"), "Not/AZone")).toEqual({ date: "2026-11-20", time: "06:05" });
  });
  it("is due from the time to the end of the local day, once", () => {
    const tz = "Europe/Stockholm";
    expect(dailyDue(at("2026-11-20T05:59:00Z"), tz, "07:00", null).due).toBe(false);
    expect(dailyDue(at("2026-11-20T06:00:00Z"), tz, "07:00", null)).toEqual({ due: true, date: "2026-11-20", lateMin: 0 });
    expect(dailyDue(at("2026-11-20T09:30:00Z"), tz, "07:00", "2026-11-19")).toMatchObject({ due: true, lateMin: 210 });
    expect(dailyDue(at("2026-11-20T09:30:00Z"), tz, "07:00", "2026-11-20").due).toBe(false);
    expect(dailyDue(at("2026-11-20T09:30:00Z"), tz, null, null).due).toBe(false);
  });
  it("takes only HH:MM", () => {
    expect(parseTime("07:30")).toBe("07:30");
    expect(parseTime("7:30")).toBeNull();
    expect(parseTime("24:00")).toBeNull();
  });
});
