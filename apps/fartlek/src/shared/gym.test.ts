import { describe, expect, it } from "vitest";
import { alternatives, EXERCISES, exercise, fromExportName, PATTERNS, TEMPLATES } from "./gym";
import { bestSet, checkSession, chooseTemplate, improvements, latestByExercise, suggestSets, volume, type GymSet } from "./gymplan";
import { parseBoltCsv, parseCsv } from "./boltcsv";
import type { Workout } from "./types";

const w = (reps: number, kg: number | null = null): GymSet => ({ kind: "work", kg, reps, seconds: null });
const plan = (date: string, type: Workout["type"]): Workout => ({ id: 1, date, type, distanceKm: 8, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null, manualActivityId: null, manualUnlinked: false, steps: null });

describe("gym catalogue", () => {
  it("has unique ids and aliases, valid patterns, and templates built from it", () => {
    const ids = EXERCISES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    const aliases = EXERCISES.flatMap((e) => (e.aliases ?? []).map((a) => a.toLowerCase()));
    expect(new Set(aliases).size).toBe(aliases.length);
    expect(EXERCISES.every((e) => PATTERNS.includes(e.pattern))).toBe(true);
    for (const tpl of Object.values(TEMPLATES)) {
      for (const slot of tpl.slots) for (const c of slot.choices) expect(exercise(c).pattern, `${tpl.id} ${c}`).toBe(slot.pattern);
      for (const x of tpl.extras) expect(ids).toContain(x);
    }
  });

  it("swapping offers the same pattern, the slot's own choices first", () => {
    const alts = alternatives("stiff_leg_deadlift", ["stiff_leg_deadlift", "single_leg_rdl"]);
    expect(alts[0]).toBe("single_leg_rdl");
    expect(alts).not.toContain("stiff_leg_deadlift");
    expect(alts.every((a) => exercise(a).pattern === "hinge")).toBe(true);
  });

  it("maps export names to the catalogue, and keeps unknown names", () => {
    expect(fromExportName("Bench Press (Barbell)")).toBe("bench_press");
    expect(fromExportName(" side delt raises ")).toBe("lateral_raise");
    expect(fromExportName("Zercher   Squat")).toBe("x:Zercher Squat");
  });
});

describe("suggested sets", () => {
  const scheme = { sets: 3, low: 8, high: 10 };
  it("nothing last time: bottom of the range, no weight", () => {
    expect(suggestSets("stiff_leg_deadlift", scheme, null)).toEqual({ change: "new", sets: [w(8), w(8), w(8)] });
  });
  it("every set at the top: one step up, back to the bottom", () => {
    const s = suggestSets("stiff_leg_deadlift", scheme, { date: "2026-11-16", sets: [w(10, 60), w(10, 60), w(11, 60)] });
    expect(s.change).toBe("up");
    expect(s.sets).toEqual([w(8, 62.5), w(8, 62.5), w(8, 62.5)]);
  });
  it("not all at the top: repeat last time, set by set", () => {
    const s = suggestSets("stiff_leg_deadlift", scheme, { date: "2026-11-16", sets: [w(10, 60), w(9, 60), w(8, 60)] });
    expect(s).toEqual({ change: "same", sets: [w(10, 60), w(9, 60), w(8, 60)] });
  });
  it("dumbbells step by 2 kg; body weight without added weight goes up a rep", () => {
    expect(suggestSets("bulgarian_split_squat", scheme, { date: "x", sets: [w(10, 16), w(10, 16), w(10, 16)] }).sets[0]).toEqual(w(8, 18));
    expect(suggestSets("pull_up", { sets: 3, low: 4, high: 6 }, { date: "x", sets: [w(7), w(6), w(6)] }).sets.map((x) => x.reps)).toEqual([8, 7, 7]);
  });
  it("held exercises go up five seconds once every hold reached the top", () => {
    const held = (s: number): GymSet => ({ kind: "work", kg: null, reps: null, seconds: s });
    expect(suggestSets("wall_sit", { sets: 3, low: 30, high: 45 }, { date: "x", sets: [held(45), held(45), held(50)] }).sets[0].seconds).toBe(55);
    expect(suggestSets("wall_sit", { sets: 3, low: 30, high: 45 }, { date: "x", sets: [held(40), held(45), held(45)] }).sets.map((x) => x.seconds)).toEqual([40, 45, 45]);
  });
  it("warm-ups don't count", () => {
    const s = suggestSets("bench_press", { sets: 2, low: 5, high: 8 }, { date: "x", sets: [{ kind: "warmup", kg: 40, reps: 10, seconds: null }, w(8, 60), w(8, 60)] });
    expect(s.sets[0]).toEqual(w(5, 62.5));
  });
});

describe("template for the day", () => {
  it("upper body the day before a key session, else legs and then turns", () => {
    expect(chooseTemplate("2026-11-26", [plan("2026-11-27", "threshold")], null)).toEqual({ id: "B", why: { key: "gym.why.keyTomorrow", params: { type: "threshold" } } });
    expect(chooseTemplate("2026-11-23", [plan("2026-11-27", "threshold")], null)).toEqual({ id: "A", why: { key: "gym.why.legsBefore", params: { type: "threshold", days: 4 } } });
    expect(chooseTemplate("2026-11-25", [plan("2026-11-29", "long")], "A").id).toBe("B");
    expect(chooseTemplate("2026-11-25", [{ ...plan("2026-11-26", "long"), status: "dropped" }], null).id).toBe("A");
    // One gym session in the week: full body, whatever comes next.
    expect(chooseTemplate("2026-11-26", [plan("2026-11-27", "threshold")], "A", 1)).toEqual({ id: "F", why: { key: "gym.why.oncePerWeek" } });
  });
});

