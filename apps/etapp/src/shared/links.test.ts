import { describe, expect, it } from "vitest";
import { alongTheWay, dayRouteUrl, directionsUrl, legUrl, nearbyUrl, placeSearchUrl, tripRouteUrl, weatherLink } from "./links";
import { dayPoints, type Day, type Home, type Plan, type Stop } from "./plan";

let nextId = 1;
const stop = (name: string, lat: number | null = null, lon: number | null = null): Stop =>
  ({ id: nextId++, name, lat, lon, note: "", openFrom: null, openTo: null, todos: [] });
const day = (stops: Stop[], sleep: Partial<Day["sleep"]> = {}): Day =>
  ({ id: nextId++, title: "", stops, sleep: { type: "tent", name: "", lat: null, lon: null, note: "", ...sleep } });
const plan = (days: Day[], p: Partial<Plan> = {}): Plan =>
  ({ area: "Norge", startMode: "home", startText: "", startDate: null, days, ...p });
const home: Home = { label: "Jönköping", lat: 57.7826, lon: 14.1618 };
const params = (url: string) => Object.fromEntries(new URL(url).searchParams);

describe("directionsUrl", () => {
  it("builds a driving link with encoded places", () => {
    expect(params(directionsUrl("57.7826,14.1618", "Lom, Norge", ["A", "B"]))).toEqual({
      api: "1", travelmode: "driving", destination: "Lom, Norge", origin: "57.7826,14.1618", waypoints: "A|B",
    });
  });
  it("omits the origin for 'my location' and caps waypoints at 9", () => {
    const p = params(directionsUrl("", "X", Array.from({ length: 12 }, (_, i) => `w${i}`)));
    expect(p.origin).toBeUndefined();
    expect(p.waypoints.split("|")).toHaveLength(9);
  });
});

describe("searches", () => {
  it("searches around a position as a map view", () => {
    expect(nearbyUrl("camping", { lat: 61.8, lon: 8.5 }, "Norge", 11)).toBe("https://www.google.com/maps/search/camping/@61.8,8.5,11z");
  });
  it("falls back to a text search near the name", () => {
    expect(params(nearbyUrl("kafé bageri", { name: "Lom" }, "Norge")).query).toBe("kafé bageri nära Lom Norge");
    expect(params(placeSearchUrl("Pollfossen", "Norge")).query).toBe("Pollfossen, Norge");
  });
});

describe("legs", () => {
  const p = plan([day([stop("Lom", 61.8384, 8.5679), stop("Pollfossen")])]);
  const pts = dayPoints(p, 0, home);
  it("links each leg", () => {
    expect(params(legUrl(pts[0], pts[1]))).toMatchObject({ origin: "57.7826,14.1618", destination: "61.8384,8.5679" });
  });
  it("offers 'along the way' only when both ends have positions", () => {
    const along = alongTheWay(pts[0], pts[1], "Norge")!;
    expect(along.map((a) => a.key)).toEqual(["fika", "food", "camping", "restArea", "fuel", "grocery"]);
    const [, lat, lon, zoom] = along[0].url.match(/@([\d.]+),([\d.]+),(\d+)z$/)!;
    expect(Number(lat)).toBeCloseTo((57.7826 + 61.8384) / 2, 6); // searches around the midpoint
    expect(Number(lon)).toBeCloseTo((14.1618 + 8.5679) / 2, 6);
    expect(zoom).toBe("9");
    expect(alongTheWay(pts[1], pts[2], "Norge")).toBeNull();
  });
});

describe("route links", () => {
  it("day route ends at the night with stops as waypoints", () => {
    const p = plan([day([stop("Lom"), stop("Pollfossen")], { name: "Camping Skjåk" })]);
    expect(params(dayRouteUrl(p, 0, home)!)).toMatchObject({
      origin: "57.7826,14.1618", destination: "Camping Skjåk, Norge", waypoints: "Lom, Norge|Pollfossen, Norge",
    });
  });
  it("without a night the last stop is the destination; an empty day has no route", () => {
    const p = plan([day([stop("Lom"), stop("Pollfossen")]), day([])]);
    expect(params(dayRouteUrl(p, 0, home)!)).toMatchObject({ destination: "Pollfossen, Norge", waypoints: "Lom, Norge" });
    expect(dayRouteUrl(p, 1, home)).toBeNull();
  });
  it("the next day starts from the night", () => {
    const p = plan([day([], { name: "Camping Skjåk" }), day([stop("Geiranger")])]);
    expect(params(dayRouteUrl(p, 1, home)!).origin).toBe("Camping Skjåk, Norge");
  });
  it("trip route runs through every stop and night", () => {
    const p = plan([day([stop("Lom")], { name: "Natt 1" }), day([stop("Geiranger")])]);
    expect(params(tripRouteUrl(p, home)!)).toMatchObject({ origin: "57.7826,14.1618", destination: "Geiranger, Norge", waypoints: "Lom, Norge|Natt 1, Norge" });
    expect(tripRouteUrl(plan([day([])]), home)).toBeNull();
  });
});

describe("weatherLink", () => {
  it("prefers yr.no at the night's position, then the last positioned stop", () => {
    expect(weatherLink(plan([day([stop("Lom", 61.8, 8.5)], { name: "N", lat: 61.9, lon: 8.3 })]), 0))
      .toEqual({ kind: "yr", url: "https://www.yr.no/en/forecast/daily-table/61.9000,8.3000" });
    expect(weatherLink(plan([day([stop("Lom", 61.8, 8.5), stop("Okänd")])]), 0)?.url).toContain("61.8000,8.5000");
  });
  it("searches by name without positions, nothing for an empty day", () => {
    expect(weatherLink(plan([day([stop("Lom")])]), 0)).toEqual({ kind: "search", url: "https://www.google.com/search?q=v%C3%A4der%20Lom%20Norge" });
    expect(weatherLink(plan([day([])]), 0)).toBeNull();
  });
});
