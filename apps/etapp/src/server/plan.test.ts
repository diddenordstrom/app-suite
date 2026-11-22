import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { EventBus } from "./events";
import type { PlanResponse, QuickResponse, TripDetail } from "../shared/api";
import { seedDemo } from "./seed";

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

describe("plan api", () => {
  let app: App;
  const bus = new EventBus();
  beforeAll(() => { app = createApp(createDb(":memory:"), config, bus); });

  async function newTrip() {
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "Norge" });
    const plan = () => admin.get<PlanResponse>(`/t/${tid}/plan`);
    return { admin, tid, plan, base: `/t/${tid}` };
  }

  it("a new trip has one empty day and default settings", async () => {
    const { plan } = await newTrip();
    const p = await plan();
    expect(p).toMatchObject({ area: "", startMode: "home", startText: "", startDate: null, pack: [] });
    expect(p.days).toHaveLength(1);
    expect(p.days[0]).toMatchObject({ title: "", stops: [], photoUrl: null, sleep: { type: "tent", name: "", lat: null, lon: null, note: "" } });
  });

  it("updates trip settings with validation", async () => {
    const { admin, base, plan } = await newTrip();
    await admin.patch(`${base}/plan`, { area: "Norge", startMode: "custom", startText: "Göteborg", startDate: "2027-07-01" });
    expect(await plan()).toMatchObject({ area: "Norge", startMode: "custom", startText: "Göteborg", startDate: "2027-07-01" });
    await admin.patch(`${base}/plan`, { startDate: null });
    expect((await plan()).startDate).toBeNull();
    await admin.patch(`${base}/plan`, { startMode: "boat" }, 400);
    await admin.patch(`${base}/plan`, { startDate: "2027-13-40" }, 400);
  });

  it("days: add, rename, night, move, delete (never fewer than one)", async () => {
    const { admin, base, plan } = await newTrip();
    const d1 = (await plan()).days[0].id;
    const { id: d2 } = await admin.post<{ id: number }>(`${base}/days`, { title: "Lom" });
    await admin.patch(`${base}/days/${d1}`, { title: "Mot Jotunheimen", sleepType: "hostel", sleepName: "Lom vandrarhem", sleepLat: 61.84, sleepLon: 8.57 });
    let p = await plan();
    expect(p.days.map((d) => d.title)).toEqual(["Mot Jotunheimen", "Lom"]);
    expect(p.days[0].sleep).toEqual({ type: "hostel", name: "Lom vandrarhem", lat: 61.84, lon: 8.57, note: "" });
    await admin.patch(`${base}/days/${d1}`, { sleepLat: 61.84 }, 400); // half a position
    await admin.patch(`${base}/days/${d1}`, { sleepLat: null, sleepLon: null });
    expect((await plan()).days[0].sleep.lat).toBeNull();

    await admin.post(`${base}/days/${d2}/move`, { dir: -1 });
    expect((await plan()).days.map((d) => d.id)).toEqual([d2, d1]);
    await admin.post(`${base}/days/${d2}/move`, { dir: -1 }); // already first: no-op
    expect((await plan()).days.map((d) => d.id)).toEqual([d2, d1]);
    await admin.post(`${base}/days/${d2}/move`, { dir: 2 }, 400);

    await admin.del(`${base}/days/${d1}`);
    await admin.del(`${base}/days/${d2}`);
    p = await plan();
    expect(p.days).toHaveLength(1);
    expect(p.days[0].id).not.toBe(d2);
  });

  it("stops and todos: add, edit, check off, delete", async () => {
    const { admin, base, plan } = await newTrip();
    const day = (await plan()).days[0].id;
    const { id: s } = await admin.post<{ id: number }>(`${base}/days/${day}/stops`, { name: "Lom stavkyrkje", lat: 61.8395, lon: 8.5658 });
    await admin.patch(`${base}/stops/${s}`, { note: "Öppet sommartid", openFrom: 5, openTo: 9 });
    await admin.patch(`${base}/stops/${s}`, { openFrom: 13 }, 400);
    await admin.post(`${base}/days/${day}/stops`, { name: "  " }, 400);
    const { id: t } = await admin.post<{ id: number }>(`${base}/stops/${s}/todos`, { text: "Bakeriet", category: "fika" });
    await admin.post(`${base}/stops/${s}/todos`, { text: "Stavkyrkan" });
    await admin.post(`${base}/stops/${s}/todos`, { text: "x", category: "dans" }, 400);
    await admin.patch(`${base}/todos/${t}`, { done: true });
    await admin.patch(`${base}/todos/${t}`, { done: "yes" }, 400);
    let stop = (await plan()).days[0].stops[0];
    expect(stop).toMatchObject({ name: "Lom stavkyrkje", lat: 61.8395, note: "Öppet sommartid", openFrom: 5, openTo: 9 });
    expect(stop.todos).toEqual([
      { id: t, text: "Bakeriet", category: "fika", done: true },
      { id: expect.any(Number), text: "Stavkyrkan", category: "se", done: false },
    ]);
    await admin.del(`${base}/todos/${t}`);
    stop = (await plan()).days[0].stops[0];
    expect(stop.todos.map((x) => x.text)).toEqual(["Stavkyrkan"]);
    await admin.del(`${base}/stops/${s}`);
    expect((await plan()).days[0].stops).toEqual([]);
  });

  it("moving a stop past a day's edge moves it into the neighbouring day", async () => {
    const { admin, base, plan } = await newTrip();
    const d1 = (await plan()).days[0].id;
    const { id: d2 } = await admin.post<{ id: number }>(`${base}/days`, {});
    const add = async (d: number, name: string) => (await admin.post<{ id: number }>(`${base}/days/${d}/stops`, { name })).id;
    const a = await add(d1, "A"), b = await add(d1, "B"), c = await add(d2, "C");
    const names = async () => (await plan()).days.map((d) => d.stops.map((s) => s.name));
    expect(await names()).toEqual([["A", "B"], ["C"]]);
    await admin.post(`${base}/stops/${a}/move`, { dir: 1 });
    expect(await names()).toEqual([["B", "A"], ["C"]]);
    await admin.post(`${base}/stops/${a}/move`, { dir: 1 });
    expect(await names()).toEqual([["B"], ["A", "C"]]);
    await admin.post(`${base}/stops/${c}/move`, { dir: 1 }); // last stop of the last day: nowhere to go
    expect(await names()).toEqual([["B"], ["A", "C"]]);
    await admin.post(`${base}/stops/${a}/move`, { dir: -1 });
    expect(await names()).toEqual([["B", "A"], ["C"]]);
    await admin.post(`${base}/stops/${b}/move`, { dir: -1 }); // first stop of the first day
    expect(await names()).toEqual([["B", "A"], ["C"]]);
  });

  it("quick entry adds stops, todos, a new day and its night", async () => {
    const { admin, base, plan } = await newTrip();
    const d1 = (await plan()).days[0].id;
    const r = await admin.post<QuickResponse>(`${base}/quick`, {
      dayId: d1,
      text: "Huskvarna, fika Kroatorpet, handla ICA\nnatt tält Vättern\ndag Lom\nLom stavkyrkje 61.8395, 8.5658\nStryn https://maps.app.goo.gl/abc",
    });
    expect(r.added).toEqual({ days: 1, stops: 3, vias: 0, todos: 2, nights: 1 });
    expect(r.warnings).toEqual([{ line: 5, code: "shortLink" }]);
    const p = await plan();
    expect(r.dayId).toBe(p.days[1].id);
    expect(p.days[0].stops[0].todos.map((t) => [t.category, t.text])).toEqual([["fika", "Kroatorpet"], ["fixa", "Handla ICA"]]);
    expect(p.days[0].sleep).toMatchObject({ type: "tent", name: "Vättern" });
    expect(p.days[1]).toMatchObject({ title: "Lom" });
    expect(p.days[1].stops.map((s) => [s.name, s.lat])).toEqual([["Lom stavkyrkje", 61.8395], ["Stryn", null]]);
    await admin.post(`${base}/quick`, { dayId: 999999, text: "x" }, 404);
    await admin.post(`${base}/quick`, { text: "x" }, 400);
  });

  it("packing list: starter, add, check, delete", async () => {
    const { admin, base, plan } = await newTrip();
    await admin.post(`${base}/pack/starter`);
    let p = await plan();
    expect(p.pack.length).toBeGreaterThan(20);
    expect(p.pack[0]).toMatchObject({ group: "tent", text: "Tält", done: false });
    const { id } = await admin.post<{ id: number }>(`${base}/pack`, { group: "other", text: "Hängmatta" });
    await admin.post(`${base}/pack`, { group: "boat", text: "x" }, 400);
    await admin.patch(`${base}/pack/${id}`, { done: true });
    p = await plan();
    expect(p.pack.find((x) => x.id === id)).toEqual({ id, group: "other", text: "Hängmatta", done: true });
    await admin.del(`${base}/pack/${id}`);
    expect((await plan()).pack.some((x) => x.id === id)).toBe(false);
  });

  it("travellers can edit the plan; nobody reaches another trip's rows", async () => {
    const { admin, tid, base, plan } = await newTrip();
    const code = (await admin.get<TripDetail>(base)).inviteCode!;
    const bob = anon(app);
    await bob.post(`/join/${code}`, { name: "Bob" });
    const day = (await plan()).days[0].id;
    const { id: s } = await bob.post<{ id: number }>(`${base}/days/${day}/stops`, { name: "Bobs stopp" });
    await bob.patch(`${base}/plan`, { area: "Norge" });
    expect((await plan()).days[0].stops[0].name).toBe("Bobs stopp");

    const other = await newTrip();
    const otherDay = (await other.plan()).days[0].id;
    await bob.get(`${other.base}/plan`, 403);
    // Ids from another trip are 404 even for its own admin's routes on this trip.
    await admin.patch(`${base}/days/${otherDay}`, { title: "x" }, 404);
    await other.admin.patch(`${other.base}/stops/${s}`, { name: "x" }, 404);
    expect(tid).not.toBe(Number(other.base.split("/")[2]));
  });

  it("per-person home lives on the membership", async () => {
    const { admin, base } = await newTrip();
    await admin.patch(`${base}/me`, { homeLabel: "Jönköping", homeLat: 57.7826, homeLon: 14.1618 });
    expect((await admin.get<TripDetail>(base)).home).toEqual({ label: "Jönköping", lat: 57.7826, lon: 14.1618 });
    await admin.patch(`${base}/me`, { homeLat: 57.7826 }, 400);
  });

  it("plan changes stream as 'plan' events", async () => {
    const { admin, tid, base, plan } = await newTrip();
    const ac = new AbortController();
    const r = await app.request(`/api/t/${tid}/events`, { signal: ac.signal });
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    await admin.post(`${base}/days/${(await plan()).days[0].id}/stops`, { name: "Lom" });
    while (!buf.includes("data:")) buf += dec.decode((await reader.read()).value);
    expect(buf).toContain(JSON.stringify({ scope: ["plan"] }));
    ac.abort();
    await reader.cancel();
  });
});

