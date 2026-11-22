ALTER TABLE `days` ADD `drive_minutes` integer;--> statement-breakpoint
-- Making stops.day_id nullable needs a table rebuild. The migrator runs in a transaction, where PRAGMA foreign_keys=OFF
-- is ignored, so DROP TABLE stops would cascade-delete every todo. Keep a copy of todos and put them back afterwards.
CREATE TABLE `__todos_keep` AS SELECT * FROM `todos`;--> statement-breakpoint
CREATE TABLE `__new_stops` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`day_id` integer,
	`position` real NOT NULL,
	`kind` text DEFAULT 'stop' NOT NULL,
	`name` text NOT NULL,
	`lat` real,
	`lon` real,
	`note` text DEFAULT '' NOT NULL,
	`open_from` integer,
	`open_to` integer,
	`photo` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`day_id`) REFERENCES `days`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_stops`("id", "trip_id", "day_id", "position", "kind", "name", "lat", "lon", "note", "open_from", "open_to", "photo", "created_at") SELECT "id", "trip_id", "day_id", "position", 'stop', "name", "lat", "lon", "note", "open_from", "open_to", NULL, "created_at" FROM `stops`;--> statement-breakpoint
DROP TABLE `stops`;--> statement-breakpoint
ALTER TABLE `__new_stops` RENAME TO `stops`;--> statement-breakpoint
CREATE INDEX `stops_day_idx` ON `stops` (`day_id`);--> statement-breakpoint
CREATE INDEX `stops_trip_idx` ON `stops` (`trip_id`);--> statement-breakpoint
INSERT INTO `todos` SELECT * FROM `__todos_keep` WHERE `id` NOT IN (SELECT `id` FROM `todos`);--> statement-breakpoint
DROP TABLE `__todos_keep`;--> statement-breakpoint
CREATE TABLE `stop_links` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`trip_id` integer NOT NULL,
	`stop_id` integer NOT NULL,
	`position` real NOT NULL,
	`url` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`trip_id`) REFERENCES `trips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stop_id`) REFERENCES `stops`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `stop_links_stop_idx` ON `stop_links` (`stop_id`);--> statement-breakpoint
CREATE INDEX `stop_links_trip_idx` ON `stop_links` (`trip_id`);
