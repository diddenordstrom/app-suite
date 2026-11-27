import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { TrendsCards } from "./StatsTrends";
import type { TrendsData } from "../types";
import { addDays, range } from "@/shared/dates";

const today = "2026-11-27";
const from = addDays(today, -89);
const days = range(from, today);
const rolling = { kind: "rolling" as const, current: { from, to: today }, previous: { from, to: today }, currentCurve: [], previousCurve: [] };
const data = {
  today, from,
  load: { series: days.map((d, i) => ({ date: d, load: 50, ctl: 40 + i / 10, atl: 45, tsb: -5, formPct: -12 })), race: null, planEnd: null },
  easy: [],
  threshold: {
    points: [{ date: "2026-11-20", pace: 280, hr: 168, intervals: 3, activityId: "a1", name: "Tröskel", inRange: 3 }],
    estimates: [
      { id: 1, effectiveDate: "2026-09-01", paceSecPerKm: 290, hr: 170 },
      { id: 2, effectiveDate: "2026-11-15", paceSecPerKm: 284, hr: 169 },
    ],
    current: { id: 2, effectiveDate: "2026-11-15", paceSecPerKm: 284, hr: 169 },
    proposal: null,
  },
  cs: { tests: [], latest: null, olderTest: null },
  best: { pending: 0, allTime: [], block: null, rolling, gapShare: null },
  vo2max: { points: [], latest: null, change8w: null },
  log: { fuel: [], fuelAdvice: { gPerH: 60, reason: { key: "fuel.reason.start" } }, srpe: [], durability: [] },
  pain: { trends: [], entries: [] },
  wellness: days.map((d) => ({ date: d, hrvWeeklyAvg: d >= "2026-11-01" ? 62 : 58, hrvLastNight: null, hrvBaselineLow: 50, restingHr: d >= "2026-11-01" ? 48 : 50, bodyBatteryMax: null, sleepScore: null })),
  checkins: [],
} as unknown as TrendsData;

const nov = { from: "2026-11-01", to: "2026-11-30" };
const oct = { from: "2026-10-01", to: "2026-10-30" };
const render = (b: typeof oct | null) => renderToStaticMarkup(
  <MemoryRouter><TrendsCards data={data} sides={{ a: nov, b, shortA: "nov.", shortB: "okt." }} /></MemoryRouter>,
);

describe("Statistik, Trender view", () => {
  it("puts the period's figures on top: form today, HRV and resting HR means, threshold movement", () => {
    const html = render(null);
    expect(html).toMatch(/Form (idag|today)/);
    expect(html).toMatch(/(Snitt|Mean) nov\./);
    expect(html).toContain(">62<");
    expect(html).toContain(">48<");
    // The estimate moved from 4:50 to 4:44 during November.
    expect(html).toMatch(/↑ 6 s/);
    expect(html).toMatch(/(under|during) nov\./);
    // Kilometres per week and intensity are on the Period view now.
    expect(html).not.toMatch(/Kilometer per vecka|Kilometers per week|Intensitetsfördelning|Intensity distribution/);
  });

  it("compares the means with the other period when comparing", () => {
    const html = render(oct);
    expect(html).toMatch(/\+4 (mot|vs) okt\./);
    expect(html).toMatch(/−2 (mot|vs) okt\.|-2 (mot|vs) okt\./);
    expect(html).toMatch(/(Tröskel|Threshold) okt\./);
  });
});
