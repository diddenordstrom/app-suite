import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekday } from "./dates";
import { COACH } from "./coach";
import { BLOCK, blockWeekCap, evaluateBlock, floorFor, gateAfterRace, projectVolumes, raceChunks, raceRoles, RECOVERY, recoveryBucket, recoveryRoles, recoveryRow, recoveryWeekOf, suggestBlock, suggestWeek, tolerance, weekKm, withRecovery, type BlockSeed, type RecoveryRace, type WeekRole } from "./blockplan";
import { COACH as COACH_RACE } from "./coach";
import { NEXT, spikeMax, thresholdReps, weekCap, type SuggestItem } from "./nextweek";
import { stridesOf, withStrides } from "./steps";
import type { PhaseSeed } from "./racephase";
const floorHalf = (n: number) => Math.floor(n * 2) / 2;
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

describe("post-race recovery (docs/decisions/fartlek-post-race-recovery.md)", () => {
  const SUN = addDays(MONDAY, -1);
  const rec = (distanceKm: number, priority: "A" | "B", peakKm: number | null = null, date = SUN): RecoveryRace => ({ date, distanceKm, priority, peakKm });
  const runs = (items: SuggestItem[]) => items.filter((it) => it.type !== "cross");
  const day = (r: RecoveryRace, d: string) => daysBetween(r.date, d);

  it("has rows of the right shape, gates in order, B about 0.6 of A", () => {
    for (const p of ["A", "B"] as const) {
      for (const b of ["10k", "half", "marathon"] as const) {
        const row = RECOVERY[p][b];
        expect(row.volume).toHaveLength(row.weeks);
        expect(row.strides).toBeLessThanOrEqual(row.thresholdShort);
        expect(row.thresholdShort).toBeLessThanOrEqual(row.thresholdFull);
        expect(row.thresholdFull).toBeLessThanOrEqual(row.intervals);
        if (p === "B") {
          const a = RECOVERY.A[b];
          for (const k of ["strides", "thresholdShort", "thresholdFull", "intervals"] as const) expect(Math.abs(row[k] - Math.round(0.6 * a[k]))).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("buckets by distance, and has no row for a C race", () => {
    expect([9.9, 10, 14.9, 15, 21.1, 29.9, 30, 42.2].map(recoveryBucket)).toEqual([null, "10k", "10k", "half", "half", "half", "marathon", "marathon"]);
    expect(recoveryRow({ distanceKm: 21.1, priority: "C" })).toBeNull();
  });

  it("finds the recovery week from the week's middle day", () => {
    expect(recoveryWeekOf("2026-11-22", "2026-11-23")).toBe(0);
    expect(recoveryWeekOf("2026-11-22", "2026-11-30")).toBe(1);
    expect(recoveryWeekOf("2026-11-21", "2026-11-23")).toBe(0);
    expect(recoveryWeekOf("2026-11-18", "2026-11-23")).toBe(1);
    expect(recoveryWeekOf("2026-11-16", "2026-11-23")).toBe(1);
  });

  it("gives recovery roles by distance and priority, dropping weeks already over", () => {
    expect(recoveryRoles(rec(42.2, "A", null, "2026-11-08"), "2026-11-09", 4)).toEqual(["recovery", "recovery", "recovery", "recovery"]);
    expect(recoveryRoles(rec(42.2, "A", null, "2026-11-08"), "2026-11-23", 4)).toEqual(["recovery", "recovery", null, null]);
    expect(recoveryRoles(rec(21.1, "A", null, "2026-11-15"), "2026-11-16", 4)).toEqual(["recovery", "recovery", null, null]);
    expect(recoveryRoles(rec(10, "A"), MONDAY, 4)).toEqual(["recovery", null, null, null]);
    expect(recoveryRoles(rec(10, "B"), MONDAY, 4)).toEqual(["recovery", null, null, null]);
    expect(recoveryRoles(rec(5, "A"), MONDAY, 4)).toEqual([null, null, null, null]);
    expect(recoveryRoles({ date: SUN, distanceKm: 21.1, priority: "C" }, MONDAY, 4)).toEqual([null, null, null, null]);
  });

  it("puts recovery weeks first, keeping race weeks", () => {
    expect(withRecovery(null, ["recovery", null])).toEqual(["recovery", "build"]);
    expect(withRecovery(["build", "build", "taper", "race"], ["recovery", "recovery", null, null])).toEqual(["recovery", "recovery", "taper", "race"]);
    expect(withRecovery(["build", "race"], ["recovery", "recovery"])).toEqual(["recovery", "race"]);
    expect(withRecovery(["build", "taper"], ["recovery", "recovery"])).toEqual(["recovery", "recovery"]);
    expect(withRecovery(null, [null, null])).toBeNull();
    expect(withRecovery(["build", "lighter"], [null, null])).toEqual(["build", "lighter"]);
  });

  it("sizes recovery weeks as shares of the pre-race peak, then re-enters", () => {
    const m = suggestBlock(seed({ recovery: rec(42.2, "A", 60), roles: ["recovery", "recovery", "recovery", "recovery"], runDays: [1, 2, 4, 6, 0] }));
    expect(m.weeks.map((w) => w.targetKm)).toEqual([9, 27, 39, 48]);
    const h = suggestBlock(seed({ recovery: rec(21.1, "A", 50), roles: ["recovery", "recovery", "build", "build"], runDays: [1, 2, 4, 6, 0],
      tolerance: { km: 50, peakKm: 50, peakWeek: null, weeksAgo: 2 }, ctl: 40, atl: 35 }));
    expect(h.weeks.slice(0, 2).map((w) => w.targetKm)).toEqual([25, 37.5]);
    expect(h.weeks[2].role).toBe("build");
    expect(h.weeks[2].reentry).toBe(true);
    expect(h.weeks[2].targetKm).toBeGreaterThan(37.5);
    // Without a peak from the runs, the tolerance's peak.
    const t = suggestBlock(seed({ recovery: rec(21.1, "A"), roles: ["recovery", "recovery"], weeks: 2 }));
    expect(t.weeks[0].targetKm).toBe(floorHalf(31 * 0.5));
  });

  it("runs nothing on the rest days after a marathon", () => {
    const r = rec(42.2, "A", 50);
    const s = suggestBlock(seed({ recovery: r, roles: ["recovery", "recovery", "recovery", "recovery"], runDays: [1, 2, 4, 6, 0], crossMin: 30 }));
    expect(runs(s.weeks[0].items).filter((it) => day(r, it.date) <= 3)).toEqual([]);
    expect(runs(s.weeks[0].items).length).toBeGreaterThan(0);
  });

  it("opens strides and threshold by day after a half and a marathon", () => {
    const thrOf = (items: SuggestItem[]) => items.filter((it) => it.type === "threshold");
    const r = rec(21.1, "A", 45);
    const h = suggestBlock(seed({ recovery: r, roles: ["recovery", "recovery", "build", "build"], runDays: [1, 2, 4, 6, 0], tolerance: { km: 45, peakKm: 45, peakWeek: null, weeksAgo: 2 } }));
    const all = h.weeks.flatMap((w) => w.items);
    for (const it of thrOf(all)) expect(day(r, it.date)).toBeGreaterThanOrEqual(11);
    for (const it of all.filter((x) => stridesOf(x.steps))) expect(day(r, it.date)).toBeGreaterThanOrEqual(6);
    for (const it of thrOf(h.weeks[1].items)) expect(thresholdReps(it.steps)).toMatchObject({ reps: NEXT.lighterThr.reps, min: NEXT.lighterThr.min });
    // Week 3 (day 15 on) has the ladder's rung, not the short session.
    const w3 = thrOf(h.weeks[2].items);
    expect(w3.length).toBeGreaterThan(0);
    expect(thresholdReps(w3[0].steps)!.reps * thresholdReps(w3[0].steps)!.min).toBeGreaterThan(NEXT.lighterThr.reps * NEXT.lighterThr.min);

    const mr = rec(42.2, "A", 50);
    const m = suggestBlock(seed({ recovery: mr, roles: ["recovery", "recovery", "recovery", "recovery"], runDays: [1, 2, 4, 6, 0] }));
    expect(thrOf([...m.weeks[0].items, ...m.weeks[1].items])).toEqual([]);
    for (const it of thrOf(m.weeks[2].items)) expect(day(mr, it.date)).toBeGreaterThanOrEqual(21);
    expect(m.weeks[0].items.some((it) => stridesOf(it.steps))).toBe(false);
    for (const it of m.weeks.flatMap((w) => w.items).filter((x) => stridesOf(x.steps))) expect(day(mr, it.date)).toBeGreaterThanOrEqual(12);
    expect(m.weeks.slice(2).some((w) => w.items.some((it) => stridesOf(it.steps)))).toBe(true);
  });

  it("caps the long run in recovery weeks, and steps from it after them", () => {
    const r = rec(42.2, "A", 60);
    const s = suggestBlock(seed({ recovery: r, roles: ["recovery", "recovery", "build", "build"], runDays: [1, 2, 4, 6, 0], longestKm: 32,
      tolerance: { km: 60, peakKm: 60, peakWeek: null, weeksAgo: 2 } }));
    for (const w of s.weeks.filter((x) => x.role === "recovery")) {
      const long = w.items.find((it) => it.type === "long");
      if (long) expect(long.km).toBeLessThanOrEqual(Math.max(NEXT.easyMinKm, Math.min(RECOVERY.longMaxKm, floorHalf(w.targetKm * RECOVERY.longShare))));
    }
    const recLongest = Math.max(...s.weeks.filter((x) => x.role === "recovery").flatMap((w) => runs(w.items).map((it) => it.km)));
    const firstBuild = s.weeks.find((w) => w.role === "build")!;
    expect(firstBuild.items.find((it) => it.type === "long")!.km).toBeLessThanOrEqual(spikeMax(recLongest));
  });

  it("is never fitted or deepened, and an all-recovery block is judged ok", () => {
    const base = { recovery: rec(21.1, "A", 50), roles: ["recovery", "recovery"] as WeekRole[], weeks: 2 };
    const tired = suggestBlock(seed({ ...base, ctl: 30, atl: 70 }));
    const fresh = suggestBlock(seed({ ...base, ctl: 30, atl: 20 }));
    expect(tired.weeks.map((w) => w.targetKm)).toEqual(fresh.weeks.map((w) => w.targetKm));
    expect(fresh.eval.deepest).toBeNull();
    expect(fresh.eval.state).toBe("ok");
    const goal = suggestBlock(seed({ recovery: rec(21.1, "A", 50), roles: ["recovery", "recovery", "build", "build"], goalKm: 80 }));
    expect(goal.weeks.slice(0, 2).map((w) => w.targetKm)).toEqual([25, 37.5]);
  });

  it("changes nothing for a race under 10 km or a C race", () => {
    const plain = suggestBlock(seed()).weeks.map((w) => w.items);
    expect(suggestBlock(seed({ recovery: rec(5, "A", 40) })).weeks.map((w) => w.items)).toEqual(plain);
    expect(suggestBlock(seed({ recovery: { ...rec(21.1, "B", 40), priority: "C" as "B" } })).weeks.map((w) => w.items)).toEqual(plain);
  });

  it("plans no race-phase session in a recovery week", () => {
    const phase: PhaseSeed = { race: { date: addDays(MONDAY, 7 * 7 + 6), kind: "marathon" }, paces: { mp: 300, hmp: 285 }, paceSource: "goal", steps: {} as PhaseSeed["steps"], backOff: false, injury: false };
    const s = suggestBlock(seed({ recovery: rec(21.1, "B", 45), roles: ["recovery", "build", "build", "lighter"], phase, runDays: [1, 2, 4, 6, 0] }));
    expect(s.weeks[0].items.some((it) => it.blueprint)).toBe(false);
  });

  it("gates single items: threshold swaps later or runs easy, strides wait, race day untouched", () => {
    const half = RECOVERY.A.half, tenk = RECOVERY.A["10k"];
    const r = { date: "2026-11-01" };
    const thr: SuggestItem = { date: "2026-11-10", type: "threshold", km: 8, durationMin: null, steps: withStrides({ km: 8 }) };
    const easy: SuggestItem = { date: "2026-11-13", type: "easy", km: 6, durationMin: null, steps: null };
    const swapped = gateAfterRace([thr, easy], r, half);
    expect(swapped.map((it) => [it.date, it.type])).toEqual([["2026-11-10", "easy"], ["2026-11-13", "threshold"]]);
    expect(gateAfterRace([thr], r, half)).toEqual([{ date: "2026-11-10", type: "easy", km: 8, durationMin: null, steps: null }]);
    const strides: SuggestItem = { date: "2026-11-04", type: "easy", km: 7, durationMin: null, steps: withStrides({ km: 6.5 }) };
    expect(gateAfterRace([strides], r, tenk)[0].steps).toBeNull();
    const before: SuggestItem = { date: "2026-10-30", type: "threshold", km: 8, durationMin: null, steps: null };
    expect(gateAfterRace([before], r, half)).toEqual([before]);
  });
});

describe("race plan hooks (docs/decisions/fartlek-race-plan-skeleton.md)", () => {
  it("projects the same km as the engine for a calm seed", () => {
    const calm = seed({ ctl: 40, atl: 38, kmBefore: [30, 31, 30], tolerance: { km: 31, peakKm: 31, peakWeek: null, weeksAgo: 1 }, runDays: [1, 2, 4, 6, 0] });
    const s = suggestBlock(calm);
    expect(projectVolumes({ ...calm, firstWeekMax: s.weeks[0].targetKm }).map((v) => v.km)).toEqual(s.weeks.map((w) => w.targetKm));
  });

  it("plans an other race's week as a B race week, its days after the race short and easy", () => {
    const sun = addDays(MONDAY, 13);
    const s = suggestBlock(seed({ roles: ["build", "race", "build", "lighter"], race: null, otherRaces: [{ date: sun }], runDays: [1, 2, 4, 6, 0] }));
    expect(s.weeks[1].targetKm).toBe(Math.floor(s.weeks[0].targetKm * tune().taper.bRace * 2) / 2);
    const sat = addDays(MONDAY, 12);
    const s2 = suggestBlock(seed({ roles: ["build", "race", "build", "lighter"], race: null, otherRaces: [{ date: sat }], runDays: [1, 2, 4, 6, 0] }));
    for (const it of s2.weeks[1].items.filter((x) => x.date > sat && x.type !== "cross")) expect(it).toMatchObject({ type: "easy", steps: null });
    expect(s2.weeks[1].items.some((x) => x.date === sat)).toBe(false);
  });

  it("holds the long run in the build weeks just before a marathon taper", () => {
    // Weeks at wip 6–3 of a marathon on the Sunday of week 4 + 2.
    const race = addDays(MONDAY, 5 * 7 + 6);
    const phase: PhaseSeed = { race: { date: race, kind: "marathon" }, paces: { mp: 300, hmp: 285 }, paceSource: "goal", steps: {} as PhaseSeed["steps"], backOff: false, injury: true };
    const s = suggestBlock(seed({ roles: ["build", "lighter", "build", "build"], phase, longestKm: 20, kmBefore: [48, 50, 52], tolerance: { km: 55, peakKm: 55, peakWeek: null, weeksAgo: 1 }, runDays: [1, 2, 4, 6, 0], ctl: 50, atl: 50 }));
    const long = (i: number) => Math.max(...s.weeks[i].items.filter((it) => it.type === "long").map((it) => it.km));
    expect(long(2)).toBeLessThanOrEqual(long(0));
    expect(long(3)).toBeLessThanOrEqual(long(0));
  });
});
