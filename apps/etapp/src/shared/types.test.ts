import { describe, expect, it } from "vitest";
import { displayName } from "./types";

describe("displayName", () => {
  it("prefers name, then email, then sub", () => {
    expect(displayName({ name: "A", email: "a@x", sub: "s" })).toBe("A");
    expect(displayName({ name: null, email: "a@x", sub: "s" })).toBe("a@x");
    expect(displayName({ name: null, email: null, sub: "s" })).toBe("s");
  });
});
