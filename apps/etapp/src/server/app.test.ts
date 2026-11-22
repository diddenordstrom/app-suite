import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { EventBus } from "./events";
import type { MeResponse, TripDetail } from "../shared/api";

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

describe("api", () => {
  let app: App;
  const bus = new EventBus();
  beforeAll(() => { app = createApp(createDb(":memory:"), config, bus); });

  it("health", async () => {
    expect(await client(app).get("/health")).toEqual({ ok: true });
  });

  it("dev mode logs in a fake user", async () => {
    const me = await client(app).get<MeResponse>("/me");
    expect(me.user?.name).toBe("Dev User");
    expect(me.trips).toEqual([]);
    expect((await client(app).get<{ user: { sub: string } }>("/auth/me")).user.sub).toBe("dev-user");
  });

  it("csrf blocks cross-site form posts", async () => {
    const r = await app.request("/api/trips", { method: "POST", headers: { "content-type": "text/plain", origin: "https://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });

  it("full flow: create trip, invite, join, admin actions, permissions", async () => {
    const alice = client(app);
    const { id: tid } = await alice.post<{ id: number }>("/trips", { name: "Norge", adminName: "Alice" });
    const me = await alice.get<MeResponse>("/me");
    expect(me.trips).toEqual([{ id: tid, name: "Norge", memberId: expect.any(Number), role: "admin" }]);
    const aliceId = me.trips[0].memberId;
    const detail = await alice.get<TripDetail>(`/t/${tid}`);
    expect(detail.me).toMatchObject({ name: "Alice", role: "admin" });
    const code = detail.inviteCode!;
    expect(code).toMatch(/^[\w-]{16}$/);

    // join without an account
    const bob = anon(app);
    expect((await bob.get<MeResponse>("/me")).trips).toEqual([]);
    await bob.get(`/t/${tid}`, 403);
    expect(await bob.get(`/join/${code}`)).toEqual({ tripName: "Norge", tripId: tid, memberId: null });
    const { memberId: bobId } = await bob.post<{ memberId: number }>(`/join/${code}`, { name: "Bob" });
    expect(bob.jar.get("mtok")).toBeTruthy();
    expect((await bob.post<{ memberId: number }>(`/join/${code}`, { name: "Again" })).memberId).toBe(bobId);
    const bobView = await bob.get<TripDetail>(`/t/${tid}`);
    expect(bobView.inviteCode).toBeNull();
    expect(bobView.members.map((m) => m.name)).toEqual(["Alice", "Bob"]);
    await bob.post(`/t/${tid}/invite/rotate`, undefined, 403);
    await bob.patch(`/t/${tid}`, { name: "Mine" }, 403);
    await bob.patch(`/t/${tid}/me`, { name: "Bobby" });
    await alice.patch(`/t/${tid}`, { name: "Norge 2027" });
    expect((await bob.get<MeResponse>("/me")).trips[0].name).toBe("Norge 2027");

    const carol = anon(app);
    const { memberId: carolId } = await carol.post<{ memberId: number }>(`/join/${code}`, { name: "Carol" });

    // another trip stays private
    const { id: other } = await alice.post<{ id: number }>("/trips", { name: "Other" });
    await bob.get(`/t/${other}`, 403);
    await bob.get(`/t/${other}/events`, 403);
    await bob.get(`/t/abc`, 404);

    // admin: rotate invite, recovery link, remove member
    const { inviteCode } = await alice.post<{ inviteCode: string }>(`/t/${tid}/invite/rotate`);
    expect(inviteCode).not.toBe(code);
    await anon(app).get(`/join/${code}`, 404);
    const { recoveryUrl } = await alice.post<{ recoveryUrl: string }>(`/t/${tid}/members/${bobId}/recovery`);
    expect(recoveryUrl.startsWith(`${config.publicUrl}/api/recover/`)).toBe(true);
    await bob.get(`/t/${tid}`, 403); // old token rotated away
    const bobPhone = anon(app);
    const r = await bobPhone.req("GET", recoveryUrl.slice(`${config.publicUrl}/api`.length));
    expect(r.status).toBe(302);
    expect((await bobPhone.get<TripDetail>(`/t/${tid}`)).me.name).toBe("Bobby");
    const own = await bobPhone.get<{ recoveryUrl: string }>(`/t/${tid}/me/recovery`);
    expect(own.recoveryUrl).toBe(recoveryUrl);
    const bad = await anon(app).req("GET", "/recover/nope");
    expect(bad.headers.get("location")).toBe("/?error=invalid-recovery");

    await alice.del(`/t/${tid}/members/${aliceId}`, 400);
    await bobPhone.del(`/t/${tid}/members/${carolId}`, 403);
    await alice.del(`/t/${tid}/members/${carolId}`);
    await carol.get(`/t/${tid}`, 403);
    const members = (await alice.get<TripDetail>(`/t/${tid}`)).members;
    expect(members.find((m) => m.id === carolId)?.removed).toBe(true);
  });

  it("streams change events over SSE", async () => {
    const alice = client(app);
    const { id: tid } = await alice.post<{ id: number }>("/trips", { name: "Live" });
    const ac = new AbortController();
    const r = await app.request(`/api/t/${tid}/events`, { signal: ac.signal });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    await alice.patch(`/t/${tid}`, { name: "Live 2" });
    while (!buf.includes("data:")) buf += dec.decode((await reader.read()).value);
    expect(buf).toContain(JSON.stringify({ scope: ["trip"] }));
    ac.abort();
    await reader.cancel();
    await new Promise((res) => setTimeout(res, 10));
    expect(bus.listenerCount(tid)).toBe(0);
  });
});

describe("api in oidc mode", () => {
  it("anonymous viewers see nothing and cannot create trips", async () => {
    const app = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv));
    const c = client(app);
    expect(await c.get("/me")).toEqual({ user: null, authMode: "oidc", trips: [] });
    await c.post("/trips", { name: "x" }, 401);
    await c.get("/t/1", 403);
  });
});
