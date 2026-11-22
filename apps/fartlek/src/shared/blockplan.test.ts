import { describe, expect, it } from "vitest";
import { addDays, weekday } from "./dates";
import { COACH } from "./coach";
import { BLOCK, blockWeekCap, evaluateBlock, floorFor, raceChunks, raceRoles, suggestBlock, suggestWeek, tolerance, weekKm, type BlockSeed } from "./blockplan";
import { COACH as COACH_RACE } from "./coach";
import { weekCap } from "./nextweek";
import { longShareAt, tune } from "./tuning";
import type { StepRefs } from "./steps";

const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const MONDAY = "2026-11-16";

/** The runner from the week-47 review: 10.8, 20.2, 22.8 km, a 31 km week six weeks back, runs Tue, Fri and Sun. */
function seed(over: Partial<BlockSeed> = {}): BlockSeed {
  return {
    startWeek: MONDAY, weeks: 4, ctl: 30, atl: 36, kmBefore: [10.8, 20.2, 22.8], past: [],
    tolerance: { km: 31, peakKm: 31, peakWeek: "2026-10-05", weeksAgo: 6 },
    runDays: [2, 5, 0], longRunDay: 0,
    threshold: { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 }, refs: REFS,
    crossMin: 0, lighterLast: true, goalKm: null, buildWeeksDone: 0, hardBefore: false,
    longestKm: 9, rung: 0, tempoPace: 275, ...over,
  };
}
const weeks = (n: number, km: number[]) => km.slice(0, n).map((k, i) => ({ weekStart: addDays("2026-01-05", i * 7), km: k }));

describe("tolerance", () => {
  it("counts a recent peak in full and fades an old one", () => {
    // 40 km eleven weeks back: faded by 2 % for each of the 5 weeks past the six that count in full.
    const t = tolerance(weeks(11, [40, 20, 20, 20, 20, 20, 25, 25, 25, 25, 25]));
    expect(t.peakKm).toBe(40);
    expect(t.weeksAgo).toBe(11);
    expect(t.km).toBeCloseTo(40 * (1 - 0.02 * 5), 1);
    // A recent 38 beats the faded 40.
    expect(tolerance(weeks(11, [40, 20, 20, 20, 20, 20, 38, 25, 25, 25, 25])).peakKm).toBe(38);
  });

  it("never fades below the floor and has nothing without history", () => {
    const old = tolerance([{ weekStart: "2026-01-05", km: 50 }, ...weeks(25, Array(25).fill(0))]);
    expect(old.km).toBeCloseTo(50 * BLOCK.tolerance.floor, 1);
    expect(tolerance([]).km).toBe(0);
  });
});

describe("blockWeekCap", () => {
  it("lets a week return to a tolerated load faster than +10 %", () => {
    // "32 one week and 44 the next is fine if you have shown you tolerate it."
    const { cap, reentry } = blockWeekCap([40, 42, 32], 45);
    expect(reentry).toBe(true);
    expect(cap).toBeGreaterThanOrEqual(44);
    expect(cap).toBeLessThanOrEqual(45);
  });

  it("never asks a week to drop below the one before, and re-enters after a break", () => {
    // Three weeks off after a race, then 15 km: the ramp would allow 7 km.
    expect(blockWeekCap([0, 0, 15], 0).cap).toBeGreaterThanOrEqual(15);
    const re = blockWeekCap([0, 0, 15], 61);
    expect(re.reentry).toBe(true);
    expect(re.cap).toBeCloseTo(15 * BLOCK.reentryGrowth, 1);
  });

  it("keeps the careful cap above the peak, or without one", () => {
    expect(blockWeekCap([34, 36, 38], 30)).toEqual({ cap: weekCap([34, 36, 38]), reentry: false });
    expect(blockWeekCap([34, 36, 38], 0).reentry).toBe(false);
  });
});

