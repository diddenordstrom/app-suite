import { describe, expect, it } from "vitest";
import { matchesSearch, moveItem, normalize, patchSet, type DraftSet } from "./gymlog";

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
