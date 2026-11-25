import { blob, integer, primaryKey, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { authTables, pushTables } from "@homelab/server-kit";

export const { users, sessions } = authTables();
/** Web Push devices and the VAPID keys (server-kit, docs/decisions/web-push.md). */
export const { pushSubscriptions, pushKeys } = pushTables(users);

const userRef = () => integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" });

export const userSettings = sqliteTable("user_settings", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  units: text("units").notNull().default("metric"),
  weekStart: text("week_start").notNull().default("monday"),
  timezone: text("timezone").notNull().default("UTC"),
  runDays: text("run_days").notNull().default("0,2,4,6"),
  longRunDay: integer("long_run_day").notNull().default(0),
  /** Gym weekdays, comma-separated ("1"), and other-sport days with minutes ("4:30,6:60"). */
  gymDays: text("gym_days").notNull().default(""),
  crossDays: text("cross_days").notNull().default(""),
  /** "off", "gym" or "all": where a short easy run may go when the run days don't hold the week. */
  doubles: text("doubles").notNull().default("off"),
  maxHr: integer("max_hr"),
  zones: text("zones"),
  easyLow: integer("easy_low"),
  easyHigh: integer("easy_high"),
  /** Guided tours this user has finished or closed, comma-separated ids. */
  toursSeen: text("tours_seen").notNull().default(""),
});

/** Garmin personal API key, AES-256-GCM encrypted (D24). Never returned to the client. */
export const garminAccounts = sqliteTable("garmin_accounts", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  keyEnc: text("key_enc").notNull(),
  keyExpiresOn: text("key_expires_on"),
  tokenEnc: text("token_enc"),
  tokenExp: integer("token_exp"),
  connectedAt: integer("connected_at").notNull(),
  lastSyncAt: integer("last_sync_at"),
  lastError: text("last_error"),
});

/**
 * intervals.icu API key (encrypted like the Garmin key), used to send structured workouts on to Garmin
 * (docs/decisions/fartlek-watch-push.md). Never returned to the client.
 */
export const intervalsAccounts = sqliteTable("intervals_accounts", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  keyEnc: text("key_enc").notNull(),
  athleteId: text("athlete_id").notNull(),
  athleteName: text("athlete_name"),
  /** Language of the workout names sent (the UI language when connecting). */
  lang: text("lang").notNull().default("sv"),
  connectedAt: integer("connected_at").notNull(),
  lastPushAt: integer("last_push_at"),
  lastError: text("last_error"),
  /** Message keys (comma-separated) about the intervals.icu account, e.g. no threshold pace set. */
  warnings: text("warnings").notNull().default(""),
});

/** Workouts sent to intervals.icu: what was sent, so unchanged ones aren't resent and removed ones can be deleted there. */
export const intervalsEvents = sqliteTable("intervals_events", {
  userId: userRef(),
  workoutId: integer("workout_id").notNull(),
  date: text("date").notNull(),
  hash: text("hash").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.workoutId] })]);

export const activities = sqliteTable("activities", {
  userId: userRef(),
  id: text("id").notNull(),
  name: text("name").notNull(),
  typeKey: text("type_key").notNull(),
  startTimeLocal: text("start_time_local").notNull(),
  date: text("date").notNull(),
  distanceM: real("distance_m").notNull().default(0),
  durationS: real("duration_s").notNull().default(0),
  avgHr: real("avg_hr"),
  maxHr: real("max_hr"),
  elevationGain: real("elevation_gain"),
  zone1: real("zone1"), zone2: real("zone2"), zone3: real("zone3"), zone4: real("zone4"), zone5: real("zone5"),
  isRun: integer("is_run", { mode: "boolean" }).notNull(),
  thresholdFlag: integer("threshold_flag", { mode: "boolean" }).notNull().default(false),
  /** none = not fetched yet, done, failed, na (not a run). */
  detailStatus: text("detail_status").notNull().default("none"),
  detailError: text("detail_error"),
  /** Which parse of the detail is stored (DETAIL_VERSION in sync.ts); older ones are fetched again, keeping the old detail until that succeeds. */
  detailVersion: integer("detail_version").notNull().default(0),
  /** Which extraction of best efforts is stored (EFFORTS_VERSION in efforts.ts); 0 = not extracted yet. */
  effortsVersion: integer("efforts_version").notNull().default(0),
  /** Heart-rate-to-speed decoupling of a steady long run (shared/racemodels.ts), extracted with the efforts; null otherwise. */
  decoupling: real("decoupling"),
  /** Garmin's event type (`race`, `training`, `uncategorized`…), null before it was synced. */
  eventType: text("event_type"),
  /** The runner answered "no" to "Was this a race?" (docs/decisions/fartlek-race-results.md). */
  notRace: integer("not_race", { mode: "boolean" }).notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.id] }), index("activities_user_date").on(t.userId, t.date)]);

