import { describe, expect, it } from "vitest";
import { layoutOf, matchesSearch, moveItem, normalize, patchSet, type Draft, type DraftSet } from "./gymlog";
import { startEntries, templateEntries } from "@/shared/gymplan";

describe("exercise search", () => {
  it("finds an exercise by its name in either language and by export names, ignoring spaces and hyphens", () => {
    expect(normalize("Pull-ups ")).toBe("pullups");
    for (const q of ["Pull up", "pullup", "chins", "Chin Up"]) expect(matchesSearch("pull_up", q), q).toBe(true);
    expect(matchesSearch("bench_press", "bänk")).toBe(true);
    expect(matchesSearch("bench_press", "bench")).toBe(true);
    expect(matchesSearch("bench_press", "row")).toBe(false);
  });
  it("matches own exercises by their name", () => {
    expect(matchesSearch("x:Zercher Squat", "zercher")).toBe(true);
  });
});

describe("reordering", () => {
  it("moves an item up or down and leaves bad indexes alone", () => {
    const xs = ["a", "b", "c", "d"];
    expect(moveItem(xs, 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveItem(xs, 3, 1)).toEqual(["a", "d", "b", "c"]);
    expect(moveItem(xs, 1, 9)).toBe(xs);
  });
});

describe("a new weight on a set", () => {
  const set = (kg: number | null, done = false): DraftSet => ({ kind: "work", kg, reps: 10, seconds: null, done });
  it("goes to the open sets below that still had the old weight", () => {
    const out = patchSet([set(12.5, true), set(12.5), set(12.5), set(15)], 1, { kg: 10 });
    expect(out.map((s) => s.kg)).toEqual([12.5, 10, 10, 15]);
  });
  it("leaves done sets and sets above alone, and reps never spread", () => {
    expect(patchSet([set(12.5), set(12.5, true), set(12.5)], 0, { kg: 10 }).map((s) => s.kg)).toEqual([10, 12.5, 10]);
    expect(patchSet([set(12.5), set(12.5)], 0, { reps: 8 }).map((s) => s.reps)).toEqual([8, 10]);
  });
});

describe("the runner's own version of a template", () => {
  const set = (done: boolean, kind: DraftSet["kind"] = "work"): DraftSet => ({ kind, kg: 20, reps: 10, seconds: null, done });
  const draft = (template: Draft["template"]): Draft => ({
    clientId: "c1", date: "2026-12-01", template, feel: null, workoutId: null, startedAt: 1, lastSetAt: null, entries: [
      { exercise: "single_leg_rdl", slot: "hinge", scheme: { sets: 3, low: 8, high: 10 }, sets: [set(true), set(true), set(true), set(false)] },
      { exercise: "seated_calf_raise", slot: "calf", scheme: { sets: 3, low: 12, high: 15 }, sets: [set(false), set(false), set(false)] },
      { exercise: "hip_abduction", slot: "hip_abd", scheme: { sets: 3, low: 12, high: 15 }, sets: [set(true, "warmup")] },
    ],
  });
  it("keeps skipped exercises and the sets planned, and leaves out one with every work set removed", () => {
    expect(layoutOf(draft("A"))).toEqual([
      { exercise: "single_leg_rdl", slot: "hinge", scheme: { sets: 4, low: 8, high: 10 } },
      { exercise: "seated_calf_raise", slot: "calf", scheme: { sets: 3, low: 12, high: 15 } },
    ]);
  });
  it("is not kept for a free session", () => {
    expect(layoutOf(draft(null))).toBeNull();
  });
  it("starts the next session from it, unless reset to the suggestion", () => {
    const own = { date: "2026-12-01" as const, entries: layoutOf(draft("A")) ?? [] };
    expect(startEntries("A", { A: own })).toEqual({ own, entries: own.entries });
    expect(startEntries("A", { A: own }, true)).toEqual({ own: null, entries: templateEntries("A") });
    expect(startEntries("B", { A: own }).entries).toEqual(templateEntries("B"));
  });
});
