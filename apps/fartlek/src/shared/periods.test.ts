import { describe, expect, it } from "vitest";
import { comparePeriods, presetAvailable, type PeriodBlock } from "./periods";

const today = "2026-11-26"; // a Thursday in week 48
const blocks: PeriodBlock[] = [
  { id: 1, name: "Base", startWeek: "2026-09-07", weeks: 4 },
  { id: 2, name: "Build", startWeek: "2026-10-05", weeks: 5 },
  { id: 3, name: "Specific", startWeek: "2026-11-09", weeks: 4 },
];
const ctx = { today, blocks };
const pick = (preset: Parameters<typeof presetAvailable>[0]) =>
  preset === "custom" ? null : comparePeriods({ kind: "preset", preset }, ctx);

describe("period presets", () => {
  it("today is compared with the same weekday last week", () => {
    expect(pick("today")).toMatchObject({ a: { from: today, to: today }, b: { from: "2026-11-19", to: "2026-11-19" }, days: 1 });
  });

  it("an ongoing week is compared day for day with the week before", () => {
    const r = pick("week")!;
    expect(r.a).toEqual({ from: "2026-11-23", to: today });
    expect(r.b).toEqual({ from: "2026-11-16", to: "2026-11-19" });
    expect(r.note).toEqual({ key: "stats.note.weekOngoing", params: { week: 48, count: 4 } });
    expect(r.labelA).toEqual({ kind: "week", week: 48 });
  });

  it("follows a Sunday week start", () => {
    const r = comparePeriods({ kind: "preset", preset: "week" }, { ...ctx, weekStart: "sunday" })!;
    expect(r.a).toEqual({ from: "2026-11-22", to: today });
    expect(r.b).toEqual({ from: "2026-11-15", to: "2026-11-19" });
  });

  it("last week is a full week against the week before", () => {
    const r = pick("lastWeek")!;
    expect(r.a).toEqual({ from: "2026-11-16", to: "2026-11-22" });
    expect(r.b).toEqual({ from: "2026-11-09", to: "2026-11-15" });
    expect(r.note.key).toBe("stats.note.fullWeeks");
  });

  it("an ongoing month is compared with the same days of the month before", () => {
    const r = pick("month")!;
    expect(r.a).toEqual({ from: "2026-11-01", to: today });
    expect(r.b).toEqual({ from: "2026-10-01", to: "2026-10-26" });
    expect(r.note).toEqual({ key: "stats.note.monthOngoing", params: { count: 26 } });
  });

  it("full months of different lengths compare the first days of each", () => {
    const r = pick("lastMonth")!;
    expect(r.a).toEqual({ from: "2026-10-01", to: "2026-10-30" });
    expect(r.b).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(r.note).toEqual({ key: "stats.note.unevenMonths", params: { count: 30 } });
    expect(r.labelA).toEqual({ kind: "month", month: "2026-10-01" });
  });

  it("a month that is longer than the one before is cut to its length", () => {
    const r = comparePeriods({ kind: "preset", preset: "month" }, { today: "2026-03-31" })!;
    expect(r.a).toEqual({ from: "2026-03-01", to: "2026-03-28" });
    expect(r.b).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    const full = comparePeriods({ kind: "preset", preset: "lastMonth" }, { today: "2026-09-02" })!;
    expect(full.note).toEqual({ key: "stats.note.fullMonths", params: { count: 31 } });
  });

  it("an ongoing block is compared with as many days of the block before", () => {
    const r = pick("block")!;
    expect(r.a).toEqual({ from: "2026-11-09", to: today });
    expect(r.b).toEqual({ from: "2026-10-05", to: "2026-10-22" });
    expect(r.note).toEqual({ key: "stats.note.blockOngoing", params: { name: "Specific", day: 18, total: 28, count: 18, prev: "Build" } });
  });

  it("last block: blocks of different lengths compare the shorter", () => {
    const r = pick("lastBlock")!;
    expect(r.a).toEqual({ from: "2026-10-05", to: "2026-11-01" });
    expect(r.b).toEqual({ from: "2026-09-07", to: "2026-10-04" });
    expect(r.note).toEqual({ key: "stats.note.unevenBlocks", params: { count: 28 } });
    expect(r.labelB).toEqual({ kind: "block", name: "Base" });
  });

  it("the first block is compared with the days before it", () => {
    const r = comparePeriods({ kind: "block", id: 1 }, ctx)!;
    expect(r.a).toEqual({ from: "2026-09-07", to: "2026-10-04" });
    expect(r.b).toEqual({ from: "2026-08-10", to: "2026-09-06" });
    expect(r.note.key).toBe("stats.note.blockNoPrev");
  });

  it("block presets need a block", () => {
    expect(presetAvailable("block", { today })).toBe(false);
    expect(presetAvailable("lastBlock", { today })).toBe(false);
    expect(presetAvailable("block", ctx)).toBe(true);
    expect(comparePeriods({ kind: "preset", preset: "block" }, { today })).toBeNull();
    // After the last block ends, "last block" is that one and there is no current block.
    const later = { today: "2026-12-20", blocks };
    expect(presetAvailable("block", later)).toBe(false);
    expect(comparePeriods({ kind: "preset", preset: "lastBlock" }, later)).toMatchObject({ a: { from: "2026-11-09", to: "2026-12-06" }, note: { key: "stats.note.unevenBlocks" } });
  });
});

describe("picked periods", () => {
  it("a custom range is compared with as many days directly before", () => {
    const r = comparePeriods({ kind: "custom", from: "2026-11-03", to: "2026-11-26" }, ctx)!;
    expect(r.b).toEqual({ from: "2026-10-10", to: "2026-11-02" });
    expect(r.days).toBe(24);
    // A reversed range is put the right way round.
    expect(comparePeriods({ kind: "custom", from: "2026-11-26", to: "2026-11-03" }, ctx)!.a).toEqual({ from: "2026-11-03", to: "2026-11-26" });
  });

  it("a week on the timeline is that week against the one before", () => {
    const r = comparePeriods({ kind: "week", weekStart: "2026-10-12" }, ctx)!;
    expect(r.a).toEqual({ from: "2026-10-12", to: "2026-10-18" });
    expect(r.b).toEqual({ from: "2026-10-05", to: "2026-10-11" });
    expect(r.note.key).toBe("stats.note.pickedWeek");
    expect(comparePeriods({ kind: "week", weekStart: "2026-11-30" }, ctx)).toBeNull();
  });

  it("a block on the timeline is that block against the block before", () => {
    expect(comparePeriods({ kind: "block", id: 2 }, ctx)).toMatchObject({ a: { from: "2026-10-05" }, b: { from: "2026-09-07" } });
    expect(comparePeriods({ kind: "block", id: 9 }, ctx)).toBeNull();
  });
});
