CREATE TABLE `user_settings` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`units` text DEFAULT 'metric' NOT NULL,
	`week_start` text DEFAULT 'monday' NOT NULL,
	`timezone` text DEFAULT 'UTC' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