describe("suggestBlock", () => {
  it("builds up week by week inside the caps and ends lighter", () => {
    const s = suggestBlock(seed());
    expect(s.weeks).toHaveLength(4);
    const km = s.weeks.map((w) => weekKm(w.items));
    expect(km[1]).toBeGreaterThan(km[0]);
    expect(km[2]).toBeGreaterThanOrEqual(km[1]);
    expect(s.weeks[3].lighter).toBe(true);
    // The lighter week is 70 % of the planned week before it (with three run days the easy run can't take all of that week's km).
    expect(km[3]).toBeLessThanOrEqual(s.weeks[2].cap * tune().lighter.volume + 0.5);
    for (const w of s.weeks) expect(weekKm(w.items)).toBeLessThanOrEqual(w.cap + 0.5);
    // Every build week keeps the ramp under the risk line and has a long run on Sunday and a threshold session.
    for (const w of s.eval.weeks.filter((x) => !x.lighter)) expect(w.acwr!).toBeLessThanOrEqual(COACH.rampRisk + 0.01);
    for (const w of s.weeks) {
      expect(w.items.filter((it) => it.type === "long").map((it) => weekday(it.date))).toEqual([0]);
      expect(w.items.some((it) => it.type === "threshold")).toBe(true);
    }
    // The long run is the week's longest run and steps up from the longest run before it; the lighter week has 70 %.
    for (const w of s.weeks) {
      const long = w.items.find((it) => it.type === "long")!.km;
      for (const it of w.items.filter((x) => x.type === "easy")) expect(it.km).toBeLessThan(long);
    }
    expect(s.weeks.map((w) => w.items.find((it) => it.type === "long")!.km)).toEqual([10, 11, 12, 8.5]);
    // The chain of long runs never trips the 30-day rule.
    for (const w of s.eval.weeks) expect(w.spike).toBeNull();
    expect(s.goalKm).toBeCloseTo(km.reduce((a, b) => a + b, 0), 1);
    expect(s.shortBy).toBe(0);
  });

  it("keeps the long run the longest on a big week with few runs", () => {
    const s = suggestBlock(seed({ kmBefore: [58, 60, 61], tolerance: { km: 61, peakKm: 61, peakWeek: "2026-11-09", weeksAgo: 1 }, runDays: [2, 4, 6, 0], ctl: 50, atl: 70, longestKm: 20 }));
    for (const w of s.weeks) {
      const long = w.items.find((it) => it.type === "long")!.km;
      for (const it of w.items.filter((x) => x.type !== "long" && x.type !== "cross")) expect(it.km).toBeLessThan(long);
    }
  });

  it("re-enters up to the tolerated peak sooner than +10 % a week would", () => {
    const re = suggestBlock(seed());
    const careful = suggestBlock(seed({ tolerance: { km: 0, peakKm: 0, peakWeek: null, weeksAgo: 0 } }));
    expect(re.weeks[0].reentry).toBe(true);
    expect(weekKm(re.weeks[0].items)).toBeGreaterThan(weekKm(careful.weeks[0].items));
    expect(weekKm(re.weeks[0].items)).toBeLessThanOrEqual(31);
  });

  it("climbs the threshold ladder only as the volume allows, from the rung the history left", () => {
    const reps = (over: Partial<BlockSeed>) => suggestBlock(seed(over)).weeks.map((w) => {
      const thr = w.items.find((it) => it.type === "threshold")!;
      const r = thr.steps!.items.find((x) => x.kind === "repeat")!;
      return r.kind === "repeat" ? `${r.times}x${r.work.min}` : "";
    });
    // 25–35 km weeks: 3 × 8 while the volume is built; the lighter week 3 × 6.
    expect(reps({})).toEqual(["3x8", "3x8", "3x8", "3x6"]);
    const big = { kmBefore: [60, 62, 64], tolerance: { km: 64, peakKm: 64, peakWeek: "2026-11-09", weeksAgo: 1 }, ctl: 55, atl: 60, longestKm: 20 };
    expect(reps(big)).toEqual(["3x8", "3x10", "3x12", "3x6"]);
    expect(reps({ ...big, rung: 2 }).slice(0, 3)).toEqual(["3x12", "2x20", "4x8"]);
  });

  it("aims at a goal below the safe maximum, and says how short it falls above it", () => {
    const max = suggestBlock(seed()).goalKm;
    const low = suggestBlock(seed({ goalKm: max - 15 }));
    expect(low.goalKm).toBeLessThanOrEqual(max - 15 + 0.01);
    expect(low.goalKm).toBeGreaterThan(max - 15 - 3);
    expect(low.shortBy).toBeLessThan(3);
    const high = suggestBlock(seed({ goalKm: max + 30 }));
    expect(high.shortBy).toBeGreaterThan(20);
  });

  it("re-plans the rest of a block after a short week without chasing past the caps", () => {
    // Week 1 of 4 ran 18 km instead of 25: three weeks left, 87 km of the 105 goal to go.
    const s = suggestBlock(seed({ startWeek: addDays(MONDAY, 7), weeks: 3, kmBefore: [20.2, 22.8, 18], goalKm: 87, buildWeeksDone: 1 }));
    expect(s.weeks).toHaveLength(3);
    for (const w of s.weeks) expect(weekKm(w.items)).toBeLessThanOrEqual(w.cap + 0.5);
    expect(weekKm(s.weeks[0].items)).toBeLessThanOrEqual(31);
    expect(s.goalKm + s.shortBy).toBeCloseTo(87, 0);
  });

  it("does not cut a block to key sessions only because the runner starts tired", () => {
    // Form is already far under the floor (ctl 25, atl 60): no volume fixes that, and the floor is measured from where the runner starts.
    const tired = suggestBlock(seed({ ctl: 25, atl: 60 }));
    const fresh = suggestBlock(seed());
    const km = tired.weeks.map((w) => weekKm(w.items));
    // The first week backs off like "Föreslå veckan" does, but keeps easy runs; the weeks after it keep their size.
    expect(tired.weeks[0].items.some((it) => it.type === "easy")).toBe(true);
    expect(km.slice(1, 3).every((k, i) => k >= weekKm(fresh.weeks[i + 1].items) * 0.9)).toBe(true);
    expect(km[1]).toBeGreaterThan(km[0]);
  });

  it("measures the form floor from the start when the runner begins near or under it", () => {
    const at = (ctl: number, atl: number) => floorFor({ ctl, atl });
    expect(at(30, 36)).toBe(COACH.floor);                 // −20 % at the start: the plain floor
    expect(at(40, 51.8)).toBeCloseTo(-29.5 - BLOCK.fit.slack, 1); // −29.5 %: a few points of slack beyond the start
    expect(at(25, 60)).toBeLessThan(COACH.floor);
  });

  it("grows back after a break toward a tolerated peak instead of shrinking", () => {
    const s = suggestBlock(seed({ kmBefore: [0, 0, 0], tolerance: { km: 61, peakKm: 61, peakWeek: "2026-10-05", weeksAgo: 4 }, ctl: 30, atl: 5 }));
    const km = s.weeks.map((w) => weekKm(w.items));
    expect(km[1]).toBeGreaterThan(km[0]);
    expect(km[2]).toBeGreaterThan(km[1]);
    expect(s.eval.state).not.toBe("over");
  });

  it("starts gently without any history", () => {
    const s = suggestBlock(seed({ kmBefore: [0, 0, 0], tolerance: { km: 0, peakKm: 0, peakWeek: null, weeksAgo: 0 }, ctl: 0, atl: 0, longestKm: 0 }));
    expect(s.chosen).toBe("start");
    expect(weekKm(s.weeks[0].items)).toBeLessThanOrEqual(15);
  });
});

