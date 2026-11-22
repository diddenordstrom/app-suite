import { createHash } from "node:crypto";
import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { createCipher } from "@homelab/server-kit";
import type { Config } from "./config";
import type { Db } from "./db";
import * as t from "./db/schema";
import { ctxFor, stepRefs } from "./analysis";
import { PUSH_DAYS, intervalsDoc } from "../shared/intervalsdoc";
import { readSteps, stepsSummary } from "../shared/steps";
import { addDays } from "../shared/dates";
import { RUN_WORKOUT_TYPES, type WorkoutType } from "../shared/types";

/*
 * Push structured workouts to intervals.icu, which sends them on to the Garmin calendar and the watch
 * (docs/decisions/fartlek-watch-push.md). Personal API key only; OAuth waits.
 *
 * The push is a reconcile, not a per-route hook: after any change to the plan (whatever route made
 * it) the user's planned workouts with steps in the coming two weeks are compared with what was sent
 * last time. Changed ones are upserted by external_id, ones that are gone or dropped are deleted.
 * Past events are left alone there; they're history.
 */

export const PUSH = {
  days: PUSH_DAYS,
  /** Changes in a burst (a block applied, a week copied) become one push. */
  debounceMs: 3000,
  /** A visit pushes again when the last push is this old, so the window moves along. */
  staleMs: 6 * 3600 * 1000,
};

type FetchFn = typeof fetch;

export class IntervalsError extends Error {
  constructor(message: string, readonly status?: number) { super(message); }
}

export interface Athlete { id: string; name: string | null; lthr: number | null; thresholdPace: number | null }

/** Basic auth with the literal user name `API_KEY`. */
const authHeader = (key: string) => `Basic ${Buffer.from(`API_KEY:${key}`).toString("base64")}`;

