import { describe, expect, it } from "vitest";
import type { SessionView } from "./compliance";
import type { Workout } from "./types";
import { hardSession, keyFixes, lowFormPlan, missedSessions, movePlan, moveTarget, rebalance, todaySessions, tooFastEasy, tooHardPlan } from "./today";
import { thresholdSteps } from "./nextweek";

// Week of Mon 9 Nov 2026; "today" is Thursday the 12th. Run days Tue, Thu, Sat, Sun.
const TODAY = "2026-11-12";
const END = "2026-11-15";
const RUN_DAYS = [2, 4, 6, 0];

let id = 0;
function s(date: string, type: Workout["type"], km: number | null, outcome: SessionView["outcome"] = date < TODAY ? "to_do" : "to_do", over: Partial<Workout> = {}): SessionView {
  const workout: Workout = { id: ++id, date, type, distanceKm: km, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null, manualActivityId: null, manualUnlinked: false, steps: null, blueprint: null, ...over };
  return { workout, outcome, match: null, activity: null };
}

describe("today and missed", () => {
  it("finds today's session and runs left behind earlier in the week", () => {
    const week = [s("2026-11-09", "easy", 8, "done"), s("2026-11-11", "easy", 10), s(TODAY, "threshold", 9), s("2026-11-14", "easy", 8), s("2026-11-15", "long", 16)];
    expect(todaySessions(week, TODAY).map((x) => x.workout.type)).toEqual(["threshold"]);
    expect(missedSessions(week, TODAY).map((x) => x.workout.date)).toEqual(["2026-11-11"]);
  });

  it("leaves struck sessions out", () => {
    const week = [s("2026-11-11", "easy", 10, "dropped", { status: "dropped" })];
    expect(missedSessions(week, TODAY)).toEqual([]);
  });
});

describe("moveTarget", () => {
  it("moves an easy run to the first free day, usual run days first", () => {
    const week = [s("2026-11-11", "easy", 10), s(TODAY, "threshold", 9), s("2026-11-14", "easy", 8), s("2026-11-15", "long", 16)];
    // Fri 13th is free but not a run day; Sat and Sun are taken, so Friday it is.
    expect(moveTarget(week[0].workout, week, TODAY, END, RUN_DAYS)).toBe("2026-11-13");
  });

  it("never puts a hard session next to another hard one", () => {
    const week = [s("2026-11-10", "threshold", 9), s(TODAY, "easy", 8), s("2026-11-15", "long", 16)];
    // Fri is next to nothing hard, Sat is next to Sunday's long run.
    expect(moveTarget(week[0].workout, week, TODAY, END, RUN_DAYS)).toBe("2026-11-13");
    const full = [...week, s("2026-11-13", "easy", 6)];
    expect(moveTarget(full[0].workout, full, TODAY, END, RUN_DAYS)).toBeNull();
  });
});

describe("rebalance", () => {
  it("spreads struck km over later easy runs and the long run within their caps", () => {
    const week = [s("2026-11-11", "easy", 10, "dropped", { status: "dropped" }), s(TODAY, "threshold", 9), s("2026-11-14", "easy", 8), s("2026-11-15", "long", 16)];
    const r = rebalance(10, week, TODAY);
    const by = Object.fromEntries(r.changes.map((c) => [c.date, c.toKm]));
    expect(by["2026-11-14"]).toBeLessThanOrEqual(8 * 1.3);
    expect(by["2026-11-15"]).toBeLessThanOrEqual(16 * 1.2);
    expect(r.placedKm + r.leftoverKm).toBe(10);
    expect(r.leftoverKm).toBeGreaterThan(0);
    expect(r.weekKm).toBe(33 + r.placedKm);
  });

  it("doesn't touch today's session, structured runs or ones already run", () => {
    const week = [s(TODAY, "easy", 8), s("2026-11-14", "easy", 8, "to_do", { steps: { v: 1, steps: [] } as unknown as Workout["steps"] }), s("2026-11-15", "long", 16, "done")];
    expect(rebalance(4, week, TODAY).changes).toEqual([]);
  });
});

describe("lowFormPlan", () => {
  it("swaps today's key session with a later easy run when it fits there", () => {
    const week = [s(TODAY, "threshold", 9), s("2026-11-13", "easy", 7), s("2026-11-15", "long", 16)];
    const p = lowFormPlan("backOff", week, TODAY, END, RUN_DAYS);
    expect(p).toMatchObject({ kind: "swap", other: { date: "2026-11-13" } });
  });

  it("moves it to a free day when no easy run fits, and says nothing on a good day", () => {
    const week = [s(TODAY, "threshold", 9), s("2026-11-15", "long", 16)];
    expect(lowFormPlan("backOff", week, TODAY, END, RUN_DAYS)).toMatchObject({ kind: "move", date: "2026-11-13" });
    expect(lowFormPlan("trim", week, TODAY, END, RUN_DAYS)).toBeNull();
    expect(lowFormPlan("fine", week, TODAY, END, RUN_DAYS)).toBeNull();
  });
});

