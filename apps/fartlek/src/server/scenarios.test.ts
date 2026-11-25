import { afterAll, beforeAll, describe as group, expect, it, vi } from "vitest";
import { describe, runScenario, SCENARIOS, type ScenarioResult } from "./scenarios";

// Real-looking histories through the real app: what "Föreslå veckan" and "Föreslå block" make of them.
// Run `npm run scenarios -w apps/fartlek` to print them all.
// A fixed Wednesday: the current week is part run, part planned, and the result can't change with the day the tests run
// (the app reads the clock, so the date alone isn't enough). A run planned is counted lighter than the same run done.
const TODAY = "2026-11-18";
group("planning scenarios", () => {
  const results = new Map<string, ScenarioResult>();
  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
    for (const sc of SCENARIOS) results.set(sc.name, await runScenario(sc, TODAY));
  });
  afterAll(() => { vi.useRealTimers(); });
  const r = (name: string) => results.get(name)!;

  it("starts a block no higher than the week button's week, and at most a fifth lower", () => {
    // The block ramps up from a little under the proven load (BLOCK.ramp), so its first week may sit below the week button's.
    for (const x of results.values()) {
      if (x.scenario.race || x.scenario.raceAgo) continue;
      expect(x.blocks[0].km[0], describe(x)).toBeLessThanOrEqual(x.week.km + 0.5);
      expect(x.blocks[0].km[0], describe(x)).toBeGreaterThanOrEqual(x.week.km * 0.8);
    }
  });

  it("starts the block after a 10 km+ race with recovery weeks (docs/decisions/fartlek-post-race-recovery.md)", () => {
    const m = r("after a marathon");
    expect(m.race!.roles, describe(m)).toBe("rrrr");
    // 15 · 45 · 65 · 80 % of the pre-race peak, never more.
    expect(m.race!.km[0], describe(m)).toBeLessThan(m.race!.km[1]);
    expect(m.race!.km[3], describe(m)).toBeLessThanOrEqual(0.8 * 46 + 0.5);
    const h = r("after a half, late");
    // Ten days after the race: the second recovery week (75 %) is the only one left, then the build.
    expect(h.race!.roles, describe(h)).toBe("rbbb");
    expect(h.race!.km[0], describe(h)).toBeLessThanOrEqual(0.75 * 41 + 0.5);
    expect(h.race!.km[1], describe(h)).toBeGreaterThan(h.race!.km[0]);
  });

  it("projects the road to an A marathon or half (docs/decisions/fartlek-race-plan-skeleton.md)", () => {
    const m20 = r("marathon in 20"), m28 = r("marathon in 28"), h12 = r("half in 12"), m10 = r("marathon in 10");
    expect(m20.road!.lengths, describe(m20)).toEqual({ base: 8, build: 6, specific: 4, taper: 2 });
    expect(m28.road!.lengths, describe(m28)).toEqual({ base: 12, build: 8, specific: 6, taper: 2 });
    expect(h12.road!.lengths, describe(h12)).toEqual({ base: 3, build: 4, specific: 3, taper: 2 });
    expect(m10.road!.short?.minWeeks, describe(m10)).toBe(12);
    expect(m10.road!.lengths, describe(m10)).toEqual({ base: 0, build: 4, specific: 4, taper: 2 });
    // The long-run peak lands 8 to 5 weeks before a marathon; every week to the end of recovery has a target.
    for (const x of [m20, m28]) {
      expect(x.road!.longPeak!.wip, describe(x)).toBeGreaterThanOrEqual(5);
      expect(x.road!.longPeak!.wip, describe(x)).toBeLessThanOrEqual(8);
      expect(x.road!.weeks.filter((w) => w.phase === "recovery"), describe(x)).toHaveLength(4);
      expect(x.road!.weeks.every((w) => (w.km ?? 0) > 0), describe(x)).toBe(true);
    }
  });

  it("starts a block from today without also making the running week lighter: the days that are over are its easing", () => {
    // Heavy form and an A marathon 27 weeks out: in phase, build, build, lighter. From a Wednesday with nothing run on
    // Monday and Tuesday, the first week keeps its build target and loses only those days; a fresh week still starts lighter.
    const none = r("from today, heavy"), run = r("from today, heavy, run"), fresh = r("heavy, next week");
    for (const x of [none, run]) {
      expect(x.race!.startPct, describe(x)).toBeLessThan(-25);
      expect(x.race!.roles, describe(x)).toBe("bbl");
      expect(x.race!.weeks[0].items.every((it) => it.date >= TODAY), describe(x)).toBe(true);
    }
    const target = none.race!.weeks[0].targetKm;
    expect(none.race!.doneKm).toBe(0);
    // Not lighter and clipped (70 % of the week, less two days): the build week less what Monday and Tuesday held.
    expect(none.race!.km[0], describe(none)).toBeGreaterThan(0.65 * target);
    expect(none.race!.km[0], describe(none)).toBeLessThanOrEqual(target);
    // With Monday and Tuesday run, what was run and what is planned come to about the target, never past it.
    const w0 = run.race!.weeks[0];
    expect(run.race!.doneKm, describe(run)).toBeGreaterThan(5);
    expect(run.race!.doneKm + run.race!.km[0], describe(run)).toBeLessThanOrEqual(w0.targetKm + 0.5);
    expect(run.race!.doneKm + run.race!.km[0], describe(run)).toBeGreaterThan(w0.targetKm - 4);
    // The runs already done count in the form and fitness of the block.
    expect(run.race!.ctl[1], describe(run)).toBeGreaterThan(none.race!.ctl[1]);
    expect(fresh.race!.roles, describe(fresh)).toBe("lbl");
  });

  it("brings a runner returning from a dip back towards the 35 km run before, not a lighter week", () => {
    const x = r("dip and return");
    expect(x.week.chosen, describe(x)).toBe("volume");
    expect(x.week.km).toBeGreaterThan(23.3 * 1.2);
    expect(x.week.why).toMatch(/re-entry/);
    expect(x.blocks[1].km[1]).toBeGreaterThan(x.blocks[1].km[0]);
  });

  it("grows a steady runner and gives no lighter week", () => {
    // The week is the block engine with one week: a lone build week sits in the middle of the block's ramp (+5 % on the
    // tolerated load, 31.5 km), where the old week button went to the +10 % cap (33 km). Changed 2026-11-16.
    const x = r("steady");
    expect(x.week.chosen, describe(x)).toBe("volume");
    expect(x.week.km).toBeCloseTo(31.5, 0);
  });

  it("builds on after weeks of building when form isn't heavy: the lighter week is the block's own, at its end", () => {
    const x = r("building");
    expect(x.week.chosen, describe(x)).not.toBe("backoff");
    expect(x.week.km, describe(x)).toBeGreaterThan(38);
    const four = x.blocks[1].km;
    expect(four.at(-1)!, describe(x)).toBeLessThan(Math.max(...four) * 0.8);
  });

  it("lets a comeback after a break grow faster than 10 % towards the load run before", () => {
    const x = r("comeback");
    expect(x.week.km, describe(x)).toBeGreaterThan(15 * 1.2);
    expect(x.week.state).not.toBe("over");
  });

  it("keeps a new runner's small week mostly easy, with no lighter week", () => {
    const x = r("beginner");
    expect(x.week.chosen, describe(x)).not.toBe("backoff");
    const thr = Number(/T([\d.]+)/.exec(x.week.items)?.[1] ?? 0);
    expect(thr).toBeLessThanOrEqual(x.week.km * 0.5);
  });

  it("plans toward an A race: the form peak ends the weeks, race-day form lands in the window, never two lighter weeks in a row", () => {
    for (const name of ["race in 5", "race in 8", "race at peak"]) {
      const x = r(name).race!;
      expect(x.roles, describe(r(name))).toMatch(/tr$/);
      expect(x.raceForm).toBeGreaterThanOrEqual(5);
      expect(x.raceForm).toBeLessThanOrEqual(20);
    }
    for (const x of results.values()) if (x.race) expect(x.race.roles, describe(x)).not.toMatch(/ll/);
    expect(r("race in 8").race!.roles).toBe("bbblbbtr");
  });

  it("creates only the first block when the race is further than eight weeks out", () => {
    const x = r("race in 14").race!;
    expect(x.now, describe(r("race in 14"))).toBe(1);
    expect(x.chunks).toBe("inPhase:2 + build:4 + build:4 + peak:4");
    expect(x.roles).toHaveLength(2);
  });

  it("tapers a runner back from a break as close to the window as the weeks allow", () => {
    const x = r("race after a break").race!;
    expect(x.roles, describe(r("race after a break"))).toBe("bbblbbtr");
    expect(x.raceForm).toBeGreaterThan(0);
  });

  it("plans the race phase through the real app: tagged sessions, the ladder as a third only at 70 km, race-day form in the window", () => {
    const tagged = (x: ScenarioResult) => x.race!.weeks.map((w) => w.items.filter((it) => it.blueprint));
    for (const name of ["marathon in 8 at 45", "marathon in 8 at 70", "half in 6"]) {
      const x = r(name);
      expect(x.race!.raceForm, describe(x)).toBeGreaterThanOrEqual(5);
      expect(x.race!.raceForm, describe(x)).toBeLessThanOrEqual(20);
      for (const w of x.race!.weeks) {
        expect(w.items.filter((it) => it.type === "long"), describe(x)).toHaveLength(w.role === "race" ? 0 : 1);
        for (const it of w.items) if (it.type === "long") expect(it.km, describe(x)).toBeLessThanOrEqual(32);
      }
      expect(tagged(x).flat().length, describe(x)).toBeGreaterThan(6);
    }
    const ladder = (x: ScenarioResult) => x.race!.weeks.filter((w) => w.role === "build").map((w) => w.items.filter((it) => it.type === "threshold" && !it.blueprint).length);
    expect(ladder(r("marathon in 8 at 45")).every((n) => n === 0), describe(r("marathon in 8 at 45"))).toBe(true);
    expect(ladder(r("marathon in 8 at 70")).some((n) => n === 1), describe(r("marathon in 8 at 70"))).toBe(true);
    // A marathon's dress rehearsal sits 9–13 days before the race (the race is on a Saturday here).
    const x = r("marathon in 8 at 45").race!;
    const race = x.weeks.at(-1)!.weekStart;
    const dress = x.weeks.flatMap((w) => w.items).find((it) => it.blueprint?.startsWith("dress-rehearsal"))!;
    const out = Math.round((Date.parse(race) - Date.parse(dress.date)) / 864e5) + 5;
    expect(out).toBeGreaterThanOrEqual(9);
    expect(out).toBeLessThanOrEqual(13);
  });
});
