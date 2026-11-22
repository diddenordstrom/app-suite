CREATE TABLE `days` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`position` real NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`sleep_type` text DEFAULT 'tent' NOT NULL,
	`sleep_name` text DEFAULT '' NOT NULL,
	`sleep_lat` real,
	`sleep_lon` real,
	`sleep_note` text DEFAULT '' NOT NULL,
	`photo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `days_trip_idx` ON `days` (`trip_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`user_id` integer,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`home_label` text DEFAULT '' NOT NULL,
	`home_lat` real,
	`home_lon` real,
	`created_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_token_unique` ON `memberships` (`token`);--> statement-breakpoint
CREATE INDEX `memberships_trip_idx` ON `memberships` (`trip_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_user_trip_idx` ON `memberships` (`user_id`,`trip_id`);--> statement-breakpoint
CREATE TABLE `pack_items` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`grp` text NOT NULL,
	`position` real NOT NULL,
	`text` text NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pack_trip_idx` ON `pack_items` (`trip_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `stops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`day_id` integer NOT NULL,
	`position` real NOT NULL,
	`name` text NOT NULL,
	`lat` real,
	`lon` real,
	`note` text DEFAULT '' NOT NULL,
	`open_from` integer,
	`open_to` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stops_day_idx` ON `stops` (`day_id`);--> statement-breakpoint
CREATE INDEX `stops_trip_idx` ON `stops` (`trip_id`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`stop_id` integer NOT NULL,
	`position` real NOT NULL,
	`text` text NOT NULL,
	`category` text DEFAULT 'se' NOT NULL,
	`done` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todos_stop_idx` ON `todos` (`stop_id`);--> statement-breakpoint
CREATE INDEX `todos_trip_idx` ON `todos` (`trip_id`);--> statement-breakpoint
CREATE TABLE `trips` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`invite_code` text NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`start_mode` text DEFAULT 'home' NOT NULL,
	`start_text` text DEFAULT '' NOT NULL,
	`start_date` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `trips_invite_code_unique` ON `trips` (`invite_code`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sub` text NOT NULL,
	`email` text,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_sub_unique` ON `users` (`sub`);