import { describe, expect, it } from "vitest";
import { addDays, weekday } from "./dates";
import { COACH } from "./coach";
import { tune } from "./tuning";
import { build, daysAdvice, daysFor, evaluate, formHeavy, longRun, NEXT, nextRung, rung, rungBefore, thresholdSteps, weekCap, type Shape, type WeekSeed } from "./nextweek";
import { suggestWeek } from "./blockplan";
import { placeSessions, parseWeekLine } from "./parser";
import { stepsText, type StepRefs } from "./steps";

const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const MONDAY = "2026-11-16";

/** A runner like the mock's: 34, 36, 38 km weeks, four run days (Tue, Thu, Sat, Sun), a 12 km longest run. */
function seed(over: Partial<WeekSeed> = {}): WeekSeed {
  return {
    weekStart: MONDAY, ctl: 40, atl: 44, kmBefore: [34, 36, 38], past: [],
    runDays: [2, 4, 6, 0], longRunDay: 0,
    threshold: { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 }, refs: REFS,
    crossMin: 0, targetKm: null, backoff: false, longestKm: 12, rung: 0, tempoPace: 275, ...over,
  };
}
const dayOf = (d: string) => weekday(d);

const shape = (over: Partial<Shape> = {}): Shape => ({ km: 40, longKm: 13, tempo: null, thr: [rung(0)], crossMin: 0, ...over });
const runKm = (items: { type: string; km: number }[]) => items.filter((i) => i.type !== "cross").reduce((s, i) => s + i.km, 0);
const repsOf = (steps: Parameters<typeof nextRung>[0]) => {
  const r = steps?.items.find((x) => x.kind === "repeat");
  return r?.kind === "repeat" ? `${r.times}x${r.work.min}` : "";
};

describe("suggestWeek", () => {
  it("puts the long run first on its ladder, then threshold, and keeps km under the cap", () => {
    const s = suggestWeek(seed());
    const long = s.items.find((i) => i.type === "long")!;
    expect(dayOf(long.date)).toBe(0);
    expect(long.km).toBe(13);
    expect(s.why.long).toMatchObject({ km: 13, why: "step", longestKm: 12 });
    expect(repsOf(s.items.find((i) => i.type === "threshold")!.steps)).toBe("3x8");
    expect(s.eval.km).toBeLessThanOrEqual(weekCap([34, 36, 38]) + 0.25);
    expect(s.eval.growth!).toBeLessThanOrEqual(COACH.weekGrowth - 1 + 0.005);
    expect(s.eval.acwr!).toBeLessThanOrEqual(COACH.rampCap);
    expect(s.eval.spike).toBeNull();
    // Every session sits on a run day, one per day.
    expect(new Set(s.items.map((i) => i.date)).size).toBe(s.items.length);
    for (const i of s.items.filter((x) => x.type !== "cross")) expect([2, 4, 6, 0]).toContain(dayOf(i.date));
  });

  it("takes the threshold session's next rung when the volume holds it, else stays lower", () => {
    const thr = (over: Partial<WeekSeed>) => repsOf(suggestWeek(seed(over)).items.find((i) => i.type === "threshold")!.steps);
    expect(thr({ kmBefore: [60, 62, 64], longestKm: 20, rung: 2, ctl: 70, atl: 70 })).toBe("3x12");
    // About 53 km: 15 % is 34 min at threshold, so 3 × 10.
    expect(thr({ kmBefore: [44, 46, 48], rung: 2 })).toBe("3x10");
    // About 42 km: never below the first rung.
    expect(thr({ rung: 3 })).toBe("3x8");
  });

  it("suggests another run day when three carry a big week", () => {
    expect(suggestWeek(seed({ runDays: [2, 5, 0] })).why.moreDays).toBe(true);
    expect(suggestWeek(seed()).why.moreDays).toBe(false);
  });

  it("gives a calm week a faster finish on the long run, and chases nothing more", () => {
    const rested = { ctl: 45, atl: 30 };
    const s = suggestWeek(seed(rested));
    expect(s.tries.map((t) => t.id)).toEqual(["volume", "tempo"]);
    expect(s.tries[0].state).toBe("under");
    expect(s.chosen).toBe("tempo");
    const long = s.items.find((i) => i.type === "long")!;
    expect(long.steps?.items.at(-1)).toMatchObject({ kind: "step", step: { target: { kind: "pace", secPerKm: 275 } } });
    expect(long.km).toBeCloseTo(13, 1);
    // Five run days don't bring a second threshold session or other sports in either.
    const five = suggestWeek(seed({ ...rested, runDays: [1, 2, 4, 6, 0] }));
    expect(five.items.filter((i) => i.type === "threshold")).toHaveLength(1);
    expect(five.items.some((i) => i.type === "cross")).toBe(false);
  });


  it("stops at the first variant inside the band", () => {
    const s = suggestWeek(seed({ ctl: 40, atl: 52 }));
    const ok = s.tries.findIndex((t) => t.state === "ok");
    if (ok >= 0) expect(s.tries[ok].id).toBe(s.chosen);
    expect(s.eval.state).not.toBe("over");
  });

  it("never collapses a tired runner's week, as the block doesn't, and keeps the long run's step", () => {
    // The week is the block engine with one week (BLOCK.fit): too hard at any size, it keeps the shallower of the aimed km
    // and a modest cut, never a week of key sessions only; the long run keeps its step.
    const fresh = suggestWeek(seed({ ctl: 40, atl: 40, rung: 2 }));
    const s = suggestWeek(seed({ ctl: 40, atl: 300, rung: 2 }));
    expect(s.eval.km).toBeGreaterThanOrEqual(fresh.targetKm * 0.75 - 0.5);
    expect(s.eval.km).toBeLessThanOrEqual(fresh.targetKm + 0.5);
    expect(s.items.find((i) => i.type === "long")!.km).toBe(13);
  });

  it("uses a target as given, and makes a lighter week of both key sessions", () => {
    expect(suggestWeek(seed({ targetKm: 30 })).eval.km).toBeCloseTo(30, 0);
    const b = suggestWeek(seed({ backoff: true, rung: 3 }));
    expect(b.chosen).toBe("backoff");
    expect(b.eval.km).toBeCloseTo(38 * tune().lighter.long, 0);
    expect(b.items.find((i) => i.type === "long")!.km).toBe(8.5);
    expect(repsOf(b.items.find((i) => i.type === "threshold")!.steps)).toBe("3x6");
  });

  it("starts small without any history", () => {
    const s = suggestWeek(seed({ kmBefore: [0, 0, 0], ctl: 0, atl: 0, longestKm: 0 }));
    expect(s.chosen).toBe("start");
    expect(s.eval.km).toBeCloseTo(NEXT.startKm, 0);
    expect(s.why.long).toBeNull();
  });
});

