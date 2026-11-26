import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { StatsView, runFilters } from "./Stats";
import { comparePeriods } from "@/shared/periods";
import type { BandSecs, PeriodTotals, RunRow, StatsResponse } from "@/shared/periodstats";

const today = "2026-11-26";
const ctx = { today, blocks: [] };
const cmp = comparePeriods({ kind: "preset", preset: "week" }, ctx)!;

const bands = (min: number, at = 0, target = 0, over = 0): BandSecs => ({
  totalS: min * 60, zones: [min * 6, min * 42, min * 6, min * 6, 0], belowS: min * 60 - at - over, atS: at, overS: over, targetS: target,
});
const run = (id: string, date: string, min: number, b: BandSecs, name = "Run"): RunRow =>
  ({ id, date, name, distanceKm: min / 5, durationS: min * 60, kind: null, bands: b });
const totals = (period: { from: string; to: string }, runs: RunRow[]): PeriodTotals => {
  const s = runs.reduce((x, r) => x + r.durationS, 0);
  return {
    period, runs: runs.length, durationS: runs.reduce((x, r) => x + r.durationS, 0), distanceKm: runs.reduce((x, r) => x + r.distanceKm, 0), longestKm: Math.max(0, ...runs.map((r) => r.distanceKm)),
    easyShare: runs.length ? 0.8 : null, totalS: s, zones: [s * 0.1, s * 0.7, s * 0.1, s * 0.1, 0], belowS: s, atS: 0, overS: 0, targetS: 0,
    plan: { km: 40, doneKm: 30, sessions: 4, doneSessions: 3, key: 2, doneKey: 1, long: 1, doneLong: 0 },
  };
};

const runsA = [run("a2", "2026-11-25", 70, bands(70, 1800, 240, 80), "Threshold 3×10 min"), run("a1", "2026-11-23", 45, bands(45))];
const runsB = [run("b1", "2026-11-18", 60, bands(60, 300))];
const data: StatsResponse = {
  a: totals(cmp.a, runsA), b: totals(cmp.b, runsB),
  threshold: { pace: 285, low: 275, high: 295 },
  target: { pace: 306, low: 296, high: 317, raceName: "Marathon", distanceKm: 42.195, goalSeconds: 12900 },
  runs: runsA, runsB,
  weeks: Array.from({ length: 12 }, (_, i) => ({ weekStart: `2026-${i < 6 ? "09" : "10"}-01`, week: 37 + i, km: 40 + i })),
  blocks: [],
  pending: 0,
};

const render = (d: StatsResponse) => renderToStaticMarkup(
  <MemoryRouter><StatsView data={d} cmp={cmp} choice={{ kind: "preset", preset: "week" }} ctx={ctx} mode="zone" onMode={() => {}} onChoose={() => {}} /></MemoryRouter>,
);

describe("Statistik page", () => {
  it("renders both sides, the run table with links, and the target row", () => {
    const html = render(data);
    expect(html).toMatch(/48/);
    expect(html).toMatch(/47/);
    expect(html).toContain('href="/activities/a2"');
    expect(html).toContain("Threshold 3×10 min");
    // Target pace is shown: its filter chip and its column.
    expect(html).toMatch(/målfart|target pace/i);
  });

  it("hides the target rows without a target and says when nothing was run", () => {
    const noTarget = render({ ...data, target: null });
    expect(noTarget).not.toMatch(/I målfart|At target pace/);
    const empty = render({ ...data, runs: [], runsB: [], a: totals(cmp.a, []), b: totals(cmp.b, []) });
    expect(empty).toMatch(/Inga pass i någon av perioderna|No runs in either period/);
  });

  it("says when stats are still being worked out", () => {
    expect(render({ ...data, pending: 3 })).toMatch(/Räknar statistik|Working out the stats/);
  });

  it("filters runs by the bands", () => {
    expect(runsA.filter(runFilters.thr).map((r) => r.id)).toEqual(["a2"]);
    expect(runsA.filter(runFilters.mp).map((r) => r.id)).toEqual(["a2"]);
    expect(runsA.filter(runFilters.over).map((r) => r.id)).toEqual(["a2"]);
  });
});