/** Best distance per fixed duration of a run (shared/bestefforts.ts), extracted from its stream. */
export const bestEfforts = sqliteTable("best_efforts", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  date: text("date").notNull(),
  durationS: integer("duration_s").notNull(),
  distanceM: real("distance_m").notNull(),
  startS: integer("start_s").notNull(),
  /** Grade-adjusted speed was used. */
  gap: integer("gap", { mode: "boolean" }).notNull().default(false),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId, t.durationS] }), index("best_efforts_user_date").on(t.userId, t.date)]);

/** Garmin's running VO2max per day, shown as a trend in Trends. */
export const vo2max = sqliteTable("vo2max", {
  userId: userRef(),
  date: text("date").notNull(),
  value: real("value").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);

export const laps = sqliteTable("laps", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  idx: integer("idx").notNull(),
  distanceM: real("distance_m").notNull(),
  durationS: real("duration_s").notNull(),
  avgHr: real("avg_hr"),
  startS: real("start_s"),
  trigger: text("trigger"),
  maxHr: real("max_hr"),
  cadence: real("cadence"),
  elevGain: real("elev_gain"),
  elevLoss: real("elev_loss"),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId, t.idx] })]);

/**
 * Where the runner split a lap (seconds from the activity's start) to fix a forgotten lap press.
 * Only how the activity's steps are judged changes; the laps from Garmin stay as they are.
 */
export const activitySplits = sqliteTable("activity_splits", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  atS: integer("at_s").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId, t.atS] })]);

/** The raw FIT file per activity, gzipped, so a parser change re-reads it locally instead of fetching from Garmin again. */
export const activityFiles = sqliteTable("activity_files", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
  fetchedAt: integer("fetched_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId] })]);

/** ~5 s HR/speed/altitude samples, gzipped JSON (D25). */
export const streams = sqliteTable("streams", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  data: blob("data", { mode: "buffer" }).notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId] })]);

export const workouts = sqliteTable("workouts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  date: text("date").notNull(),
  type: text("type").notNull(),
  distanceKm: real("distance_km"),
  durationMin: real("duration_min"),
  zone2: integer("zone2", { mode: "boolean" }).notNull().default(false),
  notes: text("notes"),
  status: text("status").notNull().default("planned"),
  skipReason: text("skip_reason"),
  manualActivityId: text("manual_activity_id"),
  manualUnlinked: integer("manual_unlinked", { mode: "boolean" }).notNull().default(false),
  /** Structured steps as JSON (shared/steps.ts `WorkoutSteps`); null = a plain workout. The planned amount is derived from them. */
  steps: text("steps"),
  /** The race-phase blueprint this session came from, e.g. `mp-long#2` (a trailing `h` = held); see shared/blueprints.ts. */
  blueprint: text("blueprint"),
}, (t) => [index("workouts_user_date").on(t.userId, t.date)]);

export const weekTargets = sqliteTable("week_targets", {
  userId: userRef(),
  weekStart: text("week_start").notNull(),
  km: real("km"),
  minutes: real("minutes"),
  note: text("note"),
}, (t) => [primaryKey({ columns: [t.userId, t.weekStart] })]);

