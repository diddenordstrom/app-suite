import { describe, expect, it } from "vitest";
import { addMonths, DEFAULT_GIFT_CATEGORIES, giftByDefault, hintDue, lastGiftByMember, parseCategoryLabels, parseGiftCategories } from "./gifts";

describe("gift categories", () => {
  it("defaults to bjudet for hemma only; drinks, restaurant, activity, annat and free text are delas", () => {
    expect(giftByDefault("home", DEFAULT_GIFT_CATEGORIES)).toBe(true);
    for (const k of ["drinks", "restaurant", "activity", "other"]) expect(giftByDefault(k, DEFAULT_GIFT_CATEGORIES)).toBe(false);
    expect(giftByDefault("Pizza", DEFAULT_GIFT_CATEGORIES)).toBe(false);
    expect(giftByDefault(null, DEFAULT_GIFT_CATEGORIES)).toBe(false);
  });
  it("falls back to the defaults on unreadable stored JSON", () => {
    expect(parseGiftCategories('["drinks"]')).toEqual(["drinks"]);
    expect(parseGiftCategories("nope")).toEqual(DEFAULT_GIFT_CATEGORIES);
    expect(parseGiftCategories('{"a":1}')).toEqual(DEFAULT_GIFT_CATEGORIES);
    expect(parseGiftCategories("[1,2]")).toEqual(DEFAULT_GIFT_CATEGORIES);
  });
});

describe("lastGiftByMember", () => {
  it("keeps the latest date per host", () => {
    const m = lastGiftByMember([
      { payerId: 1, date: "2026-11-01" }, { payerId: 2, date: "2026-11-07" }, { payerId: 1, date: "2026-11-08" }, { payerId: 1, date: "2026-10-31" },
    ]);
    expect(m.get(1)).toBe("2026-11-08");
    expect(m.get(2)).toBe("2026-11-07");
    expect(m.get(3)).toBeUndefined();
  });
});

describe("addMonths", () => {
  it("adds calendar months and clamps the day", () => {
    expect(addMonths("2026-10-08", 1)).toBe("2026-11-08");
    expect(addMonths("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("hintDue", () => {
  it("never nags before the first bjudning", () => {
    expect(hintDue(null, "2026-11-10", 1)).toBe(false);
  });
  it("is due exactly one calendar month after the latest bjudning, not before", () => {
    expect(hintDue("2026-10-10", "2026-11-09", 1)).toBe(false);
    expect(hintDue("2026-10-10", "2026-11-10", 1)).toBe(true);
    expect(hintDue("2026-11-08", "2026-11-10", 1)).toBe(false);
  });
  it("never goes below one month and honours longer settings", () => {
    expect(hintDue("2026-11-08", "2026-11-10", 0)).toBe(false);
    expect(hintDue("2026-09-10", "2026-11-09", 2)).toBe(false);
    expect(hintDue("2026-09-10", "2026-11-10", 2)).toBe(true);
  });
});

describe("parseCategoryLabels", () => {
  it("keeps trimmed labels for the five known slots and drops everything else", () => {
    expect(parseCategoryLabels('{"home":" Middag ","drinks":"","bogus":"x","other":5,"activity":"Ett alldeles för långt namn på en kategori"}')).toEqual({ home: "Middag" });
    expect(parseCategoryLabels("nope")).toEqual({});
    expect(parseCategoryLabels("[]")).toEqual({});
  });
});
