CREATE TABLE `intervals_accounts` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`key_enc` text NOT NULL,
	`athlete_id` text NOT NULL,
	`athlete_name` text,
	`lang` text DEFAULT 'sv' NOT NULL,
	`connected_at` integer NOT NULL,
	`last_push_at` integer,
	`last_error` text,
	`warnings` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `intervals_events` (
	`user_id` integer NOT NULL,
	`workout_id` integer NOT NULL,
	`date` text NOT NULL,
	`hash` text NOT NULL,
	PRIMARY KEY(`user_id`, `workout_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