describe("the long run's ladder", () => {
  it("is the longest run of 30 days + 1 km, never more than 10 % over it, rounded to the half km", () => {
    expect(longRun(10, false, 330)).toMatchObject({ km: 11, why: "step" });
    expect(longRun(10.4, false, 330)).toMatchObject({ km: 11.5, why: "step" });
    expect(longRun(6, false, 330)).toMatchObject({ km: 6.5, why: "spike" });
    expect(longRun(0, false, 330)).toBeNull();
  });

  it("is 70 % in a lighter week, and stops at 32 km or 3 hours", () => {
    expect(longRun(10, true, 330)).toMatchObject({ km: 7, why: "lighter" });
    expect(longRun(31.5, false, 330)).toMatchObject({ km: 32, why: "ceiling" });
    // 3 hours at 6:40/km is 27 km.
    expect(longRun(30, false, 400)).toMatchObject({ km: 27, why: "ceiling" });
  });
});

describe("the threshold ladder", () => {
  it("warms up and cools down for 10 minutes, not a distance", () => {
    expect(stepsText(thresholdSteps(3, 8), "en", "metric")).toBe("10 min easy, 3x8 min @threshold / 2 min jog, 10 min easy");
  });
  it("takes the next rung after a session on it, and starts over with one rep more after 2 × 20", () => {
    expect(nextRung(thresholdSteps(3, 8))).toBe(1);
    expect(rung(nextRung(thresholdSteps(2, 20, 3)))).toMatchObject({ reps: 4, min: 8 });
    expect(nextRung(thresholdSteps(4, 10))).toBe(NEXT.ladder.length - 1);
    expect(NEXT.ladder.every((r) => r.min <= 20 && r.reps * r.min <= 40)).toBe(true);
  });

  it("goes by minutes at threshold for a session off the ladder, and starts at the bottom without one", () => {
    expect(rung(nextRung(thresholdSteps(5, 5)))).toMatchObject({ reps: 3, min: 10 });
    expect(nextRung(null)).toBe(0);
    // 3 × 2 km at 4:15/km is 25.5 min at threshold: next is 3 × 10.
    const km = { v: 1 as const, items: [{ kind: "repeat" as const, times: 3, work: { km: 2, target: { kind: "threshold" as const } }, rest: null }] };
    expect(rung(nextRung(km, 255))).toMatchObject({ reps: 3, min: 10 });
  });
});

