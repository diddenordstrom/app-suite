/*
 * The plan simulator (docs/decisions/fartlek-simulator.md): a made-up runner's history put into an in-memory database,
 * then "Skapa block" run block after block up to the race through the real app, with every planned session run as
 * planned in between and the clock moved on. What comes out is the whole road as the app would plan it for a runner
 * who follows it: weeks, sessions, km, long runs, form. No real data is read or written.
 *
 * Used by `npm run sim -w apps/fartlek -- <runner.json>` and by POST /api/sim.
 */
import { createApp } from "./app";
import { loadConfig } from "./config";
import { createDb } from "./db";
import { pinToday } from "./analysis";
import { addDays, daysBetween, todayIn, weekday, weekStartOf, type ISODate } from "../shared/dates";
import { thresholdReps, type SuggestItem } from "../shared/nextweek";
import type { BlockSuggestion, WeekRole } from "../shared/blockplan";
import type { RaceRoad } from "../shared/raceplan";
import type { CrossDay } from "../shared/types";

export interface SimInput {
  /** Run km per week before the plan starts, oldest first (the last one is the week before). Up to 26 weeks. */
  history: number[];
  runDays?: number[];
  longRunDay?: number;
  gymDays?: number[];
  crossDays?: CrossDay[];
  doubles?: "off" | "gym" | "all";
  /** Threshold pace (s/km) and heart rate. */
  threshold?: { pace: number; hr: number };
  maxHr?: number;
  /** The race the plan leads to: in its `inWeeks`th week from the start, on `day` (weekday, 0 = Sunday, the default). */
  race?: { inWeeks: number; distanceKm?: number; goalSeconds?: number; priority?: "A" | "B"; day?: number };
  /** Weeks to plan without a race (default 12). */
  weeks?: number;
  /** The rhythm asked for where no race decides it. */
  rhythm?: "1:1" | "2:1" | "3:1";
  /** The answer to the race-pace question of the race-specific phase. */
  racePace?: "prediction" | "goal";
  /** Say yes to "add a run day" (the first day offered, or doubles when that is all it offers). */
  acceptAdvice?: boolean;
  /** The plan's first Monday; default the next one. */
  start?: ISODate;
}

export interface SimWeek {
  weekStart: ISODate; block: string; role: WeekRole; phase: string | null;
  km: number; longKm: number | null;
  /** The sessions as short codes: E8 easy, L21 long, T9 threshold [reps], G60 gym, X45 cross-training, ² a double. */
  sessions: string;
  /** The deepest daily form in the week as a share of fitness, and fitness at its end. */
  formPct: number; ctl: number;
}
export interface SimResult {
  start: ISODate; race: { date: ISODate; distanceKm: number } | null;
  weeks: SimWeek[];
  /** Form on race day, and what the planner said along the way (run days added, refusals). */
  raceForm: number | null; notes: string[];
  /** The race plan's skeleton as first shown (phases and km per week), when the race has one. */
  road: RaceRoad | null;
  /** Why each block looks as it does: the engine's chosen try, and every try with its km per week and verdict. */
  blocks: { start: ISODate; chosen: string; tolerance: number; kmBefore: number[]; form: number; tries: string[] }[];
}

const ORIGIN = "http://localhost:5173";
const MAX_WEEKS = 40;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** A week's km over its run days: the long run about a third, one faster run, the rest easy. */
export function runsOf(km: number, days: ISODate[], longDay: ISODate) {
  if (km <= 0 || !days.length) return [];
  const long = days.length > 1 ? km * 0.34 : km;
  const others = days.filter((d) => d !== longDay);
  const each = others.length ? (km - long) / others.length : 0;
  return days.map((d, i) => ({
    date: d, km: r1(d === longDay ? long : each),
    kind: d === longDay ? "long" as const : i === 0 ? "threshold" as const : "easy" as const,
  }));
}

const code = (it: SuggestItem) => {
  const mark = it.double ? "²" : "";
  if (it.type === "strength") return `G${it.durationMin}`;
  if (it.type === "cross") return `X${it.durationMin}`;
  if (it.type === "threshold") {
    const reps = thresholdReps(it.steps);
    const what = it.blueprint ? it.blueprint.split(":")[0] : reps ? `${reps.reps}x${Math.round(reps.min)}` : "";
    return `T${it.km}${what ? `[${what}]` : ""}${mark}`;
  }
  return `${it.type === "long" ? "L" : "E"}${it.km}${it.type === "easy" && it.steps ? "s" : ""}${mark}`;
};