describe("vias, ideas, links and drive time", () => {
  let app: App;
  beforeAll(() => { app = createApp(createDb(":memory:"), config); });

  async function newTrip() {
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "Norge" });
    const plan = () => admin.get<PlanResponse>(`/t/${tid}/plan`);
    const p = await plan();
    return { admin, tid, plan, base: `/t/${tid}`, dayId: p.days[0].id };
  }

  it("creates a stop with todos and a link in one request, and a via without todos", async () => {
    const { admin, base, plan, dayId } = await newTrip();
    await admin.post(`${base}/days/${dayId}/stops`, { name: "Hamar", kind: "via", todos: "fika X" });
    await admin.post(`${base}/days/${dayId}/stops`, { name: "Lom", todos: "fika Bakeriet, se kyrkan", url: "https://youtu.be/abc" });
    const [via, lom] = (await plan()).days[0].stops;
    expect(via).toMatchObject({ kind: "via", name: "Hamar", todos: [] });
    expect(lom).toMatchObject({ kind: "stop", todos: [{ text: "Bakeriet", category: "fika" }, { text: "Kyrkan", category: "se" }], links: [{ url: "https://youtu.be/abc", note: "" }] });
  });

  it("refuses links that are not http(s)", async () => {
    const { admin, base, dayId } = await newTrip();
    const { id } = await admin.post<{ id: number }>(`${base}/days/${dayId}/stops`, { name: "Lom" });
    await admin.post(`${base}/stops/${id}/links`, { url: "javascript:alert(1)" }, 400);
    await admin.post(`${base}/ideas`, { name: "X", url: "data:text/html,hi" }, 400);
  });

  it("moves stops between a day and the idea bank", async () => {
    const { admin, base, plan, dayId } = await newTrip();
    const { id } = await admin.post<{ id: number }>(`${base}/ideas`, { name: "Trollstigen", url: "https://www.reddit.com/r/Norway" });
    let p = await plan();
    expect(p.ideas.map((s) => s.name)).toEqual(["Trollstigen"]);
    expect(p.days[0].stops).toEqual([]);
    await admin.patch(`${base}/stops/${id}`, { dayId });
    p = await plan();
    expect(p.ideas).toEqual([]);
    expect(p.days[0].stops[0]).toMatchObject({ name: "Trollstigen", links: [{ url: "https://www.reddit.com/r/Norway" }] });
    await admin.patch(`${base}/stops/${id}`, { dayId: null, kind: "via" });
    p = await plan();
    expect(p.ideas[0]).toMatchObject({ name: "Trollstigen", kind: "via" });
    await admin.patch(`${base}/stops/${id}`, { dayId: 999_999 }, 404);
  });

  it("edits and deletes links, and saves the day's drive time", async () => {
    const { admin, base, plan, dayId } = await newTrip();
    const { id: stopId } = await admin.post<{ id: number }>(`${base}/days/${dayId}/stops`, { name: "Lom" });
    const { id } = await admin.post<{ id: number }>(`${base}/stops/${stopId}/links`, { url: "https://youtu.be/x", note: "utsikten vid 4:30" });
    await admin.patch(`${base}/links/${id}`, { note: "vid 5:00" });
    expect((await plan()).days[0].stops[0].links).toEqual([{ id, url: "https://youtu.be/x", note: "vid 5:00" }]);
    await admin.del(`${base}/links/${id}`);
    expect((await plan()).days[0].stops[0].links).toEqual([]);
    await admin.patch(`${base}/days/${dayId}`, { driveMinutes: 620 });
    expect((await plan()).days[0].driveMinutes).toBe(620);
    await admin.patch(`${base}/days/${dayId}`, { driveMinutes: null });
    expect((await plan()).days[0].driveMinutes).toBeNull();
  });

  it("quick entry understands via lines", async () => {
    const { admin, base, plan, dayId } = await newTrip();
    const r = await admin.post<QuickResponse>(`${base}/quick`, { dayId, text: "via Karlstad\nLom, fika Bakeriet" });
    expect(r.added).toMatchObject({ stops: 1, vias: 1 });
    expect((await plan()).days[0].stops.map((s) => [s.kind, s.name])).toEqual([["via", "Karlstad"], ["stop", "Lom"]]);
  });
});

