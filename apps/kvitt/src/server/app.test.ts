import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { EventBus } from "./events";
import type { Activity, BalancesResponse, CarHelpResponse, Expense, GiftsResponse, HouseholdDetail, Item, List, MeResponse, StatsEntry, Trip } from "../shared/api";

type App = ReturnType<typeof createApp>;
const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
/** Today in local time, the way the server dates "same-day" entries. A fixed date makes the activity order depend on the calendar. */
const today = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; })();

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
    expect(me.households).toEqual([]);
    expect((await client(app).get<{ user: { sub: string } }>("/auth/me")).user.sub).toBe("dev-user");
  });

  it("csrf blocks cross-site form posts", async () => {
    const r = await app.request("/api/households", { method: "POST", headers: { "content-type": "text/plain", origin: "https://evil.example" }, body: "{}" });
    expect(r.status).toBe(403);
  });

  it("full flow: households, join, lists, trips, money, permissions", async () => {
    const alice = client(app);
    const { id: hid } = await alice.post<{ id: number }>("/households", { name: "Home", adminName: "Alice" });
    const me = await alice.get<MeResponse>("/me");
    expect(me.households).toEqual([{ id: hid, name: "Home", currency: "SEK", memberId: expect.any(Number), role: "admin" }]);
    const aliceId = me.households[0].memberId;
    const detail = await alice.get<HouseholdDetail>(`/h/${hid}`);
    expect(detail.me).toMatchObject({ name: "Alice", role: "admin" });
    const code = detail.inviteCode!;
    expect(code).toMatch(/^[\w-]{16}$/);

    // join
    const bob = anon(app);
    expect((await bob.get<MeResponse>("/me")).households).toEqual([]);
    await bob.get(`/h/${hid}`, 403);
    expect(await bob.get(`/join/${code}`)).toMatchObject({ householdName: "Home", memberId: null });
    await bob.get("/join/nope", 404);
    await bob.post(`/join/${code}`, { name: "" }, 400);
    const { memberId: bobId } = await bob.post<{ memberId: number }>(`/join/${code}`, { name: "Bob" });
    expect(bob.jar.get("mtok")).toBeTruthy();
    expect(await bob.post(`/join/${code}`, { name: "Bob again" })).toEqual({ householdId: hid, memberId: bobId });
    expect((await bob.get<MeResponse>("/me")).households).toMatchObject([{ id: hid, role: "member", memberId: bobId }]);
    expect((await bob.get<HouseholdDetail>(`/h/${hid}`)).inviteCode).toBeNull();
    await bob.post(`/h/${hid}/invite/rotate`, undefined, 403);
    await bob.patch(`/h/${hid}/me`, { swishNumber: "070-123 45 67" });

    const carol = anon(app);
    const { memberId: carolId } = await carol.post<{ memberId: number }>(`/join/${code}`, { name: "Carol" });
    expect((await alice.get<HouseholdDetail>(`/h/${hid}`)).members.map((m) => m.name)).toEqual(["Alice", "Bob", "Carol"]);

    // lists: owner-only editing
    const aList = await alice.post<List>(`/h/${hid}/lists`, { title: "Groceries", color: "green" });
    await alice.post(`/h/${hid}/lists`, { title: "x", color: "mauve" }, 400);
    const milk = await alice.post<Item>(`/h/${hid}/lists/${aList.id}/items`, { text: "Milk", quantity: "2 l" });
    const eggs = await alice.post<Item>(`/h/${hid}/lists/${aList.id}/items`, { text: "Eggs" });
    expect(eggs.price).toBeNull();
    expect(await alice.patch<Item>(`/h/${hid}/items/${eggs.id}`, { price: 4500 })).toMatchObject({ price: 4500, text: "Eggs" });
    await alice.patch(`/h/${hid}/items/${eggs.id}`, { price: -1 }, 400);
    await alice.patch(`/h/${hid}/items/${eggs.id}`, { price: 1.5 }, 400);
    expect(await alice.patch<Item>(`/h/${hid}/items/${eggs.id}`, { price: null })).toMatchObject({ price: null });
    expect(eggs.position).toBeGreaterThan(milk.position);
    const bList = await bob.post<List>(`/h/${hid}/lists`, { title: "Bob stuff" });
    const bread = await bob.post<Item>(`/h/${hid}/lists/${bList.id}/items`, { text: "Bread" });
    await bob.patch(`/h/${hid}/lists/${aList.id}`, { title: "mine now" }, 403);
    await bob.post(`/h/${hid}/lists/${aList.id}/items`, { text: "Chips" }, 403);
    await bob.patch(`/h/${hid}/items/${milk.id}`, { text: "Oat milk" }, 403);
    await bob.del(`/h/${hid}/items/${milk.id}`, 403);
    expect(await alice.patch<Item>(`/h/${hid}/items/${milk.id}`, { note: "lactose free" })).toMatchObject({ note: "lactose free" });
    const lists = await carol.get<List[]>(`/h/${hid}/lists`);
    expect(lists.map((l) => [l.title, l.items.map((i) => i.text)])).toEqual([["Groceries", ["Milk", "Eggs"]], ["Bob stuff", ["Bread"]]]);

    // trip: carol shops alice's and bob's lists
    const trip = await carol.post<Trip>(`/h/${hid}/trips`, { listIds: [aList.id, bList.id], store: "ICA" });
    expect(trip).toMatchObject({ shopperId: carolId, status: "active", listIds: [aList.id, bList.id] });
    await alice.post(`/h/${hid}/trips`, { listIds: [aList.id] }, 409);
    const ops = { ops: [{ itemId: milk.id, status: "checked" }, { itemId: eggs.id, status: "skipped" }, { itemId: bread.id, status: "checked" }, { itemId: 999999, status: "checked" }] };
    await carol.post(`/h/${hid}/trips/${trip.id}/ops`, ops);
    await bob.post(`/h/${hid}/trips/${trip.id}/ops`, ops); // replay by anyone is harmless
    await carol.post(`/h/${hid}/trips/${trip.id}/ops`, { ops: [{ itemId: milk.id, status: "bogus" }] }, 400);
    await bob.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [] }, 403);
    await carol.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [{ ownerId: 999999, amount: 1 }] }, 400);
    await carol.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [{ ownerId: aliceId, amount: -1 }] }, 400);
    const closed = await carol.post<Trip>(`/h/${hid}/trips/${trip.id}/checkout`, {
      allocations: [{ ownerId: aliceId, amount: 30000 }, { ownerId: bobId, amount: 20000 }],
    });
    expect(closed.status).toBe("closed");
    expect(closed.boughtItems.map((i) => i.text).sort()).toEqual(["Bread", "Milk"]);
    await carol.post(`/h/${hid}/trips/${trip.id}/ops`, ops, 409);
    const after = await alice.get<List[]>(`/h/${hid}/lists`);
    expect(after[0].items).toMatchObject([{ text: "Eggs", status: "open", tripId: null }]);
    // Everything on Bob's list got bought, so the list is gone from the lists page (but not from the trip).
    expect(after.map((l) => l.title)).toEqual(["Groceries"]);

    const balances = () => alice.get<BalancesResponse>(`/h/${hid}/balances`);
    expect((await balances()).pairs).toEqual([
      { from: aliceId, to: carolId, amount: 30000 },
      { from: bobId, to: carolId, amount: 20000 },
    ]);

    // opposing expense: alice paid 500 kr dinner shared with carol → carol owes alice 250, netted
    const exp = await alice.post<{ id: number; shares: unknown[] }>(`/h/${hid}/expenses`, {
      title: "Dinner", amount: 50000, payerId: aliceId, splitMode: "equal", date: today,
      participants: [{ memberId: aliceId, weight: 1 }, { memberId: carolId, weight: 1 }],
    });
    expect(exp.shares).toHaveLength(2);
    await alice.post(`/h/${hid}/expenses`, {
      title: "Bad", amount: 100, payerId: aliceId, splitMode: "exact", date: today,
      participants: [{ memberId: aliceId, weight: 50 }],
    }, 400);
    await bob.patch(`/h/${hid}/expenses/${exp.id}`, { title: "x" }, 403);
    expect((await balances()).pairs).toEqual([
      { from: bobId, to: carolId, amount: 20000 },
      { from: aliceId, to: carolId, amount: 5000 },
    ]);

    // settlement reduces the balance
    const s = await bob.post<{ id: number }>(`/h/${hid}/settlements`, { fromId: bobId, toId: carolId, amount: 15000 });
    expect((await balances()).pairs).toEqual([
      { from: aliceId, to: carolId, amount: 5000 },
      { from: bobId, to: carolId, amount: 5000 },
    ]);
    await alice.del(`/h/${hid}/settlements/${s.id}`, 403); // third party cannot delete
    expect((await balances()).settlements).toHaveLength(1);

    const activity = await carol.get<{ kind: string }[]>(`/h/${hid}/activity`);
    expect(activity.map((a) => a.kind)).toEqual(["settlement", "expense", "trip"]);
    expect((await balances()).simplified).toEqual((await balances()).pairs); // star shape: nothing to simplify

    const stats = await bob.get<StatsEntry[]>(`/h/${hid}/stats`);
    expect(stats.map((e) => [e.kind, e.total]).sort()).toEqual([["expense", 50000], ["trip", 50000]]);
    expect(stats.find((e) => e.kind === "trip")!.shares).toEqual(expect.arrayContaining([{ memberId: aliceId, amount: 30000 }, { memberId: bobId, amount: 20000 }]));
    expect(stats.find((e) => e.kind === "expense")).toMatchObject({ date: today, label: null });

    // cross-household isolation
    const { id: other } = await alice.post<{ id: number }>("/households", { name: "Other" });
    const otherList = await alice.post<List>(`/h/${other}/lists`, { title: "Secret" });
    await bob.get(`/h/${other}`, 403);
    await bob.get(`/h/${other}/lists`, 403);
    await bob.get(`/h/${other}/events`, 403);
    await bob.patch(`/h/${hid}/lists/${otherList.id}`, { title: "pwned" }, 404);
    await alice.post(`/h/${hid}/trips`, { listIds: [otherList.id] }, 404);
    await alice.post(`/h/${hid}/expenses`, {
      title: "x", amount: 100, payerId: aliceId, splitMode: "equal", date: today,
      participants: [{ memberId: (await alice.get<HouseholdDetail>(`/h/${other}`)).me.id, weight: 1 }],
    }, 400);

    // admin: rotate invite, recovery link, remove member
    const { inviteCode } = await alice.post<{ inviteCode: string }>(`/h/${hid}/invite/rotate`);
    expect(inviteCode).not.toBe(code);
    await anon(app).get(`/join/${code}`, 404);
    const { recoveryUrl } = await alice.post<{ recoveryUrl: string }>(`/h/${hid}/members/${bobId}/recovery`);
    expect(recoveryUrl.startsWith(`${config.publicUrl}/api/recover/`)).toBe(true);
    await bob.get(`/h/${hid}`, 403); // old token rotated away
    const bobPhone = anon(app);
    const r = await bobPhone.req("GET", recoveryUrl.slice(`${config.publicUrl}/api`.length));
    expect([r.status, r.headers.get("location")]).toEqual([302, "/"]);
    expect((await bobPhone.get<HouseholdDetail>(`/h/${hid}`)).me).toMatchObject({ id: bobId, swishNumber: "070-123 45 67" });
    const own = await bobPhone.get<{ recoveryUrl: string }>(`/h/${hid}/me/recovery`);
    expect(own.recoveryUrl).toBe(recoveryUrl);
    const bad = await anon(app).req("GET", "/recover/nope");
    expect(bad.headers.get("location")).toBe("/?error=invalid-recovery");

    await alice.del(`/h/${hid}/members/${aliceId}`, 400);
    await bobPhone.del(`/h/${hid}/members/${carolId}`, 403);
    await alice.del(`/h/${hid}/members/${carolId}`);
    await carol.get(`/h/${hid}`, 403);
    const members = (await alice.get<HouseholdDetail>(`/h/${hid}`)).members;
    expect(members.find((m) => m.id === carolId)?.removed).toBe(true);
    await alice.post(`/h/${hid}/settlements`, { fromId: aliceId, toId: carolId, amount: 1 }, 400);
  });

  it("streams change events over SSE", async () => {
    const alice = client(app);
    const { id: hid } = await alice.post<{ id: number }>("/households", { name: "Live" });
    const ac = new AbortController();
    const r = await app.request(`/api/h/${hid}/events`, { signal: ac.signal });
    expect(r.headers.get("content-type")).toContain("text/event-stream");
    const reader = r.body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    await alice.post(`/h/${hid}/lists`, { title: "Live list" });
    while (!buf.includes("data:")) buf += dec.decode((await reader.read()).value);
    expect(buf).toContain(JSON.stringify({ scope: ["lists"] }));
    ac.abort();
    await reader.cancel();
    await new Promise((res) => setTimeout(res, 10));
    expect(bus.listenerCount(hid)).toBe(0);
  });
});