export const races = sqliteTable("races", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  name: text("name").notNull(),
  date: text("date").notNull(),
  distanceKm: real("distance_km").notNull(),
  goalSeconds: integer("goal_seconds"),
  priority: text("priority").notNull().default("A"),
  /** The finish time of a race that has been run, and the activity it was. */
  resultSeconds: integer("result_seconds"),
  activityId: text("activity_id"),
  /** Race pace (sec/km) the race phase trains at, where it came from and when it was locked (docs/decisions/fartlek-race-specific-phase.md). */
  mpSec: real("mp_sec"),
  hmpSec: real("hmp_sec"),
  paceSource: text("pace_source"),
  paceLockedOn: text("pace_locked_on"),
  /** The runner's cap on a build week's km on the way to this race (docs/decisions/fartlek-long-run-ceiling.md); null = none. */
  peakKm: real("peak_km"),
});

/**
 * What Fartlek predicted for a race the day before it, against the result (docs/decisions/fartlek-race-results.md):
 * every model's estimate and the inputs, per model version, so the models can be tuned later.
 */
/**
 * The race plan's weeks (docs/decisions/fartlek-race-plan-skeleton.md): phase, role and km target of every week from the plan's start to the end
 * of the race's recovery. `km` null = the week is in a block, whose week_targets row holds its target. Never read as planned load or tolerance.
 */
export const racePlanWeeks = sqliteTable("race_plan_weeks", {
  userId: userRef(),
  weekStart: text("week_start").notNull(),
  raceId: integer("race_id").notNull(),
  phase: text("phase").notNull(),
  role: text("role").notNull(),
  km: real("km"),
  longKm: real("long_km"),
  computedOn: text("computed_on").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.weekStart] }), index("race_plan_weeks_race").on(t.userId, t.raceId)]);

export const raceChecks = sqliteTable("race_checks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  raceId: integer("race_id").notNull(),
  modelVersion: integer("model_version").notNull(),
  date: text("date").notNull(),
  distanceKm: real("distance_km").notNull(),
  resultSeconds: integer("result_seconds").notNull(),
  predictedSeconds: integer("predicted_seconds"),
  model: text("model"),
  /** JSON: [{ model, seconds }] for each model that had its inputs. */
  models: text("models").notNull(),
  /** JSON: CS, D′, weekly km, mean pace, decoupling, CTL on the day before. */
  inputs: text("inputs").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("race_checks_race_version").on(t.userId, t.raceId, t.modelVersion)]);

/** Training blocks (replaced phases). A block covers `weeks` whole weeks from `startWeek`; workouts belong to it by date. */
export const blocks = sqliteTable("blocks", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  kind: text("kind").notNull(),
  name: text("name"),
  startWeek: text("start_week").notNull(),
  weeks: integer("weeks").notNull(),
  note: text("note"),
  /** Minutes a week of other sports the coach counts in this block; null = the mean of the last weeks. */
  crossMin: integer("cross_min"),
  /** Run km the block aims at over all its weeks (docs/decisions/fartlek-block-goals.md); null = no goal set. */
  goalKm: real("goal_km"),
}, (t) => [index("blocks_user_start").on(t.userId, t.startWeek)]);

export const thresholds = sqliteTable("thresholds", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  effectiveDate: text("effective_date").notNull(),
  paceSecPerKm: real("pace_sec_per_km"),
  hr: integer("hr"),
}, (t) => [uniqueIndex("thresholds_user_date").on(t.userId, t.effectiveDate)]);

export const painEntries = sqliteTable("pain_entries", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  date: text("date").notNull(),
  activityId: text("activity_id"),
  area: text("area").notNull(),
  level: integer("level").notNull(),
  note: text("note"),
});

/** Critical speed tests. `inputs` holds what was typed (JSON), so a test can be shown again; CS and D′ are computed when it is saved. */
export const csTests = sqliteTable("cs_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  date: text("date").notNull(),
  /** trials = two or three maximal efforts, three_min = the 3-minute all-out test. */
  kind: text("kind").notNull(),
  inputs: text("inputs").notNull(),
  csMps: real("cs_mps").notNull(),
  dPrimeM: real("d_prime_m").notNull(),
}, (t) => [index("cs_tests_user_date").on(t.userId, t.date)]);

