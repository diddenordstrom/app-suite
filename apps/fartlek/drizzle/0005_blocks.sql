CREATE TABLE `blocks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`start_week` text NOT NULL,
	`weeks` integer NOT NULL,
	`note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `blocks_user_start` ON `blocks` (`user_id`,`start_week`);--> statement-breakpoint
-- Carry existing phases over as unnamed blocks: start on the week start (per the user's setting), whole weeks to cover the end date, peak becomes specific.
INSERT INTO `blocks` (`user_id`, `kind`, `name`, `start_week`, `weeks`, `note`)
SELECT `user_id`, CASE `kind` WHEN 'peak' THEN 'specific' ELSE `kind` END, NULL, `ws`,
  MAX(1, CAST((julianday(`end_date`) - julianday(`ws`)) / 7 AS INTEGER) + 1), `note`
FROM (
  SELECT p.*, date(p.`start_date`, '-' || ((CAST(strftime('%w', p.`start_date`) AS INTEGER) + CASE WHEN u.`week_start` = 'sunday' THEN 0 ELSE 6 END) % 7) || ' days') AS `ws`
  FROM `phases` p LEFT JOIN `user_settings` u ON u.`user_id` = p.`user_id`
);