describe("lighter weeks the runner decides", () => {
  it("makes the second of two weeks lighter for a 1:1 rhythm, which the engine's own rule never does", () => {
    expect(suggestBlock(seed({ weeks: 2 })).weeks.map((w) => w.lighter)).toEqual([false, false]);
    const s = suggestBlock(seed({ weeks: 2, lighterWeeks: [false, true] }));
    expect(s.weeks.map((w) => w.lighter)).toEqual([false, true]);
    expect(s.weeks[1].targetKm).toBeLessThan(s.weeks[0].targetKm);
  });

  it("ends a tired five-week block with a lighter week: one lighter first, then 3:1", () => {
    expect(suggestBlock(seed({ weeks: 4, lighterFirst: true })).weeks.map((w) => w.lighter)).toEqual([true, false, false, false]);
    expect(suggestBlock(seed({ weeks: 5, lighterFirst: true })).weeks.map((w) => w.lighter)).toEqual([true, false, false, false, true]);
  });

  it("evaluates the weeks with the lighter ones as set in the editor", () => {
    const s = suggestBlock(seed());
    const items = s.weeks.map((w) => w.items);
    expect(evaluateBlock({ ...seed(), lighterWeeks: [false, true, false, false] }, items).weeks.map((w) => w.lighter)).toEqual([false, true, false, false]);
  });
});