describe("api in oidc mode", () => {
  it("anonymous viewers see nothing and cannot create households", async () => {
    const app = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv));
    const c = client(app);
    expect(await c.get("/me")).toEqual({ user: null, authMode: "oidc", households: [] });
    await c.post("/households", { name: "x" }, 401);
    await c.get("/h/1", 403);
  });
});

describe("there are no empty lists", () => {
  let app: App;
  let hid: number;
  let me: ReturnType<typeof client>;
  beforeAll(async () => {
    app = createApp(createDb(":memory:"), config, new EventBus());
    me = client(app);
    ({ id: hid } = await me.post<{ id: number }>("/households", { name: "Home", adminName: "Alice" }));
  });
  const titles = async () => (await me.get<List[]>(`/h/${hid}/lists`)).map((l) => l.title);

  it("deletes a list when its last item is deleted", async () => {
    const l = await me.post<List>(`/h/${hid}/lists`, { title: "Once" });
    const a = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "A" });
    const b = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "B" });
    await me.del(`/h/${hid}/items/${a.id}`);
    expect(await titles()).toContain("Once");
    await me.del(`/h/${hid}/items/${b.id}`);
    expect(await titles()).not.toContain("Once");
    await me.patch(`/h/${hid}/lists/${l.id}`, { title: "back?" }, 404);
  });

  it("keeps a new list until something is added, and a list with things left after a trip", async () => {
    const l = await me.post<List>(`/h/${hid}/lists`, { title: "New" });
    expect(await titles()).toContain("New");
    const keep = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "Keep" });
    const buy = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "Buy" });
    const trip = await me.post<Trip>(`/h/${hid}/trips`, { listIds: [l.id] });
    await me.post(`/h/${hid}/trips/${trip.id}/ops`, { ops: [{ itemId: buy.id, status: "checked" }] });
    await me.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [] });
    const lists = await me.get<List[]>(`/h/${hid}/lists`);
    expect(lists.find((x) => x.id === l.id)?.items.map((i) => i.text)).toEqual([keep.text]);
  });

  it("archives a fully bought list: gone from lists and new trips, still in the trip's history", async () => {
    const l = await me.post<List>(`/h/${hid}/lists`, { title: "All of it" });
    const milk = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "Milk" });
    const trip = await me.post<Trip>(`/h/${hid}/trips`, { listIds: [l.id] });
    await me.post(`/h/${hid}/trips/${trip.id}/ops`, { ops: [{ itemId: milk.id, status: "checked" }] });
    // While the trip is on, the list stays even with nothing open left on it.
    expect(await titles()).toContain("All of it");
    const closed = await me.post<Trip>(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [] });
    expect(closed.boughtItems.map((i) => i.text)).toEqual(["Milk"]);
    expect(await titles()).not.toContain("All of it");
    await me.post(`/h/${hid}/trips`, { listIds: [l.id] }, 404);
    const history = await me.get<Trip[]>(`/h/${hid}/trips`);
    expect(history.find((t) => t.id === trip.id)?.boughtItems.map((i) => i.text)).toEqual(["Milk"]);
  });

  it("leaves a list in an active trip alone when its last item is deleted, until checkout", async () => {
    const l = await me.post<List>(`/h/${hid}/lists`, { title: "Mid-trip" });
    const x = await me.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "X" });
    const trip = await me.post<Trip>(`/h/${hid}/trips`, { listIds: [l.id] });
    await me.del(`/h/${hid}/items/${x.id}`);
    expect(await titles()).toContain("Mid-trip");
    await me.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [] });
    expect(await titles()).not.toContain("Mid-trip");
  });
});

