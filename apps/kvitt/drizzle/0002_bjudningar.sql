ALTER TABLE `expenses` ADD `gift` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `guests` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `expenses` ADD `guest_amount` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `zone_kr` integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `gift_categories` text DEFAULT '["homecooked","houseparty","round","fika"]' NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `hint_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `households` ADD `hint_months` integer DEFAULT 1 NOT NULL;