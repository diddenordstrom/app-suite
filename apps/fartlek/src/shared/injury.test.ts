import { describe, expect, it } from "vitest";
import { injuryStop } from "./recovery";
import type { PainEntry } from "./types";

const TODAY = "2026-11-25";
let id = 0;
const pain = (date: string, level: number, area = "knee"): PainEntry => ({ id: ++id, date, activityId: null, area, level, note: null });

describe("injuryStop", () => {
  it("fires on pain of level 8 or more in the last 7 days, not on 7", () => {
    expect(injuryStop([pain("2026-11-25", 8)], TODAY)).toMatchObject({ reason: "severe", level: 8 });
    expect(injuryStop([pain("2026-11-19", 9)], TODAY)).toMatchObject({ reason: "severe", level: 9 }); // 6 days ago: inside
    expect(injuryStop([pain("2026-11-24", 7)], TODAY)).toBeNull();
    expect(injuryStop([pain("2026-11-18", 9)], TODAY)).toBeNull(); // 7 days ago: outside
  });

  it("fires on level 5 or more on 3 different days within 7, not on 2 days or level 4", () => {
    expect(injuryStop([pain("2026-11-21", 5), pain("2026-11-23", 6), pain("2026-11-25", 5)], TODAY)).toMatchObject({ reason: "repeated", level: 6 });
    expect(injuryStop([pain("2026-11-23", 6), pain("2026-11-25", 5)], TODAY)).toBeNull();
    expect(injuryStop([pain("2026-11-21", 4), pain("2026-11-23", 4), pain("2026-11-25", 4)], TODAY)).toBeNull();
  });

  it("counts a day once however many areas hurt, and leaves out days older than the week", () => {
    expect(injuryStop([pain("2026-11-24", 5, "knee"), pain("2026-11-24", 6, "calf"), pain("2026-11-25", 5)], TODAY)).toBeNull();
    expect(injuryStop([pain("2026-11-18", 5), pain("2026-11-23", 5), pain("2026-11-25", 5)], TODAY)).toBeNull();
  });

  it("says nothing without pain, and ignores pain in the future", () => {
    expect(injuryStop([], TODAY)).toBeNull();
    expect(injuryStop([pain("2026-11-26", 9)], TODAY)).toBeNull();
  });
});