describe("bjudningar, guests and the green zone", () => {
  let app: App;
  let hid: number;
  let alice: ReturnType<typeof client>;
  let bob: ReturnType<typeof client>;
  let [aliceId, bobId, carolId] = [0, 0, 0];
  beforeEach(async () => {
    app = createApp(createDb(":memory:"), config, new EventBus());
    alice = client(app);
    ({ id: hid } = await alice.post<{ id: number }>("/households", { name: "Home", adminName: "Alice" }));
    aliceId = (await alice.get<MeResponse>("/me")).households[0].memberId;
    const code = (await alice.get<HouseholdDetail>(`/h/${hid}`)).inviteCode!;
    bob = anon(app);
    bobId = (await bob.post<{ memberId: number }>(`/join/${code}`, { name: "Bob" })).memberId;
    carolId = (await anon(app).post<{ memberId: number }>(`/join/${code}`, { name: "Carol" })).memberId;
  });
  const expense = (body: Record<string, unknown>, status = 200) =>
    alice.post<Expense>(`/h/${hid}/expenses`, { title: "x", payerId: aliceId, splitMode: "equal", date: today, ...body }, status);
  const balances = () => alice.get<BalancesResponse>(`/h/${hid}/balances`);

  it("a shopper may split a trip on any member, also when only their own lists are in it", async () => {
    const l = await alice.post<List>(`/h/${hid}/lists`, { title: "Mine" });
    const it1 = await alice.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "Gift", price: 25000 });
    expect(it1.price).toBe(25000);
    const trip = await alice.post<Trip>(`/h/${hid}/trips`, { listIds: [l.id] });
    await alice.post(`/h/${hid}/trips/${trip.id}/ops`, { ops: [{ itemId: it1.id, status: "checked" }] });
    await alice.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [{ ownerId: 999999, amount: 100 }] }, 400);
    await alice.post(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [{ ownerId: bobId, amount: 12500 }, { ownerId: carolId, amount: 12500 }] });
    expect((await balances()).pairs).toEqual([
      { from: bobId, to: aliceId, amount: 12500 },
      { from: carolId, to: aliceId, amount: 12500 },
    ]);
  });

  it("a closed trip's split can be redone by the shopper or an admin until a payment covers it", async () => {
    const l = await bob.post<List>(`/h/${hid}/lists`, { title: "Bob's" });
    const i = await bob.post<Item>(`/h/${hid}/lists/${l.id}/items`, { text: "Pan" });
    const trip = await bob.post<Trip>(`/h/${hid}/trips`, { listIds: [l.id] });
    await bob.post(`/h/${hid}/trips/${trip.id}/ops`, { ops: [{ itemId: i.id, status: "checked" }] });
    const closed = await bob.post<Trip>(`/h/${hid}/trips/${trip.id}/checkout`, { allocations: [{ ownerId: bobId, amount: 20000 }] });
    expect(closed.locked).toBe(false);
    await bob.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: bobId, amount: 10000 }, { ownerId: carolId, amount: 10000 }] });
    expect((await balances()).pairs).toEqual([{ from: carolId, to: bobId, amount: 10000 }]);
    // guests share the bill without a debt; their share is stored on the trip, not in the ledger
    await bob.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: carolId, amount: 10000 }], guestAmount: 100 }, 400);
    await bob.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [], guests: 21 }, 400);
    const withGuest = await bob.patch<Trip>(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: bobId, amount: 5000 }, { ownerId: carolId, amount: 10000 }], guests: 1, guestAmount: 5000 });
    expect(withGuest).toMatchObject({ guests: 1, guestAmount: 5000 });
    expect((await balances()).pairs).toEqual([{ from: carolId, to: bobId, amount: 10000 }]);
    await bob.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: bobId, amount: 10000 }, { ownerId: carolId, amount: 10000 }] });
    // an admin (alice) may change it too; bad ids are refused
    await alice.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: 999999, amount: 1 }] }, 400);
    await alice.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [{ ownerId: aliceId, amount: 5000 }, { ownerId: carolId, amount: 15000 }] });
    expect((await balances()).pairs).toEqual(expect.arrayContaining([{ from: aliceId, to: bobId, amount: 5000 }, { from: carolId, to: bobId, amount: 15000 }]));
    // an active trip is not editable this way
    const l2 = await alice.post<List>(`/h/${hid}/lists`, { title: "A" });
    await alice.post(`/h/${hid}/lists/${l2.id}/items`, { text: "x" });
    const t2 = await alice.post<Trip>(`/h/${hid}/trips`, { listIds: [l2.id] });
    await alice.patch(`/h/${hid}/trips/${t2.id}`, { allocations: [] }, 409);
    // carol pays bob back: the split is locked
    await alice.post(`/h/${hid}/settlements`, { fromId: carolId, toId: bobId, amount: 15000 });
    expect((await alice.get<Trip[]>(`/h/${hid}/trips`)).find((x) => x.id === trip.id)?.locked).toBe(true);
    await bob.patch(`/h/${hid}/trips/${trip.id}`, { allocations: [] }, 409);
  });

  it("a gift creates no debt, may be unpriced, and stays out of stats but in the activity feed", async () => {
    const g = await expense({ title: "Middag hemma", gift: true, category: "home", participants: [{ memberId: bobId, weight: 1 }, { memberId: carolId, weight: 1 }] });
    expect(g).toMatchObject({ gift: true, amount: 0, guests: 0, guestAmount: 0 });
    expect(g.shares.map((x) => [x.memberId, x.amount])).toEqual([[bobId, 0], [carolId, 0]]);
    expect((await balances()).pairs).toEqual([]);
    expect(await alice.get<StatsEntry[]>(`/h/${hid}/stats`)).toEqual([]);
    expect((await alice.get<Activity[]>(`/h/${hid}/activity`)).map((a) => a.kind)).toEqual(["expense"]);
    // a priced gift still creates no debt
    await expense({ title: "Vin", gift: true, amount: 40000, participants: [{ memberId: bobId, weight: 1 }] });
    expect((await balances()).pairs).toEqual([]);
  });

  it("only gifts may be unpriced, and bad gift or guest input is rejected", async () => {
    await expense({ amount: 0, participants: [{ memberId: aliceId, weight: 1 }] }, 400);
    await expense({ gift: "yes", participants: [] }, 400);
    await expense({ gift: true, participants: [{ memberId: bobId, weight: 1 }, { memberId: bobId, weight: 1 }] }, 400);
    await expense({ amount: 1000, guests: 21, participants: [{ memberId: aliceId, weight: 1 }] }, 400);
    await expense({ amount: 1000, guests: -1, participants: [{ memberId: aliceId, weight: 1 }] }, 400);
    await expense({ amount: 1000, guests: 1, splitMode: "shares", participants: [{ memberId: aliceId, weight: 1 }] }, 400);
    await expense({ amount: 1000, guests: 1, participants: [] }, 400);
  });

  it("splits over members plus an anonymous guest: the guest's share is shown but never owed in the ledger", async () => {
    const e = await expense({ title: "Dart och pizza", amount: 50000, guests: 1, participants: [aliceId, bobId, carolId].map((memberId) => ({ memberId, weight: 1 })) });
    // 500 kr over 3 members + 1 guest = 125 kr each
    expect(e).toMatchObject({ guests: 1, guestAmount: 12500 });
    expect(e.shares.map((x) => x.amount)).toEqual([12500, 12500, 12500]);
    expect((await balances()).pairs).toEqual([
      { from: bobId, to: aliceId, amount: 12500 },
      { from: carolId, to: aliceId, amount: 12500 },
    ].sort((a, b) => a.from - b.from));
    // editing to a gift removes the debts; the guest count and amount follow the edit
    const g = await alice.patch<Expense>(`/h/${hid}/expenses/${e.id}`, { title: "Dart och pizza", payerId: aliceId, splitMode: "equal", date: today, gift: true, participants: [{ memberId: bobId, weight: 1 }] });
    expect(g).toMatchObject({ gift: true, guests: 0, guestAmount: 0 });
    expect((await balances()).pairs).toEqual([]);
  });

  it("keeps exact balances and flips between kvitt and outside the zone: 99 kr then 50 kr more is 149 kr", async () => {
    const both = [aliceId, bobId].map((memberId) => ({ memberId, weight: 1 }));
    await expense({ amount: 19800, participants: both }); // Bob owes Alice 99 kr
    let b = await balances();
    expect(b.zoneKr).toBe(100);
    expect(b.totals).toEqual([{ memberId: aliceId, net: 9900 }, { memberId: bobId, net: -9900 }, { memberId: carolId, net: 0 }]);
    expect(b.plan.inside).toBe(true);
    expect(b.plan.payments.every((p) => p.optional)).toBe(true);
    await expense({ amount: 10000, participants: both }); // 50 kr more
    b = await balances();
    expect(b.pairs).toEqual([{ from: bobId, to: aliceId, amount: 14900 }]);
    expect(b.plan).toEqual({ inside: false, outside: [aliceId, bobId], payments: [{ from: bobId, to: aliceId, amount: 14900, optional: false }] });
  });

  it("household settings: defaults, admin-only updates and validation", async () => {
    const d = await alice.get<HouseholdDetail>(`/h/${hid}`);
    expect(d.settings).toEqual({ zoneKr: 100, giftCategories: ["home"], categoryLabels: {}, hintEnabled: true, hintMonths: 1 });
    await bob.patch(`/h/${hid}`, { zoneKr: 500 }, 403);
    await alice.patch(`/h/${hid}`, { zoneKr: 250, hintMonths: 3, hintEnabled: false, giftCategories: ["other", "other", "drinks"] });
    expect((await bob.get<HouseholdDetail>(`/h/${hid}`)).settings).toEqual({ zoneKr: 250, giftCategories: ["other", "drinks"], categoryLabels: {}, hintEnabled: false, hintMonths: 3 });
    await alice.patch(`/h/${hid}`, { hintMonths: 0 }, 400);
    await alice.patch(`/h/${hid}`, { zoneKr: -1 }, 400);
    await alice.patch(`/h/${hid}`, { zoneKr: 1.5 }, 400);
    await alice.patch(`/h/${hid}`, { hintEnabled: "no" }, 400);
    await alice.patch(`/h/${hid}`, { giftCategories: [1] }, 400);
    await alice.patch(`/h/${hid}`, { categoryLabels: { fika: "Fika" } }, 400);
    await alice.patch(`/h/${hid}`, { categoryLabels: { home: "x".repeat(25) } }, 400);
    await alice.patch(`/h/${hid}`, { categoryLabels: { home: 1 } }, 400);
    await alice.patch(`/h/${hid}`, { categoryLabels: [] }, 400);
    await bob.patch(`/h/${hid}`, { categoryLabels: { home: "Middag" } }, 403);
    // slots can be renamed (trimmed), an empty name goes back to the default, and the whole map is replaced
    await alice.patch(`/h/${hid}`, { categoryLabels: { home: " Middag ", drinks: "Pubrunda", other: "" } });
    expect((await bob.get<HouseholdDetail>(`/h/${hid}`)).settings.categoryLabels).toEqual({ home: "Middag", drinks: "Pubrunda" });
    await alice.patch(`/h/${hid}`, { categoryLabels: { restaurant: "Ute" } });
    expect((await bob.get<HouseholdDetail>(`/h/${hid}`)).settings.categoryLabels).toEqual({ restaurant: "Ute" });
    // a wider zone changes the view, not the balances
    await expense({ amount: 19800, participants: [aliceId, bobId].map((memberId) => ({ memberId, weight: 1 })) });
    await alice.patch(`/h/${hid}`, { zoneKr: 5 });
    expect((await balances()).plan.inside).toBe(false);
    await alice.patch(`/h/${hid}`, { zoneKr: 100 });
    expect((await balances()).plan.inside).toBe(true);
  });

  it("lists bjudningar with who treated last, and shows the hint only after the set time and the first bjudning", async () => {
    expect(await alice.get<GiftsResponse>(`/h/${hid}/gifts`)).toEqual({ gifts: [], lastByMember: [], hint: false });
    await expense({ gift: true, date: "2020-01-01", category: "other", participants: [] });
    await expense({ gift: true, date: "2020-01-05", payerId: bobId, category: "home", participants: [] });
    await expense({ amount: 1000, date: today, participants: [{ memberId: aliceId, weight: 1 }] }); // a shared expense is not a bjudning
    const g = await alice.get<GiftsResponse>(`/h/${hid}/gifts`);
    expect(g.gifts.map((x) => x.date)).toEqual(["2020-01-05", "2020-01-01"]);
    expect(g.lastByMember).toEqual([{ memberId: aliceId, date: "2020-01-01" }, { memberId: bobId, date: "2020-01-05" }]);
    expect(g.hint).toBe(true);
    await alice.patch(`/h/${hid}`, { hintEnabled: false });
    expect((await alice.get<GiftsResponse>(`/h/${hid}/gifts`)).hint).toBe(false);
    await alice.patch(`/h/${hid}`, { hintEnabled: true });
    await expense({ gift: true, date: today, participants: [] });
    expect((await alice.get<GiftsResponse>(`/h/${hid}/gifts`)).hint).toBe(false);
  });
});

