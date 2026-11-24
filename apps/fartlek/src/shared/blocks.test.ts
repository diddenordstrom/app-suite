import { describe, expect, it } from "vitest";
import { summarizeWeek, type WeekSummary } from "./compliance";
import { blockEnd, blockOn, CATCHUP_TAG, checkEdges, longestStep, markSpikes, raceHints, spikeLimitOf, spikeOf, summarizeBlock } from "./blocks";
import { applyBlockText, blockText, weekText, type WeekState } from "./blocktext";
import { parseWeekLine } from "./parser";
import { addDays, weekStartOf } from "./dates";
import type { Activity, Block, Workout } from "./types";

const act = (p: Partial<Activity> & { id: string; date: string; km?: number }): Activity => ({
  name: "Run", typeKey: "running", startTimeLocal: `${p.date} 07:00:00`, distanceM: (p.km ?? 0) * 1000, durationS: (p.km ?? 0) * 330,
  avgHr: 140, maxHr: 160, elevationGain: null, zoneSecs: null, isRun: true, thresholdFlag: false, hasDetail: false, ...p,
});
let nextId = 1;
const wo = (p: Partial<Workout> & { date: string }): Workout => ({
  id: nextId++, type: "easy", distanceKm: null, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null,
  manualActivityId: null, manualUnlinked: false, steps: null, blueprint: null, ...p,
});
const block = (p: Partial<Block> & { id: number; startWeek: string; weeks: number }): Block => ({ kind: "base", name: null, note: null, crossMin: null, goalKm: null, ...p });
const state = (weekStart: string, workouts: Workout[], today: string, acts: Activity[] = [], target: WeekState["target"] = null): WeekState => {
  const s = summarizeWeek(weekStart, workouts, acts, target, today);
  return { weekStart, finished: addDays(weekStart, 6) < today, sessions: s.sessions, target };
};

describe("block edges", () => {
  const blocks = [block({ id: 1, startWeek: "2026-11-02", weeks: 4 }), block({ id: 2, startWeek: "2026-11-30", weeks: 2 }), block({ id: 3, startWeek: "2026-12-14", weeks: 3 }), block({ id: 4, startWeek: "2027-02-01", weeks: 2 })];
  it("ranges", () => {
    expect(blockEnd(blocks[0])).toBe("2026-11-29");
    expect(blockOn("2026-11-30", blocks)?.id).toBe(2);
    expect(blockOn("2027-01-20", blocks)).toBeNull();
  });
  it("extending pushes the next blocks on, cascading only while they collide", () => {
    const r = checkEdges({ id: 1, startWeek: "2026-11-02", weeks: 5 }, blocks, "2026-11-10");
    expect(r).toEqual({ ok: true, pushes: [{ id: 2, name: null, kind: "base", weeks: 1 }, { id: 3, name: null, kind: "base", weeks: 1 }] });
    expect(checkEdges({ id: 1, startWeek: "2026-11-02", weeks: 4 }, blocks, "2026-11-10")).toEqual({ ok: true, pushes: [] });
  });
  it("overlapping a block that starts earlier, or pushing one that started, is refused", () => {
    expect(checkEdges({ startWeek: "2026-11-16", weeks: 1 }, blocks, "2026-11-10")).toMatchObject({ ok: false, reason: "overlap" });
    expect(checkEdges({ id: 1, startWeek: "2026-11-02", weeks: 5 }, blocks, "2026-12-01")).toMatchObject({ ok: false, reason: "started" });
  });
});

describe("catch-up long run", () => {
  it("may go 15 % over the longest run when tagged, 10 % otherwise", () => {
    const hist = [{ date: "2026-11-08", km: 15 }];
    expect(spikeOf("2026-11-15", 17, hist)).not.toBeNull();
    expect(spikeOf("2026-11-15", 17, hist, spikeLimitOf({ notes: CATCHUP_TAG }))).toBeNull();
    expect(spikeOf("2026-11-15", 18, hist, spikeLimitOf({ notes: CATCHUP_TAG }))).not.toBeNull();
    expect(spikeLimitOf({ notes: null })).toBe(0.1);
  });
});