describe("rungBefore", () => {
  const thr = (date: string, reps: number, min: number, outcome: "done" | "missed" | "skipped" | "upcoming" | "to_do") => ({
    workout: { id: 1, date, type: "threshold" as const, distanceKm: null, durationMin: null, zone2: false, notes: null, status: "planned" as const,
      skipReason: null, manualActivityId: null, manualUnlinked: false, steps: thresholdSteps(reps, min) },
    outcome, match: null, activity: null,
  });
  it("steps on from the last session run or still to run, and repeats after a missed one", () => {
    expect(rungBefore("2026-11-23", [thr("2026-11-03", 3, 8, "done"), thr("2026-11-10", 3, 10, "done")], 255)).toBe(2);
    expect(rungBefore("2026-11-23", [thr("2026-11-03", 3, 8, "done"), thr("2026-11-10", 3, 10, "missed")], 255)).toBe(1);
    expect(rungBefore("2026-11-23", [thr("2026-11-03", 3, 8, "done"), thr("2026-11-17", 3, 10, "upcoming")], 255)).toBe(2);
    expect(rungBefore("2026-11-23", [], 255)).toBe(0);
  });
});

describe("formHeavy", () => {
  it("is form under −25 % of fitness (fitness under 40 counts as 40): tired, whatever the km rhythm says", () => {
    expect(formHeavy(50, 62)).toBe(false); // −24 %
    expect(formHeavy(50, 63)).toBe(true); // −26 %
    expect(formHeavy(20, 30)).toBe(false); // −10 on 40: −25 %, not under
    expect(formHeavy(4, 17.3)).toBe(true); // −13.3 on 40
    expect(formHeavy(0, 20)).toBe(false); // no fitness yet: nothing to read
  });
});

describe("build", () => {
  it("falls back to the last run day when the long-run day isn't one", () => {
    const items = build(seed({ longRunDay: 3 }), shape());
    expect(dayOf(items.find((i) => i.type === "long")!.date)).toBe(0);
  });

  it("adds up to the week exactly", () => {
    // The week-47 review: 28.5 km on Tue, Wed, Fri and Sun came out at 28.1.
    const items = build(seed({ runDays: [2, 3, 5, 0] }), shape({ km: 28.5, longKm: 10 }));
    expect(Math.abs(runKm(items) - 28.5)).toBeLessThan(0.15);
    const two = build(seed(), shape({ km: 41.5, thr: [rung(0), NEXT.second] }));
    expect(Math.abs(runKm(two) - 41.5)).toBeLessThan(0.15);
  });

  it("drops a zone 2 run when there are too few km for them, and never shortens the long run", () => {
    const items = build(seed(), shape({ km: 26, longKm: 13 }));
    expect(items.find((i) => i.type === "long")!.km).toBe(13);
    expect(items.filter((i) => i.type === "easy")).toHaveLength(1);
  });

  it("never makes a zone 2 run longer than the long run", () => {
    const items = build(seed({ runDays: [2, 0] }), shape({ km: 40, longKm: 13 }));
    for (const i of items.filter((x) => x.type === "easy")) expect(i.km).toBeLessThanOrEqual(12);
  });

  it("puts other sports on a free day", () => {
    const items = build(seed(), shape({ crossMin: 45 }));
    const cross = items.find((i) => i.type === "cross")!;
    expect(cross.durationMin).toBe(45);
    expect([2, 4, 6, 0]).not.toContain(dayOf(cross.date));
  });
});