describe("quick entry on an empty day", () => {
  it("a paste starting with 'dag' names the empty day instead of skipping it", async () => {
    const app = createApp(createDb(":memory:"), config);
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "Norge" });
    const dayId = (await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].id;
    const text = "dag Transport norrut\nHjo, fika vid Vättern\nvia Kongsvinger\nnatt Elverum 60.8819, 11.5615\ndag Mot Jotunheimen\nLom, se kyrkan";
    const r = await admin.post<QuickResponse>(`/t/${tid}/quick`, { dayId, text });
    const p = await admin.get<PlanResponse>(`/t/${tid}/plan`);
    expect(p.days.map((d) => d.title)).toEqual(["Transport norrut", "Mot Jotunheimen"]);
    expect(p.days[0].stops.map((s) => [s.kind, s.name])).toEqual([["stop", "Hjo"], ["via", "Kongsvinger"]]);
    expect(p.days[0].sleep).toMatchObject({ name: "Elverum", lat: 60.8819 });
    expect(r.dayId).toBe(p.days[1].id);
    // A day with something on it is left alone: "dag" starts a new one as before.
    await admin.post(`/t/${tid}/quick`, { dayId, text: "dag Extra" });
    expect((await admin.get<PlanResponse>(`/t/${tid}/plan`)).days.map((d) => d.title)).toEqual(["Transport norrut", "Mot Jotunheimen", "Extra"]);
  });
});

