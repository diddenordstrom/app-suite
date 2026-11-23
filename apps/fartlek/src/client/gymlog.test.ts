import { describe, expect, it } from "vitest";
import { matchesSearch, moveItem, normalize } from "./gymlog";

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
