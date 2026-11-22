import { describe, expect, it } from "vitest";
import { addDays, range } from "./dates";
import { COACH, project, suggest, type CoachInput, type CoachWeekIn } from "./coach";
import { plannedLoad, stepsLoad } from "./load";
import { parseWeekLine, splitSessions } from "./parser";
import { parseSteps, type StepRefs } from "./steps";
import type { PlanItem } from "./blocktext";
import type { Threshold, WorkoutType } from "./types";

const THR: Threshold = { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 };
const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const ctx = { units: "metric" as const, lang: "sv" as const, refsFor: () => REFS };
const TODAY = "2026-11-11"; // a Wednesday; the block starts next Monday
const START = "2026-11-16";

const steps = (text: string) => parseSteps(text, "metric", "sv").steps!;
const item = (date: string, type: WorkoutType, km: number, s: string | null = null): PlanItem =>
  ({ date, type, km, durationMin: null, zone2: false, steps: s ? steps(s) : null, open: true });

/** A week like the mock's: threshold Tuesday, easy Thursday, long Saturday, easy Sunday. */
function week(weekStart: string, long: number, easy = 8, opts: Partial<CoachWeekIn> = {}): CoachWeekIn {
  const plan = [
    item(addDays(weekStart, 1), "threshold", 9.7, "2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt"),
    item(addDays(weekStart, 3), "easy", easy),
    item(addDays(weekStart, 5), "long", long),
    item(addDays(weekStart, 6), "easy", easy),
  ];
  return { weekStart, backoff: false, locked: false, km: plan.reduce((a, p) => a + p.km, 0), plan, ...opts };
}

/** Ten months of the same 44 km week, so fitness has settled. */
function history(): Map<string, number> {
  const m = new Map<string, number>();
  const w = week("2026-01-05", 18);
  const loads = [0, plannedLoad({ type: "threshold", status: "planned", distanceKm: null, durationMin: null, steps: w.plan[0].steps }, THR), 0, 41, 0, 96, 41];
  for (const d of range("2026-01-05", TODAY)) {
    const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
    if (loads[dow]) m.set(d, loads[dow]);
  }
  return m;
}

const input = (weeks: CoachWeekIn[], extra: Partial<CoachInput> = {}): CoachInput => ({
  today: TODAY, history: history(), outside: new Map(), weeks, kmBefore: [43.7, 43.7, 43.7], crossMin: 0, crossOutsideMin: 0, race: null, threshold: THR, ...extra,
});

const lineOf = (w: CoachWeekIn) => w.plan.map((p) => (p.steps ? `${p.km} tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt)` : `${p.km} ${p.type === "long" ? "långpass" : "lugnt"}`)).join(", ") + (w.backoff ? " avlastning" : "");

describe("block text: inline steps and Swedish words", () => {
  it("splits on commas outside parentheses and decimal commas", () => {
    expect(splitSessions("6,5 lugnt, 9.8 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg), 15 långpass zon 2")).toEqual([
      "6,5 lugnt", "9.8 tröskel (2 km lugnt, 3x8 min @tröskel / 2 min jogg)", "15 långpass zon 2",
    ]);
  });
  it("reads steps, Swedish types and avlastning", () => {
    const w = parseWeekLine("tröskel (3x8 min @tröskel / 2 min jogg), 8 lugnt, 12 långpass zon 2, 45min annat avlastning");
    expect(w.errors).toEqual([]);
    expect(w.backoff).toBe(true);
    expect(w.sessions).toMatchObject([
      { type: "threshold", distance: null, stepsText: "3x8 min @tröskel / 2 min jogg" },
      { type: "easy", distance: 8 }, { type: "long", distance: 12, zone2: true }, { type: "cross", durationMin: 45 },
    ]);
    expect(parseWeekLine("9.8 threshold*").sessions[0]).toMatchObject({ type: "threshold", star: true });
  });
});

describe("planned load", () => {
  it("loads a structured session step by step", () => {
    const s = steps("2 km lugnt, 3x8 min @tröskel / 2 min jogg, 1.5 km lugnt");
    const flat = plannedLoad({ type: "threshold", status: "planned", distanceKm: 9.8, durationMin: null, steps: null }, THR);
    const perStep = stepsLoad(s, THR);
    expect(perStep).toBeGreaterThan(40);
    expect(Math.abs(perStep - flat)).toBeLessThan(15);
    expect(stepsLoad(steps("2 km lugnt, 3x10 min @tröskel / 2 min jogg, 1.5 km lugnt"), THR)).toBeGreaterThan(perStep);
  });
});