describe("evaluate", () => {
  it("counts a long run at the end of the week and flags hard days in a row", () => {
    const s = seed();
    const base = build(s, shape());
    const huge = base.map((i) => (i.type === "long" ? { ...i, km: 100 } : i));
    expect(evaluate(s, huge).form).toBeLessThan(evaluate(s, base).form - 5);
    expect(evaluate(s, huge).state).toBe("over");
    const sat = addDays(MONDAY, 5);
    const moved = base.map((i) => (i.type === "threshold" ? { ...i, date: sat } : i.date === sat ? { ...i, date: addDays(MONDAY, 1) } : i));
    expect(evaluate(s, moved).adjacent).toBe(true);
  });

  it("flags a session more than 10 % over the longest run of 30 days, with the engine's rounding", () => {
    const s = seed({ longestKm: 10.4 });
    const at = (km: number) => evaluate(s, build(s, shape({ longKm: km }))).spike;
    expect(at(11.5)).toBeNull();
    expect(at(12.5)).toMatchObject({ km: 12.5 });
    expect(evaluate(s, []).spikeMax).toBe(11.5);
  });
});

describe("placeSessions", () => {
  it("puts the long run on the long-run day when it is a run day", () => {
    const days = placeSessions(MONDAY, parseWeekLine("6 easy, 15 long").sessions, [2, 4, 6], [], 4);
    expect(dayOf(days[1])).toBe(4);
    expect(dayOf(placeSessions(MONDAY, parseWeekLine("15 long").sessions, [2, 4, 6], [], 0)[0])).toBe(6);
  });
});

