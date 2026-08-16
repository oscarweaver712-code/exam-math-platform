ALTER TABLE `tasks` ADD `catalogNumber` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_catalog_number_unique` UNIQUE(`catalogNumber`);