describe("coach projection", () => {
  it("calls a block lighter than the weeks before it calm, judged on the deepest build week as a share of fitness", () => {
    const weeks = [week(START, 14, 6), week(addDays(START, 7), 14, 6), week(addDays(START, 14), 15, 6), week(addDays(START, 21), 10, 5, { backoff: true })];
    const r = project(input(weeks));
    expect(r.mode).toBe("base");
    expect(r.state).toBe("under");
    expect(r.value!).toBeGreaterThan(COACH.goal);
    expect(r.weeks.map((w) => w.judged)).toEqual([true, true, true, false]);
    expect(r.weeks[0].acwr).toBeLessThan(1);
    expect(r.series.at(-1)!.projected).toBe(true);
  });

  it("flags a big jump in km as too hard", () => {
    const weeks = [week(START, 22), week(addDays(START, 7), 32, 16)];
    const r = project(input(weeks));
    expect(r.state).toBe("over");
    expect(r.risk).toMatchObject({ weekStart: addDays(START, 7) });
    expect(r.risk!.acwr).toBeGreaterThan(COACH.rampRisk);
  });

  it("counts other sports in form but not in the km ramp", () => {
    const weeks = [week(START, 20), week(addDays(START, 7), 20)];
    const without = project(input(weeks));
    const withCross = project(input(weeks, { crossMin: 120 }));
    expect(withCross.value!).toBeLessThan(without.value!);
    expect(withCross.weeks.map((w) => w.acwr)).toEqual(without.weeks.map((w) => w.acwr));
  });

  it("judges race-day form in race mode", () => {
    const weeks = [week(START, 20), week(addDays(START, 7), 20)];
    const r = project(input(weeks, { race: { date: addDays(START, 12), name: "10 km" } }));
    expect(r.mode).toBe("race");
    expect(r.at).toBe(addDays(START, 12));
    // +4.8 on a fitness of 30 is +16 %: rested, inside +5 % … +20 %.
    expect(r.value!).toBeGreaterThan(COACH.race.low);
    expect(r.state).toBe("ok");
  });

  it("keeps a steady block like the weeks before it in the build band, though its absolute form is only −6", () => {
    const r = project(input([week(START, 20), week(addDays(START, 7), 20), week(addDays(START, 14), 21), week(addDays(START, 21), 14, 6, { backoff: true })]));
    expect(r.state).toBe("ok");
    expect(r.value!).toBeLessThan(COACH.goal);
  });
});

describe("coach suggestions", () => {
  const weeks = [week(START, 14, 6), week(addDays(START, 7), 14, 6), week(addDays(START, 14), 15, 6), week(addDays(START, 21), 10, 5, { backoff: true })];
  const lines = weeks.map(lineOf);

  it("offers volume, longer reps, another sport and a quality session, in that order, leaving the backoff week alone", () => {
    const r = project(input(weeks));
    const tips = suggest(r, lines, [43.7, 43.7, 43.7], ctx);
    expect(tips.map((t) => t.id)).toEqual(["volume", "reps", "cross", "quality"]);
    for (const t of tips) expect(t.text.split("\n")[3]).toBe(lines[3]);
    const volume = tips[0].text.split("\n");
    expect(parseWeekLine(volume[1]).sessions.find((s) => s.type === "long")!.distance).toBeGreaterThan(20);
    for (const l of volume) expect(parseWeekLine(l).errors).toEqual([]);
    expect(tips[1].text).toContain("3x10 min @tröskel");
    expect(tips[1].params).toEqual({ from: 8, to: 10 });
    expect(tips[2].text.split("\n")[0]).toMatch(/, 45min annat$/);
    const quality = parseWeekLine(tips[3].text.split("\n")[2]);
    expect(quality.sessions.filter((s) => s.type === "threshold")).toHaveLength(2);
    // The new threshold session warms up and cools down for 10 minutes, not a distance.
    expect(tips[3].text.split("\n")[2]).toContain("(10 min lugnt, 2x10 min @tröskel / 2 min jogg, 10 min lugnt)");
  });

  it("keeps a volume tip inside +10 % and the ramp cap", () => {
    const r = project(input(weeks));
    const volume = suggest(r, lines, [43.7, 43.7, 43.7], ctx)[0];
    const km = volume.text.split("\n").map((l) => parseWeekLine(l).sessions.reduce((a, s) => a + (s.distance ?? 0), 0));
    expect(km[1] / km[0]).toBeLessThanOrEqual(COACH.weekGrowth + 0.02);
  });

  it("shortens or drops sessions when too hard, and tapers before a race", () => {
    const hard = [week(START, 22), week(addDays(START, 7), 32, 16)];
    const r = project(input(hard));
    const tips = suggest(r, hard.map(lineOf), [43.7, 43.7, 43.7], ctx);
    expect(tips.map((t) => t.id)).toEqual(["long", "drop", "swap"]);
    expect(tips[2].text.split("\n")[1]).toMatch(/\d+min annat$/);

    // Two heavy weeks right up to the race: tired on race day.
    const heavy = [week(START, 26, 12), week(addDays(START, 7), 26, 12)];
    const race = project(input(heavy, { race: { date: addDays(START, 9), name: "10 km" } }));
    expect(race.state).toBe("tired");
    const raceTips = suggest(race, heavy.map(lineOf), [43.7, 43.7, 43.7], ctx);
    expect(raceTips.map((t) => t.id)).toEqual(["raceCut", "raceReps", "raceEasy"]);
    expect(raceTips[1].text).toContain("3x4 min @tröskel");
  });
});
