/*
 * Planning scenarios: a runner's history as weekly km, put into an in-memory database through the real
 * app, then "Föreslå veckan" and "Föreslå block" run on it as in the app. Used by scenarios.test.ts to pin
 * what the engines suggest for real-looking histories, and by `npm run scenarios -w apps/fartlek` to print
 * them while tuning the engines, so a change can be judged without a release and a phone screenshot.
 */
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { addDays, todayIn, weekday, weekStartOf, type ISODate } from "../shared/dates";
import type { Suggestion } from "../shared/nextweek";
import type { BlockSuggestion, PlannedWeek } from "../shared/blockplan";
import type { RaceRoad } from "../shared/raceplan";

export interface Scenario {
  name: string;
  /** What the history is meant to look like, for the printout. */
  note: string;
  /** Run km per week, oldest first; the last one is the current week (run up to yesterday, planned from today). */
  weeks: number[];
  runDays?: number[];
  longRunDay?: number;
  /** Threshold pace (s/km) and heart rate. */
  threshold?: { pace: number; hr: number };
  maxHr?: number;
  /** A race this many weeks from the block's start (1 = its first week), on Saturday: "Skapa block" plans toward it. */
  race?: { inWeeks: number; priority: "A" | "B"; /** Default 21.1 (a half). */ distanceKm?: number; goalSeconds?: number };
  /** A race run this many days before the block's start (a race-list row and a run that day): the block starts with recovery weeks. */
  raceAgo?: { days: number; priority: "A" | "B"; distanceKm: number };
}

