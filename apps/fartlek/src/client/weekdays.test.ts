import { describe, expect, it } from "vitest";
import { roleOf, weekOrder, withRole, type WeekDays } from "./weekdays";

const order = weekOrder("monday");
// Runs Tue, Thu, Sat and a Sunday long run.
const week: WeekDays = { runDays: [0, 2, 4, 6], longRunDay: 0, gymDays: [], crossDays: [] };

describe("withRole", () => {
  it("makes a run day a gym or cross-training day, never both a run and gym", () => {
    const v = withRole(withRole(week, 1, "gym", order)!, 4, "cross", order)!;
    expect(v).toEqual({ runDays: [0, 2, 6], longRunDay: 0, gymDays: [1], crossDays: [{ day: 4, min: 45 }] });
    expect(roleOf(v, 4)).toBe("cross");
    expect(roleOf(v, 3)).toBe("rest");
  });

  it("keeps one long-run day: picking another makes the old one a run day", () => {
    const v = withRole(week, 6, "long", order)!;
    expect(v.longRunDay).toBe(6);
    expect(v.runDays).toEqual([0, 2, 4, 6]);
    expect(roleOf(v, 0)).toBe("run");
  });

  it("moves the long run to the last run day when its day gets another role, and refuses without a run day", () => {
    const v = withRole(week, 0, "gym", order)!;
    expect(v).toMatchObject({ longRunDay: 6, gymDays: [0], runDays: [2, 4, 6] });
    expect(withRole({ runDays: [0], longRunDay: 0, gymDays: [], crossDays: [] }, 0, "rest", order)).toBeNull();
  });

  it("keeps the minutes of a cross-training day when another day changes", () => {
    const v = withRole({ ...week, runDays: [0, 2], crossDays: [{ day: 4, min: 90 }] }, 2, "gym", order)!;
    expect(v.crossDays).toEqual([{ day: 4, min: 90 }]);
  });
});
