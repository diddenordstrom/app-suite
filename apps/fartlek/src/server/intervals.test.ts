import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { createIntervalsPusher } from "./intervals";
import { addDays, todayIn } from "../shared/dates";

const ORIGIN = "http://localhost:5173";
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

/** A stand-in for intervals.icu: the athlete, and events upserted / deleted by external_id. */
function fakeIntervals(athlete: Record<string, unknown>) {
  const events = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  let auth = "";
  const fetchFn = (async (url: string, init: RequestInit) => {
    const u = new URL(url);
    const method = init.method ?? "GET";
    calls.push(`${method} ${u.pathname}`);
    auth = String((init.headers as Record<string, string>).Authorization);
    if (auth !== `Basic ${Buffer.from("API_KEY:good-key-123").toString("base64")}`) return new Response("", { status: 401 });
    if (u.pathname === "/api/v1/athlete/0") return Response.json(athlete);
    if (u.pathname === "/api/v1/athlete/0/events/bulk") {
      expect(u.searchParams.get("upsert")).toBe("true");
      const body = JSON.parse(String(init.body)) as Record<string, unknown>[];
      return Response.json(body.map((e) => {
        events.set(String(e.external_id), e);
        // Echo a parsed workout_doc: one step per line starting with "- ", repeat blocks as groups.
        const blocks = String(e.description).split("\n\n").map((b) => b.split("\n"));
        const steps = blocks.flatMap((lines) => /^\d+x$/.test(lines[0])
          ? [{ reps: Number(lines[0].slice(0, -1)), steps: lines.slice(1).filter((l) => l.startsWith("- ")) }]
          : lines.filter((l) => l.startsWith("- ")).map(() => ({})));
        return { ...e, id: events.size, workout_doc: { steps } };
      }));
    }
    if (u.pathname === "/api/v1/athlete/0/events/bulk-delete") {
      const body = JSON.parse(String(init.body)) as { external_id: string }[];
      for (const b of body) events.delete(b.external_id);
      return Response.json({ eventsDeleted: body.length });
    }
    return new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetchFn, events, calls };
}

describe("intervals.icu push", () => {
  const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
  const fake = fakeIntervals({ id: "i42", name: "Didde", sportSettings: [{ types: ["Ride"] }, { types: ["Run", "TrailRun"], lthr: 170, threshold_pace: 4.0 }] });
  const db = createDb(":memory:");
  const pusher = createIntervalsPusher(db, config, fake.fetchFn);
  const app = createApp(db, config, { pusher });
  const get = async <T,>(p: string) => (await app.request(p)).json() as Promise<T>;
  let today = "";
  let userId = 0;

  beforeAll(async () => {
    const me = await get<{ user: { id: number } }>("/api/auth/me");
    userId = me.user.id;
    today = todayIn((await get<{ timezone: string }>("/api/settings")).timezone);
    await app.request("/api/thresholds", json({ effectiveDate: "2020-01-01", paceSecPerKm: 250, hr: 170 }));
  });

  it("rejects a bad key, connects with a good one and sends upcoming structured workouts only", async () => {
    expect((await app.request("/api/intervals", json({ apiKey: "bad-key-0000" }, "PUT"))).status).toBe(400);

    const w = async (date: string, type: string, stepsText?: string) =>
      (await (await app.request("/api/workouts", json({ date, type, distanceKm: 8, ...(stepsText ? { stepsText } : {}) }))).json()) as { id: number };
    const thr = await w(addDays(today, 2), "threshold", "2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    await w(addDays(today, 3), "easy");
    await w(addDays(today, -2), "threshold", "3x8 min @tröskel");
    await w(addDays(today, 30), "threshold", "3x8 min @tröskel");

    const s = await (await app.request("/api/intervals", json({ apiKey: "good-key-123", lang: "sv" }, "PUT"))).json() as { connected: boolean; athleteName: string; sent: number; warnings: string[] };
    expect(s).toMatchObject({ connected: true, athleteName: "Didde", sent: 1, warnings: [] });
    expect([...fake.events.keys()]).toEqual([`fartlek-${thr.id}`]);
    expect(fake.events.get(`fartlek-${thr.id}`)).toMatchObject({
      category: "WORKOUT", type: "Run", start_date_local: `${addDays(today, 2)}T00:00:00`, name: "3×8 min tröskel",
    });
    expect(String(fake.events.get(`fartlek-${thr.id}`)!.description)).toContain("2x\n- 8m 3:55/km-4:30/km Pace intensity=active");

    // Nothing changed: nothing is sent again.
    fake.calls.length = 0;
    const again = await (await app.request("/api/intervals/push", { method: "POST", headers: { origin: ORIGIN } })).json() as { result: { sent: number; unchanged: number } };
    expect(again.result).toMatchObject({ sent: 0, unchanged: 1 });
    expect(fake.calls).toEqual(["GET /api/v1/athlete/0"]);

    // Home's button sends one workout again even when nothing changed, and says so in /home.
    fake.calls.length = 0;
    expect(await (await app.request(`/api/intervals/push/${thr.id}`, { method: "POST", headers: { origin: ORIGIN } })).json()).toEqual({ sent: true });
    expect(fake.calls).toContain("POST /api/v1/athlete/0/events/bulk");
    expect((await get<{ watch: { sent: number[] } }>("/api/home")).watch.sent).toEqual([thr.id]);
    expect((await get<{ sentIds: number[] }>("/api/intervals")).sentIds).toEqual([thr.id]);
    const easy = (await (await app.request("/api/workouts", json({ date: addDays(today, 1), type: "easy", distanceKm: 5 }))).json()) as { id: number };
    expect((await app.request(`/api/intervals/push/${easy.id}`, { method: "POST", headers: { origin: ORIGIN } })).status).toBe(400);

    // A move is pushed after the change, a drop deletes it there.
    await app.request(`/api/workouts/${thr.id}`, json({ date: addDays(today, 4) }, "PATCH"));
    await pusher.flush(userId);
    expect(fake.events.get(`fartlek-${thr.id}`)?.start_date_local).toBe(`${addDays(today, 4)}T00:00:00`);
    await app.request(`/api/workouts/${thr.id}`, json({ status: "dropped" }, "PATCH"));
    await pusher.flush(userId);
    expect(fake.events.size).toBe(0);
    expect(fake.calls.at(-1)).toBe("PUT /api/v1/athlete/0/events/bulk-delete");

    // Restored, then disconnected: the upcoming event goes and the account is forgotten.
    await app.request(`/api/workouts/${thr.id}`, json({ status: "planned" }, "PATCH"));
    await pusher.flush(userId);
    expect(fake.events.size).toBe(1);
    expect(await (await app.request("/api/intervals", { method: "DELETE", headers: { origin: ORIGIN } })).json()).toEqual({ connected: false });
    expect(fake.events.size).toBe(0);
  });

  it("warns when intervals.icu has no run threshold pace, and no LTHR when a step is judged on HR", async () => {
    const bare = fakeIntervals({ id: "i7", name: "B", sportSettings: [{ types: ["Run"] }] });
    const db2 = createDb(":memory:");
    const app2 = createApp(db2, config, { fetch: bare.fetchFn });
    await app2.request("/api/workouts", json({ date: addDays(todayIn("UTC"), 1), type: "easy", stepsText: "20 min @165" }));
    const s = await (await app2.request("/api/intervals", json({ apiKey: "good-key-123" }, "PUT"))).json() as { warnings: string[] };
    expect(s.warnings).toEqual(["intervals.noThresholdPace", "intervals.noLthr"]);
  });
});
