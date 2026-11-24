import type { ISODate, WeekStart } from "./dates";
import type { Units } from "./format";
import type { WorkoutSteps } from "./steps";

export interface User {
  id: number;
  sub: string;
  email: string | null;
  name: string | null;
}

export function displayName(u: Pick<User, "name" | "email" | "sub">): string {
  return u.name || u.email || u.sub;
}

/** HR zone upper bounds in bpm for zones 1–4 (zone 5 is everything above). */
export type ZoneBounds = [number, number, number, number];

export interface Settings {
  units: Units;
  weekStart: WeekStart;
  timezone: string;
  /** Days the runner usually trains, 0 = Sunday. Used to place quick-add and suggested sessions. */
  runDays: number[];
  /** Day the long run goes on, 0 = Sunday. A preference: when it isn't a run day, the last run day is used. */
  longRunDay: number;
  maxHr: number | null;
  /** Custom zones; null = use the watch's zones from Garmin. */
  zones: ZoneBounds | null;
  easyLow: number | null;
  easyHigh: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
  units: "metric",
  weekStart: "monday",
  timezone: "UTC",
  runDays: [2, 4, 6, 0],
  longRunDay: 0,
  maxHr: null,
  zones: null,
  easyLow: null,
  easyHigh: null,
};

const isHr = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 40 && v <= 240;

export function parseSettings(input: unknown): Settings | null {
  if (typeof input !== "object" || input === null) return null;
  const s = { ...DEFAULT_SETTINGS, ...(input as Record<string, unknown>) } as Record<string, unknown>;
  if (s.units !== "metric" && s.units !== "imperial") return null;
  if (s.weekStart !== "monday" && s.weekStart !== "sunday") return null;
  if (typeof s.timezone !== "string") return null;
  try { new Intl.DateTimeFormat("en", { timeZone: s.timezone }); } catch { return null; }
  if (!Array.isArray(s.runDays) || !s.runDays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) return null;
  if (!Number.isInteger(s.longRunDay) || (s.longRunDay as number) < 0 || (s.longRunDay as number) > 6) return null;
  for (const k of ["maxHr", "easyLow", "easyHigh"] as const) if (s[k] !== null && !isHr(s[k])) return null;
  if (s.zones !== null) {
    const z = s.zones;
    if (!Array.isArray(z) || z.length !== 4 || !z.every(isHr) || !z.every((v, i) => i === 0 || v > z[i - 1])) return null;
  }
  if (s.easyLow !== null && s.easyHigh !== null && (s.easyLow as number) >= (s.easyHigh as number)) return null;
  return {
    units: s.units,
    weekStart: s.weekStart,
    timezone: s.timezone,
    runDays: [...new Set(s.runDays as number[])].sort(),
    longRunDay: s.longRunDay as number,
    maxHr: s.maxHr as number | null,
    zones: s.zones as ZoneBounds | null,
    easyLow: s.easyLow as number | null,
    easyHigh: s.easyHigh as number | null,
  };
}

export const RUN_TYPES = ["running", "trail_running", "treadmill_running", "track_running", "street_running", "indoor_running", "virtual_run"];
/** Garmin's gym activities; they get their own planned type so they never fill a cross-train session. */
export const STRENGTH_TYPES = ["strength_training"];
export const isStrengthType = (typeKey: string) => STRENGTH_TYPES.includes(typeKey);

export const isRunType = (typeKey: string) => RUN_TYPES.includes(typeKey) || typeKey.endsWith("_running");

export interface Activity {
  id: string;
  name: string;
  typeKey: string;
  startTimeLocal: string;
  date: ISODate;
  distanceM: number;
  durationS: number;
  avgHr: number | null;
  maxHr: number | null;
  elevationGain: number | null;
  /** Seconds in the watch's HR zones 1–5. */
  zoneSecs: [number, number, number, number, number] | null;
  isRun: boolean;
  thresholdFlag: boolean;
  hasDetail: boolean;
}

export const WORKOUT_TYPES = ["easy", "long", "threshold", "intervals", "race", "cross", "strength", "rest"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];
export const KEY_TYPES: WorkoutType[] = ["long", "threshold", "intervals", "race"];
export const RUN_WORKOUT_TYPES: WorkoutType[] = ["easy", "long", "threshold", "intervals", "race"];

/** A translatable message: the client turns `key` + `params` into text in the user's language. */
export interface Msg { key: string; params?: Record<string, number | string> }

