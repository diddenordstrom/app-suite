import { describe, expect, it } from "vitest";
import type { SessionView } from "./compliance";
import type { Workout } from "./types";
import { explainsMiss, longRunCatchUp, primaryReason, recommend, reviewWeek } from "./weekreview";

// Last week: Mon 9 – Sun 15 Nov 2026; "today" is Monday the 16th.
const TODAY = "2026-11-16";
const WEEK = "2026-11-09";

let id = 0;
function s(date: string, type: Workout["type"], km: number, outcome: SessionView["outcome"], over: Partial<Workout> = {}): SessionView {
  const workout: Workout = { id: ++id, date, type, distanceKm: km, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null, manualActivityId: null, manualUnlinked: false, steps: null, ...over };
  return { workout, outcome, match: null, activity: null };
}
const week = (sessions: SessionView[], actualKm = 0) => ({ weekStart: WEEK, sessions, actualKm });

describe("reviewWeek", () => {
  it("is quiet when everything was run", () => {
    const r = reviewWeek(week([s("2026-11-10", "easy", 8, "done"), s("2026-11-12", "threshold", 9, "done"), s("2026-11-15", "long", 16, "short")], 33), TODAY)!;
    expect(r.kind).toBe("quiet");
    expect(r.doneRuns).toBe(3);
  });

  it("calls one missed run small", () => {
    const r = reviewWeek(week([s("2026-11-10", "easy", 8, "done"), s("2026-11-12", "easy", 6, "missed"), s("2026-11-15", "long", 16, "done")], 24), TODAY)!;
    expect(r.kind).toBe("small");
    expect(r.missed.map((w) => w.date)).toEqual(["2026-11-12"]);
  });

  it("asks why after two missed or struck runs in a row", () => {
    const r = reviewWeek(week([s("2026-11-10", "easy", 8, "done"), s("2026-11-12", "easy", 6, "missed"), s("2026-11-14", "threshold", 9, "dropped", { status: "dropped" }), s("2026-11-15", "long", 16, "done")]), TODAY)!;
    expect(r.inARow).toBe(2);
    expect(r.kind).toBe("ask");
    expect(r.wholeWeek).toBe(false);
  });

  it("two misses apart are not a stretch", () => {
    const r = reviewWeek(week([s("2026-11-10", "easy", 8, "missed"), s("2026-11-12", "easy", 6, "done"), s("2026-11-15", "long", 16, "missed")]), TODAY)!;
    expect(r.kind).toBe("small");
  });

  it("knows a whole week missed", () => {
    const r = reviewWeek(week([s("2026-11-10", "easy", 8, "missed"), s("2026-11-12", "threshold", 9, "missed"), s("2026-11-15", "long", 16, "skipped", { status: "skipped", skipReason: "sick" })]), TODAY)!;
    expect(r.wholeWeek).toBe(true);
    expect(r.kind).toBe("ask");
    expect(r.plannedKm).toBe(33);
  });

  it("has nothing to say about a week without planned runs, or one that isn't over", () => {
    expect(reviewWeek(week([]), TODAY)).toBeNull();
    expect(reviewWeek(week([s("2026-11-17", "easy", 8, "upcoming")]), TODAY)).toBeNull();
  });
});

describe("reasons", () => {
  it("recommends from the most serious reason", () => {
    expect(recommend(["sick"])).toBe("pause");
    expect(recommend(["stress", "injury"])).toBe("pause");
    expect(recommend(["stress"])).toBe("light");
    expect(recommend(["tired", "time"])).toBe("light");
    expect(recommend(["travel", "time"])).toBe("repeat");
    expect(recommend(["other"])).toBe("repeat");
  });

  it("stores the most serious reason on the missed sessions", () => {
    expect(primaryReason(["time", "stress", "sick"])).toBe("sick");
    expect(primaryReason(["travel", "time"])).toBe("travel");
    expect(primaryReason([])).toBeNull();
  });

  it("only 'other' leaves a miss unexplained", () => {
    expect(explainsMiss(["other"])).toBe(false);
    expect(explainsMiss(["time"])).toBe(true);
  });
});

describe("longRunCatchUp", () => {
  const review = (missed: Workout[]) => ({ ...reviewWeek(week(missed.map((w) => ({ workout: w, outcome: "missed" as const, match: null, activity: null }))), TODAY)! });
  const easy = (km: number, over: Partial<Workout> = {}) => s("2026-11-12", "easy", km, "missed", over).workout;
  const long = (km: number, over: Partial<Workout> = {}) => s("2026-11-22", "long", km, "to_do", over).workout;

  it("lifts the long run 1 km after one unexplained missed easy run, up to 15 % over the longest", () => {
    // Longest 15 km → step 16 km, lifted to 17 (the cap is 17.25 → 17).
    const c = longRunCatchUp(review([easy(6)]), long(16), 15)!;
    expect(c).toMatchObject({ fromKm: 16, toKm: 17, longestKm: 15, missedKm: 6 });
  });

  it("never goes past 15 % over the longest run", () => {
    expect(longRunCatchUp(review([easy(6)]), long(16.5), 15)!.toKm).toBe(17);
    expect(longRunCatchUp(review([easy(6)]), long(17), 15)).toBeNull();
  });

  it("not after an explained miss, a short one, two misses, or a long run with steps", () => {
    expect(longRunCatchUp(review([easy(6, { skipReason: "stress" })]), long(16), 15)).toBeNull();
    expect(longRunCatchUp(review([easy(3)]), long(16), 15)).toBeNull();
    expect(longRunCatchUp(review([easy(6), easy(6)]), long(16), 15)).toBeNull();
    expect(longRunCatchUp(review([easy(6)]), long(16, { steps: { v: 1, steps: [] } as never }), 15)).toBeNull();
    expect(longRunCatchUp(review([s("2026-11-12", "threshold", 9, "missed").workout]), long(16), 15)).toBeNull();
  });
});