describe("evaluateBlock", () => {
  it("flags a hard Monday after the week before ended on a long run", () => {
    const s = seed({ weeks: 2, lighterLast: false });
    const w1 = [{ date: addDays(MONDAY, 6), type: "long" as const, km: 10, durationMin: null, steps: null }];
    const w2 = [{ date: addDays(MONDAY, 7), type: "long" as const, km: 10, durationMin: null, steps: null }];
    const e = evaluateBlock(s, [w1, w2]);
    expect(e.weeks[0].adjacent).toBe(false);
    expect(e.weeks[1].adjacent).toBe(true);
  });

  it("chains fitness and the km window from week to week", () => {
    const s = suggestBlock(seed());
    const e = s.eval;
    expect(e.weeks[1].acwr).not.toBeNull();
    expect(e.ctlGain).toBeCloseTo(e.ctl - 30, 1);
    expect(e.deepest!.weekStart).not.toBe(e.weeks[3].weekStart);
  });
});

describe("threshold placement", () => {
  it("never puts the threshold on the Monday after a Sunday long run", () => {
    // The 2026-11-14 block: runs Mon, Wed, Fri and Sun; every week had threshold on Monday ("two hard days in a row").
    const s = suggestBlock(seed({ kmBefore: [10.9, 20.2, 32.3], ctl: 24, atl: 36.3, tolerance: { km: 32.2, peakKm: 35, peakWeek: "2026-09-07", weeksAgo: 10 },
      runDays: [1, 3, 5, 0], longestKm: 9.5, rung: 1, hardBefore: true }));
    for (const w of s.weeks) expect(weekday(w.items.find((it) => it.type === "threshold")!.date)).toBe(3);
    expect(s.eval.weeks.every((w) => !w.adjacent)).toBe(true);
  });
});

describe("the first week", () => {
  it("is never bigger than what Föreslå veckan suggests for it", () => {
    // After a jump to 32 km the week button backs off to 25.5; the block used to start at 29.5.
    const s0 = seed({ kmBefore: [10.9, 20.2, 32.3], ctl: 24, atl: 36.3, tolerance: { km: 32.4, peakKm: 35, peakWeek: "2026-09-07", weeksAgo: 10 },
      runDays: [1, 2, 3, 0], longestKm: 9.5, hardBefore: true });
    const s = suggestBlock(s0);
    const week = suggestWeek({ weekStart: MONDAY, ctl: s0.ctl, atl: s0.atl, kmBefore: s0.kmBefore, past: [], runDays: s0.runDays, longRunDay: 0,
      threshold: s0.threshold, refs: REFS, crossMin: 0, targetKm: null, backoff: false, hardBefore: true, longestKm: 9.5, rung: 0, tempoPace: 275, toleranceKm: 32.4 });
    expect(s.weeks[0].targetKm).toBeLessThanOrEqual(week.targetKm);
    expect(s.weeks[2].targetKm).toBeGreaterThan(s.weeks[0].targetKm);
  });
});

