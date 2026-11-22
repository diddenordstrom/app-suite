CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `companion_planting` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crop_a_id` integer NOT NULL,
	`crop_b_id` integer NOT NULL,
	`relationship` text NOT NULL,
	`evidence_level` text NOT NULL,
	`source` text NOT NULL,
	`note` text,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`crop_a_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`crop_b_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `companion_pair_unique` ON `companion_planting` (`crop_a_id`,`crop_b_id`);--> statement-breakpoint
CREATE TABLE `crop` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`yield_kg_per_m2` real NOT NULL,
	`yield_kg_per_plant` real,
	`kcal_per_kg` real NOT NULL,
	`protein_g_per_kg` real NOT NULL,
	`carbs_g_per_kg` real NOT NULL,
	`fat_g_per_kg` real NOT NULL,
	`category` text NOT NULL,
	`shelf_life_weeks` integer,
	`default_consume_kg` real,
	`weeks_to_transplant` integer,
	`direct_sow_only` integer DEFAULT false NOT NULL,
	`days_to_maturity_from_transplant` integer,
	`crop_family` text DEFAULT 'unknown' NOT NULL,
	`is_perennial` integer DEFAULT false NOT NULL,
	`indoor_sow_month_start` integer,
	`indoor_sow_month_end` integer,
	`direct_sow_month_start` integer,
	`direct_sow_month_end` integer,
	`min_temp_c` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crop_name_unique` ON `crop` (`name`);--> statement-breakpoint
CREATE TABLE `crop_burn_rate` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`crop_id` integer NOT NULL,
	`kg_per_week` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crop_burn_rate_household_crop_unique` ON `crop_burn_rate` (`household_id`,`crop_id`);--> statement-breakpoint
CREATE TABLE `crop_family_rotation` (
	`family` text PRIMARY KEY NOT NULL,
	`exclusion_years` integer NOT NULL,
	`penalty_years` integer NOT NULL,
	`source` text NOT NULL,
	`source_note` text
);
--> statement-breakpoint
CREATE TABLE `expense` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`cost` real NOT NULL,
	`date` text NOT NULL,
	`crop_id` integer,
	`location_id` integer,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `growing_location`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `family_rotation_bonus` (
	`predecessor_family` text NOT NULL,
	`successor_family` text NOT NULL,
	`bonus_score` integer NOT NULL,
	`source` text NOT NULL,
	PRIMARY KEY(`predecessor_family`, `successor_family`)
);
--> statement-breakpoint
CREATE TABLE `garden` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text DEFAULT 'Min trädgård' NOT NULL,
	`width_cm` integer NOT NULL,
	`height_cm` integer NOT NULL,
	`cell_size_cm` integer DEFAULT 10 NOT NULL,
	`layout` text DEFAULT '{"cells":{},"colors":{}}' NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garden_household_id_unique` ON `garden` (`household_id`);--> statement-breakpoint
CREATE TABLE `garden_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`title` text NOT NULL,
	`date` text NOT NULL,
	`completed_at` text,
	`recurring_days` integer,
	`status` text,
	`crop_id` integer,
	`suggestion_type` text,
	`event_type` text DEFAULT 'general' NOT NULL,
	`description` text,
	`recurrence_rule` text,
	`dismissed_at` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `garden_event_location` (
	`event_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `garden_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `growing_location`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garden_event_location_pk` ON `garden_event_location` (`event_id`,`location_id`);--> statement-breakpoint
CREATE TABLE `garden_event_planting` (
	`event_id` integer NOT NULL,
	`planting_id` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `garden_event`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`planting_id`) REFERENCES `planting`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `garden_event_planting_pk` ON `garden_event_planting` (`event_id`,`planting_id`);--> statement-breakpoint
CREATE TABLE `growing_location` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`area_m2` real NOT NULL,
	`description` text,
	`is_indoor` integer DEFAULT false NOT NULL,
	`frost_buffer_c` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `harvest_event` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`planting_id` integer NOT NULL,
	`quantity_kg` real NOT NULL,
	`harvested_date` text NOT NULL,
	`added_to_storage` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`planting_id`) REFERENCES `planting`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `household` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`persons` integer NOT NULL,
	`default_planting_unit` text DEFAULT 'area' NOT NULL,
	`growing_zone` integer,
	`invite_code` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_invite_code_unique` ON `household` (`invite_code`);--> statement-breakpoint
CREATE TABLE `household_crop_price` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`crop_id` integer NOT NULL,
	`price_per_kg` real NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `household_crop_price_unique` ON `household_crop_price` (`household_id`,`crop_id`);--> statement-breakpoint
CREATE TABLE `household_crop_wishlist` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`crop_id` integer NOT NULL,
	`kg_per_week` real,
	`kg_per_year` real,
	`created_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wishlist_household_crop_unique` ON `household_crop_wishlist` (`household_id`,`crop_id`);--> statement-breakpoint
CREATE TABLE `household_member` (
	`household_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`household_id`, `user_id`),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `image` (
	`id` text PRIMARY KEY NOT NULL,
	`bytes` blob NOT NULL,
	`mime` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`taken_at` text,
	`uploaded_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE TABLE `location_image` (
	`location_id` integer NOT NULL,
	`image_id` text NOT NULL,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`location_id`, `image_id`),
	FOREIGN KEY (`location_id`) REFERENCES `growing_location`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `macro_preset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kcal_per_person` integer NOT NULL,
	`protein_g` real NOT NULL,
	`carbs_g` real NOT NULL,
	`fat_g` real NOT NULL,
	`activity_level` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `macro_preset_name_unique` ON `macro_preset` (`name`);--> statement-breakpoint
CREATE TABLE `macro_target` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`household_id` integer NOT NULL,
	`name` text NOT NULL,
	`daily_kcal` integer NOT NULL,
	`daily_protein_g` real NOT NULL,
	`daily_carbs_g` real NOT NULL,
	`daily_fat_g` real NOT NULL,
	`active` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planting` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crop_id` integer NOT NULL,
	`location_id` integer NOT NULL,
	`planted_date` text NOT NULL,
	`expected_harvest_date` text,
	`area_m2` real NOT NULL,
	`planting_mode` text DEFAULT 'area' NOT NULL,
	`quantity` integer,
	`seed_variety_id` integer,
	`yield_kg_per_plant_override` real,
	`status` text DEFAULT 'planted' NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `growing_location`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`seed_variety_id`) REFERENCES `seed_variety`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `planting_image` (
	`planting_id` integer NOT NULL,
	`image_id` text NOT NULL,
	`caption` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	PRIMARY KEY(`planting_id`, `image_id`),
	FOREIGN KEY (`planting_id`) REFERENCES `planting`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`image_id`) REFERENCES `image`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `seed_variety` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crop_id` integer NOT NULL,
	`name` text NOT NULL,
	`variety_type` text,
	`sow_month_start` integer,
	`sow_month_end` integer,
	`harvest_month_start` integer,
	`harvest_month_end` integer,
	`sun_requirement` text,
	`watering_frequency_days` integer,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `storage_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`crop_id` integer NOT NULL,
	`planting_id` integer,
	`household_id` integer NOT NULL,
	`quantity_kg` real NOT NULL,
	`harvested_date` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')),
	`updated_at` text DEFAULT (datetime('now')),
	FOREIGN KEY (`crop_id`) REFERENCES `crop`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`planting_id`) REFERENCES `planting`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`household_id`) REFERENCES `household`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sub` text NOT NULL,
	`email` text,
	`name` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_sub_unique` ON `users` (`sub`);