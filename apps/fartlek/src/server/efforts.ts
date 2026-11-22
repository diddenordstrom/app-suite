import { and, asc, desc, eq, lt } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { parseFit } from "./providers/fit";
import { extractEfforts, type DatedEffort, type RunEfforts, type RunSummary } from "../shared/bestefforts";
import { longRunDecoupling } from "../shared/racemodels";
import type { Stream } from "../shared/types";

/**
 * Bump when extraction changes; runs stored with an older version are extracted again from what is
 * already kept (FIT file or stream), never from Garmin.
 * 1: moving-time windows, GAP from the kept FIT file at 1 s, raw speed from the stored stream otherwise.
 * 2: also the long run's heart-rate-to-speed decoupling.
 */
export const EFFORTS_VERSION = 2;

/** The run's best stream: the kept FIT file at 1 s with grade-adjusted speed, else the stored ~5 s stream. */
function streamOf(db: Db, userId: number, activityId: string): Stream | null {
  const fit = repo.getFit(db, userId, activityId);
  if (fit) {
    try {
      const s = parseFit(fit, 1, { gap: true }).stream;
      if (s) return s;
    } catch { /* a broken file: the stored stream will do */ }
  }
  return repo.getStream(db, userId, activityId);
}

/** Efforts and long-run decoupling of one run, from one read of its stream. */
export function effortsOf(db: Db, userId: number, activityId: string): RunEfforts & { decoupling: number | null } {
  const s = streamOf(db, userId, activityId);
  return { ...extractEfforts(s), decoupling: longRunDecoupling(s) };
}

/** Extract and store one run's efforts, replacing what it had. */
export function saveEfforts(db: Db, userId: number, activityId: string, date: string) {
  const { efforts, gap, decoupling } = effortsOf(db, userId, activityId);
  db.transaction((tx) => {
    tx.delete(t.bestEfforts).where(and(eq(t.bestEfforts.userId, userId), eq(t.bestEfforts.activityId, activityId))).run();
    for (const e of efforts) tx.insert(t.bestEfforts).values({ userId, activityId, date, durationS: e.durationS, distanceM: e.distanceM, startS: e.startS, gap }).run();
    tx.update(t.activities).set({ effortsVersion: EFFORTS_VERSION, decoupling }).where(and(eq(t.activities.userId, userId), eq(t.activities.id, activityId))).run();
  });
}

function pending(db: Db, userId: number) {
  return db.select({ id: t.activities.id, date: t.activities.date }).from(t.activities)
    .where(and(eq(t.activities.userId, userId), eq(t.activities.isRun, true), eq(t.activities.detailStatus, "done"), lt(t.activities.effortsVersion, EFFORTS_VERSION)))
    .orderBy(desc(t.activities.startTimeLocal)).all();
}

/**
 * Extract efforts for runs that lack them, newest first, until `budgetMs` is spent. Called on the
 * pages that show efforts, so a visit right after a sync or a release is never empty for long.
 * Returns how many runs are still waiting.
 */
export function ensureEfforts(db: Db, userId: number, budgetMs = 1500): number {
  const list = pending(db, userId);
  const start = Date.now();
  let done = 0;
  for (const a of list) {
    if (Date.now() - start > budgetMs) break;
    try { saveEfforts(db, userId, a.id, a.date); } catch (e) { console.warn(`efforts ${a.id}: ${(e as Error).message}`); markDone(db, userId, a.id); }
    done++;
  }
  return list.length - done;
}

function markDone(db: Db, userId: number, activityId: string) {
  db.update(t.activities).set({ effortsVersion: EFFORTS_VERSION }).where(and(eq(t.activities.userId, userId), eq(t.activities.id, activityId))).run();
}

/** Every user's backlog, a run at a time with a yield between, so the server stays responsive after a release. */
export async function backfillEfforts(db: Db) {
  const users = db.select({ id: t.users.id }).from(t.users).all();
  for (const u of users) {
    while (ensureEfforts(db, u.id, 200) > 0) await new Promise((r) => setImmediate(r));
  }
}

export function listEfforts(db: Db, userId: number): DatedEffort[] {
  return db.select().from(t.bestEfforts).where(eq(t.bestEfforts.userId, userId)).orderBy(asc(t.bestEfforts.date)).all()
    .map((r) => ({ activityId: r.activityId, date: r.date, durationS: r.durationS, distanceM: r.distanceM, startS: r.startS, gap: r.gap }));
}

/** Runs with distance, moving time and decoupling, for the marathon models' training context. */
export function listRunSummaries(db: Db, userId: number): RunSummary[] {
  return db.select({ date: t.activities.date, distanceM: t.activities.distanceM, durationS: t.activities.durationS, decoupling: t.activities.decoupling })
    .from(t.activities).where(and(eq(t.activities.userId, userId), eq(t.activities.isRun, true))).orderBy(asc(t.activities.date)).all();
}