describe("plånböcker and bilutgifter", () => {
  let app: App;
  let hid: number;
  let didde: ReturnType<typeof client>;
  let sambon: ReturnType<typeof client>;
  let jonna: ReturnType<typeof client>;
  let [diddeId, sambonId, jonnaId] = [0, 0, 0];
  beforeEach(async () => {
    app = createApp(createDb(":memory:"), config, new EventBus());
    didde = client(app);
    ({ id: hid } = await didde.post<{ id: number }>("/households", { name: "Sälen", adminName: "Didde" }));
    diddeId = (await didde.get<MeResponse>("/me")).households[0].memberId;
    const code = (await didde.get<HouseholdDetail>(`/h/${hid}`)).inviteCode!;
    sambon = anon(app);
    sambonId = (await sambon.post<{ memberId: number }>(`/join/${code}`, { name: "Sambon" })).memberId;
    jonna = anon(app);
    jonnaId = (await jonna.post<{ memberId: number }>(`/join/${code}`, { name: "Jonna" })).memberId;
  });
  const balances = () => didde.get<BalancesResponse>(`/h/${hid}/balances`);
  const car = { mode: "fuel", distanceMil: 41, roundTrip: true, consumption: 0.65, fuelPrice: 19.5, rate: null, deductIds: [], deducted: 0 };

  it("a wallet puts a couple's debts on the lead and hides debts between them", async () => {
    // Sambon pays 600 for all three, Jonna pays 300 for Sambon only.
    await sambon.post(`/h/${hid}/expenses`, { title: "Mat", amount: 60000, payerId: sambonId, splitMode: "equal", date: today, participants: [{ memberId: diddeId }, { memberId: sambonId }, { memberId: jonnaId }] });
    await jonna.post(`/h/${hid}/expenses`, { title: "Snacks", amount: 30000, payerId: jonnaId, splitMode: "equal", date: today, participants: [{ memberId: sambonId }] });
    await sambon.patch(`/h/${hid}/members/${sambonId}/wallet`, { walletId: diddeId });
    const b = await balances();
    // Didde owed Sambon 200 (gone), Jonna owed Sambon 200, Sambon owed Jonna 300 → the wallet owes Jonna 100.
    expect(b.pairs).toEqual([{ from: diddeId, to: jonnaId, amount: 10000 }]);
    expect(b.totals.map((t) => t.memberId)).toEqual([diddeId, jonnaId]);
    expect((await didde.get<HouseholdDetail>(`/h/${hid}`)).members.find((m) => m.id === sambonId)?.walletId).toBe(diddeId);
    // leaving brings the per-person view back
    await sambon.patch(`/h/${hid}/members/${sambonId}/wallet`, { walletId: null });
    expect((await balances()).totals.map((t) => t.memberId)).toEqual([diddeId, sambonId, jonnaId]);
  });

  it("guards wallets: no self, no chains, members only change their own, removal dissolves", async () => {
    await sambon.patch(`/h/${hid}/members/${sambonId}/wallet`, { walletId: sambonId }, 400);
    await jonna.patch(`/h/${hid}/members/${sambonId}/wallet`, { walletId: jonnaId }, 403);
    await sambon.patch(`/h/${hid}/members/${sambonId}/wallet`, { walletId: diddeId });
    await jonna.patch(`/h/${hid}/members/${jonnaId}/wallet`, { walletId: sambonId }, 400); // Sambon is in Didde's wallet
    await didde.patch(`/h/${hid}/members/${diddeId}/wallet`, { walletId: jonnaId }, 400); // Didde leads a wallet
    await didde.patch(`/h/${hid}/members/${jonnaId}/wallet`, { walletId: diddeId }); // admin may set anyone
    await didde.del(`/h/${hid}/members/${sambonId}`);
    const detail = await didde.get<HouseholdDetail>(`/h/${hid}`);
    expect(detail.members.find((m) => m.id === sambonId)?.walletId).toBeNull();
    expect(detail.members.find((m) => m.id === jonnaId)?.walletId).toBe(diddeId);
  });

  it("stores the car calculation, prefills from it and offers tankningar to deduct once", async () => {
    const fuel = await jonna.post<Expense>(`/h/${hid}/expenses`, { title: "Tankning Mora", amount: 64000, payerId: jonnaId, splitMode: "equal", date: today, participants: [{ memberId: diddeId }, { memberId: sambonId }] });
    let help = await jonna.get<CarHelpResponse>(`/h/${hid}/car/${jonnaId}`);
    expect(help).toEqual({ last: null, fuel: [{ id: fuel.id, title: "Tankning Mora", amount: 64000, date: today }] });
    const drive = await jonna.post<Expense>(`/h/${hid}/expenses`, {
      title: "Bil 2", amount: 39900, payerId: jonnaId, splitMode: "equal", date: today,
      participants: [{ memberId: diddeId }, { memberId: sambonId }], car: { ...car, deductIds: [fuel.id], deducted: 64000 },
    });
    expect(drive.car).toMatchObject({ mode: "fuel", distanceMil: 41, deductIds: [fuel.id], deducted: 64000 });
    help = await jonna.get<CarHelpResponse>(`/h/${hid}/car/${jonnaId}`);
    expect(help.last?.consumption).toBe(0.65);
    expect(help.fuel).toEqual([]); // already deducted by the drive
    expect((await jonna.get<CarHelpResponse>(`/h/${hid}/car/${jonnaId}?exclude=${drive.id}`)).fuel).toHaveLength(1); // editing the drive
    // bad input
    await jonna.post(`/h/${hid}/expenses`, { title: "x", amount: 100, payerId: jonnaId, splitMode: "equal", date: today, participants: [{ memberId: diddeId }], car: { ...car, consumption: null } }, 400);
    await jonna.post(`/h/${hid}/expenses`, { title: "x", amount: 100, payerId: jonnaId, splitMode: "equal", date: today, participants: [{ memberId: diddeId }], car: { ...car, mode: "boat" } }, 400);
  });
});
