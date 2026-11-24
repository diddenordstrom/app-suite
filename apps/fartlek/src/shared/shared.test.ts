import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isoWeek, range, weekNumber, weekStartOf, monthEnd } from "./dates";
import { fmtPace, fmtDuration, parseGoalTime, parsePace, fmtDist, fmtNum } from "./format";
import { parseWeekLine, parseBlock, placeSessions } from "./parser";
import { matchWeek } from "./matching";
import { summarizeWeek, summarizeMonth } from "./compliance";
import { activityLoad, edwardsTrimp, formPct, formState, pmc, plannedLoad } from "./load";
import { easyScore, gradeEasy, zoneSecsFromStream, zonesFromMaxHr, paceInBand, intensityDistribution } from "./zones";
import { intervalLaps, rangeCheck, thresholdOn, sessionPoint, proposeThreshold } from "./threshold";
import { painTrends, trendOf, readiness, goalPace, neededThreshold, countdown, type ReadinessInput } from "./recovery";
import { displayName, parseSettings, DEFAULT_SETTINGS, type Activity, type Workout, type Wellness } from "./types";

const act = (p: Partial<Activity> & { id: string; date: string; km?: number }): Activity => ({
  name: "Run", typeKey: "running", startTimeLocal: `${p.date} 07:00:00`, distanceM: (p.km ?? 0) * 1000, durationS: (p.km ?? 0) * 330,
  avgHr: 140, maxHr: 160, elevationGain: null, zoneSecs: null, isRun: true, thresholdFlag: false, hasDetail: false, ...p,
});
const wo = (p: Partial<Workout> & { id: number; date: string }): Workout => ({
  type: "easy", distanceKm: null, durationMin: null, zone2: false, notes: null, status: "planned", skipReason: null,
  manualActivityId: null, manualUnlinked: false, steps: null, blueprint: null, ...p,
});

describe("week numbers", () => {
  it("follows ISO 8601", () => {
    expect(isoWeek("2026-11-11")).toBe(46);
    expect(isoWeek("2026-01-01")).toBe(1); // a Thursday
    expect(isoWeek("2024-12-30")).toBe(1); // Monday of 2025's week 1
    expect(isoWeek("2021-01-03")).toBe(53); // Sunday still in 2020's week 53
  });
  it("numbers Sunday-start weeks by the Monday week they mostly overlap", () => {
    expect(weekNumber("2026-11-09")).toBe(46);
    expect(weekNumber("2026-11-08")).toBe(46);
  });
});

describe("types", () => {
  it("displayName falls back", () => {
    expect(displayName({ name: null, email: "a@b", sub: "x" })).toBe("a@b");
    expect(displayName({ name: null, email: null, sub: "x" })).toBe("x");
  });
  it("settings validation", () => {
    expect(parseSettings({ ...DEFAULT_SETTINGS, zones: [120, 140, 155, 170] })).not.toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, zones: [140, 120, 155, 170] })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, easyLow: 150, easyHigh: 140 })).toBeNull();
    expect(parseSettings({ ...DEFAULT_SETTINGS, timezone: "Mars/Base" })).toBeNull();
  });
});

describe("dates + format", () => {
  it("weeks", () => {
    expect(weekStartOf("2026-11-08", "monday")).toBe("2026-11-02");
    expect(weekStartOf("2026-11-08", "sunday")).toBe("2026-11-08");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
  });
  it("formats", () => {
    expect(fmtPace(299, "metric")).toBe("4:59/km");
    expect(fmtDuration(8580)).toBe("2h23");
    expect(fmtDuration(2710)).toBe("45:10");
    expect(parseGoalTime("3:30")).toBe(12600);
    expect(parseGoalTime("1:35:00")).toBe(5700);
    expect(parsePace("4:41", "metric")).toBe(281);
    expect(fmtDist(10, "imperial")).toBe("6.2 mi");
    expect(fmtDist(40.25, "metric", 1, "sv-SE")).toBe("40,3 km");
    expect(fmtDist(1234.5, "metric", 1, "en-GB")).toBe("1234.5 km");
    expect(fmtNum(12, 0, 1, "sv-SE")).toBe("12");
    expect(fmtNum(12.4, 0, 1, "sv-SE")).toBe("12,4");
  });
});

