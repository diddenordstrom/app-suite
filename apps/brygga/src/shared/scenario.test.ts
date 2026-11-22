import { describe, expect, it } from "vitest";
import { defaultScenario, parseScenario, savingsCheck, toModel } from "./scenario";

describe("parseScenario", () => {
  it("round-trips the defaults", () => {
    const s = defaultScenario();
    expect(parseScenario(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("rejects what is not a version 1 scenario", () => {
    expect(parseScenario(null)).toBeNull();
    expect(parseScenario("x")).toBeNull();
    expect(parseScenario({ v: 2 })).toBeNull();
  });

  it("fills gaps from the defaults and clamps out-of-range numbers", () => {
    const s = parseScenario({ v: 1, mode: "duo", people: [{ age: 40, allmStart: 61, salary: "lots" }], household: { loan: -5 } })!;
    expect(s.mode).toBe("duo");
    expect(s.people[0].age).toBe(40);
    expect(s.people[0].allmStart).toBe(64); // model change 4: today's earliest public pension age
    expect(s.people[0].salary).toBe(defaultScenario().people[0].salary);
    expect(s.household.loan).toBe(0);
    expect(s.people[1]).toEqual(defaultScenario().people[1]);
  });
});

describe("toModel", () => {
  it("uses one person in single mode and both in duo", () => {
    const s = defaultScenario();
    expect(toModel(s).people).toHaveLength(1);
    expect(toModel({ ...s, mode: "duo" }).people).toHaveLength(2);
  });
});

describe("savingsCheck", () => {
  it("accepts the example values", () => {
    expect(savingsCheck(defaultScenario()).ok).toBe(true);
  });

  it("flags savings larger than what is left", () => {
    const s = defaultScenario();
    s.people[0].stockSave = 20_000;
    const c = savingsCheck(s);
    expect(c.ok).toBe(false);
    expect(c.gap).toBeLessThan(0);
  });

  it("flags money that is not accounted for", () => {
    const s = defaultScenario();
    s.household.expensesNow = 10_000;
    expect(savingsCheck(s).gap).toBeGreaterThan(0);
  });
});
