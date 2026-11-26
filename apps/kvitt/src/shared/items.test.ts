import { describe, expect, it } from "vitest";
import { itemTotal, listTotal, quantityCount } from "./items";

describe("item prices", () => {
  it("reads the leading number of a quantity, 1 otherwise", () => {
    expect(quantityCount("5")).toBe(5);
    expect(quantityCount("5 st")).toBe(5);
    expect(quantityCount("2,5 kg")).toBe(2.5);
    expect(quantityCount("en burk")).toBe(1);
    expect(quantityCount(null)).toBe(1);
    expect(quantityCount("0")).toBe(1);
  });

  it("multiplies the piece price by the count", () => {
    expect(itemTotal({ price: 20000, quantity: null })).toBe(20000);
    expect(itemTotal({ price: 10000, quantity: "5" })).toBe(50000);
    expect(itemTotal({ price: 3333, quantity: "2,5 kg" })).toBe(8333);
    expect(itemTotal({ price: null, quantity: "5" })).toBeNull();
    expect(itemTotal({ price: 0, quantity: "5" })).toBe(0);
  });

  it("sums priced items and counts the rest", () => {
    expect(listTotal([{ price: 20000, quantity: null }, { price: 10000, quantity: "2" }, { price: null, quantity: null }])).toEqual({ total: 40000, priced: 2, unpriced: 1 });
    expect(listTotal([])).toEqual({ total: 0, priced: 0, unpriced: 0 });
  });
});
