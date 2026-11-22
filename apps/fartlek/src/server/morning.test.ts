import { describe, expect, it } from "vitest";
import type { Push, PushLang, PushMessage } from "@homelab/server-kit";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import * as t from "./db/schema";
import { createMorning, morningText } from "./morning";
import type { SyncRunner } from "./sync";

const ORIGIN = "http://localhost:5173";
const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });

describe("morning notification", () => {
  it("says today's sessions and form in the device's language", () => {
    const parts = { sessions: [{ type: "threshold" as const, km: 10 }, { type: "strength" as const, km: null }], score: 6, verdict: "trim" as const, uncertain: true, suggestion: true };
    expect(morningText(parts, "sv", "metric")).toMatchObject({ title: "Idag: tröskel 10 km + gym", body: "Dagsform 6/10, ta det lite lugnare (osäker) Det finns ett förslag i appen." });
    expect(morningText({ ...parts, sessions: [], score: null }, "en", "metric")).toMatchObject({ title: "Rest day", body: "No form score yet. Check in in the app." });
    expect(morningText({ ...parts, sessions: [{ type: "easy", km: 8.5 }], uncertain: false, suggestion: false, score: 9, verdict: "fine" }, "sv", "metric").title).toBe("Idag: lugnt 8.5 km");
  });

  it("goes out once a day after the time, waiting for last night when Garmin is connected", async () => {
    const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
    const db = createDb(":memory:");
    const app = createApp(db, config);
    await app.request("/api/settings"); // signs in the dev user (id 1); timezone UTC
    let clock = new Date();
    clock.setUTCHours(6, 30, 0, 0);
    const today = clock.toISOString().slice(0, 10);
    await app.request("/api/workouts", json({ date: today, type: "easy", distanceKm: 8 }));

    const sent: PushMessage[] = [];
    const push = { subscribedUsers: () => [1], sendTo: async (_u: number, m: (l: PushLang) => PushMessage) => { sent.push(m("sv")); return { sent: 1, removed: 0, failed: 0 }; } } as unknown as Push;
    let syncs = 0;
    const syncer = { run: async () => { syncs++; return null; } } as unknown as SyncRunner;
    const morning = createMorning(db, push, syncer, () => clock);

    db.insert(t.morningPush).values({ userId: 1, time: "07:00", sentOn: null }).run();
    await morning.tick();
    expect(sent).toEqual([]); // 06:30, not yet

    clock = new Date(clock.getTime() + 45 * 60_000); // 07:15, no Garmin: sends right away
    await morning.tick();
    expect(sent.map((m) => m.title)).toEqual(["Idag: lugnt 8 km"]);
    await morning.tick();
    expect(sent.length).toBe(1);

    // With Garmin and no night yet: asks Garmin and waits, every 15 minutes, then sends without it after two hours.
    db.update(t.morningPush).set({ sentOn: null }).run();
    db.insert(t.garminAccounts).values({ userId: 1, keyEnc: "x", connectedAt: 0 }).run();
    await morning.tick();
    expect([sent.length, syncs]).toEqual([1, 1]);
    clock = new Date(clock.getTime() + 5 * 60_000);
    await morning.tick();
    expect(syncs).toBe(1);
    // Last night arrives: it goes out.
    db.insert(t.wellness).values({ userId: 1, date: today, sleepScore: 80, fetchedAt: 0 }).run();
    clock = new Date(clock.getTime() + 15 * 60_000);
    await morning.tick();
    expect([sent.length, syncs]).toEqual([2, 2]);
  });

  it("stores the time, and a time already passed today waits for tomorrow", async () => {
    const config = loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv);
    const db = createDb(":memory:");
    const app = createApp(db, config);
    expect(await (await app.request("/api/push/morning")).json()).toEqual({ time: null, defaultTime: "08:00" });
    expect((await app.request("/api/push/morning", json({ time: "7am" }, "PUT"))).status).toBe(400);
    expect((await app.request("/api/push/morning", json({ time: "00:00" }, "PUT"))).status).toBe(200);
    const row = db.select().from(t.morningPush).get()!;
    expect(row.time).toBe("00:00");
    // Unless it is exactly midnight UTC, 00:00 has passed: today counts as sent.
    expect(row.sentOn === null || row.sentOn === new Date().toISOString().slice(0, 10)).toBe(true);
    await app.request("/api/push/morning", json({ time: null }, "PUT"));
    expect(db.select().from(t.morningPush).get()!.time).toBeNull();
  });
});
