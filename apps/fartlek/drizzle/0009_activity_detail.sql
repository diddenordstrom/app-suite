CREATE TABLE `activity_files` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`data` blob NOT NULL,
	`fetched_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `activity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `detail_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `laps` ADD `start_s` real;--> statement-breakpoint
ALTER TABLE `laps` ADD `trigger` text;--> statement-breakpoint
ALTER TABLE `laps` ADD `max_hr` real;--> statement-breakpoint
ALTER TABLE `laps` ADD `cadence` real;--> statement-breakpoint
ALTER TABLE `laps` ADD `elev_gain` real;--> statement-breakpoint
ALTER TABLE `laps` ADD `elev_loss` real;