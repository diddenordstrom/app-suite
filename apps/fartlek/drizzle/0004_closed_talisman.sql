CREATE TABLE `cs_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`date` text NOT NULL,
	`kind` text NOT NULL,
	`inputs` text NOT NULL,
	`cs_mps` real NOT NULL,
	`d_prime_m` real NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `cs_tests_user_date` ON `cs_tests` (`user_id`,`date`);