describe("keyFixes", () => {
  const O = { easyPace: 330, thresholdPace: 255, units: "metric" as const };
  // Longest run of the 30 days before: 10 km a week and a half ago; the 11 km long run last Sunday was missed.
  const history = [{ date: "2026-11-01", km: 10 }, { date: "2026-11-05", km: 8 }];

  it("brings the next long run back to the step after a missed one", () => {
    const week = [s("2026-11-08", "long", 11, "missed"), s("2026-11-15", "long", 12, "to_do")];
    expect(keyFixes(week, history, TODAY, O)).toEqual([{ kind: "long", workout: week[1].workout, fromKm: 12, toKm: 11, longestKm: 10 }]);
  });

  it("leaves a long run on its step, or within the rounding, alone", () => {
    expect(keyFixes([s("2026-11-15", "long", 11, "to_do")], history, TODAY, O)).toEqual([]);
    expect(keyFixes([s("2026-11-15", "long", 11.5, "to_do")], [{ date: "2026-11-01", km: 10.4 }], TODAY, O)).toEqual([]);
  });

  it("repeats the threshold rung after a missed or struck session, and leaves sessions off the ladder alone", () => {
    const thr = (date: string, reps: number, min: number, outcome: SessionView["outcome"], over: Partial<Workout> = {}) =>
      s(date, "threshold", null, outcome, { steps: thresholdSteps(reps, min), ...over });
    const run = thr("2026-11-03", 3, 8, "done");
    const missed = thr("2026-11-10", 3, 10, "skipped", { status: "skipped" });
    const next = thr("2026-11-17", 3, 12, "upcoming");
    const fixes = keyFixes([run, missed, next], history, TODAY, O);
    expect(fixes).toMatchObject([{ kind: "threshold", workout: next.workout, from: { reps: 3, min: 12 }, to: { reps: 3, min: 10 }, lastRun: { reps: 3, min: 8 } }]);
    expect(fixes[0].kind === "threshold" && fixes[0].stepsText).toMatch(/3x10 min/);
    // Run as planned: the next rung is right.
    expect(keyFixes([run, thr("2026-11-10", 3, 10, "done"), next], history, TODAY, O)).toEqual([]);
    // A session of the runner's own (5x5) is never rewritten.
    expect(keyFixes([run, missed, thr("2026-11-17", 5, 5, "upcoming")], history, TODAY, O)).toEqual([]);
  });

  it("only looks a week ahead", () => {
    expect(keyFixes([s("2026-11-22", "long", 14, "upcoming")], history, TODAY, O)).toEqual([]);
  });
});

describe("rebalance and the 30-day rule", () => {
  it("never grows a run past 10 % over the longest run of the 30 days before it", () => {
    const week = [s("2026-11-14", "easy", 8), s("2026-11-15", "long", 10.5)];
    const r = rebalance(4, week, TODAY, [{ date: "2026-11-01", km: 10 }]);
    // The long run may grow 20 %, but only to 11 km here.
    expect(r.changes.find((c) => c.type === "long")?.toKm ?? 10.5).toBeLessThanOrEqual(11);
  });
});

describe("movePlan", () => {
  it("moves to a free day when there is one", () => {
    const week = [s("2026-11-10", "threshold", 9), s("2026-11-15", "long", 16)];
    expect(movePlan(week[0].workout, week, TODAY, END, RUN_DAYS)).toEqual({ kind: "move", date: "2026-11-12" });
  });

  it("lets a key session take over a later easy run's day when no day is free, and moves the easy run on", () => {
    // Thu–Sun all taken: Thu easy, Fri easy, Sat easy, Sun long. The missed threshold can't go next to Sunday's long run (Sat),
    // so it takes Thursday's easy run; that one moves to... nowhere free (Fri, Sat taken), so it is struck.
    const week = [s("2026-11-10", "threshold", 9), s(TODAY, "easy", 8), s("2026-11-13", "easy", 6), s("2026-11-14", "easy", 6), s("2026-11-15", "long", 16)];
    const p = movePlan(week[0].workout, week, TODAY, END, RUN_DAYS)!;
    expect(p).toMatchObject({ kind: "swap", date: TODAY, otherTo: null });
    expect(p.kind === "swap" && p.other.id).toBe(week[1].workout.id);
  });

  it("moves the easy run it took over to a free day when there is one", () => {
    const week = [s("2026-11-10", "threshold", 9), s(TODAY, "easy", 8), s("2026-11-13", "easy", 6), s("2026-11-15", "long", 16)];
    // Free: Sat (but next to Sunday's long run, so not for the threshold). The threshold takes Thursday, the easy run goes to Saturday.
    expect(movePlan(week[0].workout, week, TODAY, END, RUN_DAYS)).toMatchObject({ kind: "swap", date: TODAY, otherTo: "2026-11-14" });
  });

  it("never takes over a day for a missed easy run", () => {
    const week = [s("2026-11-10", "easy", 9), s(TODAY, "easy", 8), s("2026-11-13", "easy", 6), s("2026-11-14", "easy", 6), s("2026-11-15", "long", 16)];
    expect(movePlan(week[0].workout, week, TODAY, END, RUN_DAYS)).toBeNull();
  });
});

