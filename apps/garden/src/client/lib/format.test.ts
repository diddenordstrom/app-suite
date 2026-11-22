import { describe, expect, it } from "vitest";
import { formatQuantity } from "./format";

describe("formatQuantity", () => {
  it("shows grams under a kilo", () => {
    expect(formatQuantity(0.5)).toBe("500 g");
    expect(formatQuantity(0.0004)).toBe("0 g");
  });
  it("shows kilos from one kilo up", () => {
    expect(formatQuantity(1)).toBe("1 kg");
    expect(formatQuantity(2.5)).toBe("2.5 kg");
  });
});