export const SCENARIOS: Scenario[] = [
  {
    name: "dip and return",
    note: "35 km at v37, a dip to 6–11 km, back to 20 and 23 km (a typical comeback)",
    weeks: [30, 32, 35, 31, 28, 26, 30, 6, 8, 10.9, 20.2, 23.3],
    runDays: [2, 3, 5, 0], longRunDay: 0, threshold: { pace: 265, hr: 172 }, maxHr: 192,
  },
  {
    name: "after a spike",
    note: "the same runner after a 32 km week that jumped from 20: form is deep, the next week should be lighter, then build",
    weeks: [30, 32, 35, 31, 28, 26, 30, 6, 8, 10.9, 20.2, 32.3],
    runDays: [2, 3, 5, 0], longRunDay: 0, threshold: { pace: 265, hr: 172 }, maxHr: 192,
  },
  {
    name: "steady",
    note: "months of the same 30 km week",
    weeks: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 270, hr: 170 }, maxHr: 190,
  },
  {
    name: "building",
    // A slow, even build: the steeper 32 → 34 → 36 → 38 used before is heavy form (−33 %) once the week's threshold run is done.
    note: "weeks of slow building to a new high, form not heavy: builds on, the block ends lighter",
    weeks: [32, 33, 34, 34, 35, 35, 36, 36, 37, 37, 38, 38],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190,
  },
  {
    name: "comeback",
    note: "40 km weeks, three weeks off, then 15 km",
    weeks: [40, 40, 42, 40, 41, 40, 42, 0, 0, 0, 12, 15],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 250, hr: 175 }, maxHr: 192,
  },
  {
    name: "beginner",
    note: "a new runner, 8–12 km weeks on three days",
    weeks: [0, 0, 0, 0, 0, 0, 6, 8, 8, 10, 11, 12],
    runDays: [2, 4, 0], longRunDay: 0, threshold: { pace: 330, hr: 175 }, maxHr: 195,
  },
  {
    name: "race in 5",
    note: "a steady 30 km runner with an A race five weeks out: an in-phase week, then the form peak (2:2)",
    weeks: [30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 270, hr: 170 }, maxHr: 190, race: { inWeeks: 5, priority: "A" },
  },
  {
    name: "race in 8",
    note: "the user's history with an A race eight weeks out: a 3:1 build, then the form peak",
    weeks: [30, 32, 35, 31, 28, 26, 30, 6, 8, 10.9, 20.2, 23.3],
    runDays: [2, 3, 5, 0], longRunDay: 0, threshold: { pace: 265, hr: 172 }, maxHr: 192, race: { inWeeks: 8, priority: "A" },
  },
  {
    name: "race in 14",
    note: "a building runner with an A race 14 weeks out: only the in-phase block now (2 weeks), the rest later",
    weeks: [26, 27, 28, 29, 30, 31, 30, 31, 32, 34, 36, 38],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190, race: { inWeeks: 14, priority: "A" },
  },
  {
    name: "race after a break",
    note: "back from three weeks off with an A race eight weeks out",
    weeks: [40, 40, 42, 40, 41, 40, 42, 0, 0, 0, 12, 15],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 250, hr: 175 }, maxHr: 192, race: { inWeeks: 8, priority: "A" },
  },
  {
    name: "race at peak",
    note: "three build weeks at a new high and an A race four weeks out: the form peak alone",
    weeks: [26, 27, 28, 29, 30, 31, 30, 31, 32, 34, 36, 38],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190, race: { inWeeks: 4, priority: "A" },
  },
  {
    name: "marathon in 8 at 45",
    note: "a steady 45 km runner with an A marathon eight weeks out: the race phase, two quality sessions a week",
    weeks: [44, 45, 46, 45, 44, 46, 45, 45, 46, 45, 44, 45],
    runDays: [1, 2, 4, 6, 0], longRunDay: 0, threshold: { pace: 255, hr: 172 }, maxHr: 190, race: { inWeeks: 8, priority: "A", distanceKm: 42.195, goalSeconds: 3 * 3600 + 30 * 60 },
  },
  {
    name: "marathon in 8 at 70",
    note: "a 70 km runner with an A marathon eight weeks out: the ladder stays as a third session",
    weeks: [68, 70, 71, 70, 69, 71, 70, 70, 71, 70, 69, 70],
    runDays: [1, 2, 3, 4, 6, 0], longRunDay: 0, threshold: { pace: 235, hr: 172 }, maxHr: 190, race: { inWeeks: 8, priority: "A", distanceKm: 42.195, goalSeconds: 3 * 3600 },
  },
  {
    name: "half in 6",
    note: "a 40 km runner with an A half marathon six weeks out: the phase starts at once, the weeks counted back from the race",
    weeks: [38, 40, 41, 40, 39, 41, 40, 40, 41, 40, 39, 40],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190, race: { inWeeks: 6, priority: "A", distanceKm: 21.0975, goalSeconds: 1 * 3600 + 40 * 60 },
  },
  {
    name: "after a marathon",
    note: "a 45 km runner who ran an A marathon the day before the block: four recovery weeks (docs/decisions/fartlek-post-race-recovery.md)",
    weeks: [44, 45, 46, 45, 44, 46, 45, 45, 46, 45, 44, 30],
    runDays: [1, 2, 4, 6, 0], longRunDay: 0, threshold: { pace: 255, hr: 172 }, maxHr: 190, raceAgo: { days: 1, priority: "A", distanceKm: 42.195 },
  },
  {
    name: "after a half, late",
    note: "a 40 km runner whose A half was 10 days before the block: one recovery week left, at 75 %, then the build",
    weeks: [38, 40, 41, 40, 39, 41, 40, 40, 41, 40, 30, 25],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190, raceAgo: { days: 10, priority: "A", distanceKm: 21.0975 },
  },
  // The race plan's skeleton (docs/decisions/fartlek-race-plan-skeleton.md): the whole road, phases and km per week.
  {
    name: "marathon in 20",
    note: "a steady 45 km runner with an A marathon 20 weeks out: 8/6/4/2, the long-run peak 8 to 5 weeks before the race",
    weeks: [44, 45, 46, 45, 44, 46, 45, 45, 46, 45, 44, 45],
    runDays: [1, 2, 4, 6, 0], longRunDay: 0, threshold: { pace: 255, hr: 172 }, maxHr: 190, race: { inWeeks: 20, priority: "A", distanceKm: 42.195, goalSeconds: 3 * 3600 + 30 * 60 },
  },
  {
    name: "marathon in 28",
    note: "the same runner 28 weeks out: 12/8/6/2, extra time into base",
    weeks: [44, 45, 46, 45, 44, 46, 45, 45, 46, 45, 44, 45],
    runDays: [1, 2, 4, 6, 0], longRunDay: 0, threshold: { pace: 255, hr: 172 }, maxHr: 190, race: { inWeeks: 28, priority: "A", distanceKm: 42.195, goalSeconds: 3 * 3600 + 30 * 60 },
  },
  {
    name: "half in 12",
    note: "a 35 km runner with an A half 12 weeks out: 3/4/3/2",
    weeks: [34, 35, 36, 35, 34, 36, 35, 35, 36, 35, 34, 35],
    runDays: [2, 4, 6, 0], longRunDay: 0, threshold: { pace: 260, hr: 172 }, maxHr: 190, race: { inWeeks: 12, priority: "A", distanceKm: 21.0975, goalSeconds: 1 * 3600 + 40 * 60 },
  },
  {
    name: "marathon in 10",
    note: "a 45 km runner with an A marathon only 10 weeks out: short, base gone, the goal offered lower",
    weeks: [44, 45, 46, 45, 44, 46, 45, 45, 46, 45, 44, 45],
    runDays: [1, 2, 4, 6, 0], longRunDay: 0, threshold: { pace: 255, hr: 172 }, maxHr: 190, race: { inWeeks: 10, priority: "A", distanceKm: 42.195, goalSeconds: 3 * 3600 },
  },
];

