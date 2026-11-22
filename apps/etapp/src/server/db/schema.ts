import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { authTables } from "@homelab/server-kit";

/** OIDC users (admins) and their sessions; same tables in every app (server-kit authTables). Invited travellers are not users; they only exist as memberships. */
export const { users, sessions } = authTables();

/** A roadtrip: the unit that is planned and shared through an invite link. */
export const trips = sqliteTable("trips", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  /** Current invite code; rotating replaces it, invalidating old links. */
  inviteCode: text("invite_code").notNull().unique(),
  /** Country or region added to name-only searches. */
  area: text("area").notNull().default(""),
  startMode: text("start_mode", { enum: ["home", "here", "custom"] }).notNull().default("home"),
  startText: text("start_text").notNull().default(""),
  /** "YYYY-MM-DD" or null. */
  startDate: text("start_date"),
  createdAt: integer("created_at").notNull(),
});

/**
 * A traveller on a trip. Admins link to an OIDC user; invited travellers have userId null
 * and authenticate with `token` (stored in a signed cookie, also the recovery link).
 * Removed memberships keep their row (removedAt set) so who-did-what stays intact.
 */
export const memberships = sqliteTable("memberships", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  role: text("role", { enum: ["admin", "member"] }).notNull(),
  token: text("token").notNull().unique(),
  /** The traveller's own home, where "Start: home" begins. */
  homeLabel: text("home_label").notNull().default(""),
  homeLat: real("home_lat"),
  homeLon: real("home_lon"),
  createdAt: integer("created_at").notNull(),
  removedAt: integer("removed_at"),
}, (t) => [index("memberships_trip_idx").on(t.tripId), uniqueIndex("memberships_user_trip_idx").on(t.userId, t.tripId)]);

/** A day of the trip; the night is part of the day (sleep_*). Order by position. */
export const days = sqliteTable("days", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  position: real("position").notNull(),
  title: text("title").notNull().default(""),
  sleepType: text("sleep_type", { enum: ["tent", "hostel", "hotel", "other"] }).notNull().default("tent"),
  sleepName: text("sleep_name").notNull().default(""),
  sleepLat: real("sleep_lat"),
  sleepLon: real("sleep_lon"),
  sleepNote: text("sleep_note").notNull().default(""),
  /** Cover photo file name under the uploads dir, or null. */
  photo: text("photo"),
  /** Driving time for the day in minutes, typed in from Google Maps; null when not given. */
  driveMinutes: integer("drive_minutes"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("days_trip_idx").on(t.tripId)]);

/**
 * A place on the trip. `kind` "stop" is somewhere you explore (todos, links, photo); "via" is a point that only steers
 * the route. A stop with dayId null is an idea in the trip's idea bank, not yet on a day.
 */
export const stops = sqliteTable("stops", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  dayId: integer("day_id").references(() => days.id, { onDelete: "cascade" }),
  position: real("position").notNull(),
  kind: text("kind", { enum: ["stop", "via"] }).notNull().default("stop"),
  name: text("name").notNull(),
  lat: real("lat"),
  lon: real("lon"),
  note: text("note").notNull().default(""),
  openFrom: integer("open_from"),
  openTo: integer("open_to"),
  /** Photo file name under the uploads dir ("what the place looks like"), or null. */
  photo: text("photo"),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("stops_day_idx").on(t.dayId), index("stops_trip_idx").on(t.tripId)]);

/** Inspiration saved on a stop or idea: a video, thread or post, with a note of what to look for. */
export const stopLinks = sqliteTable("stop_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  stopId: integer("stop_id").notNull().references(() => stops.id, { onDelete: "cascade" }),
  position: real("position").notNull(),
  url: text("url").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("stop_links_stop_idx").on(t.stopId), index("stop_links_trip_idx").on(t.tripId)]);

export const todos = sqliteTable("todos", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  stopId: integer("stop_id").notNull().references(() => stops.id, { onDelete: "cascade" }),
  position: real("position").notNull(),
  text: text("text").notNull(),
  category: text("category", { enum: ["fika", "mat", "sova", "se", "fixa"] }).notNull().default("se"),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("todos_stop_idx").on(t.stopId), index("todos_trip_idx").on(t.tripId)]);

export const packItems = sqliteTable("pack_items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  tripId: integer("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  grp: text("grp", { enum: ["tent", "kitchen", "clothes", "car", "other"] }).notNull(),
  position: real("position").notNull(),
  text: text("text").notNull(),
  done: integer("done", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
}, (t) => [index("pack_trip_idx").on(t.tripId)]);