describe("too hard", () => {
  const load = (v: SessionView, actual: number, planned: number) => ({ workout: v.workout, actual, planned });
  const thr = (date: string, reps: number, min: number) => s(date, "threshold", 9, "to_do", { steps: thresholdSteps(reps, min) });

  it("finds a session well over its planned load, or a race", () => {
    const easy = s("2026-11-11", "easy", 8, "done");
    expect(hardSession([load(easy, 90, 50)], TODAY)?.workout.id).toBe(easy.workout.id);
    expect(hardSession([load(easy, 60, 50)], TODAY)).toBeNull();
    const race = s("2026-11-11", "race", 10, "done");
    expect(hardSession([load(race, 70, 70)], TODAY)?.workout.type).toBe("race");
    expect(hardSession([load(s("2026-11-08", "easy", 8, "done"), 90, 40)], TODAY)).toBeNull();
  });

  it("first makes the next day easy: its key session moves, or becomes easy", () => {
    const hard = s("2026-11-11", "easy", 8, "done");
    const week = [hard, thr(TODAY, 3, 10), s("2026-11-15", "long", 16)];
    const p = tooHardPlan(load(hard, 90, 50), week, TODAY, END, RUN_DAYS, { score: 7, units: "metric" })!;
    expect(p.step).toBe("nextDayEasy");
    expect(p.changes[0]).toMatchObject({ workoutId: week[1].workout.id, moveTo: "2026-11-13" });
  });

  it("then takes a threshold session within two days a rung down", () => {
    const hard = s("2026-11-11", "easy", 8, "done");
    const week = [hard, s(TODAY, "easy", 6), thr("2026-11-13", 3, 10), s("2026-11-15", "long", 16)];
    const p = tooHardPlan(load(hard, 90, 50), week, TODAY, END, RUN_DAYS, { score: 7, units: "metric" })!;
    expect(p.step).toBe("rungDown");
    expect(p.changes[0].stepsText).toContain("3x8");
  });

  it("then trims the easy runs left, and keeps the long run's step", () => {
    const hard = s("2026-11-11", "threshold", 9, "done");
    const week = [hard, s(TODAY, "easy", 8), s("2026-11-14", "easy", 6), s("2026-11-15", "long", 16)];
    const p = tooHardPlan(load(hard, 120, 70), week, TODAY, END, RUN_DAYS, { score: 4, units: "metric" })!;
    expect(p.step).toBe("trimEasy");
    expect(p.changes.map((c) => c.toKm)).toEqual([7, 5]);
  });

  it("shortens the long run last, only with low form and the long run close", () => {
    const hard = s("2026-11-11", "threshold", 9, "done");
    const week = [hard, s("2026-11-14", "long", 16)];
    expect(tooHardPlan(load(hard, 120, 70), week, TODAY, END, RUN_DAYS, { score: 4, units: "metric" })).toMatchObject({ step: "shortenLong", changes: [{ toKm: 14 }] });
    expect(tooHardPlan(load(hard, 120, 70), week, TODAY, END, RUN_DAYS, { score: 7, units: "metric" })).toBeNull();
  });

  it("says when an easy run was run mostly above zone 2", () => {
    const fast = s("2026-11-11", "easy", 8, "done");
    fast.activity = { zoneSecs: [100, 500, 1200, 600, 0] } as never;
    const fine = s("2026-11-10", "easy", 8, "done");
    fine.activity = { zoneSecs: [600, 2000, 200, 0, 0] } as never;
    expect(tooFastEasy([fast, fine], TODAY).map((w) => w.id)).toEqual([fast.workout.id]);
  });
});