describe("quick-add parser", () => {
  it("old syntax", () => {
    const w = parseWeekLine("6 zone 2, 9 tröskel; 15 long run");
    expect(w.sessions.map((s) => [s.type, s.distance])).toEqual([["easy", 6], ["threshold", 9], ["long", 15]]);
  });
  it("long run zone 2, decimals, durations, totals, backoff", () => {
    expect(parseWeekLine("15 long run zone 2").sessions[0]).toMatchObject({ type: "long", zone2: true });
    expect(parseWeekLine("6,5 easy").sessions[0].distance).toBe(6.5);
    expect(parseWeekLine("45min easy").sessions[0]).toMatchObject({ durationMin: 45, distance: null });
    expect(parseWeekLine("4 20").totals).toEqual({ runs: 4, distance: 20 });
    const b = parseWeekLine("5 easy, 10 lång ... backoff");
    expect(b.backoff).toBe(true);
    expect(b.sessions).toHaveLength(2);
    expect(parseWeekLine("6 wibble").errors).toHaveLength(1);
  });
  it("blocks are one line per week", () => {
    expect(parseBlock("6 easy\n8 easy, 12 long\n")).toHaveLength(2);
  });
  it("places long run on last usual day", () => {
    const days = placeSessions("2026-11-02", parseWeekLine("6 easy, 9 threshold, 15 long").sessions, [2, 4, 0]);
    expect(days).toEqual(["2026-11-03", "2026-11-05", "2026-11-08"]);
  });
});

describe("matching", () => {
  it("threshold runs take threshold sessions, rest by closest gap; date only breaks ties", () => {
    const ws = [wo({ id: 1, date: "2026-11-03", distanceKm: 6 }), wo({ id: 2, date: "2026-11-05", type: "threshold", distanceKm: 9 }), wo({ id: 3, date: "2026-11-08", type: "long", distanceKm: 15 })];
    const as = [act({ id: "a", date: "2026-11-02", km: 14 }), act({ id: "b", date: "2026-11-04", km: 10, name: "Tröskel 3x10" }), act({ id: "c", date: "2026-11-07", km: 6.2 })];
    const m = Object.fromEntries(matchWeek(ws, as).map((x) => [x.workoutId, [x.activityId, x.matchedBy]]));
    expect(m).toEqual({ 1: ["c", "closest"], 2: ["b", "threshold"], 3: ["a", "closest"] });
  });
  it("gym fills a gym session and never a cross-train one; swim fills cross-train", () => {
    const ws = [wo({ id: 1, date: "2026-11-02", type: "strength", durationMin: 30 }), wo({ id: 2, date: "2026-11-05", type: "cross", durationMin: 30 })];
    const gym = act({ id: "g", date: "2026-11-02", typeKey: "strength_training", isRun: false, durationS: 1800 });
    const swim = act({ id: "s", date: "2026-11-05", typeKey: "lap_swimming", isRun: false, durationS: 1800 });
    expect(matchWeek(ws, [gym, swim])).toEqual([{ workoutId: 1, activityId: "g", matchedBy: "cross" }, { workoutId: 2, activityId: "s", matchedBy: "cross" }]);
    expect(matchWeek([ws[1]], [gym])).toEqual([]);
    expect(matchWeek([ws[0]], [swim])).toEqual([]);
  });
  it("manual link and unlink win", () => {
    const ws = [wo({ id: 1, date: "2026-11-03", distanceKm: 6, manualActivityId: "b" }), wo({ id: 2, date: "2026-11-05", distanceKm: 6, manualUnlinked: true })];
    const as = [act({ id: "a", date: "2026-11-03", km: 6 }), act({ id: "b", date: "2026-11-04", km: 12 })];
    expect(matchWeek(ws, as)).toEqual([{ workoutId: 1, activityId: "b", matchedBy: "manual" }]);
  });
});

