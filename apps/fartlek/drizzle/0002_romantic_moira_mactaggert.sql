CREATE TABLE `activities` (
	`user_id` integer NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`type_key` text NOT NULL,
	`start_time_local` text NOT NULL,
	`date` text NOT NULL,
	`distance_m` real DEFAULT 0 NOT NULL,
	`duration_s` real DEFAULT 0 NOT NULL,
	`avg_hr` real,
	`max_hr` real,
	`elevation_gain` real,
	`zone1` real,
	`zone2` real,
	`zone3` real,
	`zone4` real,
	`zone5` real,
	`is_run` integer NOT NULL,
	`threshold_flag` integer DEFAULT false NOT NULL,
	`detail_status` text DEFAULT 'none' NOT NULL,
	`detail_error` text,
	PRIMARY KEY(`user_id`, `id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activities_user_date` ON `activities` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `checkins` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`sleep` integer,
	`soreness` integer,
	`mood` integer,
	`note` text,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `garmin_accounts` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`key_enc` text NOT NULL,
	`key_expires_on` text,
	`token_enc` text,
	`token_exp` integer,
	`connected_at` integer NOT NULL,
	`last_sync_at` integer,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `laps` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`idx` integer NOT NULL,
	`distance_m` real NOT NULL,
	`duration_s` real NOT NULL,
	`avg_hr` real,
	PRIMARY KEY(`user_id`, `activity_id`, `idx`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pain_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`activity_id` text,
	`area` text NOT NULL,
	`level` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `phases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `races` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`date` text NOT NULL,
	`distance_km` real NOT NULL,
	`goal_seconds` integer,
	`priority` text DEFAULT 'A' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `streams` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`data` blob NOT NULL,
	PRIMARY KEY(`user_id`, `activity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `thresholds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`effective_date` text NOT NULL,
	`pace_sec_per_km` real,
	`hr` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `thresholds_user_date` ON `thresholds` (`user_id`,`effective_date`);--> statement-breakpoint
CREATE TABLE `week_targets` (
	`user_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`km` real,
	`minutes` real,
	`note` text,
	PRIMARY KEY(`user_id`, `week_start`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `wellness` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`hrv_weekly_avg` real,
	`hrv_last_night` real,
	`hrv_baseline_low` real,
	`resting_hr` real,
	`body_battery_max` real,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`distance_km` real,
	`duration_min` real,
	`zone2` integer DEFAULT false NOT NULL,
	`notes` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`skip_reason` text,
	`manual_activity_id` text,
	`manual_unlinked` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `workouts_user_date` ON `workouts` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `user_settings` ADD `run_days` text DEFAULT '0,2,4,6' NOT NULL;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `max_hr` integer;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `zones` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `easy_low` integer;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `easy_high` integer;