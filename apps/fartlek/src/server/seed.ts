import { and, eq, like, sql } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { addDays, weekStartOf, type ISODate } from "../shared/dates";
import { createDemoProvider, DEMO_PATTERN, demoWeekKm } from "./providers/demo";
import { syncProvider } from "./sync";
import { ctxFor } from "./analysis";
import { ensureBands } from "./bands";
import { parseSteps, plannedFromSteps, type StepRefs } from "../shared/steps";
import { saveSession } from "./gym";
import { templateEntries } from "../shared/gymplan";
import { exercise } from "../shared/gym";
import { zonesFromLthr } from "../shared/zones";

const count = (db: Db, tbl: typeof t.workouts | typeof t.races | typeof t.blocks | typeof t.thresholds | typeof t.painEntries, userId: number) =>
  db.select({ n: sql<number>`count(*)` }).from(tbl).where(eq(tbl.userId, userId)).get()?.n ?? 0;

const DEMO_THRESHOLD_STEPS = parseSteps("2 km easy, 3x2 km @threshold / 400 m jog, 2 km easy", "metric").steps!;
const DEMO_REFS: StepRefs = { thresholdPace: 287, thresholdHr: 169, easyLow: 135, easyHigh: 150, zones: null, easyPace: 345 };

/** Demo plan around the generated history: 8 weeks back, 11 ahead, a half and a full marathon. Only fills what is empty. */
export function seedDemoPlan(db: Db, userId: number, today: ISODate) {
  const thisWeek = weekStartOf(today, "monday");
  const marathonDay = addDays(thisWeek, 11 * 7 + 6);
  const halfDay = addDays(thisWeek, 5 * 7 + 5);

  db.transaction((tx) => {
    if (!count(db, t.workouts, userId)) {
      for (let w = -8; w <= 11; w++) {
        const ws = addDays(thisWeek, w * 7);
        const km = w === 11 ? 20 : w === 10 ? demoWeekKm(w) * 0.6 : demoWeekKm(w);
        for (const [off, type, share] of DEMO_PATTERN) {
          const date = addDays(ws, off);
          if (date === marathonDay || date === halfDay) continue;
          if (type === "threshold") {
            // Threshold sessions are structured, like the generated runs (2 km warm-up, 2 km reps, 400 m jogs).
            tx.insert(t.workouts).values({ userId, date, type, zone2: false, steps: JSON.stringify(DEMO_THRESHOLD_STEPS), ...plannedFromSteps(DEMO_THRESHOLD_STEPS, DEMO_REFS) }).run();
          } else {
            tx.insert(t.workouts).values({ userId, date, type, distanceKm: Math.round(km * share), zone2: type === "long" }).run();
          }
        }
      }
      tx.insert(t.workouts).values({ userId, date: halfDay, type: "race", distanceKm: 21.1, notes: "Tune-up half" }).run();
      tx.insert(t.workouts).values({ userId, date: marathonDay, type: "race", distanceKm: 42.2, notes: "Goal race" }).run();
    }
    if (!count(db, t.races, userId)) {
      tx.insert(t.races).values({ userId, name: "Demo Half", date: halfDay, distanceKm: 21.0975, goalSeconds: 5880, priority: "B" }).run();
      tx.insert(t.races).values({ userId, name: "Demo Marathon", date: marathonDay, distanceKm: 42.195, goalSeconds: 12600, priority: "A" }).run();
    }
    if (!count(db, t.blocks, userId)) {
      const b = (kind: string, name: string, from: number, to: number) =>
        tx.insert(t.blocks).values({ userId, kind, name, startWeek: addDays(thisWeek, from * 7), weeks: to - from + 1 }).run();
      b("base", "Base", -8, -3); b("build", "Build", -2, 5); b("specific", "Marathon-specific", 6, 9); b("taper", "Taper", 10, 11);
    }
    if (!count(db, t.thresholds, userId)) {
      tx.insert(t.thresholds).values({ userId, effectiveDate: addDays(today, -18 * 7), paceSecPerKm: 295, hr: 168 }).run();
      tx.insert(t.thresholds).values({ userId, effectiveDate: addDays(today, -6 * 7), paceSecPerKm: 287, hr: 169 }).run();
    }
    if (!count(db, t.painEntries, userId)) {
      const longRuns = repo.listActivities(db, userId, { from: addDays(today, -40) }).filter((a) => a.name === "Long run").slice(0, 3).reverse();
      longRuns.forEach((a, i) => tx.insert(t.painEntries).values({ userId, date: a.date, activityId: a.id, area: "knee", level: i + 1, note: i === 2 ? "after the hills" : null }).run());
    }
    // Flag the demo threshold sessions so threshold progress has data, like a user would.
    tx.update(t.activities).set({ thresholdFlag: true })
      .where(and(eq(t.activities.userId, userId), like(t.activities.id, "demo:%-threshold"))).run();
    tx.insert(t.checkins).values({ userId, date: today, soreness: 2, note: null }).onConflictDoNothing().run();
  });

  const s = repo.getSettings(db, userId);
  // Zones of the runner's own, from the demo threshold HR, so easy runs read as zones 1–2 (the watch's default zones put them in 3).
  if (s.maxHr == null && s.easyHigh == null) repo.saveSettings(db, userId, { ...s, maxHr: 190, easyLow: 135, easyHigh: 150, zones: s.zones ?? zonesFromLthr(169) });
}

