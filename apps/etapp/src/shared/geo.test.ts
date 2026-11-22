import { describe, expect, it } from "vitest";
import { coordsFromMapsUrl, estimateLeg, formatLatLon, hasCoords, haversineKm, midpoint, parseLatLon, roundKm, roundMinutes } from "./geo";

const lom = { lat: 61.8384, lon: 8.5679 };
const geiranger = { lat: 62.1008, lon: 7.2059 };

describe("parseLatLon", () => {
  it("accepts comma, semicolon or space between the numbers", () => {
    expect(parseLatLon("61.8366, 8.5667")).toEqual({ lat: 61.8366, lon: 8.5667 });
    expect(parseLatLon("61.8366;8.5667")).toEqual({ lat: 61.8366, lon: 8.5667 });
    expect(parseLatLon(" -33.9 18.4 ")).toEqual({ lat: -33.9, lon: 18.4 });
  });
  it("rejects text and out-of-range values", () => {
    expect(parseLatLon("Lom")).toBeNull();
    expect(parseLatLon("")).toBeNull();
    expect(parseLatLon(null)).toBeNull();
    expect(parseLatLon("91, 8")).toBeNull();
    expect(parseLatLon("61, 181")).toBeNull();
  });
});

describe("hasCoords / formatLatLon", () => {
  it("needs two finite numbers", () => {
    expect(hasCoords(lom)).toBe(true);
    expect(hasCoords({ lat: null, lon: 8 })).toBe(false);
    expect(hasCoords({ lat: NaN, lon: 8 })).toBe(false);
    expect(hasCoords(null)).toBe(false);
  });
  it("formats with four decimals, empty without a position", () => {
    expect(formatLatLon({ lat: 61.83841, lon: 8.5 })).toBe("61.8384, 8.5000");
    expect(formatLatLon({ lat: null, lon: null })).toBe("");
  });
});

describe("estimates", () => {
  it("haversine matches a known distance", () => {
    // Lom to Geiranger is about 77 km in a straight line.
    expect(haversineKm(lom, geiranger)).toBeGreaterThan(74);
    expect(haversineKm(lom, geiranger)).toBeLessThan(80);
    expect(haversineKm(lom, lom)).toBe(0);
  });
  it("road distance is straight line × 1.3 at 70 km/h", () => {
    const e = estimateLeg(lom, geiranger);
    expect(e.km).toBeCloseTo(haversineKm(lom, geiranger) * 1.3, 6);
    expect(e.hours).toBeCloseTo(e.km / 70, 6);
  });
  it("rounds for display with floors of 5 km and 15 min", () => {
    expect(roundKm(1)).toBe(5);
    expect(roundKm(101)).toBe(100);
    expect(roundKm(103)).toBe(105);
    expect(roundMinutes(0.05)).toBe(15);
    expect(roundMinutes(1.4)).toBe(90);
    expect(roundMinutes(2)).toBe(120);
  });
  it("midpoint is the average", () => {
    expect(midpoint({ lat: 60, lon: 8 }, { lat: 62, lon: 10 })).toEqual({ lat: 61, lon: 9 });
  });
});

describe("coordsFromMapsUrl", () => {
  it("reads the common long-URL forms", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/place/Lom/@61.8384,8.5679,14z")).toEqual({ lat: 61.8384, lon: 8.5679 });
    expect(coordsFromMapsUrl("https://www.google.com/maps/place/x/data=!3d61.83!4d8.56")).toEqual({ lat: 61.83, lon: 8.56 });
    expect(coordsFromMapsUrl("https://maps.google.com/?q=61.83%2C8.56")).toEqual({ lat: 61.83, lon: 8.56 });
  });
  it("flags short share links, which carry no position", () => {
    expect(coordsFromMapsUrl("https://maps.app.goo.gl/439yRrFsK7vXw43f8?g_st=ic")).toBe("short");
  });
  it("returns null for other links", () => {
    expect(coordsFromMapsUrl("https://www.google.com/maps/search/camping")).toBeNull();
  });
});
