CREATE TABLE `best_efforts` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`date` text NOT NULL,
	`duration_s` integer NOT NULL,
	`distance_m` real NOT NULL,
	`start_s` integer NOT NULL,
	`gap` integer DEFAULT false NOT NULL,
	PRIMARY KEY(`user_id`, `activity_id`, `duration_s`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `best_efforts_user_date` ON `best_efforts` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `vo2max` (
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`value` real NOT NULL,
	PRIMARY KEY(`user_id`, `date`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `activities` ADD `efforts_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `activities` ADD `decoupling` real;