/** Generated history, a plan and races for one account (Settings → Load demo data, and every demo visitor). Only fills what is empty. */
export async function loadDemoData(db: Db, userId: number) {
  const today = ctxFor(db, userId).today;
  const result = await syncProvider(db, userId, createDemoProvider(userId, today), { today, maxDetails: 500 });
  seedDemoPlan(db, userId, today);
  seedDemoGym(db, userId, today);
  // The period stats read stored rows; the demo's few months of 5 s streams take well under a second.
  ensureBands(db, userId, 10_000);
  return result;
}

/**
 * Demo gym: a planned gym session every Monday from four weeks back to four ahead, and logged sessions on
 * the past Mondays (A) and Wednesdays (B) whose weights creep up, so "last time" and the history have data.
 */
export function seedDemoGym(db: Db, userId: number, today: ISODate) {
  if (db.select({ id: t.gymSessions.id }).from(t.gymSessions).where(eq(t.gymSessions.userId, userId)).get()) return;
  const thisWeek = weekStartOf(today, "monday");
  const start: Record<string, number> = {
    bulgarian_split_squat: 12, stiff_leg_deadlift: 52.5, seated_leg_curl: 50, seated_calf_raise: 35, hip_abduction: 40, pallof_press: 10,
    bench_press: 55, pull_up: 0, seated_row: 45, shoulder_press: 14, db_curl: 10, triceps_pushdown: 35,
  };
  for (let w = -4; w <= 4; w++) {
    const monday = addDays(thisWeek, w * 7);
    if (monday >= addDays(today, -28)) db.insert(t.workouts).values({ userId, date: monday, type: "strength", durationMin: 45 }).run();
  }
  for (let w = -4; w <= -1; w++) {
    for (const [off, tpl] of [[0, "A"], [2, "B"]] as const) {
      const date = addDays(thisWeek, w * 7 + off);
      if (date >= today || (w === -3 && tpl === "B")) continue; // one week without B: 7 of 8
      const step = w + 4;
      saveSession(db, userId, {
        clientId: `demo-${date}-${tpl}`, date, startedAt: Date.parse(`${date}T16:00:00Z`), finishedAt: Date.parse(`${date}T16:45:00Z`),
        template: tpl, feel: "none", workoutId: null, layout: templateEntries(tpl),
        entries: templateEntries(tpl).map((e) => {
          const ex = exercise(e.exercise);
          const kg = start[e.exercise] ? start[e.exercise] + Math.floor(step / 2) * ex.step : null;
          const reps = Math.min(e.scheme.high, e.scheme.low + step);
          return { exercise: e.exercise, slot: e.slot, sets: Array.from({ length: e.scheme.sets }, () => ({ kind: "work" as const, kg, reps, seconds: null })) };
        }),
      });
    }
  }
}