describe("compliance", () => {
  const ws = [wo({ id: 1, date: "2026-11-03", distanceKm: 10 }), wo({ id: 2, date: "2026-11-05", distanceKm: 10 }), wo({ id: 3, date: "2026-11-08", type: "long", distanceKm: 20 })];
  it("one missed session alone never makes a week behind", () => {
    const s = summarizeWeek("2026-11-02", ws, [act({ id: "a", date: "2026-11-03", km: 10 }), act({ id: "b", date: "2026-11-08", km: 20 })], null, "2026-11-12");
    expect(s.missed).toBe(1);
    expect(s.status).toBe("on_track");
  });
  it("past week far below is behind, way above is overreaching, current is in progress", () => {
    expect(summarizeWeek("2026-11-02", ws, [act({ id: "a", date: "2026-11-03", km: 8 })], null, "2026-11-12").status).toBe("behind");
    expect(summarizeWeek("2026-11-02", ws, [act({ id: "a", date: "2026-11-03", km: 60 })], null, "2026-11-12").status).toBe("overreaching");
    expect(summarizeWeek("2026-11-02", ws, [], null, "2026-11-04").status).toBe("in_progress");
  });
  it("outcomes: done/short/to do; extras", () => {
    const s = summarizeWeek("2026-11-02", ws, [act({ id: "a", date: "2026-11-03", km: 8 }), act({ id: "x", date: "2026-11-04", km: 3, isRun: false, typeKey: "cycling" })], null, "2026-11-04");
    expect(s.sessions.map((x) => x.outcome)).toEqual(["short", "to_do", "to_do"]);
    expect(s.extras.map((a) => a.id)).toEqual(["x"]);
  });
  it("month", () => {
    const w = summarizeWeek("2026-11-02", ws, [act({ id: "a", date: "2026-11-03", km: 40 })], null, "2026-11-12");
    expect(summarizeMonth([w], true).status).toBe("on_track");
  });
});

describe("load", () => {
  it("rTSS at threshold pace for an hour is 100", () => {
    expect(activityLoad({ typeKey: "running", isRun: true, distanceM: 12000, durationS: 3600, avgHr: 170 }, { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 300, hr: 170 })).toEqual({ load: 100, method: "rTSS" });
    expect(activityLoad({ typeKey: "treadmill_running", isRun: true, distanceM: 12000, durationS: 3600, avgHr: 170 }, { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 300, hr: 170 }).method).toBe("hrTSS");
    expect(activityLoad({ typeKey: "running", isRun: true, distanceM: 12000, durationS: 3600, avgHr: null }, null)).toEqual({ load: 55, method: "duration" });
  });
  it("pmc", () => {
    const series = pmc(new Map([["2026-11-01", 100]]), "2026-11-01", "2026-11-03");
    expect(series[0]).toMatchObject({ ctl: 2.4, atl: 14.3, tsb: 0 });
    expect(series[1].tsb).toBeCloseTo(2.4 - 14.3, 0);
  });
  it("planned load", () => {
    expect(plannedLoad(wo({ id: 1, date: "2026-11-01", type: "rest" }), null)).toBe(0);
    expect(plannedLoad(wo({ id: 1, date: "2026-11-01", durationMin: 60, type: "threshold" }), null)).toBe(81);
  });
});

