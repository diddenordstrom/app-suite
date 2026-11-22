CREATE TABLE `race_checks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`race_id` integer NOT NULL,
	`model_version` integer NOT NULL,
	`date` text NOT NULL,
	`distance_km` real NOT NULL,
	`result_seconds` integer NOT NULL,
	`predicted_seconds` integer,
	`model` text,
	`models` text NOT NULL,
	`inputs` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `race_checks_race_version` ON `race_checks` (`user_id`,`race_id`,`model_version`);--> statement-breakpoint
ALTER TABLE `activities` ADD `event_type` text;--> statement-breakpoint
ALTER TABLE `activities` ADD `not_race` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `races` ADD `result_seconds` integer;--> statement-breakpoint
ALTER TABLE `races` ADD `activity_id` text;