describe("long-run step", () => {
  const hist = [{ date: "2026-11-01", km: 10 }, { date: "2026-11-08", km: 12 }, { date: "2026-09-01", km: 30 }];
  it("looks back 30 days", () => {
    expect(longestStep("2026-11-15", 15, hist)).toEqual({ refKm: 12, pct: 0.25 });
    expect(spikeOf("2026-11-15", 13, hist)).toBeNull();
    expect(spikeOf("2026-11-15", 13.5, hist)).toMatchObject({ refKm: 12, pct: 0.13 });
    // The engine's rounding to the half km: 11.5 after a longest of 10.4 is fine, 12 is not.
    const h2 = [{ date: "2026-11-08", km: 10.4 }];
    expect(spikeOf("2026-11-15", 11.5, h2)).toBeNull();
    expect(spikeOf("2026-11-15", 12, h2)).toMatchObject({ refKm: 10.4 });
    expect(spikeOf("2026-12-20", 20, hist)).toBeNull();
  });
  it("marks planned runs in week summaries", () => {
    const today = "2026-11-10";
    const w1 = summarizeWeek("2026-11-02", [], [act({ id: "a", date: "2026-11-08", km: 10 })], null, today);
    const long = wo({ date: "2026-11-15", type: "long", distanceKm: 14 });
    const race = wo({ date: "2026-11-14", type: "race", distanceKm: 21.1 });
    const w2 = summarizeWeek("2026-11-09", [long, race], [], null, today);
    markSpikes([w1, w2]);
    expect(w2.sessions.find((s) => s.workout.id === long.id)?.spike).toBeNull(); // the race (21.1) is the reference
    expect(w2.sessions.find((s) => s.workout.id === race.id)?.spike).toBeUndefined();
    const w3 = summarizeWeek("2026-11-09", [wo({ date: "2026-11-15", type: "long", distanceKm: 14 })], [], null, today);
    markSpikes([w1, w3]);
    expect(w3.sessions[0].spike).toEqual({ km: 14, refKm: 10, pct: 0.4 });
  });
});

describe("block text", () => {
  const today = "2026-11-11";
  const monday = (n: number) => addDays("2026-11-02", n * 7);

  it("serialises one line per week, ✓ on finished weeks", () => {
    const weeks = [
      state(monday(0), [wo({ date: monday(0), distanceKm: 6 }), wo({ date: addDays(monday(0), 3), type: "threshold", distanceKm: 9 })], today),
      state(monday(1), [wo({ date: addDays(monday(1), 6), type: "long", distanceKm: 15, zone2: true }), wo({ date: monday(1), durationMin: 45 })], today, [], { km: null, minutes: null, note: "backoff" }),
      state(monday(2), [], today, [], { km: 20, minutes: null, note: "4 runs" }),
      state(monday(3), [], today),
    ];
    expect(blockText(weeks, "metric")).toBe("✓ 6 easy, 9 threshold\n45min easy, 15 long run zone 2 backoff\n4 20\n-");
    expect(weekText(weeks[0], "imperial")).toBe("3.7 easy, 5.6 threshold");
    for (const line of blockText(weeks, "metric").split("\n")) expect(parseWeekLine(line).errors).toEqual([]);
  });

  it("keeps unchanged weeks untouched and pairs changed sessions by type", () => {
    const easy = wo({ date: addDays(monday(1), 1), distanceKm: 6, notes: "with Anna" });
    const thr = wo({ date: addDays(monday(1), 4), type: "threshold", distanceKm: 9 });
    const long = wo({ date: addDays(monday(1), 6), type: "long", distanceKm: 11 });
    const weeks = [
      state(monday(0), [wo({ date: monday(0), distanceKm: 8 })], today),
      state(monday(1), [easy, thr, long], today),
      state(monday(2), [wo({ date: addDays(monday(2), 1), distanceKm: 6 })], today),
    ];
    const text = "✓ 8 easy\n6 easy, 10 threshold, 13 long run\n6 easy";
    const r = applyBlockText(weeks, 3, text, [2, 4, 0], "metric");
    expect(r.errors).toEqual([]);
    expect(r.weeks.map((w) => w.state)).toEqual(["locked", "changed", "unchanged"]);
    expect(r.ops).toEqual([
      { op: "update", id: thr.id, distanceKm: 10, durationMin: null, zone2: false },
      { op: "update", id: long.id, distanceKm: 13, durationMin: null, zone2: false },
    ]);
    expect(r.weeks[1]).toMatchObject({ beforeKm: 26, afterKm: 29 });
  });

  it("places new sessions on free run days and only deletes planned, unlinked ones", () => {
    const done = wo({ date: "2026-11-10", type: "intervals", distanceKm: 8 });
    const planned = wo({ date: "2026-11-12", type: "intervals", distanceKm: 8 });
    const weeks = [state(monday(1), [done, planned, wo({ date: "2026-11-15", type: "long", distanceKm: 12 })], today, [act({ id: "r", date: "2026-11-10", km: 8, thresholdFlag: true })])];
    const r = applyBlockText(weeks, 1, "12 long run, 6 easy, 5 easy", [2, 4, 0], "metric");
    expect(r.ops).toEqual([
      { op: "delete", id: planned.id },
      { op: "create", date: "2026-11-12", type: "easy", distanceKm: 6, durationMin: null, zone2: false },
      { op: "create", date: "2026-11-09", type: "easy", distanceKm: 5, durationMin: null, zone2: false },
    ]);
    expect(r.weeks[0].changes.find((c) => c.op === "keep")).toMatchObject({ type: "intervals", date: "2026-11-10" });
  });

  it("ignores edits to finished weeks with a warning; line count sets the length", () => {
    const weeks = [state(monday(0), [wo({ date: monday(0), distanceKm: 8 })], today), state(monday(1), [], today), state(monday(2), [wo({ date: monday(2), distanceKm: 5 })], today)];
    const r = applyBlockText(weeks, 2, "✓ 10 easy\n6 easy\n- backoff", [2, 4, 0], "metric");
    expect(r.length).toBe(3);
    expect(r.weeks[0]).toMatchObject({ state: "locked", warnings: [{ key: "bt.lockedEdit" }] });
    expect(r.weeks[2].state).toBe("added");
    expect(r.ops.filter((o) => o.op === "delete")).toHaveLength(1);
    expect(r.ops).toContainEqual({ op: "target", weekStart: monday(2), target: { km: null, minutes: null, note: "backoff" } });
    const shorter = applyBlockText(weeks, 3, "✓ 8 easy", [2], "metric");
    expect(shorter.weeks.map((w) => w.state)).toEqual(["locked", "removed", "removed"]);
    expect(shorter.ops).toEqual([]);
  });

  it("totals lines set the week target; parse errors block the save", () => {
    const weeks = [state(monday(2), [], today)];
    expect(applyBlockText(weeks, 1, "4 30", [2], "metric").ops).toEqual([{ op: "target", weekStart: monday(2), target: { km: 30, minutes: null, note: "4 runs" } }]);
    const bad = applyBlockText(weeks, 1, "6 wibble", [2], "metric");
    expect(bad.errors[0]).toMatchObject({ key: "bt.lineError", params: { week: 1 } });
    expect(bad.ops).toEqual([]);
    expect(applyBlockText(weeks, 1, "\n\n", [2], "metric").errors).toEqual([{ key: "bt.empty" }]);
  });
});

