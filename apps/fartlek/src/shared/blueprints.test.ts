import { describe, expect, it } from "vitest";
import { BLUEPRINTS, PHASE_SCHEDULE, blueprintById, compileBlueprint, entryStep, type CompileCtx } from "./blueprints";
import { parseSteps, stepsText, type StepTarget } from "./steps";

const paces = { mp: 300, hmp: 285 };
const ctx = (over: Partial<CompileCtx> = {}): CompileCtx => ({ weekKm: 70, maxKm: null, longKm: 28, paces, ...over });
const targets = (s: ReturnType<typeof compileBlueprint>) =>
  s!.steps.items.flatMap((i) => (i.kind === "step" ? [i.step.target] : [i.work.target, i.rest?.target ?? null]));

describe("blueprint catalogue", () => {
  it("has unique ids and an entryHigh inside the steps", () => {
    expect(new Set(BLUEPRINTS.map((b) => b.id)).size).toBe(BLUEPRINTS.length);
    for (const b of BLUEPRINTS) {
      expect(b.entryHigh).toBeGreaterThanOrEqual(0);
      expect(b.entryHigh).toBeLessThan(b.steps.length);
      if (b.fallback) expect(BLUEPRINTS.some((o) => o.id === b.fallback && o.race === b.race && o.slot === b.slot)).toBe(true);
    }
  });

  it("schedules only blueprints of the right race and slot, for weeks 1–8", () => {
    for (const race of ["marathon", "half"] as const) {
      expect(Object.keys(PHASE_SCHEDULE[race]).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
      for (const w of Object.values(PHASE_SCHEDULE[race])) {
        for (const slot of ["long", "quality"] as const) {
          const s = w[slot];
          if (!s) continue;
          const b = blueprintById(s.id);
          expect([b.race, b.slot]).toEqual([race, slot]);
        }
      }
    }
  });

  it("enters high only at 60 km tolerated", () => {
    expect(entryStep(blueprintById("mp-long"), 59)).toBe(0);
    expect(entryStep(blueprintById("mp-long"), 60)).toBe(1);
  });
});

describe("compileBlueprint", () => {
  it("mp-long at 26 km, step 2: 15.5 km MP after 8.5 km easy", () => {
    const r = compileBlueprint(blueprintById("mp-long"), 2, ctx({ longKm: 26 }))!;
    expect(r.step).toBe(2);
    expect(r.steps.items).toEqual([
      { kind: "step", step: { km: 8.5, target: { kind: "easy" } } },
      { kind: "step", step: { km: 15.5, target: { kind: "pace", secPerKm: 300 } } },
      { kind: "step", step: { km: 2, target: { kind: "easy" } } },
    ]);
  });

  it("falls back (null) when the long run is too short for mp-long", () => {
    expect(compileBlueprint(blueprintById("mp-long"), 0, ctx({ longKm: 12 }))).toBeNull();
  });

  it("keeps at least 3 km easy in a long run by shrinking the work", () => {
    const r = compileBlueprint(blueprintById("fast-finish-long"), 4, ctx({ longKm: 14 }))!; // 8 km wanted, cap 3.5
    const km = r.steps.items.map((i) => (i.kind === "step" ? i.step.km! : 0));
    expect(km[0]).toBeGreaterThanOrEqual(3);
    expect(km.reduce((a, b) => a + b, 0)).toBe(14);
  });

  it("scales a progressive long run's finish: steady then MP", () => {
    const r = compileBlueprint(blueprintById("progressive-long"), 1, ctx({ longKm: 24 }))!;
    expect(targets(r)).toEqual([{ kind: "easy" }, { kind: "pace", secPerKm: 315 }, { kind: "pace", secPerKm: 300 }]);
  });

  it("mp-alternations at 40 km a week steps down to a session of 12 km or less", () => {
    const r = compileBlueprint(blueprintById("mp-alternations"), 4, ctx({ weekKm: 40, longKm: undefined }))!;
    expect(r.step).toBeLessThan(4);
    const { steps } = r;
    const rep = steps.items[1];
    if (rep.kind !== "repeat") throw new Error("expected a repeat");
    const session = 2 + rep.times * rep.work.km! + (rep.times - 1) * rep.rest!.km! + 1;
    expect(session).toBeLessThanOrEqual(12);
  });

  it("returns the step actually planned and respects maxKm", () => {
    const r = compileBlueprint(blueprintById("mp-tempo"), 6, ctx({ weekKm: 100, maxKm: 14, longKm: undefined }))!;
    expect(r.step).toBeLessThan(6);
    const total = r.steps.items.reduce((a, i) => a + (i.kind === "step" ? i.step.km! : i.times * i.work.km! + (i.times - 1) * (i.rest?.km ?? 0)), 0);
    expect(total).toBeLessThanOrEqual(14);
  });

  it("scales step 0 down but never under 3 km of work, else null", () => {
    const scaledDown = compileBlueprint(blueprintById("mp-tempo"), 0, ctx({ weekKm: 20, longKm: undefined }))!; // 6 km wanted, cap 5
    expect(scaledDown.step).toBe(0);
    expect(scaledDown.steps.items[1]).toEqual({ kind: "step", step: { km: 5, target: { kind: "pace", secPerKm: 300 } } });
    expect(compileBlueprint(blueprintById("mp-tempo"), 0, ctx({ weekKm: 100, maxKm: 5, longKm: undefined }))).toBeNull(); // under 3 km of work
  });

  it("checks requires: mp-alternations needs 35 km a week", () => {
    expect(compileBlueprint(blueprintById("mp-alternations"), 0, ctx({ weekKm: 34, longKm: undefined }))).toBeNull();
  });

  it("round-trips every compiled session through stepsText / parseSteps", () => {
    for (const bp of BLUEPRINTS) {
      for (let step = 0; step < bp.steps.length; step++) {
        const r = compileBlueprint(bp, step, ctx({ weekKm: 90, longKm: 32 }));
        if (!r) continue;
        for (const lang of ["sv", "en"] as const) {
          const p = parseSteps(stepsText(r.steps, lang, "metric"), "metric", lang);
          expect(p.errors, `${bp.id}#${step}`).toEqual([]);
          expect(p.steps, `${bp.id}#${step}`).toEqual(r.steps);
        }
      }
    }
  });

  it("uses zone targets when there is no pace source", () => {
    const none = { mp: null, hmp: null };
    for (const bp of BLUEPRINTS) {
      const r = compileBlueprint(bp, 0, ctx({ weekKm: 90, longKm: 30, paces: none }))!;
      expect(r, bp.id).not.toBeNull();
      const ts = targets(r).filter((t): t is StepTarget => !!t);
      expect(ts.some((t) => t.kind === "pace")).toBe(false);
      expect(ts.some((t) => t.kind === "zone" && t.zone >= 3)).toBe(true);
    }
    const mp = compileBlueprint(blueprintById("mp-tempo"), 0, ctx({ paces: none, longKm: undefined }))!;
    expect(targets(mp)[1]).toEqual({ kind: "zone", zone: 3 });
    const hmp = compileBlueprint(blueprintById("hmp-repeats"), 0, ctx({ paces: none, longKm: undefined }))!;
    expect(targets(hmp)[1]).toEqual({ kind: "zone", zone: 4 });
  });
});
