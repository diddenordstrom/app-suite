#!/usr/bin/env node
/**
 * Export a data snapshot from a Fartlek demo account for the Fartlek landing page in portfolio.
 *
 * The landing page renders real Fartlek chart/card components with this data, so the snapshot is
 * the exact JSON the Fartlek client gets from its API, trimmed to what those views need.
 *
 * Needs a running Fartlek dev server with demo on (see README.md next to the output):
 *   node apps/portfolio/scripts/fartlek-snapshot.mjs [baseUrl]
 * baseUrl defaults to http://localhost:5173 (Vite, which proxies /api and /demo to :3000).
 * Set DEMO_SID=<cookie value> to reuse a demo session (the server allows 5 demo starts per IP per hour).
 */
/* global fetch, console */
import { writeFile } from "node:fs/promises";
import process from "node:process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] ?? "http://localhost:5173").replace(/\/$/, "");
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/client/components/fartlek/data/demo-snapshot.json");

let cookie = process.env.DEMO_SID ? `demo_sid=${process.env.DEMO_SID}` : null;

async function startDemo() {
  const r = await fetch(`${BASE}/demo`, { redirect: "manual" });
  const set = r.headers.get("set-cookie") ?? "";
  const m = set.match(/demo_sid=[^;]+/);
  if (!m) throw new Error(`no demo cookie from ${BASE}/demo (status ${r.status}, location ${r.headers.get("location")}); rate limited or demo off?`);
  cookie = m[0];
}

async function api(p, init = {}) {
  const r = await fetch(`${BASE}/api${p}`, {
    ...init,
    headers: { cookie, origin: BASE, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${p}: ${r.status} ${await r.text()}`);
  return r.json();
}

/**
 * The demo seed has no activity logs, so the fuel and sRPE charts would be empty. Log RPE on every run of
 * the last ~6 weeks and carbs on the long runs (45 → 65 g/h, one 2/10 bloating), as a runner would.
 */
async function logSessions(runs) {
  const gph = [45, 50, 55, 60, 60, 65];
  let li = 0;
  for (const a of [...runs].sort((x, y) => x.date.localeCompare(y.date))) {
    const long = a.id.includes("long");
    const log = { note: null, rpe: a.id.includes("threshold") ? 7 : long ? 6 : 3, carbsG: null, nausea: null, bloating: null, cramps: null, feel: null };
    if (long && li < gph.length) {
      Object.assign(log, { carbsG: Math.round((gph[li] * a.durationS) / 3600), nausea: 0, bloating: li === 2 ? 2 : 0, cramps: 0 });
      li++;
    }
    await api(`/activities/${encodeURIComponent(a.id)}/log`, { method: "PUT", body: JSON.stringify(log) });
  }
}

const addDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** Monday of the week after `today` (the demo's week starts on Monday). */
const nextMonday = (iso) => {
  const dow = (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(iso, 7 - dow);
};

async function main() {
  if (!cookie) await startDemo();
  const me = await api("/auth/me");
  if (me.authMode !== "demo") throw new Error(`not a demo session (authMode ${me.authMode}); refusing to export a real account`);

  const list = await api("/activities?limit=60");
  const home0 = await api("/home");
  const today = home0.today;
  const since = addDays(today, -42);
  const runs = list.items.filter((a) => a.isRun && a.date >= since);
  await logSessions(runs);

  const [settings, home, trends, blocks, preds, hints, plan] = await Promise.all([
    api("/settings"), api("/home"), api("/trends?weeks=12"), api("/blocks"),
    api("/races/predictions"), api("/races/hints"), api(`/plan?from=${today}&to=${today}`),
  ]);

  const act = list.items.find((a) => a.isRun && a.thresholdFlag && a.hasDetail);
  if (!act) throw new Error("no structured threshold run with detail in the demo");
  const activity = await api(`/activities/${encodeURIComponent(act.id)}`);
  const sameSession = await api(`/activities/${encodeURIComponent(act.id)}/same-session`);

  const weekStart = nextMonday(today);
  const week = await api(`/plan/next-week?weekStart=${weekStart}&r=0`);

  const snapshot = {
    _meta: {
      source: "Fartlek demo account (made-up data from apps/fartlek/src/server/seed.ts + providers/demo.ts)",
      generatedFor: today,
      note: "Dates are relative to generatedFor. Activity logs (RPE, carbs, stomach) were added by the export script; the demo seed has none.",
      script: "apps/portfolio/scripts/fartlek-snapshot.mjs",
    },
    settings,
    // Home: TodayCard/Score (readiness), week ring, next race, load card. Full HomeData.
    today: { home: { ...home, feel: null } },
    // Trends: load (fitness/fatigue/form + dashed forecast + race), fuel, sRPE, best pace, critical speed.
    load: { today: trends.today, load: trends.load, weekly: trends.weekly },
    pace: { today: trends.today, best: trends.best, cs: trends.cs, threshold: { current: trends.threshold.current } },
    fuel: { today: trends.today, log: trends.log },
    race: { today, races: plan.races, predictions: preds.predictions, hints: hints.hints },
    week: { weekStart, response: week },
    block: blocks,
    activity: { detail: { ...activity, pain: [] }, sameSession },
  };

  // Anonymise: no user ids, names, emails or free-text notes travel with the snapshot.
  const json = JSON.stringify(snapshot, (k, v) => (["sub", "email", "userId", "user"].includes(k) ? undefined : k === "note" && typeof v === "string" ? null : v));
  await writeFile(OUT, `${json}\n`);
  console.log(`wrote ${path.relative(process.cwd(), OUT)} (${(json.length / 1024).toFixed(0)} KB) from ${act.id}, week ${weekStart}`);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