describe("easy runs follow the week's size, and the days it needs", () => {
  const all = [0, 1, 2, 3, 4, 5, 6];
  const week = (km: number, runDays = all) => {
    const s = seed({ runDays, kmBefore: [km, km, km], longestKm: Math.round(km * 0.3), ctl: km, atl: km });
    return suggestWeek({ ...s, targetKm: km });
  };
  const easy = (items: { type: string; km: number }[]) => items.filter((i) => i.type === "easy");

  it("uses fewer, longer easy runs as the week grows, not every open day", () => {
    const small = week(20), mid = week(40), big = week(60);
    expect(small.items.filter((i) => i.type !== "cross")).toHaveLength(3);
    expect(easy(mid.items).length).toBeLessThan(5);
    expect(mid.items.filter((i) => i.type !== "cross").length).toBeLessThanOrEqual(6);
    expect(Math.min(...easy(mid.items).map((i) => i.km))).toBeGreaterThanOrEqual(4.5);
    expect(easy(big.items).length).toBe(4);
    expect(Math.min(...easy(big.items).map((i) => i.km))).toBeGreaterThanOrEqual(7);
    expect(Math.abs(runKm(big.items) - 60)).toBeLessThan(0.2);
  });

  it("splits what the long run and threshold leave into as few easy runs as keep each under half the long run", () => {
    const days = { runDays: [1, 2, 3, 4, 5, 6, 0] };
    for (const km of [34, 38, 46, 60]) {
      const items = build(seed(days), shape({ km, longKm: 15 }));
      const long = items.find((i) => i.type === "long")!.km;
      const easy = items.filter((i) => i.type === "easy");
      const rest = km - long - items.filter((i) => i.type === "threshold").reduce((a, i) => a + i.km, 0);
      expect(easy.length, `${km} km`).toBe(Math.ceil(rest / (tune().easy.ofLong * long) - 1e-9));
      for (const e of easy) expect(e.km, `${km} km`).toBeLessThanOrEqual(tune().easy.ofLong * long + 0.3);
    }
  });

  it("gives a long run of 15 and 14 km left two easy runs of 7", () => {
    // Long 15, threshold 3 × 8 at 255 s/km, a 38 km week: what is left is split over two runs, not squeezed into one.
    const items = build(seed({ runDays: [2, 3, 4, 5, 0] }), shape({ km: 38, longKm: 15 }));
    expect(items.filter((i) => i.type === "easy")).toHaveLength(2);
  });

  it("steps the long run by 8 % of the longest, at least 1 km, never past the spike rule", () => {
    expect(longRun(10, false, 330)!.km).toBe(11);
    expect(longRun(20, false, 330)!.km).toBe(21.5);
    expect(longRun(25, false, 330)!.km).toBe(27);
    expect(longRun(24, true, 330)!.km).toBe(17);
  });

  it("spreads a big week over the days its volume calls for, so a long long run doesn't make long easy runs", () => {
    // 46 km with an 18.5 km long run: easy runs may be 9.25 km, so two would do, but 46 km calls for five days.
    const sh = shape({ km: 46, longKm: 18.5 });
    const easy = (runDays: number[]) => build(seed({ runDays }), sh).filter((i) => i.type === "easy");
    expect(easy([2, 3, 4, 5, 0])).toHaveLength(3);
    expect(Math.max(...easy([2, 3, 4, 5, 0]).map((i) => i.km))).toBeLessThan(7);
    // With four days, a fifth changes the plan, so it is offered.
    const weekOf = (runDays: number[]) => [{ weekStart: MONDAY, targetKm: 46, items: build(seed({ runDays }), sh) }];
    expect(daysAdvice([2, 3, 5, 0], 0, weekOf([2, 3, 5, 0]), weekOf)?.free.length).toBeGreaterThan(0);
  });

  it("calls for more run days as the volume grows", () => {
    expect([10, 24, 25, 39, 40, 54, 55, 69, 70, 120].map(daysFor)).toEqual([3, 3, 4, 4, 5, 5, 6, 6, 7, 7]);
  });

  it("asks for another day when the biggest week calls for it, the free day furthest from the hard sessions first", () => {
    const s = suggestWeek(seed({ runDays: [1, 3, 0], longRunDay: 0, kmBefore: [40, 40, 40], longestKm: 12, ctl: 40, atl: 40 }));
    const a = daysAdvice([1, 3, 0], 0, [{ weekStart: MONDAY, targetKm: s.targetKm, items: s.items }])!;
    expect(a.why).toContain("peak");
    expect(a.have).toBe(3);
    expect(a.need).toBeGreaterThan(3);
    // The threshold goes on Wednesday, not on the Monday after the long run. Wednesday and Sunday are hard:
    // Friday is two days from both, Tuesday, Thursday and Saturday one.
    expect(s.items.find((i) => i.type === "threshold")!.date).toBe(addDays(MONDAY, 2));
    expect(a.free).toEqual([5, 2, 4, 6]);
  });

  it("asks when a week can't be spread over the days it has, even in a small week", () => {
    // 3 run days, 28 km: the long run (ladder 13) and threshold leave one easy run that may not pass long − 1.
    const s = suggestWeek({ ...seed({ runDays: [1, 3, 0], kmBefore: [24, 24, 24], longestKm: 7, ctl: 24, atl: 24 }), targetKm: 36 });
    const a = daysAdvice([1, 3, 0], 0, [{ weekStart: MONDAY, targetKm: s.targetKm, items: s.items }])!;
    expect(a.shortKm).toBeGreaterThan(tune().shortKm);
    expect(a.why).toContain("fit");
    expect(a.need).toBeGreaterThanOrEqual(4);
  });

  it("stays quiet when the days are enough, or all seven are open", () => {
    const s = week(40, [1, 2, 3, 4, 6, 0]);
    expect(daysAdvice([1, 2, 3, 4, 6, 0], 0, [{ weekStart: MONDAY, targetKm: s.targetKm, items: s.items }])).toBeNull();
    expect(daysAdvice(all, 0, [{ weekStart: MONDAY, targetKm: 90, items: [] }])).toBeNull();
  });

  it("leaves a lighter week out of the peak", () => {
    const items = suggestWeek(seed({ kmBefore: [30, 30, 30], runDays: [1, 3, 5, 0], longestKm: 10 })).items;
    const a = daysAdvice([1, 3, 5, 0], 0, [{ weekStart: MONDAY, targetKm: 30, items }, { weekStart: addDays(MONDAY, 7), targetKm: 80, lighter: true, items: [] }]);
    expect(a?.peakKm ?? 30).toBe(30);
  });
});

describe("daysAdvice with a trial plan", () => {
  const week = (km: number, days: number) => ({ weekStart: MONDAY, targetKm: 40, items: Array.from({ length: days }, (_, i) => ({ date: addDays(MONDAY, i), type: "easy" as const, km: km / days, durationMin: null, steps: null })) });

  it("asks only about days that would change the plan, and lists just those", () => {
    // The week falls 6 km short on four days; Saturday (6) would take the rest, Monday (1) and Thursday (4) change nothing.
    const base = [week(34, 4)];
    const trial = (days: number[]) => (days.includes(6) ? [week(40, 5)] : [week(34, 4)]);
    const a = daysAdvice([2, 3, 5, 0], 0, base, trial)!;
    expect(a.free).toEqual([6]);
    expect(a.why).toContain("fit");
  });

  it("does not ask when no free day would change the plan (the shortfall is not about days)", () => {
    const base = [week(34, 4)];
    expect(daysAdvice([2, 3, 5, 0], 0, base, () => base)).toBeNull();
  });
});
