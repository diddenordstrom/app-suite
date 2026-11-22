import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { createCipher } from "@homelab/server-kit";
import { createGarminProvider, dateChunks, mapActivity, mapVo2max, maxBodyBattery, TOKEN_PATH } from "./providers/garmin";
import { AUTO_SYNC_AFTER_MS, DETAIL_VERSION, createSyncRunner, syncProvider, syncVo2max } from "./sync";
import { Encoder, Profile } from "@garmin/fitsdk";
import { zipSync } from "fflate";
import { parseFit } from "./providers/fit";
import { getTableName, is } from "drizzle-orm";
import { SQLiteTable } from "drizzle-orm/sqlite-core";
import * as schema from "./db/schema";
import * as repo from "./repo";
import { addDays, todayIn, weekStartOf } from "../shared/dates";
import { daysFor } from "../shared/nextweek";

const ORIGIN = "http://localhost:5173";
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

describe("api", () => {
  const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
  let app: ReturnType<typeof createApp>;
  const get = async <T = Record<string, unknown>>(p: string) => (await app.request(p)).json() as Promise<T>;
  beforeAll(() => { app = createApp(createDb(":memory:"), config); });

  it("Monday's check-in: asks why after two missed runs in a row, lifts the long run after one unexplained miss, and re-plans the running week", async () => {
    const today = todayIn("Europe/Stockholm");
    const weekStart = weekStartOf(today, "monday");
    const last = addDays(weekStart, -7);
    const post = async (a: ReturnType<typeof createApp>, body: unknown) => (await a.request("/api/workouts", json(body))).json() as Promise<{ id: number }>;
    type Review = { kind: string; inARow: number; wholeWeek: boolean; missed: { id: number }[]; catchUp: { fromKm: number; toKm: number } | null } | null;

    // Two missed runs in a row: ask.
    const a1 = createApp(createDb(":memory:"), config);
    await a1.request("/api/settings");
    await post(a1, { date: addDays(last, 1), type: "easy", distanceKm: 8 });
    const second = await post(a1, { date: addDays(last, 3), type: "threshold", distanceKm: 9 });
    const ask = (await (await a1.request("/api/home")).json() as { review: Review }).review!;
    expect(ask).toMatchObject({ kind: "ask", inARow: 2, wholeWeek: true });
    // Nothing was run, so nothing was too hard or too fast.
    const home1 = await (await a1.request("/api/home")).json() as { tooHard: unknown; tooFast: unknown[] };
    expect(home1.tooHard).toBeNull();
    expect(home1.tooFast).toEqual([]);
    // The reasons go on the missed sessions as skip reasons.
    const patched = await a1.request(`/api/workouts/${second.id}`, json({ status: "skipped", skipReason: "stress" }, "PATCH"));
    expect(patched.status).toBe(200);
    expect((await (await a1.request("/api/home")).json() as { review: Review }).review!.missed.length).toBe(2);

    // One unexplained missed easy run and a long run this week: the long run may go 1 km over its step.
    const db2 = createDb(":memory:");
    const a2 = createApp(db2, config);
    await a2.request("/api/settings");
    const day = addDays(last, -10);
    db2.$client.prepare(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run)
      values (1, 'garmin:long', 'Long', 'running', '${day} 09:00:00', '${day}', 15000, 5400, 140, 1)`).run();
    await post(a2, { date: addDays(last, 2), type: "easy", distanceKm: 6 });
    const longRun = await post(a2, { date: addDays(weekStart, 6), type: "long", distanceKm: 16 });
    const small = (await (await a2.request("/api/home")).json() as { review: Review }).review!;
    expect(small.kind).toBe("small");
    expect(small.catchUp).toMatchObject({ fromKm: 16, toKm: 17 });
    // Accepting writes the km and the tag, and the plan no longer calls 17 km a spike.
    await a2.request(`/api/workouts/${longRun.id}`, json({ distanceKm: 17, notes: "[catch-up]" }, "PATCH"));
    const plan = await (await a2.request(`/api/plan?from=${weekStart}&to=${addDays(weekStart, 6)}`)).json() as { weeks: { sessions: { workout: { id: number }; spike?: unknown }[] }[] };
    expect(plan.weeks.flatMap((w) => w.sessions).find((x) => x.workout.id === longRun.id)?.spike ?? null).toBeNull();

    // The running week can be suggested from today on; a week that is over cannot.
    const sug = await a2.request(`/api/plan/next-week?weekStart=${weekStart}`);
    expect(sug.status).toBe(200);
    const items = ((await sug.json()) as { suggestion: { items: { date: string }[] } }).suggestion.items;
    expect(items.every((it) => it.date >= today)).toBe(true);
    expect((await a2.request(`/api/plan/next-week?weekStart=${last}`)).status).toBe(400);
  });

  it("Skapa block in the running week: from today while four days are left, the days before stay, a planned week defaults to the next", async () => {
    const a2 = createApp(createDb(":memory:"), config);
    const g = async <T = Record<string, unknown>>(p: string) => (await a2.request(p)).json() as Promise<T>;
    const today = todayIn("Europe/Stockholm");
    const running = weekStartOf(today, "monday"), next = addDays(running, 7);
    // Some history: 4 weeks of three runs.
    for (let w = 1; w <= 4; w++) for (const d of [1, 3, 6]) await a2.request("/api/workouts", json({ date: addDays(running, -7 * w + d), type: d === 6 ? "long" : "easy", distanceKm: d === 6 ? 10 : 6, status: "done" }));
    type Sug = { ok: boolean; startWeek: string; defaultStart: string; earliest: string; today: string; doneDays: Record<string, number>; suggestion: { weeks: { items: { date: string }[] }[] } };
    const left = (Date.parse(addDays(running, 6)) - Date.parse(today)) / 864e5 + 1;
    const s = await g<Sug>("/api/plan/block-suggest?weeks=3");
    if (left < 4) {
      // Friday to Sunday: too little left, the block starts next week and the running week is refused.
      expect(s).toMatchObject({ earliest: next, defaultStart: next, startWeek: next });
      expect((await a2.request(`/api/plan/block-suggest?startWeek=${running}`)).status).toBe(400);
      return;
    }
    // Nothing planned in the running week: the block starts there, from today on.
    expect(s).toMatchObject({ ok: true, earliest: running, defaultStart: running, startWeek: running, today });
    expect(s.suggestion.weeks[0].items.every((it) => it.date >= today)).toBe(true);
    expect(s.suggestion.weeks[0].items.length).toBeGreaterThan(0);
    // A week that is over is refused, and nothing is written on a day that is over.
    expect((await a2.request(`/api/plan/block-suggest?startWeek=${addDays(running, -7)}`)).status).toBe(400);
    if (today > running) {
      const past = await a2.request("/api/plan/block-suggest", json({ startWeek: running, weeks: [[{ date: running, type: "easy", km: 5, durationMin: null, steps: null }], [], []], replace: [] }));
      expect(past.status).toBe(400);
    }
    // Something planned later this week: the running week is still offered, but the default is next week.
    await a2.request("/api/workouts", json({ date: addDays(running, 6), type: "easy", distanceKm: 5 }));
    expect(await g<Sug>("/api/plan/block-suggest?weeks=3")).toMatchObject({ earliest: running, defaultStart: next, startWeek: next });
  });

  it("races as the answer key: Garmin's race flag asks, yes saves the result and logs the check, no stops asking", async () => {
    const db = createDb(":memory:");
    const a2 = createApp(db, config);
    const g = async <T = Record<string, unknown>>(p: string) => (await a2.request(p)).json() as Promise<T>;
    await g("/api/settings");
    const today = todayIn("Europe/Stockholm");
    const day = addDays(today, -10);
    const q = (sql: string) => db.$client.prepare(sql);
    for (const [id, dist, ev] of [["garmin:h", 21180, "race"], ["garmin:e", 8000, "uncategorized"], ["garmin:t", 10050, "race"]] as const) {
      q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run, event_type)
         values (1, '${id}', 'Jönköping', 'running', '${day} 09:00:00', '${day}', ${dist}, 5892, 171, 1, '${ev}')`).run();
    }
    const view = await g<{ candidate: { reason: string; distanceKm: number; seconds: number } | null }>("/api/activities/garmin:h");
    expect(view.candidate).toMatchObject({ reason: "garmin", distanceKm: 21.0975, seconds: 5892 });
    expect((await g<{ candidate: unknown }>("/api/activities/garmin:e")).candidate).toBeNull();

    const saved = await (await a2.request("/api/activities/garmin:h/race", json({ name: "Jönköping Halvmarathon", distanceKm: 21.0975, resultSeconds: 5892 }))).json() as { race: { name: string; resultSeconds: number; activityId: string } };
    expect(saved.race).toMatchObject({ name: "Jönköping Halvmarathon", resultSeconds: 5892, activityId: "garmin:h" });
    const res = await g<{ checks: { resultSeconds: number; date: string; modelVersion: number }[] }>("/api/races/results");
    expect(res.checks).toHaveLength(1);
    expect(res.checks[0]).toMatchObject({ resultSeconds: 5892, date: day, modelVersion: 1 });

    // Editing the goal keeps the result; correcting the result keeps the prediction.
    const race = (await g<{ id: number; resultSeconds: number }[]>("/api/races"))[0];
    await a2.request(`/api/races/${race.id}`, json({ name: "Jönköping Halvmarathon", date: day, distanceKm: 21.0975, goalSeconds: 6000, priority: "B" }, "PUT"));
    expect((await g<{ resultSeconds: number }[]>("/api/races"))[0].resultSeconds).toBe(5892);
    await a2.request(`/api/races/${race.id}`, json({ name: "Jönköping Halvmarathon", date: day, distanceKm: 21.0975, priority: "B", resultSeconds: 5880 }, "PUT"));
    expect((await g<{ checks: { resultSeconds: number }[] }>("/api/races/results")).checks[0].resultSeconds).toBe(5880);

    await a2.request("/api/activities/garmin:t/not-race", json({}));
    expect((await g<{ candidate: unknown }>("/api/activities/garmin:t")).candidate).toBeNull();
    await a2.request(`/api/races/${race.id}`, { method: "DELETE", headers: { origin: ORIGIN } });
    expect((await g<{ checks: unknown[] }>("/api/races/results")).checks).toEqual([]);
  });

  it("same session over time: empty before any structured run", async () => {
    expect(await get("/api/trends/same-sessions")).toEqual({ outlines: [], minTimes: 3 });
    expect(await get("/api/activities/nope/same-session")).toEqual({ outline: null, minTimes: 3 });
  });

  it("session templates: save, list in the asked language, delete", async () => {
    expect((await app.request("/api/templates", json({ name: "", type: "easy", stepsText: "8 km easy" }))).status).toBe(400);
    expect((await app.request("/api/templates", json({ name: "Fart", type: "easy", stepsText: "8 km hopp" }))).status).toBe(400);
    const r = await app.request("/api/templates", json({ name: "Lugnt + strides", type: "easy", stepsText: "8 km lugnt, 6x20 s strides / 1 min jogg" }));
    expect(r.status).toBe(201);
    const { id } = await r.json() as { id: number };
    expect(await get("/api/templates?lang=en")).toEqual([{ id, name: "Lugnt + strides", type: "easy", stepsText: "8 km easy, 6x20 s strides / 1 min jog" }]);
    expect((await app.request(`/api/templates/${id}`, { method: "DELETE", headers: { origin: ORIGIN } })).status).toBe(200);
    expect(await get("/api/templates")).toEqual([]);
  });

  it("health + dev login", async () => {
    expect(await get("/api/health")).toEqual({ ok: true });
    expect((await get<{ user: { sub: string } }>("/api/auth/me")).user.sub).toBe("dev-user");
  });

  it("oidc mode rejects anonymous", async () => {
    const oidcApp = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "oidc", OIDC_ISSUER: "https://i", OIDC_CLIENT_ID: "c" } as NodeJS.ProcessEnv));
    expect((await oidcApp.request("/api/settings")).status).toBe(401);
    expect((await oidcApp.request("/api/home")).status).toBe(401);
  });

  it("settings default, update, validate", async () => {
    const s = await get("/api/settings");
    expect(s).toMatchObject({ units: "metric", weekStart: "monday" });
    const next = { ...s, units: "imperial", timezone: "Europe/Stockholm", easyLow: 135, easyHigh: 150 };
    expect((await app.request("/api/settings", json(next, "PUT"))).status).toBe(200);
    expect(await get("/api/settings")).toMatchObject({ units: "imperial", easyHigh: 150 });
    expect((await app.request("/api/settings", json({ ...next, timezone: "Not/AZone" }, "PUT"))).status).toBe(400);
    await app.request("/api/settings", json({ ...next, units: "metric" }, "PUT"));
  });

  it("tours: mark seen, keep it through a settings save, reset", async () => {
    expect(await get("/api/tours")).toEqual({ seen: [] });
    expect((await app.request("/api/tours/Bad id", json({}, "PUT"))).status).toBe(400);
    await app.request("/api/tours/onboarding", json({}, "PUT"));
    await app.request("/api/tours/onboarding", json({}, "PUT"));
    await app.request("/api/tours/trends", json({}, "PUT"));
    await app.request("/api/settings", json(await get("/api/settings"), "PUT"));
    expect(await get("/api/tours")).toEqual({ seen: ["onboarding", "trends"] });
    await app.request("/api/tours", { method: "DELETE", headers: { origin: ORIGIN } });
    expect(await get("/api/tours")).toEqual({ seen: [] });
  });

  it("empty home works before any data", async () => {
    const h = await get<{ hasData: boolean; week: { status: string } }>("/api/home");
    expect(h.hasData).toBe(false);
    expect(h.week.status).toBe("no_plan");
  });

  it("demo data fills activities, plan, races and trends", async () => {
    const r = await app.request("/api/demo", json({}));
    expect(r.status).toBe(200);
    const res = await r.json() as { added: number; details: number };
    expect(res.added).toBeGreaterThan(50);
    expect(res.details).toBeGreaterThan(50);

    const home = await get<{ hasData: boolean; races: unknown[]; week: { sessions: unknown[] }; fitness: { ctl: number } }>("/api/home");
    expect(home.hasData).toBe(true);
    expect(home.races).toHaveLength(2);
    expect(home.week.sessions.length).toBeGreaterThan(0);
    expect(home.fitness.ctl).toBeGreaterThan(10);

    const trends = await get<{ weekly: unknown[]; easy: unknown[]; threshold: { points: unknown[] }; load: { series: { date: string; projected?: boolean }[]; planEnd: string; race: { date: string } } }>("/api/trends");
    expect(trends.weekly.length).toBeGreaterThanOrEqual(12);
    expect(trends.easy.length).toBeGreaterThan(5);
    expect(trends.load.series.some((p) => p.projected)).toBe(true);
    // The projection ends where the plan ends (the taper block's last day), not later.
    expect(trends.load.series.at(-1)!.date).toBe(trends.load.planEnd);
    expect(trends.load.planEnd >= trends.load.race.date).toBe(true);
    const blocks = await get<{ blocks: { name: string; summary: { status: string; weeks: unknown[] } }[] }>("/api/blocks");
    expect(blocks.blocks.map((b) => b.name)).toEqual(["Base", "Build", "Marathon-specific", "Taper"]);
    expect(blocks.blocks[0].summary.status).not.toBe("no_plan");
    expect(Object.keys((await get<{ hints: Record<string, unknown> }>("/api/races/hints")).hints)).toHaveLength(2);

    const list = await get<{ items: { id: string; isRun: boolean; thresholdFlag: boolean }[] }>("/api/activities?limit=50");
    const thr = list.items.find((a) => a.thresholdFlag)!;
    expect((await app.request(`/api/activities/${encodeURIComponent(thr.id)}/flag`, json({ flag: false }))).status).toBe(200);
    const unflagged = await get<{ suggestedThreshold: boolean; laps: { isInterval: boolean }[] }>(`/api/activities/${encodeURIComponent(thr.id)}`);
    expect(unflagged.suggestedThreshold).toBe(true);
    expect(unflagged.laps.some((l) => l.isInterval)).toBe(false);
    expect((await app.request(`/api/activities/${encodeURIComponent(thr.id)}/flag`, json({ flag: true }))).status).toBe(200);
    const detail = await get<{ laps: { isInterval: boolean }[]; series: unknown[]; histogram: unknown[] }>(`/api/activities/${encodeURIComponent(thr.id)}`);
    expect(detail.laps.filter((l) => l.isInterval).length).toBeGreaterThanOrEqual(2);
    expect(detail.series.length).toBeGreaterThan(10);
    expect(detail.histogram.length).toBeGreaterThan(2);
  });

  it("plan: new block, move, skip, link, copy week, targets", async () => {
    const r = await app.request("/api/blocks", json({ kind: "base", name: "Base 1", startWeek: "2030-01-07", text: "6 zone 2, 9 tröskel, 15 long run\n4 20 backoff" }));
    expect(r.status).toBe(200);
    expect((await app.request("/api/blocks", json({ kind: "base", startWeek: "2030-01-28", text: "6 nonsense" }))).status).toBe(400);
    expect((await app.request("/api/blocks", json({ kind: "base", startWeek: "2030-01-29", text: "6 easy" }))).status).toBe(400);
    const { id: blockId } = await r.json() as { id: number };

    const plan = await get<{ weeks: { weekStart: string; targetKm: number | null; backoff: boolean; sessions: { workout: { id: number; type: string; date: string } }[] }[] }>("/api/plan?from=2030-01-07&to=2030-01-20");
    expect(plan.weeks).toHaveLength(2);
    expect(plan.weeks[0].sessions.map((s) => s.workout.type)).toEqual(["easy", "threshold", "long"]);
    expect(plan.weeks[1]).toMatchObject({ targetKm: 20, backoff: true });

    const id = plan.weeks[0].sessions[0].workout.id;
    expect((await app.request(`/api/workouts/${id}`, json({ date: "2030-01-09" }, "PATCH"))).status).toBe(200);
    expect((await app.request(`/api/workouts/${id}`, json({ status: "skipped", skipReason: "sick" }, "PATCH"))).status).toBe(200);
    expect((await app.request(`/api/workouts/${id}`, json({ skipReason: "bored" }, "PATCH"))).status).toBe(400);
    expect(await (await app.request("/api/weeks/copy", json({ from: "2030-01-07", to: "2030-01-21", count: 1 }))).json()).toEqual({ copied: 3 });
    expect((await app.request("/api/targets/2030-01-21", json({ km: 40 }, "PUT"))).status).toBe(200);
    expect((await app.request("/api/targets/2030-01-22", json({ km: 40 }, "PUT"))).status).toBe(400);
    expect((await app.request(`/api/workouts/999999`, json({ status: "dropped" }, "PATCH"))).status).toBe(404);

    // Clearing a range removes sessions (any status) and, if asked, targets; nothing outside the range.
    expect((await app.request("/api/plan/clear", json({ from: "2030-01-20", to: "2030-01-07" }))).status).toBe(400);
    expect(await (await app.request("/api/plan/clear", json({ from: "2030-01-07", to: "2030-01-20", targets: true }))).json()).toEqual({ deleted: 3, targets: 1 });
    const after = await get<{ weeks: { sessions: unknown[]; targetKm: number | null }[] }>("/api/plan?from=2030-01-07&to=2030-01-27");
    expect(after.weeks.map((w) => w.sessions.length)).toEqual([0, 0, 3]);
    expect(after.weeks[2].targetKm).toBe(40);
    expect((await app.request(`/api/blocks/${blockId}`, { method: "DELETE", headers: { origin: ORIGIN } })).status).toBe(200);
  });

  it("blocks: text round-trip, preview, push the next block on, delete", async () => {
    const make = async (b: Record<string, unknown>) => app.request("/api/blocks", json(b));
    const a = await (await make({ kind: "build", name: "Build", startWeek: "2031-03-03", text: "6 easy, 9 threshold, 12 long run\n6 easy, 10 threshold, 13 long run" })).json() as { id: number };
    const b = await (await make({ kind: "specific", startWeek: "2031-03-17", text: "8 easy, 10 intervals, 16 long run" })).json() as { id: number };
    expect((await make({ kind: "base", startWeek: "2031-03-10", text: "5 easy" })).status).toBe(409);

    const { text } = await get<{ text: string }>("/api/blocks/text?start=2031-03-03&weeks=2");
    expect(text).toBe("6 easy, 9 threshold, 12 long run\n6 easy, 10 threshold, 13 long run");
    const plan = await get<{ weeks: { sessions: { workout: { id: number; type: string; notes: string | null; date: string } }[] }[] }>("/api/plan?from=2031-03-03&to=2031-03-16");
    const thr = plan.weeks[1].sessions.find((s) => s.workout.type === "threshold")!.workout;
    await app.request(`/api/workouts/${thr.id}`, json({ notes: "3×10 min", date: "2031-03-13" }, "PATCH"));

    const next = "6 easy, 9 threshold, 12 long run\n6 easy, 11 threshold, 13 long run\n7 easy, 14 long run";
    const preview = await (await app.request("/api/blocks/preview", json({ id: a.id, text: next }))).json() as { weeks: { state: string; spikes: unknown[] }[]; pushes: { id: number; weeks: number }[] };
    expect(preview.weeks.map((w) => w.state)).toEqual(["unchanged", "changed", "added"]);
    expect(preview.pushes).toEqual([{ id: b.id, name: null, kind: "specific", weeks: 1 }]);
    const refused = await app.request(`/api/blocks/${a.id}/text`, json({ text: next }, "PUT"));
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ conflict: "push" });
    expect((await app.request(`/api/blocks/${a.id}/text`, json({ text: next, pushNext: true }, "PUT"))).status).toBe(200);

    const list = await get<{ blocks: { id: number; startWeek: string; weeks: number; summary: { status: string; volume: { totalKm: number } } }[] }>("/api/blocks");
    expect(list.blocks.find((x) => x.id === a.id)).toMatchObject({ weeks: 3, summary: { status: "upcoming", volume: { totalKm: 78 } } });
    expect(list.blocks.find((x) => x.id === b.id)?.startWeek).toBe("2031-03-24");
    const moved = await get<{ weeks: { sessions: { workout: { id: number; distanceKm: number; notes: string | null; date: string } }[] }[] }>("/api/plan?from=2031-03-10&to=2031-03-30");
    expect(moved.weeks[0].sessions.find((s) => s.workout.id === thr.id)?.workout).toMatchObject({ distanceKm: 11, notes: "3×10 min", date: "2031-03-13" });
    expect(moved.weeks[2].sessions.map((s) => s.workout.distanceKm).sort()).toEqual([10, 16, 8]);

    expect((await app.request(`/api/blocks/${a.id}`, json({ name: "Build 1", weeks: 2 }, "PATCH"))).status).toBe(200);
    expect((await app.request(`/api/blocks/${a.id}`, json({ kind: "nope" }, "PATCH"))).status).toBe(400);
    // A target in the block's weeks (as a suggested block writes them) goes with its sessions.
    expect((await app.request("/api/targets/2031-03-24", json({ km: 28.6 }, "PUT"))).status).toBe(200);
    const del = await app.request(`/api/blocks/${b.id}?workouts=1`, { method: "DELETE", headers: { origin: ORIGIN } });
    expect(await del.json()).toMatchObject({ deleted: 3 });
    const left = await get<{ targets: Record<string, unknown> }>("/api/plan?from=2031-03-24&to=2031-03-30");
    expect(left.targets["2031-03-24"]).toBeUndefined();
    const kept = await get<{ weeks: { sessions: unknown[] }[]; blocks: { id: number }[] }>("/api/plan?from=2031-03-17&to=2031-03-23");
    expect(kept.weeks[0].sessions).toHaveLength(2);
    expect(kept.blocks.map((x) => x.id)).toContain(a.id);
    expect(kept.blocks.map((x) => x.id)).not.toContain(b.id);
  });

  it("block coach: projection, suggestions with their effect, other sports per block", async () => {
    type Coach = { mode: string; state: string; value: number | null; weeks: { km: number; judged: boolean }[]; series: unknown[]; crossMin: number; habitMin: number; crossSet: boolean;
      tips: { id: string; text: string; before: number | null; after: number | null }[] };
    const text = "8 lugnt, 10 tröskel, 14 långpass\n8 lugnt, 10 tröskel, 14 långpass\n6 lugnt, 10 långpass avlastning";
    const p = await (await app.request("/api/blocks/preview", json({ startWeek: "2033-01-03", text, lang: "sv" }))).json() as { coach: Coach };
    expect(p.coach).toMatchObject({ mode: "base", crossSet: false });
    expect(p.coach.crossMin).toBe(p.coach.habitMin);
    expect(p.coach.weeks.map((w) => w.judged)).toEqual([true, true, false]);
    expect(p.coach.series.length).toBeGreaterThan(21);
    for (const tip of p.coach.tips) {
      const again = await (await app.request("/api/blocks/preview", json({ startWeek: "2033-01-03", text: tip.text, lang: "sv" }))).json() as { errors: unknown[]; coach: Coach };
      expect(again.errors).toEqual([]);
      expect(again.coach.value).toBe(tip.after);
    }
    const withCross = await (await app.request("/api/blocks/preview", json({ startWeek: "2033-01-03", text, crossMin: 120 }))).json() as { coach: Coach };
    expect(withCross.coach).toMatchObject({ crossMin: 120, crossSet: true });
    const { id } = await (await app.request("/api/blocks", json({ kind: "base", startWeek: "2033-01-03", text, crossMin: 90 }))).json() as { id: number };
    const list = await get<{ blocks: { id: number; crossMin: number | null }[] }>("/api/blocks");
    expect(list.blocks.find((b) => b.id === id)?.crossMin).toBe(90);
    const kept = await (await app.request("/api/blocks/preview", json({ id, text }))).json() as { coach: Coach };
    expect(kept.coach.crossMin).toBe(90);
    expect((await app.request("/api/blocks/preview", json({ id, text, crossMin: -5 }))).status).toBe(400);
  });

  it("suggest a week: engine suggestion, edited sessions written on their days, replacing the planned ones, undo puts them back", async () => {
    type Item = { date: string; type: string; km: number; durationMin: number | null; steps: unknown };
    type W = { id: number; date: string; type: string; distanceKm: number | null; notes: string | null; steps: unknown };
    type Res = { weekStart: string; ok: boolean; reason?: string; seed: { runDays: number[]; longRunDay: number }; suggestion: { items: Item[]; tries: { id: string }[]; chosen: string }; replaces: W[] };
    const s = await get("/api/settings");
    expect((await app.request("/api/settings", json({ ...s, longRunDay: 9 }, "PUT"))).status).toBe(400);
    await app.request("/api/settings", json({ ...s, runDays: [2, 4, 6, 0], longRunDay: 6 }, "PUT"));
    expect(await get("/api/settings")).toMatchObject({ longRunDay: 6 });

    const ws = "2034-01-02";
    const weekOf = async () => (await get<{ weeks: { sessions: { workout: W }[] }[] }>(`/api/plan?from=${ws}&to=2034-01-08`)).weeks.flatMap((w) => w.sessions.map((x) => x.workout));
    expect((await app.request("/api/plan/next-week?weekStart=2034-01-03")).status).toBe(400);
    // A week with sessions already planned: the suggestion replaces them.
    const old = await (await app.request("/api/workouts", json({ date: "2034-01-04", type: "easy", distanceKm: 7, notes: "with Anna" }))).json() as W;
    const r = await get<Res>(`/api/plan/next-week?weekStart=${ws}`);
    expect(r).toMatchObject({ weekStart: ws, ok: true, seed: { longRunDay: 6 } });
    expect(r.replaces.map((w) => w.id)).toEqual([old.id]);
    const long = r.suggestion.items.find((i) => i.type === "long")!;
    expect(long.date).toBe("2034-01-07");
    expect(r.suggestion.tries[0].id).toBe("start");

    // The runner moves the long run to Sunday and adds a session on Monday.
    // The long run gets a faster finish, kept as steps like strides on an easy run.
    const tempo = { v: 1, items: [{ kind: "step", step: { km: 7, target: { kind: "easy" } } }, { kind: "step", step: { km: 3, target: { kind: "pace", secPerKm: 275 } } }] };
    const strides = { v: 1, items: [{ kind: "step", step: { km: 4, target: { kind: "easy" } } }, { kind: "repeat", times: 6, work: { min: 1 / 3, target: { kind: "strides" } }, rest: { min: 1, target: { kind: "jog" } } }] };
    const items = [...r.suggestion.items.map((i) => (i === long ? { ...i, date: "2034-01-08", km: 10, steps: tempo } : i)), { date: ws, type: "easy", km: 4.5, durationMin: null, steps: strides }];
    const post = (body: unknown) => app.request("/api/plan/next-week", json(body));
    expect((await post({ weekStart: ws, items: [{ ...items[0], date: "2034-01-20" }], replace: [old.id] })).status).toBe(400);
    expect((await post({ weekStart: ws, items: [{ date: ws, type: "threshold", km: 8, steps: { v: 1, items: [{ kind: "nope" }] } }], replace: [old.id] })).status).toBe(400);
    // Replacing only what was shown: without the old session's id, the week has changed.
    expect(await (await post({ weekStart: ws, items, replace: [] })).json()).toMatchObject({ conflict: "changed" });
    const done = await (await post({ weekStart: ws, items, replace: [old.id] })).json() as { ids: number[]; removed: W[] };
    expect(done.ids).toHaveLength(items.length);
    expect(done.removed.map((w) => w.id)).toEqual([old.id]);
    const written = await weekOf();
    expect(written.find((w) => w.id === old.id)).toBeUndefined();
    expect(written.find((w) => w.type === "long")).toMatchObject({ date: "2034-01-08", distanceKm: 10 });
    expect(written.find((w) => w.type === "long")?.steps).toBeTruthy();
    expect(written.find((w) => w.date === ws)).toMatchObject({ type: "easy" });
    expect(written.find((w) => w.date === ws)?.steps).toBeTruthy();
    expect(written.find((w) => w.type === "threshold")?.steps).toBeTruthy();

    // The week after: that whole week out of nothing leaves form heavy (fatigue 17 on fitness 4, −33 %), so the
    // engine goes lighter for form rather than stepping the long run up from the 10 km of the 30 days before.
    const after = await get<{ seed: { longestKm: number; rung: number; backoffWhy: string | null }; suggestion: { items: Item[]; chosen: string } }>("/api/plan/next-week?weekStart=2034-01-09");
    expect(after.seed).toMatchObject({ longestKm: 10, backoffWhy: "form" });
    expect(after.suggestion.chosen).toBe("backoff");
    expect(after.suggestion.items.find((i) => i.type === "long")!.km).toBeLessThan(10);

    // A plain target on that week is the runner deciding it for the week dialog (no automatic lighter week), but
    // Skapa block still goes lighter for the heavy form; only a "backoff" note counts as asked.
    expect((await app.request("/api/targets/2034-01-09", json({ km: 25 }, "PUT"))).status).toBe(200);
    expect((await get<{ seed: { backoffWhy: string | null } }>("/api/plan/next-week?weekStart=2034-01-09")).seed.backoffWhy).toBeNull();
    const blk = await get<{ ok: boolean; seed: { lighterFirst: boolean; lighterFirstWhy: string | null } }>("/api/plan/block-suggest?startWeek=2034-01-09&weeks=4");
    expect(blk).toMatchObject({ ok: true, seed: { lighterFirst: true, lighterFirstWhy: "form" } });
    expect((await app.request("/api/targets/2034-01-09", json({ km: 25, note: "backoff" }, "PUT"))).status).toBe(200);
    // Asked and tired: tired is the truer reason.
    expect((await get<{ seed: { lighterFirstWhy: string | null } }>("/api/plan/block-suggest?startWeek=2034-01-09&weeks=4")).seed.lighterFirstWhy).toBe("form");
    expect((await app.request("/api/targets/2034-01-09", json({}, "PUT"))).status).toBe(200); // empty: the target goes

    // Undo: the suggestion goes, the old session comes back with its id and notes.
    expect((await app.request("/api/plan/next-week/undo", json({ weekStart: ws, ids: done.ids, restore: done.removed }))).status).toBe(200);
    expect((await weekOf()).map((w) => ({ id: w.id, notes: w.notes, km: w.distanceKm }))).toEqual([{ id: old.id, notes: "with Anna", km: 7 }]);

    // A race in the week keeps it out.
    await app.request("/api/races", json({ date: "2034-01-07", name: "Test race", distanceKm: 10, priority: "C" }));
    expect(await get(`/api/plan/next-week?weekStart=${ws}`)).toEqual({ weekStart: ws, ok: false, reason: "race" });
    expect((await post({ weekStart: ws, items, replace: [old.id] })).status).toBe(409);
    await app.request("/api/settings", json(s, "PUT"));
  });

  it("suggest a block: whole block with a goal, written as a block with targets, undo, then re-plan what is left", async () => {
    type Item = { date: string; type: string; km: number; durationMin: number | null; steps: unknown };
    type Sug = { ok: boolean; reason?: string; seed: { tolerance: { km: number } }; suggestion: { weeks: { weekStart: string; lighter: boolean; items: Item[] }[]; goalKm: number }; replaces: { id: number }[] };
    // By default the block starts after the last block (the demo's taper), and inside a block it is refused.
    const blocks = (await get<{ blocks: { startWeek: string; weeks: number }[] }>("/api/blocks")).blocks;
    const lastEnd = blocks.map((b) => addDays(b.startWeek, b.weeks * 7 - 1)).sort().at(-1)!;
    const first = await get<{ startWeek: string; defaultStart: string; reason?: string }>("/api/plan/block-suggest");
    expect(first.startWeek).toBe(addDays(lastEnd, 1));
    expect(first.defaultStart).toBe(first.startWeek);
    // The week after the demo marathon (a Sunday): recover first, no build block yet.
    const marathon = (await get<{ name: string; date: string }[]>("/api/races")).find((r) => r.name === "Demo Marathon")!;
    expect((await get<{ reason?: string }>(`/api/plan/block-suggest?startWeek=${addDays(marathon.date, 1)}`)).reason).toBe("afterRace");
    expect((await get<Sug>(`/api/plan/block-suggest?startWeek=${blocks[blocks.length - 1].startWeek}&weeks=2`)).reason).toBe("block");
    expect((await app.request("/api/plan/block-suggest?startWeek=2035-03-06")).status).toBe(400);

    const start = "2035-03-05";
    const s = await get<Sug>(`/api/plan/block-suggest?startWeek=${start}&weeks=3`);
    expect(s.ok).toBe(true);
    expect(s.suggestion.weeks).toHaveLength(3);
    expect(s.suggestion.weeks[2].lighter).toBe(true);
    const weeks = s.suggestion.weeks.map((w) => w.items);
    const lighter = s.suggestion.weeks.map((w) => w.lighter);
    const body = { startWeek: start, weeks, lighter, name: "Bygga volym säkert", replace: s.replaces.map((w) => w.id) };
    const r = await app.request("/api/plan/block-suggest", json(body));
    expect(r.status).toBe(200);
    const made = await r.json() as { id: number; ids: number[]; removed: unknown[]; targetsBefore: unknown[] };
    expect(made.ids.length).toBe(weeks.flat().length);
    const block = (await get<{ blocks: { id: number; name: string; weeks: number; goalKm: number }[] }>("/api/blocks")).blocks.find((b) => b.id === made.id)!;
    expect(block).toMatchObject({ name: "Bygga volym säkert", weeks: 3 });
    expect(block.goalKm).toBeCloseTo(s.suggestion.goalKm, 0);
    const plan = await get<{ weeks: { weekStart: string; targetKm: number | null; backoff: boolean }[] }>(`/api/plan?from=${start}&to=2035-03-25`);
    expect(plan.weeks.map((w) => w.backoff)).toEqual([false, false, true]);
    expect(plan.weeks.every((w) => (w.targetKm ?? 0) > 0)).toBe(true);
    // The weeks are a block now: suggesting them again is refused, writing them again too.
    expect((await get<Sug>(`/api/plan/block-suggest?startWeek=${start}&weeks=3`)).reason).toBe("block");
    expect((await app.request("/api/plan/block-suggest", json(body))).status).toBe(409);

    expect((await app.request("/api/plan/block-suggest/undo", json({ id: made.id, ids: made.ids, restore: made.removed, targetsBefore: made.targetsBefore }))).status).toBe(200);
    expect((await get<{ blocks: { id: number }[] }>("/api/blocks")).blocks.some((b) => b.id === made.id)).toBe(false);
    expect((await get<{ weeks: { sessions: unknown[] }[] }>(`/api/plan?from=${start}&to=2035-03-25`)).weeks.every((w) => !w.sessions.length)).toBe(true);

    // Re-plan: a block whose weeks haven't started is planned again toward its goal.
    const again = await (await app.request("/api/plan/block-suggest", json(body))).json() as { id: number };
    type Re = { ok: boolean; suggestion: { weeks: { items: Item[]; lighter: boolean }[]; goalKm: number }; replaces: { id: number }[]; before: { km: number }[]; goal: number; done: { km: number } };
    const re = await get<Re>(`/api/blocks/${again.id}/replan`);
    expect(re.ok).toBe(true);
    expect(re.before).toHaveLength(3);
    expect(re.done.km).toBe(0);
    expect(re.goal).toBeCloseTo(s.suggestion.goalKm, 0);
    const w = await app.request(`/api/blocks/${again.id}/replan`, json({ weeks: re.suggestion.weeks.map((x) => x.items), lighter: re.suggestion.weeks.map((x) => x.lighter), replace: re.replaces.map((x) => x.id) }));
    expect(w.status).toBe(200);
    expect((await w.json() as { goalKm: number }).goalKm).toBeCloseTo(re.suggestion.goalKm, 0);
    // A stale "shown" set is refused.
    expect((await app.request(`/api/blocks/${again.id}/replan`, json({ weeks: re.suggestion.weeks.map((x) => x.items), replace: re.replaces.map((x) => x.id) }))).status).toBe(409);

    // The same engine with other input: a week more (a pause). It shows what changes and writes a longer block.
    type Ext = Re & { extend: number; diff: { weeks: { weekStart: string; kmBefore: number; kmAfter: number }[]; before: { km: number; endsOn: string } | null; after: { km: number; endsOn: string; deepestForm: number | null } } };
    const ext = await get<Ext>(`/api/blocks/${again.id}/replan?extend=1`);
    expect(ext).toMatchObject({ ok: true, extend: 1 });
    expect(ext.suggestion.weeks).toHaveLength(4);
    expect(ext.diff.weeks).toHaveLength(4);
    expect(ext.diff.before).toMatchObject({ endsOn: "2035-03-25" });
    expect(ext.diff.after.endsOn).toBe("2035-04-01");
    expect(ext.diff.weeks[3].kmBefore).toBe(0);
    expect(ext.diff.weeks[3].kmAfter).toBeGreaterThan(0);
    const longer = await app.request(`/api/blocks/${again.id}/replan`, json({ extend: 1, weeks: ext.suggestion.weeks.map((x) => x.items), lighter: ext.suggestion.weeks.map((x) => x.lighter), replace: ext.replaces.map((x) => x.id) }));
    expect(longer.status).toBe(200);
    expect((await get<{ blocks: { id: number; weeks: number }[] }>("/api/blocks")).blocks.find((b) => b.id === again.id)!.weeks).toBe(4);
    // The next block right after it: a pause can't grow the block, so the rest is compressed into the weeks left, and it says so.
    const nextBlock = await (await app.request("/api/blocks", json({ kind: "base", name: "Next", startWeek: "2035-04-02", text: "6 easy, 10 long run\n6 easy, 10 long run" }))).json() as { id: number };
    const comp = await get<Ext & { compressed: { by: string; name: string } | null }>(`/api/blocks/${again.id}/replan?extend=1`);
    expect(comp).toMatchObject({ ok: true, extend: 0, compressed: { by: "block", name: "Next" } });
    expect(comp.suggestion.weeks).toHaveLength(4);
    expect(comp.diff.after.endsOn).toBe("2035-04-01");
    await app.request(`/api/blocks/${nextBlock.id}?workouts=1`, { method: "DELETE", headers: { origin: ORIGIN } });
    await app.request(`/api/blocks/${again.id}?workouts=1`, { method: "DELETE", headers: { origin: ORIGIN } });
  });

  it("next week counts today's session that hasn't been run yet", async () => {
    // Planned for today and not synced yet: it is neither history nor plan-from-tomorrow, but it still happens.
    type Seed = { seed: { ctl: number; atl: number; kmBefore: number[] } };
    const s = await get<{ timezone: string }>("/api/settings");
    const today = todayIn(s.timezone);
    const before = (await get<Seed>("/api/plan/next-week")).seed;
    const w = await (await app.request("/api/workouts", json({ date: today, type: "threshold", durationMin: 50 }))).json() as { id: number };
    const after = (await get<Seed>("/api/plan/next-week")).seed;
    expect(after.kmBefore.at(-1)! - before.kmBefore.at(-1)!).toBeCloseTo(50 / 6, 1);
    expect(after.ctl - after.atl).toBeLessThan(before.ctl - before.atl);
    await app.request(`/api/workouts/${w.id}`, { method: "DELETE", headers: { origin: ORIGIN } });
  });

  it("workout steps: stored, amount derived, star in the block text, dropped by a new amount or a non-running type", async () => {
    type W = { id: number; distanceKm: number | null; durationMin: number | null; steps: { items: unknown[] } | null };
    await app.request("/api/thresholds", json({ effectiveDate: "2032-01-01", paceSecPerKm: 255, hr: 169 }));
    const refs = await get<{ thresholdPace: number }>("/api/workouts/step-refs?date=2032-02-03");
    expect(refs).toMatchObject({ thresholdPace: 255, thresholdHr: 169 });

    const bad = await app.request("/api/workouts", json({ date: "2032-02-03", type: "threshold", stepsText: "3x8 min @trsökel" }));
    expect(bad.status).toBe(400);
    const w = await (await app.request("/api/workouts", json({ date: "2032-02-03", type: "threshold", distanceKm: 5, stepsText: "2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt" }))).json() as W;
    expect(w.steps?.items).toHaveLength(3);
    expect(w.distanceKm).toBeGreaterThan(9); // derived from the steps, not the 5 sent
    expect(w.durationMin).toBeNull();

    const { text } = await get<{ text: string }>("/api/blocks/text?start=2032-02-02&weeks=1");
    expect(text).toBe(`${w.distanceKm} threshold (2 km easy, 3x8 min @threshold / 2 min jog, 1.5 km easy)`);
    const { text: sv } = await get<{ text: string }>("/api/blocks/text?start=2032-02-02&weeks=1&lang=sv");
    expect(sv).toBe(`${w.distanceKm} tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)`);
    // Unchanged text (inline steps, either language, or the old star) keeps the steps; a new amount drops them, with a warning first.
    for (const t of [text, sv, `${w.distanceKm} threshold*`]) {
      const same = await (await app.request("/api/blocks/preview", json({ startWeek: "2032-02-02", text: t }))).json() as { weeks: { changes: unknown[]; warnings: unknown[] }[]; errors: unknown[] };
      expect(same.errors).toEqual([]);
      expect(same.weeks[0]).toMatchObject({ changes: [], warnings: [] });
    }
    // Changing the steps inline rewrites the amount from them.
    const longer = await (await app.request("/api/blocks/preview", json({ startWeek: "2032-02-02", text: "tröskel (2 km lugnt, 3x10 min @tröskel / 2 min jogg, 1.5 km lugnt)" }))).json() as { weeks: { afterKm: number; changes: { op: string }[] }[] };
    expect(longer.weeks[0].changes).toMatchObject([{ op: "update" }]);
    expect(longer.weeks[0].afterKm).toBeGreaterThan(w.distanceKm!);
    const changed = await (await app.request("/api/blocks/preview", json({ startWeek: "2032-02-02", text: "12 threshold" }))).json() as { weeks: { warnings: { key: string }[] }[] };
    expect(changed.weeks[0].warnings).toEqual([{ key: "bt.stepsDropped", params: { type: "threshold", date: "2032-02-03" } }]);
    const blk = await (await app.request("/api/blocks", json({ kind: "build", startWeek: "2032-02-02", text: "12 threshold" }))).json() as { id: number };
    expect(blk.id).toBeGreaterThan(0);
    const after = await get<{ weeks: { sessions: { workout: W }[] }[] }>("/api/plan?from=2032-02-02&to=2032-02-08");
    expect(after.weeks[0].sessions[0].workout).toMatchObject({ id: w.id, distanceKm: 12, steps: null });

    // Steps again, then a copy keeps them and a type without running drops them.
    const again = await (await app.request(`/api/workouts/${w.id}`, json({ stepsText: "20 min lugnt, 20 min @tröskel" }, "PATCH"))).json() as W;
    expect(again).toMatchObject({ distanceKm: null, durationMin: 40 });
    const copy = await (await app.request(`/api/workouts/${w.id}/copy`, json({ date: "2032-02-05" }))).json() as W;
    expect(copy.steps).toEqual(again.steps);
    const cross = await (await app.request(`/api/workouts/${w.id}`, json({ type: "cross" }, "PATCH"))).json() as W;
    expect(cross.steps).toBeNull();
    expect((await app.request(`/api/workouts/${w.id}`, json({ stepsText: "20 min lugnt" }, "PATCH"))).status).toBe(400);
  });

  it("structured sessions: the activity shows each step, a split fixes a forgotten lap, the plan chip gets the reps", async () => {
    type Planned = { workout: { id: number; steps: unknown }; match: { ok: boolean; workTotal: number; workJudged: number; steps: { status: string; merged: { lap: number; at: number } | null }[]; splits: number[] } };
    await app.request("/api/demo", json({}));
    const from = new Date(Date.now() - 35 * 864e5).toISOString().slice(0, 10);
    const plan = await get<{ weeks: { sessions: { workout: { date: string; steps: unknown }; activity: { id: string } | null; stepSummary?: { workIn: number; workTotal: number } }[] }[] }>(`/api/plan?from=${from}`);
    const done = plan.weeks.flatMap((w) => w.sessions).filter((s) => s.workout.steps && s.activity);
    expect(done.length).toBeGreaterThan(0);
    for (const s of done) expect(s.stepSummary?.workTotal).toBeGreaterThan(0);

    const latest = await get<{ id: string | null }>("/api/activities/latest-structured");
    expect(done.map((x) => x.activity!.id)).toContain(latest.id);
    const id = encodeURIComponent(done[0].activity!.id);
    const detail = await get<{ planned: Planned }>(`/api/activities/${id}`);
    expect(detail.planned.match.ok).toBe(true);
    expect(detail.planned.match.workJudged).toBe(detail.planned.match.workTotal);

    const res = await app.request(`/api/activities/${id}/splits`, json({ atS: 600 }));
    const split = await res.json() as { planned: Planned };
    expect(split.planned.match.splits).toEqual([600]);
    const undo = await (await app.request(`/api/activities/${id}/splits`, json({}, "DELETE"))).json() as { planned: Planned };
    expect(undo.planned.match.splits).toEqual([]);

    // The laps fit, so the stream has nothing to offer; taking a set of step changes replaces the splits.
    expect((detail.planned as Planned & { suggestion: unknown }).suggestion).toBeNull();
    await app.request(`/api/activities/${id}/splits`, json({ atS: 900 }));
    const all = await (await app.request(`/api/activities/${id}/splits`, json({ all: [600, 300, 300] }))).json() as { planned: Planned };
    expect(all.planned.match.splits).toEqual([300, 600]);
    expect((await app.request(`/api/activities/${id}/splits`, json({ all: [] }))).status).toBe(400);
    expect((await app.request(`/api/activities/${id}/splits`, json({ all: ["x"] }))).status).toBe(400);
    await app.request(`/api/activities/${id}/splits`, json({}, "DELETE"));

    // Last week's demo threshold run has auto-laps only: the stream offers the steps, and taking them judges every rep.
    type Suggested = { planned: Planned & { suggestion: { splits: number[]; preview: { workTotal: number } } | null } };
    const auto = done.filter((x) => x.workout.date >= new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10)).map((x) => encodeURIComponent(x.activity!.id));
    const offered = (await Promise.all(auto.map(async (x) => [x, await get<Suggested>(`/api/activities/${x}`)] as const))).find(([, d]) => d.planned.suggestion);
    expect(offered).toBeDefined();
    const [autoId, autoDetail] = offered!;
    expect(autoDetail.planned.suggestion!.splits).toHaveLength(6);
    const taken = await (await app.request(`/api/activities/${autoId}/splits`, json({ all: autoDetail.planned.suggestion!.splits }))).json() as Suggested;
    expect(taken.planned.suggestion).toBeNull();
    expect(taken.planned.match.workJudged).toBe(3);
  });

  it("deleting training data reaches every per-user table except the account's own", () => {
    // intervals.icu rows mirror what was sent there; the next push deletes the events of wiped workouts.
    // Notification devices and the morning time are the account's settings, like the Garmin connection.
    const keep = new Set(["users", "sessions", "user_settings", "engine_tuning", "garmin_accounts", "intervals_accounts", "intervals_events", "push_subscriptions", "morning_push"]);
    const perUser = Object.values(schema).filter((v): v is typeof schema.laps => is(v, SQLiteTable) && "userId" in v).map((tb) => getTableName(tb));
    const wiped = new Set(repo.TRAINING_TABLES.map((tb) => getTableName(tb)));
    expect(perUser.filter((n) => !keep.has(n) && !wiped.has(n))).toEqual([]);
  });

  it("activity log: save, derive sRPE and g/h, validate, clear, and feed trends", async () => {
    const list = await get<{ items: { id: string; isRun: boolean; durationS: number }[] }>("/api/activities?limit=50");
    const long = list.items.find((a) => a.isRun && a.durationS >= 75 * 60) ?? list.items.find((a) => a.isRun && a.durationS >= 30 * 60)!;
    const url = `/api/activities/${encodeURIComponent(long.id)}`;
    const hours = long.durationS / 3600;

    expect((await app.request(`${url}/log`, json({ rpe: 11 }, "PUT"))).status).toBe(400);
    expect((await app.request(`${url}/log`, json({ carbsG: -5 }, "PUT"))).status).toBe(400);
    expect((await app.request("/api/activities/nope/log", json({ rpe: 3 }, "PUT"))).status).toBe(404);

    expect((await app.request(`${url}/log`, json({ note: "Felt good", rpe: 6, carbsG: 120, nausea: 2, bloating: 4, cramps: 1, feel: 7 }, "PUT"))).status).toBe(200);
    const d = await get<{ log: { note: string; rpe: number }; logMetrics: { srpe: number; gPerH: number; gi: number }; durability: unknown }>(url);
    expect(d.log).toMatchObject({ note: "Felt good", rpe: 6 });
    expect(d.logMetrics).toEqual({ srpe: Math.round(6 * (long.durationS / 60)), gPerH: Math.round(120 / hours), gi: 4 });

    const trends = await get<{ log: { fuel: { id: string; gi: number }[]; fuelAdvice: { action: string }; srpe: { id: string }[] } }>("/api/trends");
    expect(trends.log.fuel.find((f) => f.id === long.id)?.gi).toBe(4);
    expect(trends.log.srpe.some((s) => s.id === long.id)).toBe(true);
    expect(trends.log.fuelAdvice.action).toBe("hold");

    expect((await app.request(`${url}/log`, json({}, "PUT"))).status).toBe(200);
    const cleared = await get<{ log: { rpe: number | null }; logMetrics: { srpe: number | null } }>(url);
    expect(cleared.log.rpe).toBeNull();
    expect(cleared.logMetrics.srpe).toBeNull();
  });

  it("best efforts, automatic CS and race predictions from the demo runs", async () => {
    type Best = { best: { pending: number; allTime: { durationS: number; paceSecPerKm: number }[]; rolling: { kind: string; currentCurve: unknown[] } } };
    const tr = await get<Best>("/api/trends");
    expect(tr.best.pending).toBe(0);
    expect(tr.best.allTime.map((p) => p.durationS)).toContain(600);
    // Longer efforts are never faster than shorter ones from the same pool.
    const p60 = tr.best.allTime.find((p) => p.durationS === 60)!.paceSecPerKm, p600 = tr.best.allTime.find((p) => p.durationS === 600)!.paceSecPerKm;
    expect(p60).toBeLessThanOrEqual(p600);
    expect(tr.best.rolling.kind).toBe("rolling");
    type Pred = { raceId: number; current: { seconds: number; model: string; estimates: { model: string }[] | null } | null; history: unknown[]; training: { weeklyKm: number | null } };
    const pr = await get<{ predictions: Pred[] }>("/api/races/predictions");
    expect(pr.predictions.length).toBeGreaterThan(0);
    expect(pr.predictions[0].history.length).toBeGreaterThan(20);
    expect(pr.predictions[0].training.weeklyKm).toBeGreaterThan(0);
    // The demo marathon gets the volume- and training-based estimates.
    const races = await get<{ id: number; distanceKm: number }[]>("/api/races");
    const mara = races.find((r) => r.distanceKm > 40);
    if (mara) {
      const m = pr.predictions.find((p) => p.raceId === mara.id)!;
      expect(m.current?.model).toBe("marathon");
      expect(m.current?.estimates?.map((e) => e.model)).toEqual(expect.arrayContaining(["vickers", "tanda"]));
    }
  });

  it("critical speed: time trials and 3-minute test, validation, comparison in trends, TRIMP", async () => {
    const trials = { date: "2026-11-01", kind: "trials", efforts: [{ distanceM: 900, durationS: 180 }, { distanceM: 3000, durationS: 720 }] };
    const saved = await (await app.request("/api/cs-tests", json(trials))).json() as { id: number; csMps: number; dPrimeM: number; paceSecPerKm: number }[];
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ dPrimeM: 200, paceSecPerKm: 257 });
    expect(saved[0].csMps).toBeCloseTo(3.889, 3);

    // The demo's hard runs are newer than the test, so CS comes from them and the test is shown as older.
    type CsRes = { cs: { tests: unknown[]; olderTest: { id: number } | null; latest: { source: string; paceSecPerKm: number; csMps: number; zones: { firstThreshold: { pace: number } }; comparison: { status: string; gapSecPerKm: number } | null } } };
    const t0 = await get<CsRes>("/api/trends");
    expect(t0.cs.tests).toHaveLength(1);
    expect(t0.cs.latest.source).toBe("auto");
    expect(t0.cs.olderTest?.id).toBe(saved[0].id);
    const csPace = t0.cs.latest.paceSecPerKm;
    expect(t0.cs.latest.zones.firstThreshold.pace).toBe(Math.round(1000 / (t0.cs.latest.csMps * 0.823)));

    // Garmin-style threshold faster than CS gets flagged in trends.
    await app.request("/api/thresholds", json({ effectiveDate: "2026-11-02", paceSecPerKm: csPace - 30, hr: 170 }));
    const t1 = await get<CsRes>("/api/trends");
    expect(t1.cs.latest.comparison?.status).toBe("above_cs");
    await app.request("/api/thresholds", json({ effectiveDate: "2026-11-02", paceSecPerKm: csPace + 18, hr: 170 }));
    const t2 = await get<CsRes>("/api/trends");
    expect(t2.cs.latest.comparison).toEqual({ gapSecPerKm: 18, status: "consistent" });

    expect((await app.request("/api/cs-tests", json({ date: "2026-11-03", kind: "three_min", totalM: 900, last30M: 115 }))).status).toBe(200);
    expect((await app.request("/api/cs-tests", json({ date: "2026-11-03", kind: "three_min", totalM: 600, last30M: 115 }))).status).toBe(400);
    expect((await app.request("/api/cs-tests", json({ ...trials, efforts: [{ distanceM: 900, durationS: 180 }] }))).status).toBe(400);
    expect((await app.request("/api/cs-tests", json({ ...trials, efforts: [{ distanceM: 900, durationS: 180 }, { distanceM: 1000, durationS: 200 }] }))).status).toBe(400);
    expect((await app.request("/api/cs-tests", json({ ...trials, kind: "bogus" }))).status).toBe(400);

    const list = await get<{ id: number; kind: string }[]>("/api/cs-tests");
    expect(list.map((x) => x.kind)).toEqual(["trials", "three_min"]);
    expect((await app.request(`/api/cs-tests/${list[0].id}`, { method: "DELETE", headers: { origin: ORIGIN } })).status).toBe(200);
    expect(await get<unknown[]>("/api/cs-tests")).toHaveLength(1);

    const acts = await get<{ items: { id: string; isRun: boolean }[] }>("/api/activities?limit=5");
    const detail = await get<{ metrics: { trimp: number | null; zoneSecs: number[] | null } }>(`/api/activities/${encodeURIComponent(acts.items[0].id)}`);
    const zs = detail.metrics.zoneSecs!;
    expect(detail.metrics.trimp).toBe(Math.round(zs.reduce((a, s, i) => a + (s / 60) * (i + 1), 0)));
  });

  it("races, blocks, thresholds, pain, check-ins validate input", async () => {
    expect((await app.request("/api/races", json({ name: "X", date: "2030-05-01", distanceKm: 21.0975, goalSeconds: 5700, priority: "B" }))).status).toBe(200);
    expect((await app.request("/api/races", json({ name: "", date: "2030-05-01" }))).status).toBe(400);
    expect((await app.request("/api/blocks", json({ kind: "peak", startWeek: "2030-02-04", text: "5 easy" }))).status).toBe(400);
    expect((await app.request("/api/thresholds", json({ effectiveDate: "2030-01-01", paceSecPerKm: 281, hr: 170 }))).status).toBe(200);
    expect((await app.request("/api/pain", json({ date: "2030-01-01", area: "knee", level: 11 }))).status).toBe(400);
    expect((await app.request("/api/pain", json({ date: "2030-01-01", area: "knee", level: 3 }))).status).toBe(200);
    expect((await app.request("/api/checkins/2030-01-01", json({ soreness: 2 }, "PUT"))).status).toBe(200);
  });

  it("cross-site writes are blocked", async () => {
    // A "simple" cross-site request (no preflight) must be refused before the body is read.
    const r = await app.request("/api/workouts", { method: "POST", body: '{"date":"2030-01-01","type":"easy"}', headers: { "content-type": "text/plain", origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("garmin status never exposes the key", async () => {
    expect(await get("/api/garmin")).toEqual({ connected: false });
    expect((await app.request("/api/sync", json({}))).status).toBe(400);
  });

  it("delete training data", async () => {
    expect((await app.request("/api/data", { method: "DELETE", headers: { origin: ORIGIN } })).status).toBe(200);
    expect((await get<{ hasData: boolean }>("/api/home")).hasData).toBe(false);
  });
});

describe("crypto", () => {
  it("round-trips with a fresh nonce and rejects tampering", () => {
    const c = createCipher("secret");
    const a = c.encrypt("my-garmin-key"), b = c.encrypt("my-garmin-key");
    expect(a).not.toBe(b);
    expect(a).not.toContain("my-garmin-key");
    expect(c.decrypt(a)).toBe("my-garmin-key");
    expect(() => createCipher("other").decrypt(a)).toThrow();
    const parts = a.split(".");
    parts[3] = Buffer.from("x").toString("base64");
    expect(() => c.decrypt(parts.join("."))).toThrow();
  });
});

function makeFit(): Uint8Array {
  const enc = new Encoder();
  type M = Parameters<typeof enc.onMesg>[1];
  const start = new Date("2026-11-01T07:00:00Z");
  enc.onMesg(Profile.MesgNum.FILE_ID, { type: "activity", manufacturer: "development", product: 0, timeCreated: start, serialNumber: 1 } as unknown as M);
  for (let i = 0; i < 120; i++) {
    enc.onMesg(Profile.MesgNum.RECORD, { timestamp: new Date(start.getTime() + i * 1000), heartRate: 140 + (i % 10), enhancedSpeed: 3.3, distance: i * 3.3, cadence: 85, fractionalCadence: 0.5 } as unknown as M);
  }
  const lap = (from: number, secs: number, trigger: string) => ({
    timestamp: new Date(start.getTime() + (from + secs) * 1000), startTime: new Date(start.getTime() + from * 1000), totalElapsedTime: secs, totalTimerTime: secs,
    totalDistance: secs * 3.3, avgHeartRate: 145, maxHeartRate: 149, sport: "running", avgCadence: 85, avgFractionalCadence: 0.5, totalAscent: 3, totalDescent: 1, lapTrigger: trigger,
  });
  enc.onMesg(Profile.MesgNum.LAP, lap(0, 60, "manual") as unknown as M);
  enc.onMesg(Profile.MesgNum.LAP, lap(60, 60, "distance") as unknown as M);
  return enc.close();
}

describe("garmin provider", () => {
  it("maps list items and body battery", () => {
    const a = mapActivity({ activityId: 42, activityName: "Tröskel", startTimeLocal: "2026-11-01 07:00:00", activityType: { typeKey: "running" }, distance: 10000, duration: 2900, averageHR: 160, hrTimeInZone_1: 10, hrTimeInZone_4: 1000 });
    expect(a).toMatchObject({ id: "garmin:42", distanceM: 10000, durationS: 2900, zoneSecs: [10, 0, 0, 1000, 0] });
    expect(maxBodyBattery({ bodyBatteryValuesArray: [[1, 40], [2, 88], [3, 60]] })).toBe(88);
    // Real shape seen 2026-11-08: descriptor list names the level column.
    expect(maxBodyBattery({
      date: "2026-11-07",
      bodyBatteryValueDescriptorDTOList: [{ bodyBatteryValueDescriptorIndex: 0, bodyBatteryValueDescriptorKey: "timestamp" }, { bodyBatteryValueDescriptorIndex: 1, bodyBatteryValueDescriptorKey: "bodyBatteryLevel" }],
      bodyBatteryValuesArray: [[1793920320000, 6], [1793930320000, 76], [1793940320000, 80], [1793950320000, 19]],
    })).toBe(80);
    expect(dateChunks(["2026-11-01", "2026-11-02", "2026-11-03"], 2)).toEqual([["2026-11-01", "2026-11-02"], ["2026-11-03", "2026-11-03"]]);
  });

  it("parses a zipped FIT into laps and a 5 s stream", () => {
    const fit = makeFit();
    const d = parseFit(zipSync({ "42_ACTIVITY.fit": fit }));
    expect(d.laps).toEqual([
      { index: 0, distanceM: 198, durationS: 60, avgHr: 145, startS: 0, trigger: "manual", maxHr: 149, cadence: 171, elevGain: 3, elevLoss: 1 },
      { index: 1, distanceM: 198, durationS: 60, avgHr: 145, startS: 60, trigger: "distance", maxHr: 149, cadence: 171, elevGain: 3, elevLoss: 1 },
    ]);
    expect(d.stream!.t.slice(0, 3)).toEqual([0, 5, 10]);
    expect(d.stream!.speed[0]).toBe(3.3);
    expect(d.stream!.cad![0]).toBe(171);
    expect(d.fit).toEqual(fit);
  });

  it("syncs through a fake Garmin: token once, pages, details, wellness, stops on unchanged page", async () => {
    const calls: string[] = [];
    const fit = zipSync({ "1_ACTIVITY.fit": makeFit() });
    const fakeFetch = (async (url: string | URL, init?: RequestInit) => {
      const u = new URL(String(url));
      calls.push(u.pathname);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      if (u.pathname === TOKEN_PATH) {
        expect(auth).toBe("ApiKey k-123");
        const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 86400 })).toString("base64url");
        return new Response(`x.${payload}.y`);
      }
      expect(auth.startsWith("Bearer ")).toBe(true);
      if (u.pathname.includes("activities/search")) {
        const start = Number(u.searchParams.get("start"));
        return Response.json(start === 0 ? [
          { activityId: 1, activityName: "Run", startTimeLocal: "2026-11-01 07:00:00", activityType: { typeKey: "running" }, distance: 396, duration: 120 },
          { activityId: 2, activityName: "Ride", startTimeLocal: "2026-10-31 07:00:00", activityType: { typeKey: "cycling" }, distance: 9000, duration: 1800 },
        ] : []);
      }
      if (u.pathname.startsWith("/download-service")) return new Response(fit);
      if (u.pathname.startsWith("/hrv-service")) return Response.json({ hrvSummary: { weeklyAvg: 60, lastNightAvg: 58, baseline: { balancedLow: 55 } } });
      if (u.pathname.includes("dailyHeartRate")) return Response.json({ restingHeartRate: 50 });
      if (u.pathname.includes("bodyBattery")) return Response.json([]);
      if (u.pathname === "/wellness-service/wellness/dailySleep") return Response.json({ calendarDate: u.searchParams.get("date"), sleepTimeSeconds: 25140, sleepScores: { overall: { value: 77, qualifierKey: "FAIR" } } });
      return new Response("nope", { status: 404 });
    }) as typeof fetch;

    const db = createDb(":memory:");
    db.$client.prepare("insert into users (sub, created_at) values ('u', 0)").run();
    let stored: { token: string; exp: number } | null = null;
    const provider = createGarminProvider({ baseUrl: "https://g.test", apiKey: "k-123", fetchFn: fakeFetch, tokens: { get: () => stored, set: (token, exp) => { stored = { token, exp }; } } });
    const r1 = await syncProvider(db, 1, provider, { today: "2026-11-02", wellnessDays: 3 });
    expect(r1).toMatchObject({ added: 2, details: 1, detailFailed: 0, wellnessDays: 3 });
    const r2 = await syncProvider(db, 1, provider, { today: "2026-11-02", wellnessDays: 3 });
    expect(r2).toMatchObject({ added: 0, updated: 0, details: 0, wellnessDays: 2 });
    expect(db.$client.prepare("select sleep_score as s from wellness where date = '2026-11-02'").get()).toEqual({ s: 77 });
    expect(calls.filter((p) => p === TOKEN_PATH)).toHaveLength(1);
  });

  it("fetches a year of VO2max on the first sync, then the last two weeks", async () => {
    const db = createDb(":memory:");
    const q = (sql: string) => db.$client.prepare(sql);
    q("insert into users (sub, created_at) values ('u', 0)").run();
    const ranges: string[][] = [];
    const provider = {
      name: "fake", pageSize: 20, activities: async () => [], detail: async () => ({ laps: [], stream: null }), wellness: async () => [],
      vo2max: async (from: string, to: string) => {
        ranges.push([from, to]);
        return [mapVo2max({ generic: { calendarDate: to, vo2MaxPreciseValue: 51.94, vo2MaxValue: 52 }, cycling: null })!];
      },
    };
    expect(await syncVo2max(db, 1, provider, "2026-11-13")).toBe(13);
    expect(ranges[0]).toEqual(["2026-10-15", "2026-11-13"]);
    expect(ranges.at(-1)![0]).toBe("2025-11-14");
    ranges.length = 0;
    await syncVo2max(db, 1, provider, "2026-11-14");
    expect(ranges).toEqual([["2026-11-01", "2026-11-14"]]);
    expect(q("select value from vo2max where date = '2026-11-13'").get()).toEqual({ value: 51.9 });
    expect(mapVo2max({ generic: null, cycling: { calendarDate: "2026-11-01" } })).toBeNull();
  });

  it("refreshes outdated details in place: user data stays, a failed refresh keeps the old laps, the kept FIT is re-read", async () => {
    const db = createDb(":memory:");
    const q = (sql: string) => db.$client.prepare(sql);
    q("insert into users (sub, created_at) values ('u', 0)").run();
    q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, is_run, threshold_flag, detail_status)
       values (1, 'garmin:7', 'Tröskel', 'running', '2026-11-01 07:00:00', '2026-11-01', 396, 120, 1, 1, 'done')`).run();
    q("insert into laps (user_id, activity_id, idx, distance_m, duration_s, avg_hr) values (1, 'garmin:7', 0, 396, 120, 145)").run();
    q("insert into activity_logs (user_id, activity_id, note, rpe) values (1, 'garmin:7', 'tungt', 7)").run();

    let mode: "fail" | "ok" = "fail";
    let detailCalls = 0;
    const provider = {
      name: "fake", pageSize: 20,
      activities: async () => [],
      detail: async () => { detailCalls++; if (mode === "fail") throw new Error("garmin down"); return parseFit(makeFit()); },
      wellness: async () => [],
    };
    const lapsNow = () => q("select idx, start_s as startS, trigger from laps where activity_id = 'garmin:7' order by idx").all();
    const act = () => q("select detail_status as s, detail_version as v, threshold_flag as flag from activities where id = 'garmin:7'").get();

    const r1 = await syncProvider(db, 1, provider, { today: "2026-11-02", wellnessDays: 0 });
    expect(r1).toMatchObject({ details: 0, detailFailed: 1 });
    expect(act()).toEqual({ s: "done", v: 0, flag: 1 });
    expect(lapsNow()).toEqual([{ idx: 0, startS: null, trigger: null }]);

    mode = "ok";
    const r2 = await syncProvider(db, 1, provider, { today: "2026-11-02", wellnessDays: 0 });
    expect(r2).toMatchObject({ details: 1, detailFailed: 0, moreDetails: 0 });
    expect(act()).toEqual({ s: "done", v: DETAIL_VERSION, flag: 1 });
    expect(lapsNow()).toEqual([{ idx: 0, startS: 0, trigger: "manual" }, { idx: 1, startS: 60, trigger: "distance" }]);
    expect(q("select note, rpe from activity_logs where activity_id = 'garmin:7'").get()).toEqual({ note: "tungt", rpe: 7 });
    expect(q("select count(*) as n from activity_files").get()).toEqual({ n: 1 });

    // A later parser bump re-reads the kept file; Garmin is not asked.
    q("update activities set detail_version = 0").run();
    mode = "fail";
    const calls = detailCalls;
    const r3 = await syncProvider(db, 1, provider, { today: "2026-11-02", wellnessDays: 0 });
    expect(r3).toMatchObject({ details: 1, detailFailed: 0 });
    expect(detailCalls).toBe(calls);
    expect(act()).toMatchObject({ v: DETAIL_VERSION });
  });

  it("sync runner: joins a running sync, auto sync only when over an hour old, no retry storm on failure", async () => {
    const db = createDb(":memory:");
    db.$client.prepare("insert into users (sub, created_at) values ('u', 0)").run();
    db.$client.prepare("insert into garmin_accounts (user_id, key_enc, connected_at) values (1, 'x', 0)").run();
    let clock = 10 * AUTO_SYNC_AFTER_MS;
    const runner = createSyncRunner(db, loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv), () => clock);
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let fail = false;
    const provider = {
      pageSize: 20,
      activities: async () => { calls++; await gate; if (fail) throw new Error("garmin down"); return []; },
      detail: async () => ({ laps: [], stream: [] }),
      wellness: async () => [],
    } as unknown as Parameters<typeof runner.run>[1];

    expect(runner.autoDue(1)).toBe(true);
    const a = runner.run(1, provider)!;
    const b = runner.run(1, provider)!;
    expect(a).toBe(b);
    expect(runner.isSyncing(1)).toBe(true);
    expect(runner.autoDue(1)).toBe(false);
    release();
    expect((await a).ok).toBe(true);
    expect(calls).toBe(1);
    expect(runner.isSyncing(1)).toBe(false);
    expect(runner.autoDue(1)).toBe(false);
    clock += AUTO_SYNC_AFTER_MS + 1;
    expect(runner.autoDue(1)).toBe(true);

    fail = true;
    const out = await runner.run(1, provider)!;
    expect(out).toEqual({ ok: false, error: "garmin down" });
    expect(runner.autoDue(1)).toBe(false); // the failed attempt counts, so no retry on every visit
    clock += AUTO_SYNC_AFTER_MS + 1;
    expect(runner.autoDue(1)).toBe(true);
  });
});

describe("garmin sleep score", () => {
  it("reads the overall score from the usual response shapes", async () => {
    const { sleepScoreOf } = await import("./providers/garmin");
    expect(sleepScoreOf({ calendarDate: "2026-11-11", sleepTimeSeconds: 25140, sleepScores: { overall: { value: 77 } } })).toBe(77); // Personal API
    expect(sleepScoreOf({ dailySleepDTO: { sleepScores: { overall: { value: 82 } } } })).toBe(82);
    expect(sleepScoreOf({ sleepScores: { overall: { value: 71 } } })).toBe(71);
    expect(sleepScoreOf({ dailySleepDTO: { sleepScore: 64 } })).toBe(64);
    expect(sleepScoreOf({ dailySleepDTO: {} })).toBeNull();
    expect(sleepScoreOf(null)).toBeNull();
  });

  it("tuning: an admin reads, saves and resets the engine's values, and they change the plans made for that runner", async () => {
    const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
    const db = createDb(":memory:");
    const a = createApp(db, config);
    const t = await (await a.request("/api/admin/tuning")).json() as { values: object; fields: { path: string }[] };
    expect(t.values).toEqual({});
    expect(t.fields.map((f) => f.path)).toContain("long.floorShare");

    expect((await a.request("/api/admin/tuning", json({ values: { ramp: { from: 0.5 } } }, "PUT"))).status).toBe(400);
    expect((await a.request("/api/admin/tuning", json({ values: { nope: 1 } }, "PUT"))).status).toBe(400);
    const saved = await (await a.request("/api/admin/tuning", json({ values: { easy: { ofLong: 0.8 } } }, "PUT"))).json();
    expect(saved).toEqual({ values: { easy: { ofLong: 0.8 } } });
    expect((await (await a.request("/api/admin/tuning")).json() as { values: object }).values).toEqual({ easy: { ofLong: 0.8 } });
    expect(repo.getTuning(db, 1)).toEqual({ easy: { ofLong: 0.8 } });

    // The saved values are in force while this runner's plans are made, and only then.
    await a.request("/api/admin/tuning", json({ values: { daysFromKm: { d4: 35 } } }, "PUT"));
    expect(daysFor(30)).toBe(4);
    expect(repo.tuned(db, 1, () => daysFor(30))).toBe(3);
    expect(daysFor(30)).toBe(4);
    await a.request("/api/admin/tuning", { method: "DELETE", headers: { origin: ORIGIN } });
    expect(repo.getTuning(db, 1)).toBeNull();
  });

  it("tuning: only an admin may reach the panel's routes (a demo visitor never)", async () => {
    const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
    const a = createApp(createDb(":memory:"), { ...config, authMode: "demo" });
    expect((await a.request("/api/admin/tuning")).status).toBe(403);
    expect((await a.request("/api/admin/tuning", json({ values: {} }, "PUT"))).status).toBe(403);
    expect((await a.request("/api/admin/tuning", { method: "DELETE", headers: { origin: ORIGIN } })).status).toBe(403);
  });
});

