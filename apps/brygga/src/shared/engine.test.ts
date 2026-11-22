import { describe, expect, it } from "vitest";
import { candidates, monthlyPayment, reason, runPath } from "./engine";
import { draft4Model, type Draft4Inputs } from "./fixtures/draft4";
import facit from "./fixtures/draft4.json";

/*
 * Pins the engine to draft 4. fixtures/draft4.json was produced by running the draft's own
 * script (fixtures/draft4-facit.mjs) on the scenarios below; any change to these numbers
 * must be a deliberate model change with the fixture or test updated alongside.
 */
const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 4);

describe.each(Object.entries(facit))("draft 4 scenario %s", (_name, f) => {
  const model = draft4Model(f.input as Partial<Draft4Inputs>);
  const retAge = model.people[0].retAge;

  it("keeps the monthly mortgage payment", () => close(monthlyPayment(model.household), f.payment));

  it("finds the same OK stop ages", () => {
    const c = candidates(model);
    expect(c.filter((x) => x.ok).map((x) => x.a)).toEqual(f.okAges);
    expect(c.find((x) => x.ok)?.a ?? null).toBe(f.earliest);
  });

  it("gives the same result for the chosen stop age", () => {
    const r = runPath(model, [retAge]);
    const e = f.chosen;
    for (const k of ["marginOk", "bridgeShort", "shortfall", "ok", "fire4"] as const) expect(r[k], k).toBe(e[k]);
    close(r.liqRealA, e.liqRealA);
    close(r.need, e.need);
    close(r.minBridge, e.minBridge);
    expect(r.pts.length).toBe(e.nw.length);
    r.pts.forEach((p, j) => {
      close(p.nw, e.nw[j]);
      close(p.liquid, e.liquid[j]);
      close(p.pension, e.pension[j]);
    });
  });
});

describe("reason", () => {
  it("names the first failed check", () => {
    const tight = draft4Model(facit.tight.input as Partial<Draft4Inputs>);
    expect(reason(runPath(tight, [tight.people[0].retAge]))).toBe("reason.bridgeShort");
  });
});
