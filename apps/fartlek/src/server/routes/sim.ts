import { simulate, simText, type SimInput } from "../simulate";
import { parseTuning } from "../../shared/tuning";
import { body, date, num, oneOf, router, BadRequest } from "./util";

/*
 * POST /api/sim: the plan simulator (docs/decisions/fartlek-simulator.md) for a made-up runner, in its own in-memory
 * database; nothing of the caller's is read or written. One simulation at a time per server: a long road is a few
 * seconds of CPU. `?format=text` answers with the terminal table instead of JSON.
 */

const day = (v: unknown, name: string) => num(v, name, 0, 6);
const days = (v: unknown, name: string) => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 7) throw new BadRequest(`${name} must be up to 7 weekdays`);
  return [...new Set(v.map((x, i) => day(x, `${name}[${i}]`)))];
};

export function parseSimInput(b: Record<string, unknown>): SimInput {
  if (!Array.isArray(b.history) || !b.history.length || b.history.length > 26) throw new BadRequest("history must be 1–26 weeks of km");
  const out: SimInput = { history: b.history.map((x, i) => num(x, `history[${i}]`, 0, 250)) };
  out.runDays = days(b.runDays, "runDays");
  if (b.longRunDay !== undefined) out.longRunDay = day(b.longRunDay, "longRunDay");
  out.gymDays = days(b.gymDays, "gymDays");
  if (b.crossDays !== undefined) {
    if (!Array.isArray(b.crossDays) || b.crossDays.length > 7) throw new BadRequest("crossDays must be up to 7 days");
    out.crossDays = b.crossDays.map((c: Record<string, unknown>, i) => ({ day: day(c?.day, `crossDays[${i}].day`), min: Math.round(num(c?.min, `crossDays[${i}].min`, 5, 600)) }));
  }
  if (b.doubles !== undefined) out.doubles = oneOf(b.doubles, ["off", "gym", "all"] as const, "doubles");
  if (b.threshold !== undefined) {
    const t = b.threshold as Record<string, unknown>;
    out.threshold = { pace: num(t?.pace, "threshold.pace", 150, 600), hr: num(t?.hr, "threshold.hr", 100, 220) };
  }
  if (b.maxHr !== undefined) out.maxHr = num(b.maxHr, "maxHr", 120, 230);
  if (b.race !== undefined) {
    const r = b.race as Record<string, unknown>;
    out.race = {
      inWeeks: Math.round(num(r?.inWeeks, "race.inWeeks", 1, 40)),
      ...(r?.distanceKm !== undefined ? { distanceKm: num(r.distanceKm, "race.distanceKm", 1, 100) } : {}),
      ...(r?.goalSeconds !== undefined ? { goalSeconds: num(r.goalSeconds, "race.goalSeconds", 600, 86400) } : {}),
      ...(r?.priority !== undefined ? { priority: oneOf(r.priority, ["A", "B"] as const, "race.priority") } : {}),
      ...(r?.day !== undefined ? { day: day(r.day, "race.day") } : {}),
    };
  }
  if (b.weeks !== undefined) out.weeks = Math.round(num(b.weeks, "weeks", 1, 40));
  if (b.rhythm !== undefined) out.rhythm = oneOf(b.rhythm, ["1:1", "2:1", "3:1"] as const, "rhythm");
  if (b.racePace !== undefined) out.racePace = oneOf(b.racePace, ["prediction", "goal"] as const, "racePace");
  if (b.acceptAdvice !== undefined) out.acceptAdvice = b.acceptAdvice === true;
  if (b.tuning !== undefined) {
    const t = parseTuning(b.tuning);
    if (!t) throw new BadRequest("invalid tuning");
    out.tuning = t;
  }
  if (b.start !== undefined) {
    out.start = date(b.start, "start");
    if (new Date(`${out.start}T12:00:00Z`).getUTCDay() !== 1) throw new BadRequest("start must be a Monday");
  }
  return out;
}

export function simRoutes() {
  const r = router();
  let busy = false;
  r.post("/sim", async (c) => {
    const input = parseSimInput(await body(c));
    if (busy) return c.json({ error: "a simulation is already running, try again in a moment" }, 429);
    busy = true;
    try {
      const res = await simulate(input);
      return c.req.query("format") === "text" ? c.text(simText(res)) : c.json(res);
    } finally { busy = false; }
  });
  return r;
}
