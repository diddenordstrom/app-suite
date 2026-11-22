CREATE TABLE `activity_logs` (
	`user_id` integer NOT NULL,
	`activity_id` text NOT NULL,
	`note` text,
	`rpe` integer,
	`carbs_g` integer,
	`nausea` integer,
	`bloating` integer,
	`cramps` integer,
	`feel` integer,
	PRIMARY KEY(`user_id`, `activity_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
