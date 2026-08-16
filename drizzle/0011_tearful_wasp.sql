ALTER TABLE `content_import_events` MODIFY COLUMN `eventType` enum('submitted','assigned','rights_cleared','rejected','converted') NOT NULL;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD `assignedEditorUserId` int;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD `assignedByUserId` int;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD `assignedAt` bigint;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_assignedEditorUserId_users_id_fk` FOREIGN KEY (`assignedEditorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_assignedByUserId_users_id_fk` FOREIGN KEY (`assignedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_import_cases_assignment_idx` ON `content_import_cases` (`examTrackId`,`status`,`assignedEditorUserId`,`createdAt`);