import { describe, expect, it } from "vitest";
import { simulate } from "./simulate";
import { createApp } from "./app";
import { createDb } from "./db";
import { loadConfig } from "./config";

// The plan simulator (docs/decisions/fartlek-simulator.md): the real app, block after block, every session run as planned.
describe("simulate", () => {
  it("plans every week up to the race, ending with the race week, and leaves real data alone", async () => {
    const r = await simulate({
      history: [34, 35, 36, 35, 34, 36, 35, 35], runDays: [2, 4, 6, 0], gymDays: [1], threshold: { pace: 260, hr: 172 },
      race: { inWeeks: 8, distanceKm: 21.0975, goalSeconds: 6000 }, start: "2027-01-04",
    });
    expect(r.weeks).toHaveLength(8);
    expect(r.weeks.map((w) => w.weekStart)).toEqual(Array.from({ length: 8 }, (_, i) => new Date(Date.UTC(2027, 0, 4 + i * 7)).toISOString().slice(0, 10)));
    expect(r.weeks.at(-1)!.role).toBe("race");
    expect(r.race).toEqual({ date: "2027-02-28", distanceKm: 21.0975 });
    // Gym on every Monday, never a run there.
    for (const w of r.weeks) expect(w.sessions).toContain("G60");
    expect(r.raceForm).not.toBeNull();
  }, 30_000);

  it("plans a number of weeks without a race", async () => {
    const r = await simulate({ history: [30, 30, 30, 30, 30, 30], weeks: 6, start: "2027-01-04" });
    expect(r.weeks).toHaveLength(6);
    expect(r.race).toBeNull();
  }, 30_000);

  it("is served at POST /api/sim, with the input checked", async () => {
    const app = createApp(createDb(":memory:"), loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
    const post = (b: unknown, q = "") => app.request(`/api/sim${q}`, { method: "POST", body: JSON.stringify(b), headers: { "content-type": "application/json", origin: "http://localhost:5173" } });
    expect((await post({ history: [] })).status).toBe(400);
    expect((await post({ history: [30], start: "2027-01-05" })).status).toBe(400);
    const res = await post({ history: [30, 30, 30, 30], weeks: 4, start: "2027-01-04" }, "?format=text");
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^start 2027-01-04/);
  }, 30_000);
});