export async function simulate(input: SimInput): Promise<SimResult> {
  const db = createDb(":memory:");
  const app = createApp(db, loadConfig({ AUTH_MODE: "dev" } as NodeJS.ProcessEnv));
  const start = input.start ?? weekStartOf(addDays(todayIn("Europe/Stockholm"), 7), "monday");
  let today = addDays(start, -1);
  pinToday(db, () => today);
  const json = (body: unknown, method = "POST") => ({ method, body: JSON.stringify(body), headers: { "content-type": "application/json", origin: ORIGIN } });
  const get = async <T>(p: string) => {
    const res = await app.request(p);
    if (!res.ok) throw new Error(`${p}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<T>;
  };
  const send = async (p: string, body: unknown, method = "POST") => {
    const res = await app.request(p, json(body, method));
    if (!res.ok) throw new Error(`${method} ${p}: ${res.status} ${await res.text()}`);
    return res.json() as Promise<Record<string, unknown>>;
  };
  const q = (sql: string, ...args: unknown[]) => db.$client.prepare(sql).run(...args);
  let n = 0;
  const run = (date: ISODate, kind: string, km: number, secs: number, hr: number) =>
    q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run)
       values (1, ?, ?, 'running', ?, ?, ?, ?, ?, 1)`, `sim:${++n}`, kind, `${date} 07:00:00`, date, Math.round(km * 1000), Math.round(secs), hr);
  const other = (date: ISODate, typeKey: string, min: number) =>
    q(`insert into activities (user_id, id, name, type_key, start_time_local, date, distance_m, duration_s, avg_hr, is_run)
       values (1, ?, ?, ?, ?, ?, 0, ?, null, 0)`, `sim:${++n}`, typeKey, typeKey, `${date} 18:00:00`, date, min * 60);

  // The runner.
  const runDays = input.runDays ?? [2, 4, 6, 0], longRunDay = input.longRunDay ?? 0;
  const thr = input.threshold ?? { pace: 270, hr: 170 };
  const settings = await get<Record<string, unknown>>("/api/settings");
  await send("/api/settings", { ...settings, runDays, longRunDay, gymDays: input.gymDays ?? [], crossDays: input.crossDays ?? [], doubles: input.doubles ?? "off", maxHr: input.maxHr ?? null }, "PUT");
  await send("/api/thresholds", { effectiveDate: addDays(start, -400), paceSecPerKm: thr.pace, hr: thr.hr });
  const pace = { easy: thr.pace + 80, long: thr.pace + 85, threshold: thr.pace + 30 };
  const hr = { easy: thr.hr - 24, long: thr.hr - 22, threshold: thr.hr - 6 };

  // The history: every week before the start run on the run days.
  const hist = input.history.slice(-26);
  hist.forEach((km, i) => {
    const ws = addDays(start, -7 * (hist.length - i));
    const days = Array.from({ length: 7 }, (_, d) => addDays(ws, d)).filter((d) => runDays.includes(weekday(d)));
    const longDay = days.find((d) => weekday(d) === longRunDay) ?? days.at(-1)!;
    for (const r of runsOf(km, days, longDay)) run(r.date, r.kind, r.km, r.km * pace[r.kind], hr[r.kind]);
  });

  let race: { id: number; date: ISODate; distanceKm: number } | null = null;
  if (input.race) {
    const day = input.race.day ?? 0;
    const date = addDays(start, (input.race.inWeeks - 1) * 7 + ((day + 6) % 7));
    const distanceKm = input.race.distanceKm ?? 42.195;
    const r = await send("/api/races", { name: "Simulated race", date, priority: input.race.priority ?? "A", distanceKm, ...(input.race.goalSeconds ? { goalSeconds: input.race.goalSeconds } : {}) });
    race = { id: Number((r as { id?: number }).id ?? (await get<{ id: number }[]>("/api/races"))[0].id), date, distanceKm };
  }
  const end = race ? addDays(weekStartOf(race.date, "monday"), 6) : addDays(start, (Math.min(MAX_WEEKS, input.weeks ?? 12)) * 7 - 1);

  type Sug = { ok: boolean; reason?: string; startWeek: ISODate; suggestion: BlockSuggestion; seed: { tolerance: { km: number }; kmBefore: number[]; ctl: number; atl: number }; replaces: { id: number }[]; advice: { free: number[]; doubles?: boolean } | null;
    racePlan: { chunks: { weeks: number; kind: string; blockKind?: string }[]; now: number } | null; racePace: { raceId: number; question: unknown } | null; road: RaceRoad | null };
  const weeks: SimWeek[] = [];
  const blocks: SimResult["blocks"] = [];
  const notes: string[] = [];
  let road: RaceRoad | null = null;
  let raceForm: number | null = null;
  let blockStart = start;
  let asked = 0;
  while (blockStart <= end && weeks.length < MAX_WEEKS) {
    today = addDays(blockStart, -1);
    const rhythm = input.rhythm ?? "3:1";
    const size = rhythm === "1:1" ? 2 : rhythm === "2:1" ? 3 : 4;
    let s = await get<Sug>(`/api/plan/block-suggest?startWeek=${blockStart}&weeks=${size}&rhythm=${rhythm}`);
    if (!s.ok) { notes.push(`${blockStart}: refused (${s.reason})`); break; }
    road ??= s.road;
    if (s.racePace?.question) {
      await send(`/api/races/${s.racePace.raceId}/race-pace`, { choice: input.racePace ?? "prediction" });
      notes.push(`${blockStart}: race paces from the ${input.racePace ?? "prediction"}`);
      s = await get<Sug>(`/api/plan/block-suggest?startWeek=${blockStart}&weeks=${size}&rhythm=${rhythm}`);
    }
    if (s.advice && input.acceptAdvice && asked++ < 4) {
      const cur = await get<Record<string, unknown> & { runDays: number[] }>("/api/settings");
      const next = s.advice.free.length ? { ...cur, runDays: [...cur.runDays, s.advice.free[0]].sort() } : { ...cur, doubles: "gym" };
      notes.push(`${blockStart}: ${s.advice.free.length ? `added a run day (weekday ${s.advice.free[0]})` : "allowed doubles after gym"}`);
      await send("/api/settings", next, "PUT");
      continue;
    } else if (s.advice) notes.push(`${blockStart}: the planner asked for ${s.advice.free.length ? "another run day" : "doubles"} (not taken)`);

    // Past the end (a block may run longer than the weeks left): only the weeks up to the end are kept.
    const sw = s.suggestion.weeks;
    const keep = Math.max(1, Math.min(sw.length, Math.floor(daysBetween(blockStart, end) / 7) + 1));
    const rp = s.racePlan;
    const parts = rp && rp.now > 0 ? rp.chunks.slice(0, rp.now).map((c) => ({ weeks: c.weeks, kind: c.blockKind ?? c.kind, name: c.kind })) : undefined;
    const fits = !parts || parts.reduce((a, p) => a + p.weeks, 0) === keep;
    await send("/api/plan/block-suggest", {
      startWeek: blockStart, weeks: sw.slice(0, keep).map((w) => w.items), roles: sw.slice(0, keep).map((w) => w.role),
      ...(fits && parts ? { blocks: parts } : {}), name: parts?.[0]?.name ?? "block", replace: s.replaces.map((w) => w.id),
    });
    const names = parts && fits ? parts.flatMap((p) => Array.from({ length: p.weeks }, () => p.name)) : Array.from({ length: keep }, () => `${rhythm} block`);
    sw.slice(0, keep).forEach((w, i) => {
      const e = s.suggestion.eval.weeks[i];
      const runs = w.items.filter((it) => it.type !== "strength" && it.type !== "cross");
      weeks.push({
        weekStart: w.weekStart, block: names[i] ?? "", role: w.role,
        phase: road?.weeks.find((x) => x.weekStart === w.weekStart)?.phase ?? null,
        km: r1(runs.reduce((a, it) => a + it.km, 0)), longKm: runs.filter((it) => it.type === "long").reduce<number | null>((m, it) => Math.max(m ?? 0, it.km), null),
        sessions: w.items.map(code).join(" "), formPct: e ? Math.round(e.lowPct) : 0, ctl: e ? r1(e.ctl) : 0,
      });
    });
    if (s.suggestion.eval.race) raceForm = s.suggestion.eval.race.form;
    blocks.push({ start: blockStart, chosen: s.suggestion.chosen, tolerance: s.seed.tolerance.km, kmBefore: s.seed.kmBefore, form: r1(s.seed.ctl - s.seed.atl),
      tries: s.suggestion.tries.map((t) => `${t.id} ${t.state}${t.params.weeks != null ? ` ${t.params.weeks}` : ""}${t.form != null ? ` form ${t.form}` : ""}`) });

    // The runner does every session as planned, at the km the planner gave it.
    const last = addDays(blockStart, keep * 7 - 1);
    for (const it of sw.slice(0, keep).flatMap((w) => w.items)) {
      if (it.date < blockStart || it.date > last) continue;
      if (it.type === "strength") other(it.date, "strength_training", it.durationMin ?? 60);
      else if (it.type === "cross") other(it.date, "lap_swimming", it.durationMin ?? 45);
      else if (it.km > 0) {
        const kind = it.type === "long" ? "long" : it.type === "threshold" ? "threshold" : "easy";
        run(it.date, kind, it.km, it.km * pace[kind], hr[kind]);
      }
    }
    if (race && race.date >= blockStart && race.date <= last) {
      const secs = input.race?.goalSeconds ?? race.distanceKm * (thr.pace + (race.distanceKm > 30 ? 35 : 15));
      run(race.date, "race", race.distanceKm, secs, thr.hr);
    }
    blockStart = addDays(last, 1);
  }
  return { start, race: race && { date: race.date, distanceKm: race.distanceKm }, weeks, raceForm, notes, road, blocks };
}

/** The result as a table for the terminal. */
export function simText(r: SimResult, verbose = false): string {
  const pad = (s: string | number, n: number) => String(s).padEnd(n);
  const head = `${pad("week", 11)}${pad("block", 10)}${pad("role", 9)}${pad("phase", 9)}${pad("km", 7)}${pad("long", 6)}${pad("form", 6)}${pad("ctl", 6)}sessions`;
  const lines = r.weeks.map((w) => `${pad(w.weekStart, 11)}${pad(w.block.slice(0, 9), 10)}${pad(w.role, 9)}${pad(w.phase ?? "", 9)}${pad(w.km, 7)}${pad(w.longKm ?? "–", 6)}${pad(`${w.formPct}%`, 6)}${pad(w.ctl, 6)}${w.sessions}`);
  const total = r1(r.weeks.reduce((a, w) => a + w.km, 0));
  const peak = Math.max(0, ...r.weeks.map((w) => w.km));
  const longest = Math.max(0, ...r.weeks.map((w) => w.longKm ?? 0));
  return [
    `start ${r.start}${r.race ? ` · race ${r.race.date} (${r.race.distanceKm} km) · race-day form ${r.raceForm ?? "–"}` : ""}`,
    `${r.weeks.length} weeks · ${total} km · peak week ${peak} km · longest run ${longest} km`,
    "", head, ...lines,
    ...(r.notes.length ? ["", ...r.notes.map((x) => `note: ${x}`)] : []),
    ...(verbose ? ["", ...r.blocks.flatMap((b) => [`block ${b.start}: ${b.chosen} · tolerance ${b.tolerance} · before ${b.kmBefore.join(" ")} · form ${b.form}`, ...b.tries.map((t) => `  ${t}`)])] : []),
    "", "E easy (s: strides) · L long · T threshold [reps or race-phase blueprint] · G gym · X cross-training · ² double",
  ].join("\n");
}

if (process.argv[1]?.endsWith("simulate.ts")) {
  const { readFileSync } = await import("node:fs");
  const file = process.argv[2];
  if (!file) { console.error("usage: npm run sim -w apps/fartlek -- <runner.json> [--json]"); process.exit(1); }
  const r = await simulate(JSON.parse(readFileSync(file, "utf8")) as SimInput);
  console.log(process.argv.includes("--json") ? JSON.stringify(r, null, 2) : simText(r, process.argv.includes("--why")));
}