export function intervalsClient(baseUrl: string, key: string, fetchFn: FetchFn = fetch) {
  const call = async (path: string, init: { method?: string; body?: unknown } = {}) => {
    const r = await fetchFn(`${baseUrl}/api/v1${path}`, {
      method: init.method ?? "GET",
      headers: { Authorization: authHeader(key), Accept: "application/json", ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    if (r.status === 401 || r.status === 403) throw new IntervalsError("intervals.icu rejected the API key", r.status);
    if (!r.ok) throw new IntervalsError(`intervals.icu request failed (HTTP ${r.status})`, r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  };
  return {
    /** Athlete 0 is "the owner of this key". */
    async athlete(): Promise<Athlete> {
      const a = await call("/athlete/0") as Record<string, unknown> | null;
      if (!a || a.id == null) throw new IntervalsError("intervals.icu returned no athlete");
      const sports = Array.isArray(a.sportSettings) ? a.sportSettings as Record<string, unknown>[] : [];
      const run = sports.find((s) => Array.isArray(s.types) && (s.types as string[]).includes("Run"));
      const n = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);
      return { id: String(a.id), name: typeof a.name === "string" ? a.name : null, lthr: n(run?.lthr), thresholdPace: n(run?.threshold_pace) };
    },
    async upsert(events: unknown[]): Promise<Record<string, unknown>[]> {
      return (await call("/athlete/0/events/bulk?upsert=true", { method: "POST", body: events })) ?? [];
    },
    async remove(externalIds: string[]): Promise<void> {
      await call("/athlete/0/events/bulk-delete", { method: "PUT", body: externalIds.map((external_id) => ({ external_id })) });
    },
  };
}

export const externalId = (workoutId: number) => `fartlek-${workoutId}`;

/** Message keys about the intervals.icu account that make targets go missing on the watch. */
export function athleteWarnings(a: Athlete): string[] {
  const w: string[] = [];
  // Without a threshold pace intervals.icu sends pace steps to Garmin as "no target".
  if (!a.thresholdPace) w.push("intervals.noThresholdPace");
  if (!a.lthr) w.push("intervals.noLthr");
  return w;
}

export interface PushResult { sent: number; deleted: number; unchanged: number; unparsed: number }

export function createIntervalsPusher(db: Db, config: Config, fetchFn: FetchFn = fetch) {
  const cipher = createCipher(config.masterKey);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const running = new Map<number, Promise<PushResult | null>>();

  const account = (userId: number) => db.select().from(t.intervalsAccounts).where(eq(t.intervalsAccounts.userId, userId)).get();

  async function pushNow(userId: number): Promise<PushResult | null> {
    const acc = account(userId);
    if (!acc) return null;
    const client = intervalsClient(config.intervalsBaseUrl, cipher.decrypt(acc.keyEnc), fetchFn);
    try {
      const athlete = await client.athlete();
      const ctx = ctxFor(db, userId);
      const today = ctx.today, end = addDays(today, PUSH.days - 1);
      const lang = acc.lang === "en" ? "en" : "sv";

      const rows = db.select().from(t.workouts)
        .where(and(eq(t.workouts.userId, userId), gte(t.workouts.date, today), lte(t.workouts.date, end), eq(t.workouts.status, "planned"))).all();
      const wanted = new Map<number, { date: string; hash: string; event: Record<string, unknown>; steps: number }>();
      let missingHr = false;
      for (const w of rows) {
        const steps = readSteps(w.steps);
        if (!steps || !RUN_WORKOUT_TYPES.includes(w.type as WorkoutType) || w.type === "race") continue;
        const doc = intervalsDoc(steps, stepRefs(ctx, w.date), athlete.lthr);
        if (doc.missing.includes("hr")) missingHr = true;
        const event = {
          category: "WORKOUT", type: "Run", start_date_local: `${w.date}T00:00:00`, external_id: externalId(w.id),
          name: stepsSummary(steps, lang, ctx.settings.units) ?? "Fartlek",
          description: w.notes ? `${doc.text}\n\n${w.notes}` : doc.text,
        };
        wanted.set(w.id, { date: w.date, hash: createHash("sha1").update(JSON.stringify(event)).digest("hex"), event, steps: doc.steps });
      }

      const sent = db.select().from(t.intervalsEvents).where(eq(t.intervalsEvents.userId, userId)).all();
      const sentBy = new Map(sent.map((s) => [s.workoutId, s]));
      const changed = [...wanted.entries()].filter(([id, w]) => sentBy.get(id)?.hash !== w.hash);
      // Gone from the window: deleted, dropped, moved out, steps removed. Past ones only leave our list.
      const gone = sent.filter((s) => !wanted.has(s.workoutId));
      const goneUpcoming = gone.filter((s) => s.date >= today);

      let unparsed = 0;
      if (changed.length) {
        const res = await client.upsert(changed.map(([, w]) => w.event));
        for (const ev of res) {
          const id = Number(String(ev.external_id ?? "").replace(/^fartlek-/, ""));
          const doc = ev.workout_doc as { steps?: { reps?: number; steps?: unknown[] }[] } | undefined;
          const want = wanted.get(id);
          if (!want || !doc || !Array.isArray(doc.steps)) continue;
          const parsed = doc.steps.reduce((n, s) => n + (Array.isArray(s.steps) ? s.steps.length * (s.reps ?? 1) : 1), 0);
          if (parsed < want.steps) unparsed++;
        }
      }
      if (goneUpcoming.length) await client.remove(goneUpcoming.map((s) => externalId(s.workoutId)));

      db.transaction((tx) => {
        if (gone.length) tx.delete(t.intervalsEvents).where(and(eq(t.intervalsEvents.userId, userId), inArray(t.intervalsEvents.workoutId, gone.map((s) => s.workoutId)))).run();
        for (const [workoutId, w] of changed) {
          tx.insert(t.intervalsEvents).values({ userId, workoutId, date: w.date, hash: w.hash })
            .onConflictDoUpdate({ target: [t.intervalsEvents.userId, t.intervalsEvents.workoutId], set: { date: w.date, hash: w.hash } }).run();
        }
        const warnings = athleteWarnings(athlete).filter((k) => k !== "intervals.noLthr" || missingHr);
        if (unparsed) warnings.push("intervals.unparsed");
        tx.update(t.intervalsAccounts).set({ lastPushAt: Date.now(), lastError: null, warnings: warnings.join(","), athleteName: athlete.name })
          .where(eq(t.intervalsAccounts.userId, userId)).run();
      });
      return { sent: changed.length, deleted: goneUpcoming.length, unchanged: wanted.size - changed.length, unparsed };
    } catch (e) {
      db.update(t.intervalsAccounts).set({ lastError: (e as Error).message }).where(eq(t.intervalsAccounts.userId, userId)).run();
      throw e;
    }
  }

  /** One push at a time per user; a push asked for while one runs starts after it. */
  function push(userId: number): Promise<PushResult | null> {
    const prev = running.get(userId) ?? Promise.resolve(null);
    const next = prev.catch(() => null).then(() => pushNow(userId));
    running.set(userId, next);
    void next.finally(() => { if (running.get(userId) === next) running.delete(userId); }).catch(() => {});
    return next;
  }

  /**
   * "Send to the watch" on one workout: forget what was sent for it so this push sends it again,
   * whether or not it changed. Returns whether it is on intervals.icu afterwards.
   */
  async function pushWorkout(userId: number, workoutId: number): Promise<boolean> {
    db.delete(t.intervalsEvents).where(and(eq(t.intervalsEvents.userId, userId), eq(t.intervalsEvents.workoutId, workoutId))).run();
    await push(userId);
    return !!db.select().from(t.intervalsEvents).where(and(eq(t.intervalsEvents.userId, userId), eq(t.intervalsEvents.workoutId, workoutId))).get();
  }

  /** After a change: push once the burst is over. Errors are kept on the account, not thrown. */
  function schedule(userId: number) {
    if (!account(userId)) return;
    clearTimeout(timers.get(userId));
    timers.set(userId, setTimeout(() => { timers.delete(userId); push(userId).catch(() => {}); }, PUSH.debounceMs));
  }

  /** On a visit: push when the last one is old, so the two-week window keeps moving. */
  function refreshIfStale(userId: number) {
    const acc = account(userId);
    if (acc && !timers.has(userId) && !running.has(userId) && (!acc.lastPushAt || Date.now() - acc.lastPushAt > PUSH.staleMs)) schedule(userId);
  }

  /** Delete what was sent for upcoming days (best effort) and forget the account. */
  async function disconnect(userId: number) {
    const acc = account(userId);
    if (!acc) return;
    clearTimeout(timers.get(userId));
    const today = ctxFor(db, userId).today;
    const upcoming = db.select().from(t.intervalsEvents).where(and(eq(t.intervalsEvents.userId, userId), gte(t.intervalsEvents.date, today))).all();
    if (upcoming.length) {
      await intervalsClient(config.intervalsBaseUrl, cipher.decrypt(acc.keyEnc), fetchFn).remove(upcoming.map((s) => externalId(s.workoutId))).catch(() => {});
    }
    db.transaction((tx) => {
      tx.delete(t.intervalsEvents).where(eq(t.intervalsEvents.userId, userId)).run();
      tx.delete(t.intervalsAccounts).where(eq(t.intervalsAccounts.userId, userId)).run();
    });
  }

  /** For tests: run any scheduled push now. */
  async function flush(userId: number) {
    if (timers.has(userId)) { clearTimeout(timers.get(userId)); timers.delete(userId); await push(userId).catch(() => {}); }
    await running.get(userId)?.catch(() => {});
  }

  return { push, pushWorkout, schedule, refreshIfStale, disconnect, flush, client: (key: string) => intervalsClient(config.intervalsBaseUrl, key, fetchFn), cipher };
}

export type IntervalsPusher = ReturnType<typeof createIntervalsPusher>;