describe("block progression", () => {
  // Steady 30 km weeks with a 30 km tolerance: the block's shape is then easy to read off.
  const steady = (over: Partial<BlockSeed> = {}) => seed({ kmBefore: [30, 30, 30], tolerance: { km: 30, peakKm: 30, peakWeek: "2026-11-02", weeksAgo: 2 }, ctl: 26, atl: 28, longestKm: 12, runDays: [2, 4, 5, 0], ...over });
  const kms = (s: ReturnType<typeof suggestBlock>) => s.weeks.map((w) => weekKm(w.items));

  it("starts at the tolerated load, climbs through the block, overreaches at the end and backs off", () => {
    const s = suggestBlock(steady());
    const km = kms(s);
    const { from, to } = tune().ramp;
    // Build weeks sit at 1.0, 1.05 and 1.1 of 30 km (the ramp's defaults, to the half km); the lighter week is 70 % of the one before.
    expect(km[0]).toBeCloseTo(30 * from, 0);
    expect(km[1]).toBeCloseTo(30 * (from + to) / 2, 0);
    expect(km[2]).toBeCloseTo(30 * to, 0);
    expect(km[3]).toBeCloseTo(km[2] * tune().lighter.volume, 0);
    expect(s.weeks[3].lighter).toBe(true);
  });

  it("puts a lone build week in the middle of the ramp", () => {
    // A lighter week first (one is due), then a single build week: it aims at the tolerated 30 km itself.
    const km = kms(suggestBlock(steady({ weeks: 2, lighterLast: false, lighterFirst: true })));
    expect(km[1]).toBeCloseTo(30, 0);
  });

  it("keeps rising when it has to scale a too hard block down, instead of going flat", () => {
    // A tolerance of 50 km on 22 km of fitness: full size gets too deep (the 'over' state); the scale is searched, the shape stays.
    const s = suggestBlock(steady({ kmBefore: [28, 32, 36], tolerance: { km: 50, peakKm: 50, peakWeek: "2026-11-02", weeksAgo: 2 }, ctl: 22, atl: 26 }));
    const km = kms(s);
    expect(s.tries.find((t) => t.id === "volume")!.state).toBe("over");
    expect(s.chosen).toBe("lighter");
    expect(s.eval.state).not.toBe("over");
    // Starting at the tolerated load, the first weeks meet their caps sooner; the block still never falls back and ends higher.
    expect(km[1]).toBeGreaterThanOrEqual(km[0]);
    expect(km[2]).toBeGreaterThan(km[0]);
  });

  it("stops the long run's ladder at its share of the week once the runner has run that far", () => {
    // Tolerance 40 km but a 16 km longest run: a ladder of 17, 18, 19 would be ~50 % of a 34–37 km week.
    const s = suggestBlock(steady({ kmBefore: [36, 38, 40], tolerance: { km: 40, peakKm: 40, peakWeek: "2026-11-09", weeksAgo: 1 }, longestKm: 16 }));
    s.weeks.forEach((w, i) => {
      const long = w.items.find((it) => it.type === "long")!.km;
      const week = kms(s)[i];
      const room = Math.max(week * longShareAt(week), w.lighter ? 0 : 16);
      expect(long, `week ${i}`).toBeLessThanOrEqual(room + 0.5);
    });
    // The lighter week's long run shrinks with the week, not with the longest run.
    const last = s.weeks[3];
    expect(last.items.find((it) => it.type === "long")!.km).toBeLessThanOrEqual(kms(s)[3] * longShareAt(kms(s)[3]) + 0.5);
  });
});

