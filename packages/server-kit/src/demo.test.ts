import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { createDemo, createRateLimiter, demoConfig, DEMO_COOKIE, type DemoOptions } from "./demo";

const dirs: string[] = [];
afterEach(() => { for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true }); });

/**
 * A stand-in app: "the database" is the file's text. Fresh files get "demo data"; GET /api/data reads it,
 * POST /api/data appends, so isolation between visitors and from the real app is visible.
 */
function setup(opts: Partial<DemoOptions> = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "demo-"));
  dirs.push(dir);
  let clock = 1_700_000_000_000;
  const closed: string[] = [];
  const demo = createDemo({
    dir, secret: "s".repeat(32), secure: false, idleMs: 3600_000, now: () => clock,
    open: (file, fresh) => {
      if (fresh) fs.writeFileSync(file, "demo");
      const a = new Hono();
      a.get("/api/data", (c) => c.text(fs.readFileSync(file, "utf8")));
      a.post("/api/data", async (c) => { fs.appendFileSync(file, `+${await c.req.text()}`); return c.text("ok"); });
      return { fetch: a.fetch, close: () => closed.push(file) };
    },
    ...opts,
  });
  const app = new Hono();
  demo.mount(app);
  app.get("/api/data", (c) => c.text("real"));
  app.get("/api/auth/login", (c) => c.text("real login"));

  const start = async (ip = "1.1.1.1") => {
    const r = await app.request("/demo", { headers: { "cf-connecting-ip": ip } });
    const cookie = r.headers.get("set-cookie")?.split(";")[0] ?? "";
    return { r, cookie, location: r.headers.get("location") };
  };
  const files = () => fs.readdirSync(dir).filter((f) => f.endsWith(".db"));
  return { app, demo, dir, start, files, closed, tick: (ms: number) => (clock += ms) };
}

describe("rate limiter", () => {
  it("allows max hits per window, then frees up", () => {
    const l = createRateLimiter({ max: 2, windowMs: 100 });
    expect(l.hit("a", 0)).toBe(true);
    expect(l.hit("a", 10)).toBe(true);
    expect(l.hit("a", 20)).toBe(false);
    expect(l.hit("b", 20)).toBe(true);
    expect(l.hit("a", 111)).toBe(true);
  });
});

describe("demoConfig", () => {
  it("puts the demo folder next to the real database, off in production unless asked for", () => {
    expect(demoConfig({}, "/data/app.db", false)).toEqual({ enabled: true, dir: "/data/demo" });
    expect(demoConfig({}, "/data/app.db", true).enabled).toBe(false);
    expect(demoConfig({ DEMO_ENABLED: "true" }, "/data/app.db", true).enabled).toBe(true);
  });
  it("refuses a demo folder that holds the real database", () => {
    expect(() => demoConfig({ DEMO_DIR: "/data" }, "/data/app.db", false)).toThrow();
  });
});

describe("demo", () => {
  it("gives each visitor their own filled file and keeps everyone else on the real app", async () => {
    const { app, start, files } = setup();
    const a = await start("1.0.0.1");
    const b = await start("1.0.0.2");
    expect(a.location).toBe("/");
    expect(a.r.headers.get("set-cookie")).toContain("HttpOnly");
    expect(files()).toHaveLength(2);
    await app.request("/api/data", { method: "POST", body: "a-was-here", headers: { cookie: a.cookie } });
    expect(await (await app.request("/api/data", { headers: { cookie: a.cookie } })).text()).toBe("demo+a-was-here");
    expect(await (await app.request("/api/data", { headers: { cookie: b.cookie } })).text()).toBe("demo");
    expect(await (await app.request("/api/data")).text()).toBe("real");
  });

  it("ignores a forged cookie", async () => {
    const { app, start } = setup();
    const { cookie } = await start();
    const forged = cookie.replace(/=([0-9a-f])/, (_, ch) => `=${ch === "a" ? "b" : "a"}`);
    expect(await (await app.request("/api/data", { headers: { cookie: forged } })).text()).toBe("real");
  });

  it("stops at the cap, and makes room once demos go idle", async () => {
    const { start, files, tick } = setup({ maxAccounts: 2 });
    await start("1.0.0.1");
    await start("1.0.0.2");
    expect((await start("1.0.0.3")).location).toBe("/?demo=full");
    expect(files()).toHaveLength(2);
    tick(3600_001);
    expect((await start("1.0.0.3")).location).toBe("/");
    expect(files()).toHaveLength(1);
  });

  it("keeps a demo alive while it is used", async () => {
    const { app, demo, start, tick } = setup();
    const { cookie } = await start();
    tick(3000_000);
    await app.request("/api/data", { headers: { cookie } });
    tick(3000_000);
    expect(demo.sweep()).toBe(0);
    tick(3600_001);
    expect(demo.sweep()).toBe(1);
    expect(await (await app.request("/api/data", { headers: { cookie } })).text()).toBe("real");
  });

  it("rate limits new demos per IP", async () => {
    const { start } = setup({ perIp: { max: 2, windowMs: 60_000 } });
    expect((await start()).location).toBe("/");
    expect((await start()).location).toBe("/");
    expect((await start()).location).toBe("/?demo=limited");
    expect((await start("2.2.2.2")).location).toBe("/");
  });

  it("deletes the file when the visitor ends the demo", async () => {
    const { app, start, files, closed } = setup();
    const { cookie } = await start();
    const r = await app.request("/api/auth/logout", { method: "POST", headers: { cookie } });
    expect(r.status).toBe(200);
    expect(r.headers.get("set-cookie")).toContain(`${DEMO_COOKIE}=;`);
    expect(files()).toHaveLength(0);
    expect(closed).toHaveLength(1);
  });

  it("drops the demo cookie when the visitor goes on to sign in for real", async () => {
    const { app, start } = setup();
    const { cookie } = await start();
    const r = await app.request("/api/auth/login", { headers: { cookie } });
    expect(r.headers.get("location")).toBe("/api/auth/login");
    expect(r.headers.get("set-cookie")).toContain(`${DEMO_COOKIE}=;`);
  });

  it("cleans up when filling the demo fails", async () => {
    const { start, files } = setup({ open: (file) => { fs.writeFileSync(file, "half"); throw new Error("boom"); } });
    expect((await start()).location).toBe("/?demo=error");
    expect(files()).toHaveLength(0);
  });

  it("closes idle connections beyond keepOpen but keeps their files", async () => {
    const { start, files, closed } = setup({ keepOpen: 1 });
    await start("1.0.0.1");
    await start("1.0.0.2");
    expect(closed).toHaveLength(1);
    expect(files()).toHaveLength(2);
  });
});
