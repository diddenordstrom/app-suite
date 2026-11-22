ALTER TABLE `expenses` ADD `car` text;--> statement-breakpoint
ALTER TABLE `memberships` ADD `wallet_id` integer REFERENCES memberships(id);