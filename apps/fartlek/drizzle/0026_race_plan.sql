CREATE TABLE `race_plan_weeks` (
	`user_id` integer NOT NULL,
	`week_start` text NOT NULL,
	`race_id` integer NOT NULL,
	`phase` text NOT NULL,
	`role` text NOT NULL,
	`km` real,
	`long_km` real,
	`computed_on` text NOT NULL,
	PRIMARY KEY(`user_id`, `week_start`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `race_plan_weeks_race` ON `race_plan_weeks` (`user_id`,`race_id`);