const ORIGIN = "http://localhost:5173";

/** A week's km over its run days: the long run about a third, one faster run, the rest easy. */
function runsOf(km: number, days: ISODate[], longDay: ISODate) {
  if (km <= 0 || !days.length) return [];
  const long = days.length > 1 ? km * 0.34 : km;
  const others = days.filter((d) => d !== longDay);
  const each = others.length ? (km - long) / others.length : 0;
  return days.map((d, i) => ({
    date: d, km: Math.round((d === longDay ? long : each) * 10) / 10,
    kind: d === longDay ? "long" as const : i === 0 ? "threshold" as const : "easy" as const,
  }));
}

export interface ScenarioResult {
  scenario: Scenario;
  weekStart: ISODate;
  week: { chosen: string; km: number; items: string; why: string; form: number; formPct: number; state: string; growth: number | null };
  blocks: { weeks: number; km: number[]; state: string; chosen: string; deepestPct: number | null }[];
  /** "Skapa block" with the race ahead: the weeks' roles and km, the blocks it makes now, and form on race day. */
  race: { roles: string; km: number[]; chunks: string; now: number; raceForm: number | null; state: string; weeks: PlannedWeek[]; warnings: BlockSuggestion["phaseWarnings"] } | null;
  /** The race plan's road, when the race has one. */
  road?: RaceRoad | null;
}

