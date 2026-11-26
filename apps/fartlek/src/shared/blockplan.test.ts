import { describe, expect, it } from "vitest";
import { addDays, daysBetween, weekday } from "./dates";
import { COACH } from "./coach";
import { BLOCK, blockDaysAdvice, blockWeekCap, evaluateBlock, floorFor, gateAfterRace, projectVolumes, raceChunks, raceRoles, RECOVERY, recoveryBucket, recoveryRoles, recoveryRow, recoveryWeekOf, suggestBlock, suggestWeek, tolerance, weekKm, withRecovery, type BlockSeed, type RecoveryRace, type WeekRole } from "./blockplan";
import { COACH as COACH_RACE } from "./coach";
import { markDoubles, NEXT, spikeMax, thresholdReps, weekCap, type SuggestItem } from "./nextweek";
import { planRange } from "./planrange";
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
    // Under NEXT.lowVolumeKm each build week climbs NEXT.lowStepKm (docs/decisions/fartlek-low-volume-growth.md): 30, 32.5, 35,
    // more than the ramp's 1.0, 1.05 and 1.1; the lighter week is 70 % of the one before.
    expect(km[0]).toBeCloseTo(30 * from, 0);
    expect(km[1]).toBeCloseTo(Math.max(30 * (from + to) / 2, 30 + NEXT.lowStepKm), 0);
    expect(km[2]).toBeCloseTo(Math.max(30 * to, 30 + 2 * NEXT.lowStepKm), 0);
    expect(km[3]).toBeCloseTo(km[2] * tune().lighter.volume, 0);
    expect(s.weeks[3].lighter).toBe(true);
  });

  it("lets a low-volume runner climb a few km a week instead of a few per cent (docs/decisions/fartlek-low-volume-growth.md)", () => {
    // Months at about 22 km: the ramp's 1.0 → 1.1 alone was 22 → 24 km, and the next block started over at 24.
    const s = suggestBlock(steady({ kmBefore: [21, 22, 22], tolerance: { km: 22, peakKm: 22, peakWeek: "2026-11-09", weeksAgo: 1 }, ctl: 20, atl: 22, longestKm: 9 }));
    const km = kms(s);
    expect(km[1]).toBeGreaterThanOrEqual(24.5);
    expect(km[2]).toBeGreaterThanOrEqual(27);
    // The spike rule still holds each long run: never more than 10 % over the longest run before it, planned weeks included.
    let longest = 9;
    for (const w of s.weeks) for (const it of w.items.filter((x) => x.type === "long")) { expect(it.km).toBeLessThanOrEqual(spikeMax(longest) + 0.05); longest = Math.max(longest, it.km); }
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

describe("long-run ceiling and the peak-week cap (docs/decisions/fartlek-long-run-ceiling.md)", () => {
  const big = { kmBefore: [74, 78, 56], tolerance: { km: 80, peakKm: 80, peakWeek: null, weeksAgo: 2 }, runDays: [1, 2, 3, 4, 6, 0], ctl: 60, atl: 62, rung: 3 };
  const longOf = (items: { type: string; km: number }[]) => Math.max(...items.filter((it) => it.type === "long").map((it) => it.km));

  it("stops a long run at 32 km, plain or key (a ceiling, not a target)", () => {
    const s = suggestBlock(seed({ ...big, weeks: 1, fixedKm: [95], longestKm: 31.5 }));
    expect(longOf(s.weeks[0].items)).toBeLessThanOrEqual(32);
    expect(longOf(s.weeks[0].items)).toBeGreaterThan(30);
  });

  it("gives a marathon plan's build weeks up to 40 % of the week for the long run", () => {
    const plain = suggestBlock(seed({ ...big, weeks: 1, fixedKm: [76], longestKm: 28 }));
    const plan = suggestBlock(seed({ ...big, weeks: 1, fixedKm: [76], longestKm: 28, longShareFrom: MONDAY }));
    expect(longOf(plain.weeks[0].items)).toBeLessThan(30);
    expect(longOf(plan.weeks[0].items)).toBe(30);
  });

  it("lets a marathon long blueprint week reach 32 km", () => {
    // The week is wip 6 of a marathon: fast-finish long, the "first 30–32 km chance".
    const race = addDays(MONDAY, 5 * 7 + 6);
    const phase: PhaseSeed = { race: { date: race, kind: "marathon" }, paces: { mp: 300, hmp: 285 }, paceSource: "goal", steps: {} as PhaseSeed["steps"], backOff: false, injury: false };
    const s = suggestBlock(seed({ ...big, weeks: 1, fixedKm: [85], longestKm: 30, roles: ["build"], race: { date: race, priority: "A" }, phase }));
    const long = s.weeks[0].items.find((it) => it.type === "long")!;
    expect(long.blueprint).toBeTruthy();
    expect(long.km).toBeGreaterThan(30);
    expect(long.km).toBeLessThanOrEqual(32);
  });

  describe("the marathon's long-run track (docs/decisions/fartlek-marathon-long-run-plan.md)", () => {
    // A single build week at `wip` weeks to a marathon (the race week is 1), of `km`, from a longest run of `longest`.
    const week = (wip: number, km: number, longest: number, others: { date: string; distanceKm: number }[] = []) => {
      const raceWeek = addDays(MONDAY, (wip - 1) * 7), raceDate = addDays(raceWeek, 6);
      return longOf(suggestBlock(seed({ ...big, weeks: 1, roles: ["build"], fixedKm: [km], longestKm: longest, track: { raceDate, others } })).weeks[0].items);
    };

    it("aims a week at its target and gives the long run up to half of the week", () => {
      expect(week(10, 60, 28)).toBe(30);
      // A week that can not carry 30 km gives the run half of it, and the target is not reached.
      expect(week(10, 52, 28)).toBe(26);
      // The ladder leads when the run is not that far: +8 % on 24 km, not 30.
      expect(week(10, 60, 24)).toBe(26);
    });

    it("reaches 32 km only in a week that carries it at half, at the two stretch targets", () => {
      expect(week(6, 64, 30)).toBe(32);
      expect(week(6, 60, 30)).toBe(30);
      expect(week(10, 70, 30)).toBe(30);
    });

    it("keeps the MP long run three weeks out to about 27 km", () => {
      expect(week(3, 70, 30)).toBe(27);
    });

    it("keeps a run off 30 km within two weeks of a B race", () => {
      // The week is wip 6 and the B race wip 8 (two weeks before it): 28 km at most there.
      const near = { date: addDays(MONDAY, -7 * 2), distanceKm: 21.1 };
      expect(week(6, 70, 28, [near])).toBeLessThanOrEqual(28);
      expect(week(6, 70, 28, [])).toBeGreaterThan(28);
    });

    it("sizes the weeks to carry the run, never past the runner's cap", () => {
      const raceDate = addDays(MONDAY, 11 * 7 + 6);
      const planned = suggestBlock(seed({ ...big, weeks: 4, roles: ["build", "build", "build", "lighter"], kmBefore: [35, 35, 35], tolerance: { km: 35, peakKm: 35, peakWeek: null, weeksAgo: 1 },
        longestKm: 20, capKm: 60, track: { raceDate, others: [] } }));
      const noTrack = suggestBlock(seed({ ...big, weeks: 4, roles: ["build", "build", "build", "lighter"], kmBefore: [35, 35, 35], tolerance: { km: 35, peakKm: 35, peakWeek: null, weeksAgo: 1 },
        longestKm: 20, capKm: 60 }));
      const top = (b: typeof planned) => Math.max(...b.weeks.map((w) => w.targetKm));
      expect(top(planned)).toBeGreaterThanOrEqual(top(noTrack));
      expect(top(planned)).toBeLessThanOrEqual(60);
    });
  });

  it("holds every build week under the runner's cap", () => {
    const s = suggestBlock(seed({ ...big, longestKm: 24, capKm: 70 }));
    for (const w of s.weeks.filter((x) => x.role === "build")) expect(w.targetKm).toBeLessThanOrEqual(70);
    const free = suggestBlock(seed({ ...big, longestKm: 24 }));
    expect(Math.max(...free.weeks.map((w) => w.targetKm))).toBeGreaterThan(70);
  });
});

describe("a block started from today", () => {
  // A runner of about 40 km a week on six days, a 46 km week a month back, heavy form (−27 %); an in-phase block (build,
  // build, lighter) started on the Wednesday of the running week (docs/decisions/fartlek-skapa-block.md).
  const WED = addDays(MONDAY, 2);
  const runner = seed({ weeks: 3, ctl: 42, atl: 53.5, kmBefore: [40, 41, 42], tolerance: { km: 46, peakKm: 46, peakWeek: addDays(MONDAY, -28), weeksAgo: 4 },
    runDays: [1, 2, 3, 4, 6, 0], longestKm: 16, roles: ["build", "build", "lighter"] });
  const easy = (date: string, km: number): SuggestItem => ({ date, type: "easy", km, durationMin: null, steps: null });
  const from = (s: BlockSeed) => planRange(s, { from: WED, to: addDays(MONDAY, 20) });

  it("keeps the first week's build target and drops only the days that are over when nothing was run on them", () => {
    const whole = suggestBlock(runner);
    const p = from({ ...runner, done: { before: WED, items: [] } });
    const w0 = p.suggestion.weeks[0];
    expect(w0.role).toBe("build");
    expect(w0.targetKm).toBe(whole.weeks[0].targetKm);
    // The days ahead are the whole week's sessions on them: what Monday and Tuesday held is not made up.
    expect(p.items[0]).toEqual(whole.weeks[0].items.filter((it) => it.date >= WED));
    expect(weekKm(p.items[0])).toBeGreaterThan(0.6 * w0.targetKm);
    expect(p.items[0].every((it) => it.date >= WED)).toBe(true);
  });

  it("plans the days ahead so what was run and what is planned come to about the target, and counts the runs", () => {
    const ran = [easy(MONDAY, 6), easy(addDays(MONDAY, 1), 7)];
    const p = from({ ...runner, done: { before: WED, items: ran } });
    const w0 = p.suggestion.weeks[0];
    const total = 13 + weekKm(p.items[0]);
    expect(total).toBeLessThanOrEqual(w0.targetKm + 0.5);
    expect(total).toBeGreaterThan(w0.targetKm - 4);
    // The evaluation counts the runs already done: the week's km and its load.
    expect(p.eval.weeks[0].km).toBeCloseTo(total, 1);
    const blind = evaluateBlock(runner, p.items);
    expect(p.eval.weeks[0].atl).toBeGreaterThan(blind.weeks[0].atl);
    // Run more than planned on Monday and Tuesday: the days ahead shrink so the week never passes its target.
    const big = from({ ...runner, done: { before: WED, items: [easy(MONDAY, 14), easy(addDays(MONDAY, 1), 12)] } });
    expect(26 + weekKm(big.items[0])).toBeLessThanOrEqual(big.suggestion.weeks[0].targetKm + 0.5);
    expect(big.items[0].every((it) => it.date >= WED)).toBe(true);
  });

  it("changes nothing for a block on a week not begun", () => {
    expect(suggestBlock({ ...runner, done: null })).toEqual(suggestBlock(runner));
    expect(evaluateBlock({ ...runner, done: null }, suggestBlock(runner).weeks.map((w) => w.items))).toEqual(evaluateBlock(runner, suggestBlock(runner).weeks.map((w) => w.items)));
  });

  it("judges the run days on whole weeks", () => {
    const four = { ...runner, runDays: [2, 4, 6, 0] };
    const clipped = from({ ...four, done: { before: WED, items: [] } });
    expect(blockDaysAdvice({ ...four, done: { before: WED, items: [] } }, clipped.suggestion.weeks)).toEqual(blockDaysAdvice(four, suggestBlock(four).weeks));
  });
});

describe("blockDaysAdvice", () => {
  // A runner of about 40 km a week on four days, a 46 km week a month back, heavy form; the block starts in the
  // running week, so its Monday and Tuesday are over and the plan is clipped to the days ahead (as the route does).
  const runner = seed({ weeks: 3, ctl: 40, atl: 51, kmBefore: [38, 40, 42], tolerance: { km: 46, peakKm: 46, peakWeek: null, weeksAgo: 4 },
    runDays: [2, 4, 6, 0], longestKm: 16 });
  const running = (s: BlockSeed) => {
    const p = planRange(s, { from: addDays(MONDAY, 2), to: addDays(MONDAY, 20) });
    return p.suggestion.weeks.map((w, i) => ({ ...w, items: p.items[i] }));
  };

  it("asks for a day only when adding it settles the plan, so accepting never loops up to seven days", () => {
    let s = runner;
    const asked: number[] = [];
    for (let i = 0; i < 7; i++) {
      const a = blockDaysAdvice(s, running(s));
      if (!a) break;
      asked.push(s.runDays.length);
      expect(a.free.length).toBeGreaterThan(0);
      s = { ...s, runDays: [...s.runDays, a.free[0]] };
    }
    // At most the one day the peak week calls for (46 km: five days), never a run of questions up to seven.
    expect(asked.length).toBeLessThanOrEqual(1);
    expect(s.runDays.length).toBeLessThan(7);
  });

  it("judges the days on whole weeks, not on a week clipped to the days ahead", () => {
    const five = { ...runner, runDays: [2, 3, 4, 6, 0] };
    expect(blockDaysAdvice(five, suggestBlock(five).weeks)).toBeNull();
    expect(blockDaysAdvice(five, running(five))).toBeNull();
  });
});

describe("gym and other-sport days (docs/decisions/fartlek-gym-cross-days.md)", () => {
  // The reference week: gym Monday, swimming Thursday, a bike ride Saturday; runs Tuesday, Wednesday, Friday and Sunday.
  const extra = { gym: [1], cross: [{ day: 4, min: 45 }, { day: 6, min: 60 }] };
  const runner = seed({ weeks: 4, ctl: 40, atl: 44, kmBefore: [36, 38, 40], tolerance: { km: 42, peakKm: 42, peakWeek: null, weeksAgo: 3 },
    runDays: [2, 3, 5, 0], longestKm: 16, extra });

  it("puts gym and other sport on their days, never a run there, and the quality session away from the day after gym", () => {
    const s = suggestBlock(runner);
    for (const w of s.weeks) {
      const on = (wd: number) => w.items.filter((it) => weekday(it.date) === wd);
      expect(on(1).map((it) => it.type)).toEqual(["strength"]);
      expect(on(4).map((it) => [it.type, it.durationMin])).toEqual([["cross", 45]]);
      expect(on(6).map((it) => [it.type, it.durationMin])).toEqual([["cross", 60]]);
      const runs = w.items.filter((it) => it.type !== "strength" && it.type !== "cross");
      expect(runs.every((it) => [2, 3, 5, 0].includes(weekday(it.date)))).toBe(true);
      // One quality session: Wednesday or Friday, never Tuesday, the day after gym.
      const thr = w.items.filter((it) => it.type === "threshold");
      if (thr.length === 1) expect([3, 5]).toContain(weekday(thr[0].date));
      // Gym and other sport add no run km.
      expect(weekKm(w.items)).toBe(weekKm(runs));
    }
  });

  it("keeps the quality session off the day after gym without gym days moving anything else", () => {
    const plain = suggestBlock({ ...runner, extra: null, runDays: [2, 3, 5, 0] });
    const thrDays = plain.weeks.flatMap((w) => w.items.filter((it) => it.type === "threshold").map((it) => weekday(it.date)));
    // Gym on Tuesday instead: Wednesday is the day after it, so the session goes to Friday when it was on Wednesday.
    const gymTue = suggestBlock({ ...runner, extra: { gym: [2], cross: [] }, runDays: [3, 5, 0] });
    const after = gymTue.weeks.flatMap((w) => w.items.filter((it) => it.type === "threshold" && it.blueprint == null).map((it) => weekday(it.date)));
    expect(thrDays.length).toBeGreaterThan(0);
    expect(after.every((d) => d !== 3)).toBe(true);
  });

  it("never offers a gym or other-sport day as an extra run day", () => {
    const big = { ...runner, kmBefore: [50, 52, 54], tolerance: { km: 56, peakKm: 56, peakWeek: null, weeksAgo: 1 }, longestKm: 20, runDays: [2, 0] };
    const a = blockDaysAdvice(big, suggestBlock(big).weeks);
    expect(a).not.toBeNull();
    expect(a!.free.some((d) => [1, 4, 6].includes(d))).toBe(false);
  });

  // A week of about 55 km on four run days, every other day taken: Monday gym, Thursday swimming, Saturday a ride.
  const full = { ...runner, kmBefore: [52, 54, 55], tolerance: { km: 58, peakKm: 58, peakWeek: null, weeksAgo: 1 }, longestKm: 20, ctl: 55, atl: 58 };
  const doubles = (w: { items: SuggestItem[] }) => w.items.filter((it) => it.double);

  it("puts no double anywhere while doubles are off, and offers them when no day is free", () => {
    const s = suggestBlock(full);
    expect(s.weeks.flatMap(doubles)).toEqual([]);
    const a = blockDaysAdvice(full, s.weeks);
    expect(a).toMatchObject({ free: [], doubles: true });
  });

  it("allowed after gym: a short easy run on the gym day when the run days don't hold the week, never on a cross-training day", () => {
    const s = suggestBlock({ ...full, extra: { ...extra, doubles: "gym" } });
    const d = s.weeks.filter((w) => w.role === "build").flatMap(doubles);
    expect(d.length).toBeGreaterThan(0);
    for (const it of d) {
      expect(weekday(it.date)).toBe(1);
      expect(it.type).toBe("easy");
      expect(it.km).toBeLessThanOrEqual(5);
      expect(it.steps).toBeNull();
    }
    // The gym session is still there, and the week asks no more.
    expect(s.weeks[0].items.filter((it) => weekday(it.date) === 1).map((it) => it.type).sort()).toEqual(["easy", "strength"]);
    expect(blockDaysAdvice({ ...full, extra: { ...extra, doubles: "gym" } }, s.weeks)).toBeNull();
  });

  it("never puts a double on the day before the long run", () => {
    const sat = { gym: [6], cross: [], doubles: "all" as const };
    const s = suggestBlock({ ...full, extra: sat, runDays: [2, 3, 5, 0] });
    expect(s.weeks.flatMap(doubles)).toEqual([]);
  });
});

describe("markDoubles", () => {
  it("keeps gym as the day's own session and makes the run beside it the double", () => {
    const run: SuggestItem = { date: MONDAY, type: "easy", km: 5, durationMin: null, steps: null };
    const gym: SuggestItem = { date: MONDAY, type: "strength", km: 0, durationMin: 60, steps: null };
    expect(markDoubles([run, gym])).toEqual([gym, { ...run, double: true }]);
    // Alone on its day, a run is never a double.
    expect(markDoubles([{ ...run, double: true }])).toEqual([run]);
  });
});
