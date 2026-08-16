DROP INDEX `tasks_public_catalog_idx` ON `tasks`;--> statement-breakpoint
ALTER TABLE `tasks` MODIFY COLUMN `internalId` varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD `sourceExamYear` int NOT NULL;--> statement-breakpoint
CREATE INDEX `tasks_source_year_idx` ON `tasks` (`sourceExamYear`,`sourceKind`);--> statement-breakpoint
CREATE INDEX `tasks_public_catalog_idx` ON `tasks` (`examTrackId`,`status`,`examTaskTypeId`);--> statement-breakpoint
ALTER TABLE `tasks` DROP COLUMN `difficulty`;