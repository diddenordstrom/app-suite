import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { backOffNow } from "./racephase";
import { ctxFor, weekSummaries } from "./analysis";
import { parseSteps } from "../shared/steps";

const ORIGIN = "http://localhost:5173";
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

// A fixed Wednesday, as in scenarios.test.ts: the app reads the clock.
const at = (day: string) => vi.setSystemTime(new Date(`${day}T10:00:00Z`));

describe("race paces of the race phase", () => {
  const app = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
  const get = async <T = Record<string, unknown>>(p: string) => (await app.request(p)).json() as Promise<T>;
  type Pace = { mp: number | null; hmp: number | null; source: string; overCap: boolean };
  type View = { raceId: number; kind: string; wip: number; paces: Pace; locked: boolean; lockedOn: string | null; question: { kind: string } | null } | null;
  type Next = { racePace: View };
  type RaceRow = { id: number; mpSec: number | null; hmpSec: number | null; paceSource: string | null; paceLockedOn: string | null };
  const item = (date: string) => [{ date, type: "easy", km: 6 }];

  beforeAll(() => { vi.useFakeTimers({ toFake: ["Date"] }); at("2026-11-18"); });
  afterAll(() => { vi.useRealTimers(); });

  it("proposes, locks on the first write of phase weeks, and asks again only after a B race", async () => {
    await app.request("/api/settings");
    // Outside a phase there is nothing to show.
    expect((await get<Next>("/api/plan/next-week?weekStart=2026-11-23")).racePace).toBeNull();

    // A marathon five weeks out, a goal and no history: the goal is the pace, and nothing is asked.
    const made = await (await app.request("/api/races", json({ name: "Marathon", date: "2026-12-27", distanceKm: 42.195, goalSeconds: 42.195 * 300, priority: "A" }))).json() as RaceRow[];
    const id = made[0].id;
    const first = (await get<Next>("/api/plan/next-week?weekStart=2026-11-23")).racePace!;
    expect(first).toMatchObject({ raceId: id, kind: "marathon", wip: 5, locked: false, question: null, paces: { mp: 300, source: "goal" } });
    expect((await get<RaceRow[]>("/api/races"))[0].paceLockedOn).toBeNull(); // a GET locks nothing

    expect((await app.request("/api/plan/next-week", json({ weekStart: "2026-11-23", items: item("2026-11-24"), replace: [] }))).status).toBe(200);
    expect((await get<RaceRow[]>("/api/races"))[0]).toMatchObject({ mpSec: 300, paceSource: "goal", paceLockedOn: "2026-11-18" });

    // Nothing to answer, so keeping is refused only when nothing is locked; a pace question needs a phase week.
    expect((await app.request(`/api/races/${id}/race-pace`, json({ choice: "nope" }))).status).toBe(400);

    // A B race is run after the lock: the engine asks before it plans phase weeks again.
    at("2026-11-25");
    await app.request("/api/races", json({ name: "Tune-up", date: "2026-11-24", distanceKm: 10, priority: "B", resultSeconds: 2700 }));
    const asked = (await get<Next>("/api/plan/next-week?weekStart=2026-11-30")).racePace!;
    expect(asked).toMatchObject({ locked: true, lockedOn: "2026-11-18", question: { kind: "recalc" }, paces: { mp: 300 } });
    const blocked = await app.request("/api/plan/next-week", json({ weekStart: "2026-11-30", items: item("2026-12-01"), replace: [] }));
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({ conflict: "racePace" });

    // Keep: the locked paces stay, the date is re-stamped, and the write goes through.
    const kept = await (await app.request(`/api/races/${id}/race-pace`, json({ choice: "keep" }))).json() as NonNullable<View>;
    expect(kept).toMatchObject({ locked: true, lockedOn: "2026-11-25", question: null, paces: { mp: 300, source: "goal" } });
    expect((await app.request("/api/plan/next-week", json({ weekStart: "2026-11-30", items: item("2026-12-01"), replace: [] }))).status).toBe(200);

    // The goal as the answer re-locks from the goal; "prediction" with no history falls to the goal as well.
    expect((await app.request(`/api/races/${id}/race-pace`, json({ choice: "goal" }))).status).toBe(200);
    expect((await get<RaceRow[]>("/api/races")).find((r) => r.id === id)).toMatchObject({ mpSec: 300, paceSource: "goal" });
  });

  it("answers for a race planned ahead, refuses a race without a phase, a goal without a goal time, and keep with nothing locked", async () => {
    const a = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
    await a.request("/api/settings");
    const far = await (await a.request("/api/races", json({ name: "Far", date: "2027-03-28", distanceKm: 42.195, priority: "A" }))).json() as RaceRow[];
    // 18 weeks out: a block planned ahead reaches its phase, so the question can be answered now.
    expect((await a.request(`/api/races/${far[0].id}/race-pace`, json({ choice: "prediction" }))).status).toBe(200);
    const ten = await (await a.request("/api/races", json({ name: "Ten", date: "2027-02-14", distanceKm: 10, priority: "A" }))).json() as RaceRow[];
    const tenId = ten.find((r) => r.name === "Ten")!.id;
    expect((await a.request(`/api/races/${tenId}/race-pace`, json({ choice: "prediction" }))).status).toBe(400); // not a marathon or half
    const near = await (await a.request("/api/races", json({ name: "Near", date: "2026-12-13", distanceKm: 21.0975, priority: "A" }))).json() as RaceRow[];
    const nearId = near.find((r) => r.name === "Near")!.id;
    // The next A race is the one that counts: the near half, not the far marathon.
    expect((await a.request(`/api/races/${nearId}/race-pace`, json({ choice: "goal" }))).status).toBe(400);
    expect((await a.request(`/api/races/${nearId}/race-pace`, json({ choice: "keep" }))).status).toBe(400);
    expect((await a.request(`/api/races/${nearId}/race-pace`, json({ choice: "prediction" }))).status).toBe(200);
  });

  it("real injury, not a bad day, holds the phase: pain 8, or 5 on three days, and only while a phase is on", async () => {
    at("2026-11-18");
    const a = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
    await a.request("/api/settings");
    const pain = (date: string, level: number) => a.request("/api/pain", json({ date, area: "knee", level }));
    const injury = async () => ((await (await a.request("/api/blocks")).json()) as { injury: { reason: string; level: number } | null }).injury;
    // Pain with no race ahead is not the phase's business.
    await pain("2026-11-18", 9);
    expect(await injury()).toBeNull();
    await a.request("/api/races", json({ name: "Marathon", date: "2026-12-27", distanceKm: 42.195, priority: "A" }));
    expect(await injury()).toMatchObject({ reason: "severe", level: 9 });
    const next = (await (await a.request("/api/plan/next-week?weekStart=2026-11-23")).json()) as { racePace: { injury: { reason: string } | null }; seed: { phase: { injury: boolean } } };
    expect(next.racePace.injury).toMatchObject({ reason: "severe" });
    expect(next.seed.phase.injury).toBe(true);
    // A week later the pain has gone out of the window; a 7 and two 5s on three days is not enough, three days of 5 is.
    at("2026-11-26");
    expect(await injury()).toBeNull();
    await pain("2026-11-26", 7);
    await pain("2026-11-25", 5);
    expect(await injury()).toBeNull();
    await pain("2026-11-24", 5);
    await pain("2026-11-23", 5);
    expect(await injury()).toMatchObject({ reason: "repeated" });
    // Nothing is re-planned by itself.
    expect(((await (await a.request("/api/plan?from=2026-11-23&to=2026-12-27")).json()) as { weeks: { sessions: unknown[] }[] }).weeks.flatMap((w) => w.sessions)).toEqual([]);
  });

  it("backs the deep aim off for pain of level 5 in the last week, or when the paces of a key session were missed", async () => {
    at("2026-11-25");
    const db = createDb(":memory:");
    const a = createApp(db, loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
    await a.request("/api/settings");
    const ctx = () => ctxFor(db, 1);
    const sessions = () => weekSummaries(ctx(), "2026-11-16", "2026-11-24").flatMap((w) => w.sessions);
    expect(backOffNow(ctx(), sessions())).toBe(false);
    await a.request("/api/pain", json({ date: "2026-11-24", area: "knee", level: 4 }));
    expect(backOffNow(ctx(), sessions())).toBe(false);
    await a.request("/api/pain", json({ date: "2026-11-24", area: "knee", level: 5 }));
    expect(backOffNow(ctx(), sessions())).toBe(true);
    db.$client.prepare("delete from pain_entries").run();
    expect(backOffNow(ctx(), sessions())).toBe(false);

    // A tagged tempo session run at 330 s/km against a 300 s/km target: no rep in target. Run at 300: all in.
    const steps = parseSteps("2 km easy, 3x1 km @5:00 / 1 min jog, 1 km easy", "metric").steps!;
    const lap = (id: string, i: number, m: number, s: number, hr: number) =>
      db.$client.prepare("insert into laps (user_id, activity_id, idx, distance_m, duration_s, avg_hr, start_s, trigger) values (1, ?, ?, ?, ?, ?, ?, 'manual')").run(id, i, m, s, hr, i * 100);
    const run = (day: string, id: string, workSec: number) => {
      db.$client.prepare("insert into workouts (user_id, date, type, distance_km, steps, blueprint) values (1, ?, 'threshold', 6, ?, 'mp-tempo#0')").run(day, JSON.stringify(steps));
      db.$client.prepare(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run, detail_status)
        values (1, ?, 'tempo', 'running', ?, ?, 6000, 2000, 150, 1, 'done')`).run(id, `${day} 07:00:00`, day);
      const laps: [number, number][] = [[2000, 700], [1000, workSec], [200, 60], [1000, workSec], [200, 60], [1000, workSec], [1000, 350]];
      laps.forEach(([m, s], i) => lap(id, i, m, s, 150));
    };
    run("2026-11-18", "x:slow", 330);
    expect(backOffNow(ctx(), sessions())).toBe(true);
    // The two latest tagged sessions count: a good one after it still leaves the slow one among the last two.
    run("2026-11-21", "x:good", 300);
    expect(backOffNow(ctx(), sessions())).toBe(true);
    // A third, good one pushes the slow one out of the last two.
    run("2026-11-23", "x:good2", 300);
    expect(backOffNow(ctx(), sessions())).toBe(false);
  });
});
