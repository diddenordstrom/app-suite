import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterAll, describe, expect, it } from "vitest";
import { cacheControlFor, IMMUTABLE, REVALIDATE, serveClient } from "./static";

describe("cacheControlFor", () => {
  it("caches hashed assets for good", () => {
    expect(cacheControlFor("/assets/index-DhdB5DMK.js")).toBe(IMMUTABLE);
  });
  it("revalidates index.html and other root files", () => {
    expect(cacheControlFor("/")).toBe(REVALIDATE);
    expect(cacheControlFor("/icon.svg")).toBe(REVALIDATE);
  });
});

describe("serveClient", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "client-"));
  fs.mkdirSync(path.join(root, "assets"));
  fs.writeFileSync(path.join(root, "index.html"), "<html></html>");
  fs.writeFileSync(path.join(root, "assets", "app-abc123.js"), "console.log(1)");
  afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

  const app = new Hono();
  app.get("/api/ping", (c) => c.json({ ok: true }));
  serveClient(app, root);

  it("sets cache headers on assets, index.html and client routes", async () => {
    expect((await app.request("/assets/app-abc123.js")).headers.get("Cache-Control")).toBe(IMMUTABLE);
    expect((await app.request("/")).headers.get("Cache-Control")).toBe(REVALIDATE);
    const route = await app.request("/plan/races");
    expect(route.status).toBe(200);
    expect(route.headers.get("Cache-Control")).toBe(REVALIDATE);
  });

  it("answers 404 for a missing asset instead of index.html", async () => {
    const res = await app.request("/assets/old-hash.js");
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBeNull();
  });

  it("leaves API responses alone", async () => {
    expect((await app.request("/api/ping")).headers.get("Cache-Control")).toBeNull();
  });
});
