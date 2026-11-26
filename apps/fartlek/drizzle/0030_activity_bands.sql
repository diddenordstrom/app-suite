CREATE TABLE `activity_bands` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`date` text NOT NULL,
	`total_s` real NOT NULL,
	`z1` real NOT NULL,
	`z2` real NOT NULL,
	`z3` real NOT NULL,
	`z4` real NOT NULL,
	`z5` real NOT NULL,
	`below_s` real NOT NULL,
	`at_s` real NOT NULL,
	`over_s` real NOT NULL,
	`target_s` real NOT NULL,
	`version` integer NOT NULL,
	`threshold_pace` real,
	`target_pace` real,
	`zones_key` text NOT NULL,
	`detail_key` text NOT NULL,
	`gap` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `activity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `activity_bands_user_date` ON `activity_bands` (`user_id`,`date`);