describe("deleting a trip", () => {
  it("only an admin can delete it; everything goes with it", async () => {
    const app = createApp(createDb(":memory:"), config);
    const admin = client(app);
    const { id: tid } = await admin.post<{ id: number }>("/trips", { name: "Skräp" });
    const dayId = (await admin.get<PlanResponse>(`/t/${tid}/plan`)).days[0].id;
    await admin.post(`/t/${tid}/days/${dayId}/stops`, { name: "Lom", todos: "fika X", url: "https://youtu.be/x" });
    const code = (await admin.get<TripDetail>(`/t/${tid}`)).inviteCode!;
    const bob = anon(app);
    await bob.post(`/join/${code}`, { name: "Bob" });
    await bob.del(`/t/${tid}`, 403);
    await admin.del(`/t/${tid}`);
    await admin.get(`/t/${tid}/plan`, 403);
    expect((await admin.get<{ trips: unknown[] }>("/me")).trips).toEqual([]);
  });
});

describe("seedDemo", () => {
  it("creates the demo trip once, owned by the dev user", async () => {
    const db = createDb(":memory:");
    const tid = seedDemo(db)!;
    expect(seedDemo(db)).toBeNull();
    const app = createApp(db, config);
    const p = await client(app).get<PlanResponse>(`/t/${tid}/plan`);
    expect(p.area).toBe("Norge");
    expect(p.days.map((d) => d.title)).toEqual(["Mot Jotunheimen", "Lom", "Galdhøpiggen", "Gamle Strynefjellsvegen", "Geiranger", "Trollstigen", "Hemfärd"]);
    expect(p.days[1].stops[0]).toMatchObject({ name: "Lom stavkyrkje", lat: 61.8395, lon: 8.5658 });
    expect(p.pack.length).toBeGreaterThan(20);
    expect((await client(app).get<TripDetail>(`/t/${tid}`)).home.label).toBe("Jönköping");
  });
});