describe("zones + threshold", () => {
  const stream = { t: [0, 5, 10, 15], hr: [130, 150, 170, null], speed: [3, 3, 4, 4], alt: [null, null, null, null] };
  it("zones from stream and easy score", () => {
    expect(zoneSecsFromStream(stream, zonesFromMaxHr(200))).toEqual([0, 5, 5, 5, 0]);
    expect(easyScore(null, stream, { easyHigh: 155 })).toBeCloseTo(2 / 3);
    expect(easyScore([600, 300, 100, 0, 0], null, { easyHigh: null })).toBe(0.9);
    expect(gradeEasy(0.85)).toBe("ok");
  });
  it("pace in band needs 5 minutes", () => {
    expect(paceInBand(stream, 120, 160)).toBeNull();
    const long = { t: Array.from({ length: 80 }, (_, i) => i * 5), hr: Array(80).fill(145), speed: Array(80).fill(3.333), alt: Array(80).fill(null) };
    expect(Math.round(paceInBand(long, 140, 150)!.pace)).toBe(300);
  });
  it("distribution", () => {
    expect(intensityDistribution([[50, 30, 10, 5, 5]]).low).toBeCloseTo(0.8);
  });
  it("interval laps, range, proposal", () => {
    const laps = [
      { index: 0, distanceM: 2000, durationS: 700, avgHr: 130 },
      { index: 1, distanceM: 2000, durationS: 570, avgHr: 168 },
      { index: 2, distanceM: 400, durationS: 150, avgHr: 140 },
      { index: 3, distanceM: 2000, durationS: 575, avgHr: 170 },
    ];
    expect(intervalLaps(laps).map((l) => l.index)).toEqual([1, 3]);
    expect(rangeCheck(281 - 16, 281)).toBe("above");
    expect(rangeCheck(301, 281)).toBe("in");
    expect(rangeCheck(302, 281)).toBe("below");
    const thr = [{ id: 1, effectiveDate: "2026-06-01", paceSecPerKm: 300, hr: 165 }, { id: 2, effectiveDate: "2026-09-01", paceSecPerKm: 290, hr: 166 }];
    expect(thresholdOn(thr, "2026-10-01")?.id).toBe(2);
    expect(thresholdOn(thr, "2026-01-01")?.id).toBe(1);
    const p = sessionPoint({ date: "2026-11-01", laps })!;
    expect(p.intervals).toBe(2);
    expect(proposeThreshold([p, { ...p, date: "2026-11-05" }], thr[0], "2026-11-08")?.paceSecPerKm).toBe(286);
  });
  describe("interval laps in a real 4 × 4 min session", () => {
    // Warm-up 7:02 and 6:48 (2:58), reps 5:17 · 5:10 · 5:06 · 5:00 with 2 min rest, then 5:23 at 6:40.
    const lap = (index: number, distanceM: number, durationS: number) => ({ index, distanceM, durationS, avgHr: 170 });
    const laps = [lap(1, 1000, 422), lap(2, 437, 178), lap(3, 757, 240), lap(4, 208, 120), lap(5, 774, 240), lap(6, 213, 120),
      lap(7, 784, 240), lap(8, 197, 120), lap(9, 800, 240), lap(10, 808, 323)];
    it("with an estimate: every rep up to 10 % slower than threshold, even when the last one was fastest", () => {
      expect(intervalLaps(laps, 321).map((l) => l.index)).toEqual([3, 5, 7, 9]); // 5:21 → up to 5:53
    });
    it("without one: near the median of the work laps, not the fastest", () => {
      expect(intervalLaps(laps).map((l) => l.index)).toEqual([3, 5, 7, 9]);
    });
    it("an estimate far too fast falls back instead of finding nothing", () => {
      expect(intervalLaps(laps, 240).map((l) => l.index)).toEqual([3, 5, 7, 9]);
    });
  });
});

