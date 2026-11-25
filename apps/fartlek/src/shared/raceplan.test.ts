import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { blockWeekCap, raceChunks, RECOVERY } from "./blockplan";
import { tune } from "./tuning";
import { chunkKind, keyLongWeek, otherRacesIn, phaseLengths, phaseOfWeeks, projectSkeleton, raceKindOf, suggestedCap, wipOf, type PlanPhase, type RaceKind, type SkeletonInput } from "./raceplan";

// docs/decisions/fartlek-race-plan-skeleton.md
const floorHalf = (n: number) => Math.floor(n * 2) / 2;
const RACE = "2027-03-21"; // a Sunday
const TOL = { km: 45, peakKm: 45, peakWeek: null, weeksAgo: 2 };
const golden = (over: Partial<SkeletonInput> = {}): SkeletonInput => ({
  kind: "marathon", race: { date: RACE, distanceKm: 42.195 }, planStart: "2026-11-30", firstWeek: "2026-11-30",
  window: [40, 44, 38], tolerance: TOL, anchorKm: 45, peakKm: 0, longestKm: 18, easyPace: 330, others: [], ...over,
});
const str = (l: { base: number; build: number; specific: number; taper: number }) => `${l.base}/${l.build}/${l.specific}/${l.taper}`;
const LISTS: Record<RaceKind, string> = {
  marathon: "1: 0/0/0/1 · 2: 0/0/0/2 · 3: 0/0/1/2 · 4: 0/0/2/2 · 5: 0/0/3/2 · 6: 0/0/4/2 · 7: 0/1/4/2 · 8: 0/2/4/2 · 9: 0/3/4/2 · 10: 0/4/4/2 · 11: 1/4/4/2 · 12: 2/4/4/2 · 13: 2/5/4/2 · 14: 2/6/4/2 · 15: 3/6/4/2 · 16: 4/6/4/2 · 17: 5/6/4/2 · 18: 6/6/4/2 · 19: 7/6/4/2 · 20: 8/6/4/2 · 21: 9/6/4/2 · 22: 10/6/4/2 · 23: 11/6/4/2 · 24: 10/7/5/2 · 25: 11/7/5/2 · 26: 12/7/5/2 · 27: 13/7/5/2 · 28: 12/8/6/2 · 29: 13/8/6/2 · 30: 14/8/6/2",
  half: "1: 0/0/0/1 · 2: 0/0/0/2 · 3: 0/0/1/2 · 4: 0/0/2/2 · 5: 0/1/2/2 · 6: 0/2/2/2 · 7: 0/3/2/2 · 8: 1/3/2/2 · 9: 2/3/2/2 · 10: 3/3/2/2 · 11: 4/3/2/2 · 12: 3/4/3/2 · 13: 4/4/3/2 · 14: 5/4/3/2 · 15: 6/4/3/2 · 16: 5/5/4/2 · 17: 6/5/4/2 · 18: 7/5/4/2 · 19: 8/5/4/2 · 20: 9/5/4/2",
};

describe("phase lengths", () => {
  it("matches the table in the decision for every week count", () => {
    for (const kind of ["marathon", "half"] as const) {
      for (const part of LISTS[kind].split(" · ")) {
        const [n, l] = part.split(": ");
        expect(str(phaseLengths(Number(n), kind)), `${kind} ${n}`).toBe(l);
      }
    }
  });

  it("adds up, never goes negative and keeps the taper from 2 weeks", () => {
    for (const kind of ["marathon", "half"] as const) {
      for (let n = 1; n <= 30; n++) {
        const l = phaseLengths(n, kind);
        expect(l.base + l.build + l.specific + l.taper).toBe(n);
        for (const v of Object.values(l)) expect(v).toBeGreaterThanOrEqual(0);
        if (n >= 2) expect(l.taper).toBe(2);
      }
    }
  });

  it("shortens base first, then build; specific and taper keep their minimum", () => {
    for (let n = 6; n <= 11; n++) expect(phaseLengths(n, "marathon")).toMatchObject({ specific: 4, taper: 2 });
    expect(phaseLengths(10, "marathon").base).toBe(0);
    expect(phaseLengths(10, "marathon").build).toBe(4);
    expect(phaseLengths(9, "marathon").build).toBe(3);
    for (let n = 4; n <= 7; n++) expect(phaseLengths(n, "half")).toMatchObject({ specific: 2, taper: 2 });
  });

  it("lists one phase per week", () => {
    const p = phaseOfWeeks({ base: 4, build: 6, specific: 4, taper: 2 });
    expect(p).toEqual([...Array(4).fill("base"), ...Array(6).fill("build"), ...Array(4).fill("specific"), "taper", "race"]);
  });
});