describe("history and results", () => {
  it("latest session per exercise, work sets only", () => {
    const rows = [
      { sessionId: 1, date: "2026-11-02", startedAt: null, exercise: "bench_press", kind: "work", kg: 60, reps: 6, seconds: null },
      { sessionId: 2, date: "2026-11-09", startedAt: null, exercise: "bench_press", kind: "warmup", kg: 40, reps: 10, seconds: null },
      { sessionId: 2, date: "2026-11-09", startedAt: null, exercise: "bench_press", kind: "work", kg: 62.5, reps: 5, seconds: null },
      { sessionId: 2, date: "2026-11-09", startedAt: null, exercise: "bench_press", kind: "work", kg: 62.5, reps: 5, seconds: null },
      { sessionId: 1, date: "2026-11-02", startedAt: null, exercise: "pull_up", kind: "work", kg: null, reps: 6, seconds: null },
    ];
    const last = latestByExercise(rows);
    expect(last.bench_press).toEqual({ date: "2026-11-09", sets: [w(5, 62.5), w(5, 62.5)] });
    expect(last.pull_up.date).toBe("2026-11-02");
  });

  it("last time carries the exercise note, even when it sits on a warm-up", () => {
    const rows = [
      { sessionId: 1, date: "2026-11-02", startedAt: null, exercise: "split_squat", kind: "work", kg: 10, reps: 8, seconds: null, note: "old" },
      { sessionId: 2, date: "2026-11-09", startedAt: null, exercise: "split_squat", kind: "warmup", kg: 5, reps: 8, seconds: null, note: "left leg first" },
      { sessionId: 2, date: "2026-11-09", startedAt: null, exercise: "split_squat", kind: "work", kg: 12, reps: 8, seconds: null },
    ];
    expect(latestByExercise(rows).split_squat).toEqual({ date: "2026-11-09", note: "left leg first", sets: [w(8, 12)] });
  });

  it("improvements: more weight, or the same weight for more reps; volume skips warm-ups", () => {
    const last = { bench_press: { date: "x", sets: [w(5, 62.5)] }, db_curl: { date: "x", sets: [w(10, 12)] }, pull_up: { date: "x", sets: [w(8)] } };
    const entries = [
      { exercise: "bench_press", slot: null, sets: [{ kind: "warmup" as const, kg: 40, reps: 10, seconds: null }, w(5, 65)] },
      { exercise: "db_curl", slot: null, sets: [w(11, 12)] },
      { exercise: "pull_up", slot: null, sets: [w(7)] },
    ];
    expect(improvements(entries, last).map((i) => [i.exercise, i.kg, i.reps])).toEqual([["bench_press", 2.5, 0], ["db_curl", 0, 1]]);
    expect(volume(entries)).toBe(65 * 5 + 12 * 11);
    expect(bestSet([w(10, 60), w(12, 60), w(5, 62.5)])).toEqual(w(5, 62.5));
  });

  it("checks a session from the client", () => {
    const ok = { clientId: "abc123def", date: "2026-11-23", startedAt: 1, finishedAt: 2, template: "A", feel: "none", workoutId: null, entries: [{ exercise: "bench_press", slot: "push", sets: [w(5, 60)] }] };
    expect(checkSession(ok)).toEqual([]);
    expect(checkSession({ ...ok, clientId: "x", template: "D" })).toHaveLength(2);
    expect(checkSession({ ...ok, entries: [{ exercise: "bench_press", sets: [{ kind: "work", kg: -1, reps: 5 }] }] })).toEqual(["entry 1, set 1 is invalid"]);
  });
});

describe("Bolt import", () => {
  const csv = [
    "Date,Workout Name,Exercise Name,Set,Weight,Reps,Distance,Duration,Level,Notes",
    '"2026-01-05 12:00:00","Upper","Bench Press (Barbell)","W","40","10","0","0","0",""',
    '"2026-01-05 12:00:00","Upper","Bench Press (Barbell)","1","62,5","6","0","0","0",""',
    '"2026-01-05 12:00:00","Upper","Pull Up (Bodyweight)","1","0","7","0","0","0",""',
    '"2026-01-05 12:00:00","Upper","Cable Thing","1","20","12","0","0","0","said ""slow"", then fast"',
    '"2026-01-08 09:30:00","Legs ","Seated Leg Curl","1","52","14","0","0","0",""',
    '"2026-01-08 09:30:00","Legs ","Seated Leg Curl","D","30","12","0","0","0",""',
  ].join("\r\n");

  it("groups rows into sessions, maps names, reads decimal commas, warm-ups, drop sets and body weight", () => {
    const r = parseBoltCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.unknown).toEqual(["Cable Thing"]);
    expect(r.sessions.map((s) => [s.date, s.name, s.clientId])).toEqual([["2026-01-05", "Upper", "bolt:20260105120000"], ["2026-01-08", "Legs", "bolt:20260108093000"]]);
    const [a, b] = r.sessions;
    expect(a.entries.map((e) => e.exercise)).toEqual(["bench_press", "pull_up", "x:Cable Thing"]);
    expect(a.entries[0].sets).toEqual([{ kind: "warmup", kg: 40, reps: 10, seconds: null }, w(6, 62.5)]);
    expect(a.entries[1].sets).toEqual([w(7)]);
    expect(b.entries[0].sets.map((s) => s.kind)).toEqual(["work", "drop"]);
  });

  it("parses quoted fields with commas and doubled quotes, and refuses other files", () => {
    expect(parseCsv('a,"b, c","d ""e"""\n')).toEqual([["a", "b, c", 'd "e"']]);
    expect(parseBoltCsv("name,value\nx,1").errors[0]).toMatch(/not a Bolt export/);
  });
});
