CREATE TABLE `gym_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`date` text NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`template` text,
	`name` text,
	`feel` text,
	`workout_id` integer,
	`source` text DEFAULT 'fartlek' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gym_sessions_client` ON `gym_sessions` (`user_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `gym_sessions_user_date` ON `gym_sessions` (`user_id`,`date`);--> statement-breakpoint
CREATE TABLE `gym_sets` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`session_id` integer NOT NULL,
	`position` integer NOT NULL,
	`set_index` integer NOT NULL,
	`exercise` text NOT NULL,
	`slot` text,
	`kind` text DEFAULT 'work' NOT NULL,
	`kg` real,
	`reps` integer,
	`seconds` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_id`) REFERENCES `gym_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `gym_sets_session` ON `gym_sets` (`session_id`);--> statement-breakpoint
CREATE INDEX `gym_sets_user_exercise` ON `gym_sets` (`user_id`,`exercise`);