describe("chunk kinds", () => {
  it("takes the phase most weeks have, a tie to the later", () => {
    expect(chunkKind(["build", "build", "specific", "specific"])).toBe("specific");
    expect(chunkKind(["base", "base", "base", "build"])).toBe("base");
    expect(chunkKind(["specific", "specific", "taper", "race"])).toBe("specific");
    expect(chunkKind(["recovery", "recovery"])).toBe("recovery");
  });

  it("gives the worked chunk kinds of the decision", () => {
    const kinds = (n: number, kind: RaceKind) => {
      const phases = phaseOfWeeks(phaseLengths(n, kind));
      let at = 0;
      return raceChunks(n).map((c) => { const k = chunkKind(phases.slice(at, at + c.weeks) as PlanPhase[]); at += c.weeks; return k; });
    };
    expect(kinds(12, "marathon")).toEqual(["build", "specific", "specific"]);
    expect(kinds(16, "marathon")).toEqual(["base", "build", "specific", "specific"]);
    expect(kinds(20, "marathon")).toEqual(["base", "base", "build", "specific", "specific"]);
    expect(kinds(28, "marathon")).toEqual(["base", "base", "base", "build", "build", "specific", "specific"]);
    expect(kinds(30, "marathon")).toEqual(["base", "base", "base", "base", "build", "build", "specific", "specific"]);
    expect(kinds(8, "half")).toEqual(["build", "specific"]);
    expect(kinds(12, "half")).toEqual(["base", "build", "specific"]);
    expect(kinds(16, "half")).toEqual(["base", "build", "specific", "specific"]);
  });
});

describe("race kind and weeks to the race", () => {
  it("knows a marathon and a half within 1 km", () => {
    expect([42.195, 41.5, 21.1, 22, 10, 30].map(raceKindOf)).toEqual(["marathon", "marathon", "half", "half", null, null]);
  });

  it("counts the race week as 1", () => {
    expect(wipOf("2027-03-15", RACE)).toBe(1);
    expect(wipOf("2027-03-08", RACE)).toBe(2);
    expect(wipOf("2027-03-22", RACE)).toBe(0);
    expect(wipOf("2026-11-30", RACE)).toBe(16);
  });
});

