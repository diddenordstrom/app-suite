import { describe, expect, it } from "vitest";
import { addDays, daysBetween } from "./dates";
import { BLUEPRINTS, parseBlueprintTag } from "./blueprints";
import { suggestBlock, raceRoles, type BlockSeed } from "./blockplan";
import { COACH } from "./coach";
import { NEXT, thresholdReps } from "./nextweek";
import { RACE_PHASE, type PhaseSeed } from "./racephase";
import type { StepRefs } from "./steps";

// The race phase in the planner (docs/decisions/fartlek-race-specific-phase.md, build plan step 4).
const REFS: StepRefs = { thresholdPace: 255, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 330 };
const MONDAY = "2026-11-16";

const phase = (race: string, kind: "marathon" | "half" = "marathon", over: Partial<PhaseSeed> = {}, step = 0): PhaseSeed => ({
  race: { date: race, kind }, paces: { mp: 300, hmp: 285 }, paceSource: "prediction", backOff: false, injury: false,
  steps: Object.fromEntries(BLUEPRINTS.map((b) => [b.id, step])) as PhaseSeed["steps"], ...over,
});

/** A runner at `km` a week, an A race `weeks` weeks out (the race on the given weekday of the last week, Monday = 0). */
function plan(km: number, o: { weeks?: number; raceDay?: number; kind?: "marathon" | "half"; runDays?: number[]; injury?: boolean; backOff?: boolean; step?: number } = {}) {
  const weeks = o.weeks ?? 8;
  const race = addDays(MONDAY, (weeks - 1) * 7 + (o.raceDay ?? 5));
  const seed: BlockSeed = {
    startWeek: MONDAY, weeks, ctl: km * 0.9, atl: km * 0.95, kmBefore: [km, km, km], past: [],
    tolerance: { km, peakKm: km, peakWeek: "2026-10-05", weeksAgo: 3 },
    runDays: o.runDays ?? [1, 2, 4, 6, 0], longRunDay: 0,
    threshold: { id: 1, effectiveDate: "2026-01-01", paceSecPerKm: 255, hr: 169 }, refs: REFS,
    crossMin: 0, lighterLast: false, goalKm: null, buildWeeksDone: 0, hardBefore: false,
    longestKm: Math.round(km * 0.34), rung: 0, tempoPace: 275,
    roles: raceRoles(weeks, "A"), race: { date: race, priority: "A" }, phase: phase(race, o.kind, { injury: !!o.injury, backOff: !!o.backOff }, o.step ?? 0),
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

  it("in a block that starts before the phase, the ladder goes on from the build weeks before it instead of starting over", () => {
    const { s } = plan(70, { weeks: 10 });
    const at = s.weeks.filter((w) => w.role === "build").map((w) => {
      const r = thresholdReps(w.items.find((it) => it.type === "threshold" && !it.blueprint)?.steps ?? null);
      return r ? NEXT.ladder.findIndex((x) => x.reps === r.reps && x.min === r.min) : -1;
    }).filter((i) => i >= 0);
    expect(at.length).toBeGreaterThan(2);
    for (let i = 1; i < at.length; i++) expect(at[i], `ladder ${at.join(", ")}`).toBeGreaterThanOrEqual(Math.min(at[i - 1] + 1, NEXT.ladder.length - 1));
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

  it("holds every step in an injury and changes nothing but those steps", () => {
    // Both without the deep aim (an injury turns it off), so only the steps can differ.
    const calm = plan(45, { step: 1, backOff: true }), hurt = plan(45, { step: 1, injury: true });
    const sessions = (x: typeof calm) => x.s.weeks.flatMap((w) => w.items);
    // Same weeks, the key sessions on the same days, same km a week (a held step is shorter, so zone 2 may get one more run).
    const keys = (x: typeof calm) => sessions(x).filter((it) => it.type !== "easy");
    expect(hurt.s.weeks.map((w) => w.targetKm)).toEqual(calm.s.weeks.map((w) => w.targetKm));
    expect(keys(hurt).map((it) => [it.date, it.type])).toEqual(keys(calm).map((it) => [it.date, it.type]));
    expect(keys(hurt).map((it) => it.blueprint?.split("#")[0] ?? null)).toEqual(keys(calm).map((it) => it.blueprint?.split("#")[0] ?? null));
    // Every blueprint stays at the step it was at, tagged held; without injury they step on.
    const tags = (x: typeof calm) => sessions(x).map((it) => it.blueprint).filter((b): b is string => !!b).map((b) => parseBlueprintTag(b)!);
    expect(tags(hurt).length).toBeGreaterThan(0);
    for (const t of tags(hurt)) { expect(t.held).toBe(true); expect(t.step).toBeLessThanOrEqual(1); }
    expect(Math.max(...tags(calm).map((t) => t.step))).toBeGreaterThan(1);
    // The deep aim is the next step's job; the form on race day still lands in the window.
    expect(hurt.s.eval.race?.form).toBeGreaterThanOrEqual(COACH.race.low);
  });

  describe("the deep aim in the last two build weeks", () => {
    const builds = (x: ReturnType<typeof plan>) => x.s.weeks.map((w, i) => ({ ...w, i })).filter((w, _i, all) => {
      const taper = all.find((y) => y.role === "taper")!.i;
      return w.role === "build" && w.i >= taper - 2;
    });

    it("goes deeper for a calm runner, inside the cap and the aim, and says so as a try", () => {
      const calm = plan(45), plain = plan(45, { backOff: true });
      const deep = builds(calm), flat = builds(plain);
      expect(deep).toHaveLength(2);
      expect(calm.s.tries.some((t) => t.id === "deep")).toBe(true);
      deep.forEach((w, k) => {
        expect(w.targetKm).toBeLessThanOrEqual(w.cap);
        expect(w.targetKm).toBeGreaterThanOrEqual(flat[k].targetKm);
        expect(calm.s.eval.weeks[w.i].lowPct).toBeGreaterThanOrEqual(RACE_PHASE.deepAim);
      });
      expect(deep.reduce((a, w) => a + w.targetKm, 0)).toBeGreaterThan(flat.reduce((a, w) => a + w.targetKm, 0));
      // Nothing else moves: the weeks before the two stay as they were, and race-day form is still in its window.
      expect(calm.s.weeks.slice(0, deep[0].i).map((w) => w.targetKm)).toEqual(plain.s.weeks.slice(0, deep[0].i).map((w) => w.targetKm));
      expect(calm.s.eval.race!.form).toBeGreaterThanOrEqual(COACH.race.low);
      expect(calm.s.eval.race!.form).toBeLessThanOrEqual(COACH.race.high);
    });

    it("is off with back-off (pain or missed paces) or injury, and for a half or marathon only", () => {
      const plain = plan(45, { backOff: true });
      expect(plain.s.tries.some((t) => t.id === "deep")).toBe(false);
      expect(plan(45, { injury: true }).s.tries.some((t) => t.id === "deep")).toBe(false);
      expect(plan(45, { injury: true }).s.weeks.map((w) => w.targetKm)).toEqual(plain.s.weeks.map((w) => w.targetKm));
      const none = suggestBlock({ ...plan(45).seed, phase: undefined });
      expect(none.tries.some((t) => t.id === "deep")).toBe(false);
    });
  });
});
