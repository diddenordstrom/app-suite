import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "./dates";
import { BLUEPRINTS, parseBlueprintTag } from "./blueprints";
import { suggestBlock, raceRoles, type BlockSeed } from "./blockplan";
import { COACH } from "./coach";
import { NEXT } from "./nextweek";
import { RACE_PHASE, type PhaseSeed } from "./racephase";
import type { StepRefs } from "./steps";

// The race phase in the planner (docs/decisions/fartlek-race-specific-phase.md, build plan step 4).
const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const MONDAY = "2026-11-16";

const phase = (race: string, kind: "marathon" | "half" = "marathon"): PhaseSeed => ({
  race: { date: race, kind }, paces: { mp: 300, hmp: 285 }, paceSource: "prediction", backOff: false, injury: false,
  steps: Object.fromEntries(BLUEPRINTS.map((b) => [b.id, 0])) as PhaseSeed["steps"],
});

/** A runner at `km` a week, an A race `weeks` weeks out (the race on the given weekday of the last week, Monday = 0). */
function plan(km: number, o: { weeks?: number; raceDay?: number; kind?: "marathon" | "half"; runDays?: number[] } = {}) {
  const weeks = o.weeks ?? 8;
  const race = addDays(MONDAY, (weeks - 1) * 7 + (o.raceDay ?? 5));
  const seed: BlockSeed = {
    startWeek: MONDAY, weeks, ctl: km * 0.9, atl: km * 0.95, kmBefore: [km, km, km], past: [],
    tolerance: { km, peakKm: km, peakWeek: "2026-10-05", weeksAgo: 3 },
    runDays: o.runDays ?? [1, 2, 4, 6, 0], longRunDay: 0,
    threshold: { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 }, refs: REFS,
    crossMin: 0, lighterLast: false, goalKm: null, buildWeeksDone: 0, hardBefore: false,
    longestKm: Math.round(km * 0.34), rung: 0, tempoPace: 275,
    roles: raceRoles(weeks, "A"), race: { date: race, priority: "A" }, phase: phase(race, o.kind),
  };
  return { seed, race, s: suggestBlock(seed) };
}

const tagged = (items: { blueprint?: string | null; type: string }[]) => items.filter((it) => it.blueprint);