describe("projectSkeleton", () => {
  it("projects the golden marathon (fails loudly when TUNE or the ramp change)", () => {
    const sk = projectSkeleton(golden());
    const got = sk.weeks.map((w) => `${w.wip > 0 ? w.wip : "rec"} ${w.role === "build" ? "b" : w.role === "lighter" ? "l" : w.role} ${w.km} ${w.longKm}`);
    expect(got).toEqual([
      // From the build phase (wip 12) the long run may take 40 % of the week, so the ladder (+8 %) leads instead of the week's share.
      "16 b 45 18.5", "15 b 47 19", "14 b 49.5 19.5", "13 l 34.5 13.5", "12 b 48 19.5", "11 b 51.5 20.5", "10 b 54 21.5", "9 l 37.5 15",
      "8 b 52 21.5", "7 b 56.5 22.5", "6 b 59 23.5", "5 l 41 16.5", "4 b 57 23.5", "3 b 62.5 23.5", "2 taper 43.5 16.5", "1 race 31 null",
      "rec recovery 9 3", "rec recovery 28 8", "rec recovery 40.5 12", "rec recovery 50 15",
    ]);
    expect(sk.weeks.map((w) => w.phase)).toEqual([...Array(4).fill("base"), ...Array(6).fill("build"), ...Array(4).fill("specific"), "taper", "race", ...Array(4).fill("recovery")]);
    expect(sk.peakKm).toBe(62.5);
    expect(sk.longPeak).toEqual({ weekStart: "2027-02-08", km: 23.5, wip: 6 });
  });

  it("holds the long run in the weeks before the taper", () => {
    const sk = projectSkeleton(golden());
    const at = (wip: number) => sk.weeks.find((w) => w.wip === wip)!.longKm!;
    expect(at(4)).toBe(at(6));
    expect(at(3)).toBe(at(6));
  });

  it("takes every cap from the actual tolerance, whatever the anchor", () => {
    const low = projectSkeleton(golden({ window: [20, 20, 20], tolerance: TOL }));
    expect(low.weeks[0].km).toBeLessThanOrEqual(blockWeekCap([20, 20, 20], 45).cap);
    const t30 = { km: 30, peakKm: 30, peakWeek: null, weeksAgo: 2 };
    const lower = projectSkeleton(golden({ window: [20, 20, 20], tolerance: t30, anchorKm: 80 }));
    expect(lower.weeks[0].km).toBeLessThanOrEqual(blockWeekCap([20, 20, 20], 30).cap);
    const high = projectSkeleton(golden({ anchorKm: 80 }));
    expect(high.weeks[0].km).toBeLessThanOrEqual(blockWeekCap([40, 44, 38], 45).cap);
    const win = [40, 44, 38];
    for (const w of high.weeks) {
      if (w.role === "build") expect(w.km).toBeLessThanOrEqual(blockWeekCap(win.slice(-3), 45).cap + 0.01);
      win.push(w.km);
    }
  });

  it("caps the first week after a break of more than 7 days", () => {
    expect(projectSkeleton(golden({ backDays: 10 })).weeks[0].km).toBeLessThanOrEqual(floorHalf(0.7 * 45));
    expect(projectSkeleton(golden({ backDays: 7 })).weeks).toEqual(projectSkeleton(golden()).weeks);
  });

  it("honours other races: a B half as a race week with recovery, one in the taper keeps the taper", () => {
    const half = { date: "2027-01-17", distanceKm: 21.1, name: "Vinterhalvan" };
    const sk = projectSkeleton(golden({ others: [half] }));
    const i = sk.weeks.findIndex((w) => w.wip === 10);
    expect(sk.weeks[i].role).toBe("race");
    expect(sk.weeks[i].km).toBe(floorHalf(sk.weeks[i - 1].km * tune().taper.bRace));
    expect(sk.weeks[i + 1].role).toBe("recovery");
    const peakSoFar = Math.max(...sk.weeks.slice(0, i).filter((w) => w.role === "build").map((w) => w.km));
    expect(sk.weeks[i + 1].km).toBe(floorHalf(peakSoFar * RECOVERY.B.half.volume[0]));

    // In the taper week (wip 2): the taper keeps its role and km, no recovery weeks replace it.
    const late = { date: "2027-03-13", distanceKm: 10, name: "Vårmilen" };
    const plain = projectSkeleton(golden());
    const close = projectSkeleton(golden({ others: [late] }));
    const t = (s: typeof plain) => s.weeks.map((w) => [w.wip, w.role, w.km]);
    expect(t(close)).toEqual(t(plain));
    // In a build week of the peak block (wip 3): a race week, still honoured.
    const wip3 = projectSkeleton(golden({ others: [{ ...late, date: "2027-03-06" }] }));
    expect(wip3.weeks.find((w) => w.wip === 3)!.role).toBe("race");
    expect(wip3.weeks.find((w) => w.wip === 2)!.role).toBe("taper");
    expect(otherRacesIn([late, half], RACE, ["2026-11-30"]).close).toEqual([late]);
    expect(otherRacesIn([late, half], RACE, ["2026-11-30"]).honoured).toEqual([half, late]);
  });

  it("projects a half: lengths, recovery and the long-run peak", () => {
    const sk = projectSkeleton({ kind: "half", race: { date: RACE, distanceKm: 21.1 }, planStart: addDays("2027-03-15", -11 * 7), firstWeek: addDays("2027-03-15", -11 * 7),
      window: [30, 34, 28], tolerance: { km: 35, peakKm: 35, peakWeek: null, weeksAgo: 2 }, anchorKm: 35, peakKm: 0, longestKm: 14, easyPace: 330, others: [] });
    expect(sk.lengths).toEqual({ base: 3, build: 4, specific: 3, taper: 2 });
    expect(sk.weeks.filter((w) => w.role === "recovery")).toHaveLength(RECOVERY.A.half.weeks);
    expect(sk.longPeak!.wip).toBeGreaterThanOrEqual(4);
    expect(sk.weeks.find((w) => w.wip === 3)!.longKm!).toBeLessThanOrEqual(sk.longPeak!.km);
  });

  it("gives only the recovery weeks once the race week is behind", () => {
    const sk = projectSkeleton(golden({ firstWeek: "2027-03-22", peakKm: 62.5 }));
    expect(sk.weeks.map((w) => w.role)).toEqual(["recovery", "recovery", "recovery", "recovery"]);
    expect(sk.weeks[0].km).toBe(floorHalf(62.5 * 0.15));
  });

  it("is cheap: 200 projections of a 30-week marathon in under a second", () => {
    const t0 = performance.now();
    for (let k = 0; k < 200; k++) projectSkeleton(golden({ planStart: addDays("2027-03-15", -29 * 7), firstWeek: addDays("2027-03-15", -29 * 7) }));
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});

describe("long-run ceiling and the peak-week cap (docs/decisions/fartlek-long-run-ceiling.md)", () => {
  it("holds every build week of the road under the runner's cap", () => {
    const sk = projectSkeleton(golden({ capKm: 55 }));
    for (const w of sk.weeks.filter((x) => x.role === "build")) expect(w.km).toBeLessThanOrEqual(55);
    expect(sk.peakKm).toBe(55);
    // Taper and recovery follow the capped peak.
    expect(sk.weeks.find((w) => w.role === "taper")!.km).toBeLessThan(projectSkeleton(golden()).weeks.find((w) => w.role === "taper")!.km);
  });

  it("suggests 1.5 × the proven peak week, to 5 km", () => {
    expect(suggestedCap(55)).toBe(80);
    expect(suggestedCap(44)).toBe(65);
    expect(suggestedCap(0)).toBeNull();
  });

  it("lets a marathon road's long run reach 30 km at about 75 km a week, and no further outside the key weeks", () => {
    const big = projectSkeleton(golden({ window: [70, 74, 72], tolerance: { km: 75, peakKm: 75, peakWeek: null, weeksAgo: 1 }, anchorKm: 75, longestKm: 26, capKm: 78 }));
    const longs = big.weeks.filter((w) => w.role === "build").map((w) => ({ wip: w.wip, long: w.longKm!, km: w.km }));
    expect(Math.max(...longs.map((l) => l.long))).toBeGreaterThanOrEqual(30);
    for (const l of longs) if (!keyLongWeek("marathon", l.wip)) expect(l.long).toBeLessThanOrEqual(30);
    for (const l of longs) expect(l.long).toBeLessThanOrEqual(32);
  });
});