describe("recovery + races", () => {
  it("pain trend", () => {
    expect(trendOf([0, 0, 2, 3, 4])).toBe("rising");
    const runs = ["a", "b", "c"].map((id, i) => ({ id, date: `2026-11-0${i + 1}` }));
    const t = painTrends(runs, [{ id: 1, date: "2026-11-03", activityId: "c", area: "knee", level: 4, note: null }]);
    expect(t[0]).toMatchObject({ area: "knee", levels: [0, 0, 4], trend: "rising" });
  });
  describe("readiness", () => {
    const today = "2026-11-08";
    /** `perDay` km on each of the 28 days before today, `last7` overriding the latest week. */
    const km = (perDay: number, last7 = perDay, onToday = 0) => new Map(
      [...range(addDays(today, -28), addDays(today, -1)).map((d) => [d, daysBetween(d, today) <= 7 ? last7 : perDay] as const), [today, onToday] as const],
    );
    const base: ReadinessInput = { today, dailyKm: km(5), firstActivity: "2026-09-01", tsb: null, painTrends: [], pain: [], wellness: [], checkins: [] };
    const w = (date: string, v: Partial<Wellness>): Wellness => ({ date, hrvWeeklyAvg: null, hrvLastNight: null, hrvBaselineLow: null, restingHr: null, bodyBatteryMax: null, sleepScore: null, ...v });
    const r = (i: Partial<ReadinessInput>) => readiness({ ...base, ...i });
    const pts = (i: Partial<ReadinessInput>, key: string) => r(i).signals.find((s) => s.key === key)!.points;

    it("needs something besides pain to go on", () => {
      expect(r({ dailyKm: new Map(), firstActivity: null }).score).toBeNull();
      expect(r({})).toMatchObject({ score: 10, verdict: "fine", uncertain: true }); // steady km only, no HRV or resting HR
    });
    it("km: acute vs 28-day weekly average, sliding from 1.3 to 1.5", () => {
      expect(r({ dailyKm: km(5, 10) }).score).toBe(8); // 70 km vs 43.75 a week = 1.6
      expect(pts({ dailyKm: km(5, 6) }, "km")).toBe(0); // 42 vs 36.75 = 1.14
      expect(pts({ dailyKm: km(5, 8.5) }, "km")).toBe(1.5); // 59.5 vs 41.1 = 1.45
      expect(pts({ dailyKm: km(5, 5, 20) }, "km")).toBe(0); // today's run isn't counted
      expect(r({ firstActivity: "2026-10-20" }).signals.find((s) => s.key === "km")!.value).toBeNull(); // under 4 weeks of history
    });
    it("sleep slides from 70 to 40, and 8.5 rounds down", () => {
      expect(r({ wellness: [w(today, { sleepScore: 82 })] }).score).toBe(10);
      expect(pts({ wellness: [w(today, { sleepScore: 55 })] }, "sleep")).toBe(1);
      expect(r({ wellness: [w(today, { sleepScore: 40 })] }).score).toBe(8); // 10 − 1.5
      expect(pts({ wellness: [w("2026-11-06", { sleepScore: 40 })] }, "sleep")).toBe(0); // too old
    });
    it("says what took it down: 1 for sleep and 1 for km is still a go", () => {
      // 56 km this week vs (21 × 5 + 56) / 4 = 40.25 a week → 1.39
      const x = r({ dailyKm: km(5, 8), wellness: [w(today, { sleepScore: 55 })] });
      expect(x.signals.filter((s) => s.points > 0).map((s) => [s.key, s.points])).toEqual([["km", 1], ["sleep", 1]]);
      expect(x).toMatchObject({ score: 8, verdict: "fine" });
    });
    it("HRV: last 2 nights vs Garmin's baseline low", () => {
      const hrv = (a: number, b: number | null) => [w("2026-11-07", { hrvLastNight: a, hrvBaselineLow: 52 }), w(today, { hrvLastNight: b, hrvBaselineLow: 52 })];
      expect(pts({ wellness: hrv(60, 58) }, "hrv")).toBe(0);
      expect(pts({ wellness: hrv(60, 36) }, "hrv")).toBe(1); // a crash after a hard session shows in the 2-night mean (48)
      expect(r({ wellness: hrv(40, 40) })).toMatchObject({ score: 7, verdict: "trim" }); // 23 % under → full 3
      expect(r({ wellness: hrv(60, null) }).signals.find((s) => s.key === "hrv")!.partial).toBe(true);
    });
    it("resting HR: last 3 days vs 28 days, 0.4 per beat", () => {
      const days = range(addDays(today, -27), today);
      const wellness = days.map((d) => w(d, { restingHr: daysBetween(d, today) < 3 ? 55 : 50 }));
      expect(pts({ wellness }, "rhr")).toBe(2); // +4.5 → 1.8 → 2
      expect(r({ wellness }).uncertain).toBe(true); // no HRV
      expect(pts({ wellness: wellness.slice(0, -3) }, "rhr")).toBe(0); // last 3 days missing → no data, not old data
      expect(r({ wellness: wellness.slice(0, -3) }).signals.find((s) => s.key === "rhr")!.value).toBeNull();
    });
    it("soreness: latest check-in, 3/5 costs 1", () => {
      const c = (date: string, soreness: number) => ({ date, soreness, feel: null, note: null });
      expect([3, 4, 5].map((n) => pts({ checkins: [c(today, n)] }, "soreness"))).toEqual([1, 2, 3]);
      expect(pts({ checkins: [c("2026-11-07", 4), c(today, 2)] }, "soreness")).toBe(0); // today's replaces yesterday's
      expect(pts({ checkins: [c("2026-11-06", 5)] }, "soreness")).toBe(0);
    });
    it("form below −25 costs up to 1.5", () => {
      expect(pts({ tsb: -20 }, "form")).toBe(0);
      expect(pts({ tsb: -34 }, "form")).toBe(1); // 9 of 15 points below −25
      expect(pts({ tsb: -50 }, "form")).toBe(1.5);
    });
    it("pain: 8+ means rest for 3 days, then it's an ordinary deduction", () => {
      const p = (date: string, level: number) => ({ id: 1, date, activityId: null, area: "knee", level, note: null });
      expect(r({ pain: [p("2026-11-06", 8)] })).toMatchObject({ verdict: "stop", veto: true, score: 2 });
      expect(r({ pain: [p("2026-11-05", 8)] })).toMatchObject({ verdict: "fine", veto: false, score: 9 });
      expect(r({ pain: [p("2026-10-30", 8)] }).score).toBe(10);
      expect(pts({ painTrends: [{ area: "knee", levels: [0, 4], latest: 4, trend: "rising" }], pain: [p(today, 6)] }, "pain")).toBe(2);
    });
    it("verdict follows the score", () => {
      const c = (soreness: number) => [{ date: today, soreness, feel: null, note: null }];
      expect(r({ checkins: c(4), wellness: [w(today, { sleepScore: 40 })] })).toMatchObject({ score: 6, verdict: "trim" }); // 10 − 2 − 1.5 = 6.5
      expect(r({ checkins: c(5), wellness: [w(today, { sleepScore: 40 })], tsb: -40 })).toMatchObject({ score: 4, verdict: "backOff" });
    });
  });
  it("race maths", () => {
    const gp = goalPace(12600, 42.195);
    expect(Math.round(gp)).toBe(299);
    expect(Math.round(neededThreshold(gp, 42.195))).toBe(269);
    expect(countdown("2026-11-08", "2026-11-19")).toEqual({ days: 11, weeks: 1, restDays: 4 });
  });
});