describe("the race phase in the plan", () => {
  it("under 60 km a week: one long run and one tagged quality session in each build week, no threshold ladder", () => {
    const { s } = plan(45);
    for (const w of s.weeks.filter((x) => x.role === "build")) {
      expect(w.items.filter((it) => it.type === "long"), w.weekStart).toHaveLength(1);
      const quality = w.items.filter((it) => it.type === "threshold");
      expect(quality, w.weekStart).toHaveLength(1);
      expect(quality[0].blueprint, w.weekStart).toBeTruthy();
    }
    // The long run is a blueprint on the weeks the schedule says so, and every tag reads back.
    for (const it of s.weeks.flatMap((w) => w.items)) if (it.blueprint) expect(parseBlueprintTag(it.blueprint)).not.toBeNull();
    expect(s.weeks.flatMap((w) => w.items).some((it) => it.type === "long" && it.blueprint)).toBe(true);
  });

  it("at 70 km a build week keeps the ladder rung as a third session", () => {
    const { s } = plan(70);
    const builds = s.weeks.filter((x) => x.role === "build" && x.targetKm >= RACE_PHASE.highKm);
    expect(builds.length).toBeGreaterThan(0);
    for (const w of builds) {
      const thr = w.items.filter((it) => it.type === "threshold");
      expect(thr.filter((it) => it.blueprint), w.weekStart).toHaveLength(1);
      expect(thr.filter((it) => !it.blueprint), w.weekStart).toHaveLength(1);
    }
    // A lighter week and the taper keep to the blueprint's one session.
    for (const w of s.weeks.filter((x) => x.role === "lighter" || x.role === "taper")) expect(w.items.filter((it) => it.type === "threshold" && !it.blueprint)).toHaveLength(0);
  });

  it("steps each blueprint on along the plan, and a held session in the lighter week never advances", () => {
    const { s } = plan(45);
    const step = (tag: string) => parseBlueprintTag(tag)!;
    const tempo = s.weeks.flatMap((w) => w.items).map((it) => it.blueprint).filter((b): b is string => !!b && b.startsWith("mp-tempo")).map(step);
    expect(tempo.map((x) => x.step)).toEqual([0, 1, 1, 2]);
    expect(tempo.map((x) => x.held)).toEqual([false, false, true, false]);
  });

  it("places a marathon's dress rehearsal 9–13 days before the race, whatever weekday it is on", () => {
    for (let day = 0; day < 7; day++) {
      const { race, s } = plan(45, { raceDay: day });
      const d = s.weeks.flatMap((w) => w.items).filter((it) => it.blueprint?.startsWith("dress-rehearsal"));
      expect(d, `race on weekday ${day}`).toHaveLength(1);
      const out = daysBetween(d[0].date, race);
      expect(out, `race on weekday ${day}`).toBeGreaterThanOrEqual(9);
      expect(out, `race on weekday ${day}`).toBeLessThanOrEqual(13);
      // Never beside the long run.
      expect(s.weeks.flatMap((w) => w.items).filter((it) => it.type === "long").map((it) => it.date)).not.toContain(d[0].date);
    }
  });

  it("leaves a half marathon without a dress rehearsal", () => {
    const { s } = plan(45, { kind: "half" });
    expect(s.weeks.flatMap((w) => w.items).some((it) => it.blueprint?.startsWith("dress-rehearsal"))).toBe(false);
    expect(tagged(s.weeks.flatMap((w) => w.items)).length).toBeGreaterThan(0);
  });

  it("keeps every long run under the ceiling and the 30-day rule, at any volume", () => {
    for (const km of [35, 45, 70]) {
      const { s } = plan(km);
      for (const w of s.eval.weeks) expect(w.spike, `${km} km, ${w.weekStart}`).toBeNull();
      for (const it of s.weeks.flatMap((w) => w.items)) {
        if (it.type !== "long") continue;
        expect(it.km).toBeLessThanOrEqual(Math.min(NEXT.longCeiling.km, (NEXT.longCeiling.min * 60) / REFS.easyPace!) + 0.05);
      }
    }
  });

  it("warns at 35 km a week and never refuses", () => {
    const { s } = plan(35);
    expect(s.weeks.length).toBe(8);
    expect(s.phaseWarnings?.lowWeek).not.toBeNull();
    expect(s.phaseWarnings?.lowWeek?.km).toBeLessThan(RACE_PHASE.warn.weekKm);
    expect(s.phaseWarnings?.shortLong).not.toBeNull();
    expect(plan(70).s.phaseWarnings?.lowWeek).toBeNull();
  });

  it("lands race-day form in the window", () => {
    for (const km of [35, 45, 70]) {
      const f = plan(km).s.eval.race?.form;
      expect(f, `${km} km`).toBeGreaterThanOrEqual(COACH.race.low);
      expect(f, `${km} km`).toBeLessThanOrEqual(COACH.race.high);
    }
  });

  it("plans a phase that starts inside it: a half six weeks out uses the bottom of the schedule", () => {
    const { s } = plan(40, { weeks: 6, kind: "half" });
    const tags = tagged(s.weeks.flatMap((w) => w.items)).map((it) => parseBlueprintTag(it.blueprint!)!.id);
    expect(tags).toContain("hmp-repeats");
    expect(tags).toContain("hmp-alternations");
  });

  it("changes nothing without a phase seed", () => {
    const { seed } = plan(45);
    const off = suggestBlock({ ...seed, phase: undefined });
    expect(off.weeks.flatMap((w) => w.items).some((it) => it.blueprint)).toBe(false);
    expect(off.phaseWarnings).toBeNull();
  });
});