export async function runScenario(sc: Scenario, today: ISODate = todayIn("Europe/Stockholm")): Promise<ScenarioResult> {
  const db = createDb(":memory:");
  const app = createApp(db, loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
  const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });
  const get = async <T>(p: string) => (await app.request(p)).json() as Promise<T>;

  const settings = await get<Record<string, unknown>>("/api/settings");
  const runDays = sc.runDays ?? [2, 4, 6, 0], longRunDay = sc.longRunDay ?? 0;
  await app.request("/api/settings", json({ ...settings, runDays, longRunDay, maxHr: sc.maxHr ?? null }, "PUT"));
  const thr = sc.threshold ?? { pace: 270, hr: 170 };
  await app.request("/api/thresholds", json({ effectiveDate: addDays(today, -400), paceSecPerKm: thr.pace, hr: thr.hr }));

  const thisWeek = weekStartOf(today, "monday");
  const first = addDays(thisWeek, -7 * (sc.weeks.length - 1));
  const q = (sql: string, ...args: unknown[]) => db.$client.prepare(sql).run(...args);
  let n = 0;
  sc.weeks.forEach((km, i) => {
    const ws = addDays(first, i * 7);
    const days = Array.from({ length: 7 }, (_, d) => addDays(ws, d)).filter((d) => runDays.includes(weekday(d)));
    const longDay = days.find((d) => weekday(d) === longRunDay) ?? days.at(-1)!;
    for (const r of runsOf(km, days, longDay)) {
      const pace = r.kind === "threshold" ? thr.pace + 30 : r.kind === "long" ? thr.pace + 85 : thr.pace + 80;
      const hr = r.kind === "threshold" ? thr.hr - 6 : thr.hr - 24;
      if (r.date < today) {
        q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run)
           values (1, ?, ?, 'running', ?, ?, ?, ?, ?, 1)`, `sc:${++n}`, r.kind, `${r.date} 07:00:00`, r.date, r.km * 1000, Math.round(r.km * pace), hr);
      } else {
        q(`insert into workouts (user_id, date, type, distance_km) values (1, ?, ?, ?)`, r.date, r.kind === "threshold" ? "easy" : r.kind, r.km);
      }
    }
  });

  const weekStart = addDays(thisWeek, 7);
  if (sc.raceAgo) {
    const date = addDays(weekStart, -sc.raceAgo.days);
    await app.request("/api/races", json({ name: "Loppet", date, priority: sc.raceAgo.priority, distanceKm: sc.raceAgo.distanceKm }));
    const km = sc.raceAgo.distanceKm;
    if (date < today) {
      q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run)
         values (1, ?, 'race', 'running', ?, ?, ?, ?, ?, 1)`, `sc:${++n}`, `${date} 09:00:00`, date, km * 1000, Math.round(km * (thr.pace + 20)), thr.hr);
    } else q(`insert into workouts (user_id, date, type, distance_km) values (1, ?, 'race', ?)`, date, km);
  }
  const w = await get<{ suggestion: Suggestion }>(`/api/plan/next-week?weekStart=${weekStart}`);
  const s = w.suggestion;
  const items = s.items.map((it) => `${it.type === "threshold" ? "T" : it.type === "long" ? "L" : it.type === "cross" ? "X" : "E"}${it.type === "cross" ? it.durationMin : it.km}`).join(" ");
  const l = s.why.long;
  const why = [l ? `long ${l.km} (${l.why}, from ${l.longestKm})` : "long by share", s.why.thr ? `thr ${s.why.thr.reps}x${s.why.thr.min}` : "no thr",
    s.why.reentryKm ? `re-entry to ${s.why.reentryKm}` : null].filter(Boolean).join(", ");
  const blocks: ScenarioResult["blocks"] = [];
  let race: ScenarioResult["race"] = null;
  if (sc.race || sc.raceAgo) {
    if (sc.race) {
      const date = addDays(weekStart, (sc.race.inWeeks - 1) * 7 + 5);
      await app.request("/api/races", json({ name: "Testloppet", date, priority: sc.race.priority, distanceKm: sc.race.distanceKm ?? 21.1, ...(sc.race.goalSeconds ? { goalSeconds: sc.race.goalSeconds } : {}) }));
    }
    const b = await get<{ ok: boolean; suggestion?: BlockSuggestion; racePlan?: { chunks: { weeks: number; kind: string }[]; now: number } | null; reason?: string; road?: RaceRoad | null }>(`/api/plan/block-suggest?startWeek=${weekStart}`);
    const road = b.road ?? null;
    if (b.ok && b.suggestion) {
      race = {
        roles: b.suggestion.weeks.map((w) => w.role[0]).join(""),
        km: b.suggestion.weeks.map((x) => Math.round(x.items.filter((it) => it.type !== "cross").reduce((a, it) => a + it.km, 0) * 10) / 10),
        chunks: (b.racePlan?.chunks ?? []).map((c) => `${c.kind}:${c.weeks}`).join(" + "), now: b.racePlan?.now ?? 0,
        raceForm: b.suggestion.eval.race?.form ?? null, state: b.suggestion.eval.state,
        weeks: b.suggestion.weeks, warnings: b.suggestion.phaseWarnings,
      };
    } else race = { roles: "", km: [], chunks: `refused: ${b.reason}`, now: 0, raceForm: null, state: "", weeks: [], warnings: null };
    return { scenario: sc, weekStart, week: { chosen: s.chosen, km: s.eval.km, items, why, form: s.eval.form, formPct: s.eval.formPct, state: s.eval.state, growth: s.eval.growth }, blocks, race, road };
  }
  for (const weeks of [2, 4]) {
    const b = await get<{ ok: boolean; suggestion?: BlockSuggestion; reason?: string }>(`/api/plan/block-suggest?startWeek=${weekStart}&weeks=${weeks}`);
    if (!b.ok || !b.suggestion) { blocks.push({ weeks, km: [], state: `refused: ${b.reason}`, chosen: "", deepestPct: null }); continue; }
    blocks.push({ weeks, km: b.suggestion.weeks.map((x) => Math.round(x.items.filter((it) => it.type !== "cross").reduce((a, it) => a + it.km, 0) * 10) / 10),
      state: b.suggestion.eval.state, chosen: b.suggestion.chosen, deepestPct: b.suggestion.eval.deepest?.formPct ?? null });
  }
  return {
    scenario: sc, weekStart,
    week: { chosen: s.chosen, km: s.eval.km, items, why, form: s.eval.form, formPct: s.eval.formPct, state: s.eval.state, growth: s.eval.growth },
    blocks, race,
  };
}

