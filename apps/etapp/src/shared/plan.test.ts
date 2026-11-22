import { describe, expect, it } from "vitest";
import {
  closedMonth, dayDate, formatDuration, parseDuration, stopNumbers, dayPoints, dayStart, dayStats, firstStopNumber, placeQuery, sleepPoint, startPoint, todayIndex, tripStats,
  type Day, type Home, type Plan, type Stop,
} from "./plan";

let nextId = 1;
const stop = (name: string, lat: number | null = null, lon: number | null = null, extra: Partial<Stop> = {}): Stop =>
  ({ id: nextId++, kind: "stop", name, lat, lon, note: "", openFrom: null, openTo: null, todos: [], links: [], photoUrl: null, ...extra });
const day = (stops: Stop[], sleep: Partial<Day["sleep"]> = {}): Day =>
  ({ id: nextId++, title: "", driveMinutes: null, stops, sleep: { type: "tent", name: "", lat: null, lon: null, note: "", ...sleep } });
const plan = (days: Day[], p: Partial<Plan> = {}): Plan =>
  ({ area: "Norge", startMode: "home", startText: "", startDate: null, days, ...p });
const home: Home = { label: "Jönköping", lat: 57.7826, lon: 14.1618 };

describe("startPoint", () => {
  it("uses the viewer's home", () => {
    expect(startPoint(plan([]), home)).toMatchObject({ label: "Jönköping", lat: 57.7826, query: "57.7826,14.1618", missing: "none" });
  });
  it("flags a missing home and a home without position", () => {
    expect(startPoint(plan([]), null).missing).toBe("home");
    expect(startPoint(plan([]), { label: "Huskvarna", lat: null, lon: null })).toMatchObject({ query: "Huskvarna", missing: "position" });
  });
  it("leaves 'my location' to Google Maps", () => {
    expect(startPoint(plan([], { startMode: "here" }), home)).toMatchObject({ query: "", missing: "here" });
  });
  it("custom start: coordinates, quick-pick places, free text, empty", () => {
    const c = (startText: string) => startPoint(plan([], { startMode: "custom", startText }), home);
    expect(c("59.91, 10.75")).toMatchObject({ lat: 59.91, lon: 10.75, query: "59.91,10.75", missing: "none" });
    expect(c("göteborg")).toMatchObject({ label: "Göteborg", missing: "none" });
    expect(c("Örebro")).toMatchObject({ label: "Örebro", query: "Örebro", missing: "position" });
    expect(c("  ").missing).toBe("text");
  });
});

describe("route points", () => {
  it("query prefers coordinates, else name plus area", () => {
    expect(placeQuery("Norge", { name: "Lom", lat: 61.8, lon: 8.5 })).toBe("61.8,8.5");
    expect(placeQuery("Norge", { name: "Lom" })).toBe("Lom, Norge");
    expect(placeQuery("", { name: "Lom" })).toBe("Lom");
  });
  it("a night counts only with a name or a position", () => {
    const p = plan([day([]), day([], { name: "Camping Skjåk" }), day([], { lat: 61.9, lon: 8.3 })]);
    expect(sleepPoint(p, p.days[0])).toBeNull();
    expect(sleepPoint(p, p.days[1])?.query).toBe("Camping Skjåk, Norge");
    expect(sleepPoint(p, p.days[2])?.query).toBe("61.9,8.3");
  });
  it("a day starts at the previous night, else its last stop, else further back", () => {
    const p = plan([
      day([stop("Lom")], { name: "Camping" }),
      day([stop("Pollfossen"), stop("Strynefjell")]),
      day([]),
      day([stop("Geiranger")]),
    ]);
    expect(dayStart(p, 0, home).kind).toBe("start");
    expect(dayStart(p, 1, home).label).toBe("Camping");
    expect(dayStart(p, 2, home).label).toBe("Strynefjell");
    expect(dayStart(p, 3, home).label).toBe("Strynefjell"); // day 3 had nothing
  });
  it("points run start → stops → night", () => {
    const p = plan([day([stop("A"), stop("B")], { name: "Natt" })]);
    expect(dayPoints(p, 0, home).map((x) => x.kind)).toEqual(["start", "stop", "stop", "night"]);
  });
});

