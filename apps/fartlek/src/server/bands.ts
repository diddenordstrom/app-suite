import { and, eq } from "drizzle-orm";
import type { Db } from "./db";
import * as t from "./db/schema";
import * as repo from "./repo";
import { streamOf } from "./efforts";
import { ctxFor } from "./analysis";
import { bandSecs, emptyBands, targetRace } from "../shared/bands";
import { thresholdOn } from "../shared/threshold";
import type { BandSecs } from "../shared/periodstats";
import type { ISODate } from "../shared/dates";
import type { Settings } from "../shared/types";

/**
 * Bump when the computation in shared/bands.ts changes; every row is then computed again from what is
 * already kept (FIT file or stream), never from Garmin.
 * 1: zones, threshold bands on the run's date, today's target band; GAP from the kept FIT file at 1 s.
 */
export const BANDS_VERSION = 1;

type Row = typeof t.activityBands.$inferSelect;
interface RunRef { id: string; date: ISODate; detailStatus: string; detailVersion: number }

/** What a run's row must have been computed from to be current. */
interface Inputs { thresholdPace: number | null; targetPace: number | null; zonesKey: string; detailKey: string }

const zonesKeyOf = (s: Pick<Settings, "zones">) => (s.zones ? `u:${s.zones.join(",")}` : "g");
const detailKeyOf = (a: RunRef) => `${a.detailStatus}/${a.detailVersion}`;
const samePace = (x: number | null, y: number | null) => (x == null || y == null ? x === y : Math.abs(x - y) < 1e-6);

export function isCurrent(row: Row | undefined, want: Inputs): boolean {
  return !!row && row.version === BANDS_VERSION && row.zonesKey === want.zonesKey && row.detailKey === want.detailKey
    && samePace(row.thresholdPace, want.thresholdPace) && samePace(row.targetPace, want.targetPace);
}

export function toBands(r: Row): BandSecs {
  return { totalS: r.totalS, zones: [r.z1, r.z2, r.z3, r.z4, r.z5], belowS: r.belowS, atS: r.atS, overS: r.overS, targetS: r.targetS };
}

/** The settings, thresholds and target every row of a user is judged against now. */
function context(db: Db, userId: number) {
  const ctx = ctxFor(db, userId);
  const target = targetRace(repo.listRaces(db, userId), ctx.today);
  return { settings: ctx.settings, thresholds: ctx.thresholds, targetPace: target?.pace ?? null, zonesKey: zonesKeyOf(ctx.settings) };
}
type Context = ReturnType<typeof context>;

function inputsFor(c: Context, a: RunRef): Inputs {
  return { thresholdPace: thresholdOn(c.thresholds, a.date)?.paceSecPerKm ?? null, targetPace: c.targetPace, zonesKey: c.zonesKey, detailKey: detailKeyOf(a) };
}

function runs(db: Db, userId: number): RunRef[] {
  return db.select({ id: t.activities.id, date: t.activities.date, detailStatus: t.activities.detailStatus, detailVersion: t.activities.detailVersion })
    .from(t.activities).where(and(eq(t.activities.userId, userId), eq(t.activities.isRun, true))).all()
    .sort((x, y) => y.date.localeCompare(x.date) || y.id.localeCompare(x.id));
}

export function rowsOf(db: Db, userId: number): Map<string, Row> {
  return new Map(db.select().from(t.activityBands).where(eq(t.activityBands.userId, userId)).all().map((r) => [r.activityId, r]));
}

/** Compute and store one run's row. */
function save(db: Db, userId: number, c: Context, a: RunRef, want: Inputs) {
  const act = repo.getActivity(db, userId, a.id);
  if (!act) return;
  const stream = a.detailStatus === "done" ? streamOf(db, userId, a.id) : null;
  let b: BandSecs & { gap: boolean };
  try { b = bandSecs(act, stream, c.settings, want); } catch (e) {
    console.warn(`bands ${a.id}: ${(e as Error).message}`);
    b = { ...emptyBands(), totalS: act.durationS, gap: false };
  }
  const values = {
    userId, activityId: a.id, date: a.date, totalS: b.totalS, z1: b.zones[0], z2: b.zones[1], z3: b.zones[2], z4: b.zones[3], z5: b.zones[4],
    belowS: b.belowS, atS: b.atS, overS: b.overS, targetS: b.targetS, version: BANDS_VERSION, gap: b.gap, ...want,
  };
  db.insert(t.activityBands).values(values).onConflictDoUpdate({ target: [t.activityBands.userId, t.activityBands.activityId], set: values }).run();
}

/**
 * Compute rows for runs that lack one or whose inputs changed (version, the threshold on the run's date,
 * today's target, the zones, the run's detail), until `budgetMs` is spent. Runs for which `first` is
 * true go first (the periods on the page), then newest first. Rows of runs that are gone are dropped.
 * Returns the runs still waiting, in total and among `first`.
 */
export function ensureBands(db: Db, userId: number, budgetMs = 1500, first?: (date: ISODate) => boolean): { pending: number; pendingFirst: number } {
  const c = context(db, userId);
  const rows = rowsOf(db, userId);
  const all = runs(db, userId);
  const ids = new Set(all.map((a) => a.id));
  for (const id of rows.keys()) if (!ids.has(id)) db.delete(t.activityBands).where(and(eq(t.activityBands.userId, userId), eq(t.activityBands.activityId, id))).run();
  const stale = all.map((a) => ({ a, want: inputsFor(c, a) })).filter((x) => !isCurrent(rows.get(x.a.id), x.want));
  if (first) stale.sort((x, y) => Number(first(y.a.date)) - Number(first(x.a.date)));
  const start = Date.now();
  const done = new Set<string>();
  for (const x of stale) {
    if (Date.now() - start > budgetMs) break;
    save(db, userId, c, x.a, x.want);
    done.add(x.a.id);
  }
  const left = stale.filter((x) => !done.has(x.a.id));
  return { pending: left.length, pendingFirst: first ? left.filter((x) => first(x.a.date)).length : left.length };
}

const running = new WeakMap<Db, Set<number>>();

/** One user's backlog in the background, a run at a time with a yield between; a second call while one runs is a no-op. */
export async function backfillUserBands(db: Db, userId: number) {
  const set = running.get(db) ?? new Set<number>();
  running.set(db, set);
  if (set.has(userId)) return;
  set.add(userId);
  try {
    while (ensureBands(db, userId, 200).pending > 0) await new Promise((r) => setImmediate(r));
  } finally {
    set.delete(userId);
  }
}

/** Every user's backlog after a release (or a change of BANDS_VERSION), so the server stays responsive. */
export async function backfillBands(db: Db) {
  for (const u of db.select({ id: t.users.id }).from(t.users).all()) await backfillUserBands(db, u.id);
}