/** One scenario as a few lines of text. */
export function describe(r: ScenarioResult): string {
  const sc = r.scenario, w = r.week;
  const pct = (x: number | null) => (x == null ? "–" : `${x > 0 ? "+" : ""}${Math.round(x * 100)} %`);
  return [
    `■ ${sc.name}: ${sc.note}`,
    `  history ${sc.weeks.join(" → ")} km`,
    `  week ${r.weekStart}: ${w.km} km (${pct(w.growth)}) via ${w.chosen} · form ${w.form} (${Math.round(w.formPct)} %) ${w.state}`,
    `    ${w.items}`,
    `    ${w.why}`,
    ...r.blocks.map((b) => `  block ${b.weeks} w: ${b.km.join(" → ") || "–"} km · ${b.state}${b.chosen ? ` via ${b.chosen}` : ""}${b.deepestPct != null ? ` · deepest ${Math.round(b.deepestPct)} %` : ""}`),
    ...(r.road ? [
      `  road ${r.road.lengths.base}/${r.road.lengths.build}/${r.road.lengths.specific}/${r.road.lengths.taper}${r.road.short ? ` · short (min ${r.road.short.minWeeks})` : ""} · long-run peak ${r.road.longPeak ? `${r.road.longPeak.km} km at wip ${r.road.longPeak.wip}` : "–"}${r.road.warnings.length ? ` · ${r.road.warnings.join(", ")}` : ""}`,
      ...r.road.weeks.map((w) => `    ${w.weekStart} wip ${w.wip} ${w.phase} ${w.role} ${w.km ?? "–"} km long ${w.longKm ?? "–"} (${w.source})`),
    ] : []),
    ...(r.race && !r.road ? r.race.weeks.map((w) => `    ${w.weekStart} ${w.role[0]} ${w.items.map((it) => `${it.type === "threshold" ? "T" : it.type === "long" ? "L" : it.type === "cross" ? "X" : "E"}${it.km}${it.blueprint ? `[${it.blueprint}]` : ""}`).join(" ")}`) : []),
    ...(r.race?.warnings && (r.race.warnings.lowWeek || r.race.warnings.shortLong) ? [`    warnings: ${JSON.stringify(r.race.warnings)}`] : []),
    ...(r.race ? [`  race plan ${r.race.chunks} (now ${r.race.now}): ${r.race.roles} · ${r.race.km.join(" → ")} km · ${r.race.state} · race-day form ${r.race.raceForm ?? "–"}`] : []),
  ].join("\n");
}

if (process.argv[1]?.endsWith("scenarios.ts")) {
  const only = process.argv[2];
  for (const sc of SCENARIOS.filter((x) => !only || x.name === only)) console.log(describe(await runScenario(sc)) + "\n");
}