describe("edwardsTrimp", () => {
  it("weights minutes by zone number", () => {
    expect(edwardsTrimp([3600, 0, 0, 0, 0])).toBe(60);
    expect(edwardsTrimp([0, 1800, 1800, 0, 0])).toBe(30 * 2 + 30 * 3);
    expect(edwardsTrimp([0, 0, 0, 0, 600])).toBe(50);
  });
  it("is null without zone data", () => {
    expect(edwardsTrimp(null)).toBeNull();
    expect(edwardsTrimp([0, 0, 0, 0, 0])).toBeNull();
  });
});

describe("form state", () => {
  it("uses the FORM bands as a share of fitness, edges included", () => {
    // Fitness 100: the share is the number itself.
    expect([6, 5, -10, -11, -25, -26].map((f) => formState(f, 100))).toEqual(["fresh", "balanced", "balanced", "building", "building", "heavy"]);
    // Fitness 60: −9 is −15 %, building; −16 is −27 %, heavy.
    expect(formState(-9, 60)).toBe("building");
    expect(formState(-16, 60)).toBe("heavy");
    // Up to a fitness of 40 the share is taken of 40: −7.6 on 23 is −19 %, building (a pure share would say −33 %).
    expect(formPct(-7.6, 23)).toBeCloseTo(-19, 0);
    expect(formState(-7.6, 23)).toBe("building");
    expect(formState(-0.7, 23)).toBe("balanced");
    expect(formState(-11, 23)).toBe("heavy");
  });
});
