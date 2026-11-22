import { describe, expect, it } from "vitest";
import type { StatsEntry } from "./api";
import { buildStats, entryMonth, monthsBetween } from "./stats";

const now = new Date(2026, 10, 15); // 15 Nov 2026, local
const exp = (date: string, total: number, shares: [number, number][], label: string | null = null): StatsEntry =>
  ({ kind: "expense", date, at: 0, label, total, shares: shares.map(([memberId, amount]) => ({ memberId, amount })) });
const trip = (at: Date, total: number, shares: [number, number][], label: string | null = null): StatsEntry =>
  ({ kind: "trip", date: null, at: at.getTime(), label, total, shares: shares.map(([memberId, amount]) => ({ memberId, amount })) });

describe("months", () => {
  it("lists months across a year boundary", () => {
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(monthsBetween("2026-03", "2026-03")).toEqual(["2026-03"]);
  });
  it("uses the expense date, or the trip time in local time", () => {
    expect(entryMonth({ date: "2026-01-31", at: 0 })).toBe("2026-01");
    expect(entryMonth({ date: null, at: new Date(2026, 0, 31, 23, 30).getTime() })).toBe("2026-01");
  });
});

describe("buildStats", () => {
  const entries = [
    exp("2026-11-02", 600, [[1, 300], [2, 300]], "Restaurant"),
    exp("2026-10-10", 1000, [[2, 1000]], "restaurant "),
    trip(new Date(2026, 9, 3), 500, [[1, 200], [2, 300]], "ICA"),
    trip(new Date(2026, 8, 30), 400, [[1, 400]], "ICA"), // September
    exp("2025-01-01", 999, [[1, 999]]),
  ];

  it("zero-fills a contiguous month range and splits mine from the total", () => {
    const s = buildStats(entries, 1, "3m", now);
    expect(s.months).toEqual([
      { month: "2026-09", total: 400, mine: 400 },
      { month: "2026-10", total: 1500, mine: 200 },
      { month: "2026-11", total: 600, mine: 300 },
    ]);
    expect([s.total, s.mine]).toEqual([2500, 900]);
  });

  it("groups by kind and case-insensitive trimmed label, largest first", () => {
    const s = buildStats(entries, 1, "3m", now);
    expect(s.groups).toEqual([
      { kind: "expense", label: "Restaurant", total: 1600, mine: 300, count: 2 },
      { kind: "trip", label: "ICA", total: 900, mine: 600, count: 2 },
    ]);
    expect(s.members).toEqual([{ memberId: 2, amount: 1600 }, { memberId: 1, amount: 900 }]);
  });

  it("'all' starts at the oldest entry and ignores future entries", () => {
    const s = buildStats([...entries, exp("2027-01-01", 5, [[1, 5]])], 1, "all", now);
    expect(s.months[0].month).toBe("2025-01");
    expect(s.months.at(-1)!.month).toBe("2026-11");
    expect(s.months).toHaveLength(23);
    expect(s.total).toBe(2500 + 999);
  });

  it("returns an empty-but-shaped result with no entries", () => {
    const s = buildStats([], 1, "all", now);
    expect(s.months).toEqual([{ month: "2026-11", total: 0, mine: 0 }]);
    expect([s.groups, s.members, s.total]).toEqual([[], [], 0]);
  });
});