describe("dayStats", () => {
  it("adds up legs with positions and counts the rest as unknown", () => {
    const p = plan([day([stop("Lom", 61.8384, 8.5679), stop("Okänd"), stop("Geiranger", 62.1008, 7.2059)])]);
    const s = dayStats(p, 0, home);
    expect(s.total).toBe(3);
    expect(s.known).toBe(1); // home → Lom; Lom → Okänd and Okänd → Geiranger lack a position
    expect(s.km).toBeGreaterThan(400);
    expect(s.hours).toBeCloseTo(s.km / 70, 6);
  });
  it("an empty day has no legs", () => {
    expect(dayStats(plan([day([])]), 0, home)).toEqual({ km: 0, hours: 0, known: 0, total: 0 });
  });
});

describe("tripStats and numbering", () => {
  it("counts days, stops and todos", () => {
    const p = plan([
      day([stop("A", null, null, { todos: [{ id: 1, text: "Fika", category: "fika", done: true }, { id: 2, text: "Tanka", category: "fixa", done: false }] })]),
      day([stop("B"), stop("C")]),
    ]);
    expect(tripStats(p, home)).toMatchObject({ days: 2, stops: 3, todos: 2, done: 1, knownLegs: 0, legs: 3 });
    expect(firstStopNumber(p, 0)).toBe(1);
    expect(firstStopNumber(p, 1)).toBe(2);
  });
});

describe("dates", () => {
  it("day i is the start date plus i, across month ends", () => {
    expect(dayDate("2027-06-29", 3)).toEqual(new Date(2027, 6, 2));
    expect(dayDate(null, 0)).toBeNull();
    expect(dayDate("juni", 0)).toBeNull();
  });
  it("finds today", () => {
    const p = plan([day([]), day([]), day([])], { startDate: "2027-07-01" });
    expect(todayIndex(p, new Date(2027, 6, 2, 15, 30))).toBe(1);
    expect(todayIndex(p, new Date(2027, 6, 9))).toBe(-1);
    expect(todayIndex(plan([day([])]), new Date())).toBe(-1);
  });
});

describe("closedMonth", () => {
  const strynefjell = { openFrom: 6, openTo: 9 };
  it("warns outside the season", () => {
    expect(closedMonth(strynefjell, new Date(2027, 4, 20))).toBe(5);
    expect(closedMonth(strynefjell, new Date(2027, 6, 1))).toBeNull();
  });
  it("handles seasons that wrap the new year", () => {
    const winter = { openFrom: 11, openTo: 3 };
    expect(closedMonth(winter, new Date(2027, 0, 10))).toBeNull();
    expect(closedMonth(winter, new Date(2027, 6, 10))).toBe(7);
  });
  it("never warns without a season or a date", () => {
    expect(closedMonth({ openFrom: null, openTo: null }, new Date())).toBeNull();
    expect(closedMonth(strynefjell, null)).toBeNull();
  });
});

describe("vias and drive time", () => {
  it("numbers only real stops, through the whole trip", () => {
    const p = plan([day([stop("A"), stop("v", null, null, { kind: "via" }), stop("B")]), day([stop("w", null, null, { kind: "via" }), stop("C")])]);
    expect(stopNumbers(p, 0)).toEqual([1, null, 2]);
    expect(stopNumbers(p, 1)).toEqual([null, 3]);
    expect(firstStopNumber(p, 1)).toBe(3);
    expect(tripStats(p, null).stops).toBe(3);
  });

  it("reads drive times the way Google Maps and people write them", () => {
    expect(parseDuration("10:20")).toBe(620);
    expect(parseDuration("10 tim 20 min")).toBe(620);
    expect(parseDuration("10h")).toBe(600);
    expect(parseDuration("45 min")).toBe(45);
    expect(parseDuration("90")).toBe(90);
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("långt")).toBeUndefined();
    expect(formatDuration(620)).toBe("10:20");
    expect(formatDuration(null)).toBe("");
  });
});
