import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { EventBus } from "./events";
import type { PlanResponse, TripDetail } from "../shared/api";
import { PhotoStore } from "./photos";

type App = ReturnType<typeof createApp>;
const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);

/** Minimal browser: keeps cookies, sends a same-origin Origin header, throws on unexpected status. */
function client(app: App, cookies: Record<string, string> = {}) {
  const jar = new Map(Object.entries(cookies));
  const req = async (method: string, path: string, body?: unknown) => {
    const headers: Record<string, string> = { origin: config.publicUrl };
    if (jar.size) headers.cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
    if (body !== undefined) headers["content-type"] = "application/json";
    const r = await app.request(`/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    for (const sc of r.headers.getSetCookie()) {
      const kv = sc.split(";")[0];
      const i = kv.indexOf("=");
      const [k, v] = [kv.slice(0, i), kv.slice(i + 1)];
      if (v) jar.set(k, v); else jar.delete(k);
    }
    return r;
  };
  const call = async <T = unknown>(method: string, path: string, body?: unknown, status = 200): Promise<T> => {
    const r = await req(method, path, body);
    const text = await r.text();
    expect(r.status, `${method} ${path}: ${text}`).toBe(status);
    return (text && r.headers.get("content-type")?.includes("json") ? JSON.parse(text) : text) as T;
  };
  return {
    req, jar,
    get: <T = unknown>(p: string, s?: number) => call<T>("GET", p, undefined, s),
    post: <T = unknown>(p: string, b?: unknown, s?: number) => call<T>("POST", p, b, s),
    patch: <T = unknown>(p: string, b?: unknown, s?: number) => call<T>("PATCH", p, b, s),
    del: <T = unknown>(p: string, s?: number) => call<T>("DELETE", p, undefined, s),
  };
}
/** In dev mode every request is the dev admin unless dev_anon is set, so members use that. */
const anon = (app: App) => client(app, { dev_anon: "1" });

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);

describe("day photos", () => {
  let app: App;
  let dir: string;
  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "etapp-photos-"));
    app = createApp(createDb(":memory:"), config, new EventBus(), new PhotoStore(dir));
  });

  const put = (c: ReturnType<typeof client>, url: string, body: Uint8Array, type = "image/jpeg") =>
    app.request(`/api${url}`, { method: "PUT", headers: { origin: config.publicUrl, "content-type": type, cookie: [...c.jar].map(([k, v]) => `${k}=${v}`).join("; ") }, body: new Blob([body as Uint8Array<ArrayBuffer>]) });

  it("uploads, serves, replaces and deletes a cover; only travellers see it", async () => {
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "Norge" });
    const dayId = (await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].id;

    const r = await put(admin, `/t/${tid}/days/${dayId}/photo`, JPEG);
    expect(r.status).toBe(200);
    const { photoUrl } = (await r.json()) as { photoUrl: string };
    expect(photoUrl).toMatch(new RegExp(`^/api/t/${tid}/photos/[\\w-]+\\.jpg$`));
    expect((await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].photoUrl).toBe(photoUrl);
    expect(fs.readdirSync(dir)).toHaveLength(1);

    const img = await admin.req("GET", photoUrl.slice(4));
    expect(img.status).toBe(200);
    expect(img.headers.get("content-type")).toBe("image/jpeg");
    expect(new Uint8Array(await img.arrayBuffer())).toEqual(JPEG);

    // Not a traveller on this trip: no photo, no upload.
    const stranger = anon(app);
    expect((await stranger.req("GET", photoUrl.slice(4))).status).toBe(403);
    expect((await put(stranger, `/t/${tid}/days/${dayId}/photo`, JPEG)).status).toBe(403);

    // A traveller who joined sees it.
    const code = (await admin.get<TripDetail>(`/t/${tid}`)).inviteCode!;
    const bob = anon(app);
    await bob.post(`/join/${code}`, { name: "Bob" });
    expect((await bob.req("GET", photoUrl.slice(4))).status).toBe(200);

    // Replacing removes the old file.
    const r2 = await put(admin, `/t/${tid}/days/${dayId}/photo`, JPEG, "image/png");
    const second = ((await r2.json()) as { photoUrl: string }).photoUrl;
    expect(second).not.toBe(photoUrl);
    expect(fs.readdirSync(dir)).toHaveLength(1);
    expect((await admin.req("GET", photoUrl.slice(4))).status).toBe(404);

    await admin.del(`/t/${tid}/days/${dayId}/photo`);
    expect(fs.readdirSync(dir)).toHaveLength(0);
    expect((await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].photoUrl).toBeNull();
  });

  it("rejects other types, empty and oversized bodies", async () => {
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "x" });
    const dayId = (await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].id;
    expect((await put(admin, `/t/${tid}/days/${dayId}/photo`, JPEG, "image/gif")).status).toBe(400);
    expect((await put(admin, `/t/${tid}/days/${dayId}/photo`, new Uint8Array())).status).toBe(400);
    expect((await put(admin, `/t/${tid}/days/${dayId}/photo`, new Uint8Array(6 * 1024 * 1024 + 1))).status).toBe(400);
    expect((await put(admin, `/t/${tid}/days/999999/photo`, JPEG)).status).toBe(404);
    expect((await admin.req("GET", `/t/${tid}/photos/../../etc/passwd`)).status).toBe(404);
  });

  it("deleting a day deletes its photo file", async () => {
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "y" });
    const dayId = (await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].id;
    const before = fs.readdirSync(dir).length;
    await put(admin, `/t/${tid}/days/${dayId}/photo`, JPEG);
    expect(fs.readdirSync(dir)).toHaveLength(before + 1);
    await admin.del(`/t/${tid}/days/${dayId}`);
    expect(fs.readdirSync(dir)).toHaveLength(before);
  });
});