describe("race planning (docs/decisions/fartlek-race-blocks.md)", () => {
  const shape = (n: number) => raceChunks(n).map((c) => c.roles.map((r) => r[0]).join("")).join(" + ");
  it("counts 4-week blocks back from the race: the form peak last, builds before it, an in-phase block in front", () => {
    expect(shape(1)).toBe("r");
    expect(shape(2)).toBe("tr");
    expect(shape(3)).toBe("btr");
    expect(shape(4)).toBe("bbtr");
    expect(shape(8)).toBe("bbbl + bbtr");
    expect(shape(10)).toBe("bl + bbbl + bbtr");
    expect(shape(11)).toBe("bbl + bbbl + bbtr");
    expect(shape(9)).toBe("b + bbbl + bbtr");
    expect(shape(16)).toBe("bbbl + bbbl + bbbl + bbtr");
    expect(raceChunks(11).map((c) => c.kind)).toEqual(["inPhase", "build", "peak"]);
  });

  it("never puts a lighter week right before the taper", () => {
    for (let n = 2; n <= 16; n++) {
      const r = raceRoles(n, "A");
      const t = r.indexOf("taper");
      expect(r[t - 1]).not.toBe("lighter");
      expect(r.at(-1)).toBe("race");
    }
  });

  it("gives a B race only a lighter race week, keeping the usual rhythm before it", () => {
    expect(raceRoles(6, "B")).toEqual(["build", "build", "build", "lighter", "build", "race"]);
    expect(raceRoles(4, "B", true)).toEqual(["lighter", "build", "build", "race"]);
  });

  // An A race on the Saturday eight weeks out (start Monday 16 Nov): 3:1, then two peak builds and the taper.
  const raceSeed = (raceDate: string, weeks = 8, priority: "A" | "B" = "A") =>
    seed({ weeks, roles: raceRoles(weeks, priority), race: { date: raceDate, priority }, lighterLast: false });

  it("puts the biggest weeks just before the taper and cuts the taper deeper than a lighter week", () => {
    const s = suggestBlock(raceSeed("2027-01-09"));
    const km = s.weeks.map((w) => w.targetKm);
    const builds = s.weeks.filter((w) => w.role === "build").map((w) => w.targetKm);
    const peak = Math.max(...builds);
    expect([km[4], km[5]]).toContain(peak);
    expect(km[6]).toBeLessThan(peak * 0.85);
    expect(km[7]).toBeLessThan(km[6]);
    expect(s.weeks.map((w) => w.role)).toEqual(["build", "build", "build", "lighter", "build", "build", "taper", "race"]);
  });

  it("lands race-day form in the race window when a taper depth can, and says which it tried", () => {
    const s = suggestBlock(raceSeed("2027-01-09"));
    expect(s.eval.race).not.toBeNull();
    const f = s.eval.race!.form;
    const tried = s.tries.filter((t) => t.id === "taper");
    expect(tried.length).toBeGreaterThan(0);
    if (tried.some((t) => t.state === "ok")) {
      expect(f).toBeGreaterThanOrEqual(COACH_RACE.race.low);
      expect(f).toBeLessThanOrEqual(COACH_RACE.race.high);
    }
  });

  it("keeps the build weeks' guards: no week grows past its cap", () => {
    const s = suggestBlock(raceSeed("2027-01-09"));
    for (const w of s.weeks.filter((x) => x.role === "build")) expect(w.targetKm).toBeLessThanOrEqual(w.cap + 0.05);
  });

  it("leaves race day and the day before free, sharpens 3+ days before, and runs only easy after it", () => {
    for (const race of ["2027-01-09", "2027-01-10", "2027-01-04"]) { // Saturday, Sunday, Monday
      const weeks = race === "2027-01-04" ? 8 : 8;
      const s = suggestBlock(raceSeed(race, weeks));
      const items = s.weeks.flatMap((w) => w.items);
      const before = new Date(Date.parse(race) - 86400000).toISOString().slice(0, 10);
      expect(items.some((it) => it.date === race || it.date === before)).toBe(false);
      const lastHard = items.filter((it) => it.type === "threshold" && it.date < race).map((it) => it.date).sort().at(-1);
      if (lastHard) expect((Date.parse(race) - Date.parse(lastHard)) / 86400000).toBeGreaterThanOrEqual(3);
      for (const it of items.filter((x) => x.date > race)) expect(it.type).toBe("easy");
    }
  });

  it("plans a race four, three and two weeks out as 2:2, 1:2 and 0:2", () => {
    const at = (n: number, date: string) => suggestBlock(seed({ weeks: n, roles: raceRoles(n, "A"), race: { date, priority: "A" }, lighterLast: false })).weeks.map((w) => w.role);
    expect(at(4, "2026-12-12")).toEqual(["build", "build", "taper", "race"]);
    expect(at(3, "2026-12-05")).toEqual(["build", "taper", "race"]);
    expect(at(2, "2026-11-28")).toEqual(["taper", "race"]);
  });
});