/** The runner's own session templates (the session library): steps as JSON, shown as text in their language. */
export const sessionTemplates = sqliteTable("session_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  steps: text("steps").notNull(),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("session_templates_user").on(t.userId)]);

/** What the runner writes down per activity. Kept apart from `activities` so a Garmin re-sync never touches it. */
export const activityLogs = sqliteTable("activity_logs", {
  userId: userRef(),
  activityId: text("activity_id").notNull(),
  note: text("note"),
  rpe: integer("rpe"),
  carbsG: integer("carbs_g"),
  nausea: integer("nausea"),
  bloating: integer("bloating"),
  cramps: integer("cramps"),
  feel: integer("feel"),
}, (t) => [primaryKey({ columns: [t.userId, t.activityId] })]);

export const checkins = sqliteTable("checkins", {
  userId: userRef(),
  date: text("date").notNull(),
  sleep: integer("sleep"),
  soreness: integer("soreness"),
  mood: integer("mood"),
  /** How the body feels before a key session on a low-form day: fresh / normal / heavy (decision fartlek-today). */
  feel: text("feel"),
  note: text("note"),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);

export const wellness = sqliteTable("wellness", {
  userId: userRef(),
  date: text("date").notNull(),
  hrvWeeklyAvg: real("hrv_weekly_avg"),
  hrvLastNight: real("hrv_last_night"),
  hrvBaselineLow: real("hrv_baseline_low"),
  restingHr: real("resting_hr"),
  bodyBatteryMax: real("body_battery_max"),
  sleepScore: real("sleep_score"),
  fetchedAt: integer("fetched_at").notNull(),
}, (t) => [primaryKey({ columns: [t.userId, t.date] })]);

/** The runner's overrides of the planning engine's tuning table (shared/tuning.ts), as JSON; only an admin writes it. */
export const engineTuning = sqliteTable("engine_tuning", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  overrides: text("overrides").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

/**
 * The morning notification (docs/decisions/fartlek-morning-push.md): the local time it goes out, null when off,
 * and the local date it last went out.
 */
export const morningPush = sqliteTable("morning_push", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  time: text("time"),
  sentOn: text("sent_on"),
});

/**
 * A gym session logged in Fartlek or imported (docs/decisions/fartlek-gym-module.md). `clientId` is made on
 * the phone when the session starts (or `bolt:<stamp>` for an import), so a resend saves it once.
 */
export const gymSessions = sqliteTable("gym_sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  clientId: text("client_id").notNull(),
  date: text("date").notNull(),
  startedAt: integer("started_at"),
  finishedAt: integer("finished_at"),
  /** A, B, C, or null for a free or imported session. */
  template: text("template"),
  /** The name another app gave the session (imports). */
  name: text("name"),
  /** The joint check-in before the session: none, some, pain. */
  feel: text("feel"),
  /** The planned gym session it was started from. */
  workoutId: integer("workout_id"),
  source: text("source").notNull().default("fartlek"),
  /** JSON `LayoutEntry[]`: the session as it stood when finished, skipped exercises included (shared/gymplan.ts). */
  layout: text("layout"),
}, (t) => [uniqueIndex("gym_sessions_client").on(t.userId, t.clientId), index("gym_sessions_user_date").on(t.userId, t.date)]);

/** One set of a gym session. `exercise` is a catalogue id (shared/gym.ts) or `x:<name>`. */
export const gymSets = sqliteTable("gym_sets", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: userRef(),
  sessionId: integer("session_id").notNull().references(() => gymSessions.id, { onDelete: "cascade" }),
  /** The exercise's place in the session, and the set's place in the exercise. */
  position: integer("position").notNull(),
  setIndex: integer("set_index").notNull(),
  exercise: text("exercise").notNull(),
  slot: text("slot"),
  /** work, warmup, drop. */
  kind: text("kind").notNull().default("work"),
  kg: real("kg"),
  reps: integer("reps"),
  seconds: integer("seconds"),
  /** The comment on the exercise in this session; kept on the exercise's first set (`setIndex` 0). */
  note: text("note"),
}, (t) => [index("gym_sets_session").on(t.sessionId), index("gym_sets_user_exercise").on(t.userId, t.exercise)]);