export const WORKOUT_STATUSES = ["planned", "skipped", "dropped"] as const;
export type WorkoutStatus = (typeof WORKOUT_STATUSES)[number];
export const SKIP_REASONS = ["sick", "injury", "time", "stress", "travel", "work", "tired", "other"] as const;

export interface Workout {
  id: number;
  date: ISODate;
  type: WorkoutType;
  distanceKm: number | null;
  durationMin: number | null;
  /** Long run that should be scored as easy/zone 2. */
  zone2: boolean;
  notes: string | null;
  status: WorkoutStatus;
  skipReason: string | null;
  manualActivityId: string | null;
  manualUnlinked: boolean;
  /** Structured steps; when set, distanceKm/durationMin are derived from them. */
  steps: WorkoutSteps | null;
  /** Race-phase blueprint tag such as `mp-long#2` (`h` after the step = held); null for any other session. */
  blueprint: string | null;
}

export interface Race {
  id: number;
  name: string;
  date: ISODate;
  distanceKm: number;
  goalSeconds: number | null;
  priority: "A" | "B" | "C";
  /** Finish time once run, and the run it was (docs/decisions/fartlek-race-results.md). */
  resultSeconds: number | null;
  activityId: string | null;
  /** Race pace (sec/km) the race phase trains at, its source and the date it was locked; null until locked. */
  mpSec: number | null;
  hmpSec: number | null;
  paceSource: string | null;
  paceLockedOn: ISODate | null;
}

export const BLOCK_KINDS = ["base", "build", "specific", "taper", "recovery"] as const;
export type BlockKind = (typeof BLOCK_KINDS)[number];
/** A training block: `weeks` whole weeks from `startWeek` (a week start). Workouts belong to it by date. */
export interface Block {
  id: number; kind: BlockKind; name: string | null; startWeek: ISODate; weeks: number; note: string | null;
  /** Minutes a week of other sports the coach counts; null = the mean of the last weeks (shared/coach.ts). */
  crossMin: number | null;
  /** Run km the block aims at over all its weeks; null = none set (docs/decisions/fartlek-block-goals.md). */
  goalKm: number | null;
}
/** Sessions a block's "key sessions" count (races are reminders, not part of a block's plan). */
export const BLOCK_KEY_TYPES: WorkoutType[] = ["long", "threshold", "intervals"];

export interface Threshold { id: number; effectiveDate: ISODate; paceSecPerKm: number | null; hr: number | null }

export const PAIN_AREAS = ["calf", "knee", "shin", "foot", "hip", "achilles", "hamstring", "back", "other"] as const;
export interface PainEntry { id: number; date: ISODate; activityId: string | null; area: string; level: number; note: string | null }

/** The daily check-in. Only soreness feeds today's form; old sleep and mood columns stay in the database unused. */
export interface Checkin { date: ISODate; soreness: number | null; feel: "fresh" | "normal" | "heavy" | null; note: string | null }

export interface Wellness {
  date: ISODate;
  hrvWeeklyAvg: number | null;
  hrvLastNight: number | null;
  hrvBaselineLow: number | null;
  restingHr: number | null;
  bodyBatteryMax: number | null;
  /** Garmin's overall sleep score (0–100) for the night ending on `date`. */
  sleepScore: number | null;
}

/** What ended a lap: the lap button, an auto-lap rule, or the end of the activity. */
export type LapTrigger = "manual" | "distance" | "time" | "position" | "end" | "other";

/**
 * A lap as the watch recorded it. The fields after `avgHr` came with the detail rework
 * (docs/decisions/fartlek-structured-workouts.md); laps fetched before it lack them until the
 * activity's detail is fetched again.
 */
export interface Lap {
  index: number;
  distanceM: number;
  durationS: number;
  avgHr: number | null;
  /** Seconds from the start of the activity, on the same clock as `Stream.t`. */
  startS?: number | null;
  trigger?: LapTrigger | null;
  maxHr?: number | null;
  /** Steps per minute (both feet). */
  cadence?: number | null;
  elevGain?: number | null;
  elevLoss?: number | null;
}

/** ~5 s samples. Arrays are parallel; null where the sensor had no value. `cad` (steps per minute) is missing in streams fetched before it was added. */
export interface Stream {
  t: number[]; hr: (number | null)[]; speed: (number | null)[]; alt: (number | null)[]; cad?: (number | null)[];
  /** Garmin's grade-adjusted speed (m/s); only in the on-demand fine parse for step detection, never stored. */
  gap?: (number | null)[];
}
