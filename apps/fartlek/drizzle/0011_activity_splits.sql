CREATE TABLE `activity_splits` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`at_s` integer NOT NULL,
	PRIMARY KEY(`user_id`, `activity_id`, `at_s`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