describe("block summary", () => {
  it("judges finished weeks on volume and key sessions; intensity stays separate", () => {
    const today = "2026-11-18";
    const z = (low: number, high: number) => [low / 2, low / 2, 0, high, 0] as Activity["zoneSecs"];
    const weeks: WeekSummary[] = [0, 1, 2].map((n) => {
      const ws = addDays("2026-11-02", n * 7);
      const ws4 = (d: number) => addDays(ws, d);
      const workouts = [wo({ date: ws4(1), distanceKm: 6 }), wo({ date: ws4(3), type: "threshold", distanceKm: 9 }), wo({ date: ws4(6), type: "long", distanceKm: 12 })];
      const acts = n === 2 ? [] : [
        act({ id: `e${n}`, date: ws4(1), km: 6, zoneSecs: z(1800, 600) }),
        act({ id: `t${n}`, date: ws4(3), km: 9, thresholdFlag: true, zoneSecs: z(600, 1800) }),
        act({ id: `l${n}`, date: ws4(6), km: n === 0 ? 12 : 11, zoneSecs: z(4000, 0) }),
      ];
      return summarizeWeek(ws, workouts, acts, null, today);
    });
    const s = summarizeBlock({ startWeek: "2026-11-02", weeks: 3 }, weeks, today);
    expect(s).toMatchObject({ weekNo: 3, finishedWeeks: 2, status: "on_track", key: { planned: 4, done: 4, total: 6 } });
    expect(s.volume).toEqual({ targetKm: 54, actualKm: 53, pct: 98, totalKm: 81, doneKm: 53 });
    expect(s.easy.share).toBeCloseTo((1800 * 2 + 4000 * 2) / (2400 * 2 + 4000 * 2));
    expect(s.longest).toMatchObject({ km: 12, planned: false });
    expect(s.weeks.map((w) => w.finished)).toEqual([true, true, false]);
    expect(summarizeBlock({ startWeek: "2027-01-04", weeks: 2 }, weeks, today).status).toBe("upcoming");
  });
});

describe("race hints", () => {
  it("suggests a taper and places volume and longest run in the Fokkema bands", () => {
    const today = "2026-11-02";
    const race = { date: "2027-01-31", distanceKm: 42.195, priority: "A" as const };
    const ws = (d: string) => weekStartOf(d, "monday");
    const weeks = Array.from({ length: 6 }, (_, i) => {
      const w = addDays("2026-12-21", i * 7);
      return summarizeWeek(w, [wo({ date: addDays(w, 6), type: "long", distanceKm: 20 + i * 2 }), wo({ date: addDays(w, 2), distanceKm: 30 })], [], null, today);
    });
    const h = raceHints(race, weeks, ws);
    expect(h.taper).toMatchObject({ from: "2027-01-18", to: "2027-01-30" });
    expect(h.build).toMatchObject({ kind: "marathon", from: "2026-12-14", to: "2027-01-17", volume: "mid", long: "ok", longestKm: 30, weeklyKm: 53 });
    expect(h.taper!.lowKm).toBeLessThan(h.taper!.highKm!);
    expect(raceHints({ ...race, distanceKm: 10, priority: "B" }, weeks, ws)).toEqual({ taper: null, build: null });
  });

  it("says nothing about volume for build weeks that haven't started and have nothing planned", () => {
    const today = "2026-11-02";
    const ws = (d: string) => weekStartOf(d, "monday");
    const weeks = Array.from({ length: 6 }, (_, i) => summarizeWeek(addDays("2027-04-05", i * 7), [], [], null, today));
    const h = raceHints({ date: "2027-05-22", distanceKm: 21.1, priority: "A" }, weeks, ws);
    expect(h.build).toMatchObject({ weeklyKm: null, longestKm: null, volume: null });
  });
});
