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
      if (x.scenario.race) continue;
      expect(x.blocks[0].km[0], describe(x)).toBeLessThanOrEqual(x.week.km + 0.5);
      expect(x.blocks[0].km[0], describe(x)).toBeGreaterThanOrEqual(x.week.km * 0.8);
    }
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
});
