ALTER TABLE `lists` ADD `archived_at` integer;--> statement-breakpoint
-- Lists that already have only bought items left: archive them (trip history keeps showing them).
-- Lists without any items may be newly made, so they stay; lists in an active trip are left to checkout.
UPDATE `lists` SET `archived_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM `items` WHERE `items`.`list_id` = `lists`.`id` AND `items`.`status` <> 'bought')
  AND EXISTS (SELECT 1 FROM `items` WHERE `items`.`list_id` = `lists`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `trip_lists` JOIN `trips` ON `trips`.`id` = `trip_lists`.`trip_id` WHERE `trip_lists`.`list_id` = `lists`.`id` AND `trips`.`status` = 'active');
