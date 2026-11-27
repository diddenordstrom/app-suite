import { describe, expect, it } from "vitest";
import { endsIn, meanIn, trendWeeks } from "./trendperiod";

const today = "2026-11-27";

describe("trendWeeks", () => {
  it("gives at least 12 weeks for a short period ending today", () => {
    expect(trendWeeks([{ from: "2026-11-23", to: today }], today)).toBe(12);
  });
  it("is about four times a long period", () => {
    // A 9-week block: 36 weeks of curve.
    expect(trendWeeks([{ from: "2026-09-28", to: "2026-11-29" }], today)).toBe(36);
  });
  it("reaches back past a period far in the past, at most two years", () => {
    expect(trendWeeks([{ from: "2026-06-01", to: "2026-06-07" }], today)).toBe(28);
    expect(trendWeeks([{ from: "2023-01-01", to: "2023-01-31" }], today)).toBe(104);
  });
  it("covers the comparison period too", () => {
    expect(trendWeeks([{ from: "2026-11-01", to: today }, { from: "2026-05-01", to: "2026-05-27" }], today)).toBe(32);
  });
});

describe("period figures", () => {
  const pts = [
    { date: "2026-10-30", value: 70 },
    { date: "2026-11-01", value: 60 },
    { date: "2026-11-02", value: null },
    { date: "2026-11-03", value: 64 },
  ];
  const nov = { from: "2026-11-01", to: "2026-11-30" };
  it("averages only the values in the period", () => {
    expect(meanIn(pts, nov)).toBe(62);
    expect(meanIn(pts, { from: "2026-12-01", to: "2026-12-31" })).toBeNull();
  });
  it("finds the first and last value in the period", () => {
    expect(endsIn(pts, nov)).toEqual({ first: 60, last: 64, firstDate: "2026-11-01", lastDate: "2026-11-03" });
  });
});
