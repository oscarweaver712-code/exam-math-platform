CREATE TABLE `content_import_cases` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`examTrackId` int NOT NULL,
	`examTaskTypeId` int NOT NULL,
	`sourceKind` enum('fipi','partner') NOT NULL,
	`sourceTitle` varchar(255) NOT NULL,
	`sourceUrl` varchar(1024) NOT NULL,
	`sourceRecordId` varchar(255),
	`sourceAccessedAt` bigint NOT NULL,
	`proposedTitle` varchar(220) NOT NULL,
	`sourceSummary` text NOT NULL,
	`plannedAdaptation` text NOT NULL,
	`rightsBasis` varchar(500),
	`rightsEvidenceUrl` varchar(1024),
	`status` enum('rights_review','cleared','rejected','converted') NOT NULL DEFAULT 'rights_review',
	`legalReviewNote` text,
	`submittedByUserId` int NOT NULL,
	`reviewedByUserId` int,
	`reviewedAt` bigint,
	`convertedTaskId` int,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `content_import_cases_id` PRIMARY KEY(`id`),
	CONSTRAINT `content_import_cases_converted_task_unique` UNIQUE(`convertedTaskId`)
);
--> statement-breakpoint
CREATE TABLE `content_import_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importCaseId` int NOT NULL,
	`actorUserId` int NOT NULL,
	`eventType` enum('submitted','rights_cleared','rejected','converted') NOT NULL,
	`note` text,
	`snapshot` json,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `content_import_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `exam_variant_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examVariantId` int NOT NULL,
	`taskId` int NOT NULL,
	`taskContentVersion` int NOT NULL,
	`sortOrder` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `exam_variant_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_variant_items_variant_task_unique` UNIQUE(`examVariantId`,`taskId`),
	CONSTRAINT `exam_variant_items_variant_order_unique` UNIQUE(`examVariantId`,`sortOrder`)
);
--> statement-breakpoint
CREATE TABLE `exam_variants` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examTrackId` int NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(220) NOT NULL,
	`origin` enum('monthly','manual') NOT NULL DEFAULT 'monthly',
	`monthKey` varchar(7),
	`status` enum('draft','published','archived') NOT NULL DEFAULT 'draft',
	`generatedAt` bigint NOT NULL,
	`publishedAt` bigint,
	`createdByUserId` int,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `exam_variants_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_variants_track_slug_unique` UNIQUE(`examTrackId`,`slug`),
	CONSTRAINT `exam_variants_track_month_unique` UNIQUE(`examTrackId`,`monthKey`)
);
--> statement-breakpoint
CREATE TABLE `variant_generation_schedules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examTrackId` int NOT NULL,
	`scheduleCronTaskUid` varchar(65),
	`cronExpression` varchar(64) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`lastGeneratedMonthKey` varchar(7),
	`lastGeneratedAt` bigint,
	`lastError` text,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `variant_generation_schedules_id` PRIMARY KEY(`id`),
	CONSTRAINT `variant_generation_schedules_track_unique` UNIQUE(`examTrackId`)
);
--> statement-breakpoint
ALTER TABLE `task_editorial_events` MODIFY COLUMN `eventType` enum('created','updated','published','archived','restored','soft_deleted','source_updated','media_added','media_approved','media_rejected','media_removed') NOT NULL;--> statement-breakpoint
ALTER TABLE `task_visuals` ADD `reviewedByUserId` int;--> statement-breakpoint
ALTER TABLE `task_visuals` ADD `reviewedAt` bigint;--> statement-breakpoint
ALTER TABLE `task_visuals` ADD `reviewNote` text;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_examTaskTypeId_exam_task_types_id_fk` FOREIGN KEY (`examTaskTypeId`) REFERENCES `exam_task_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_submittedByUserId_users_id_fk` FOREIGN KEY (`submittedByUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_cases` ADD CONSTRAINT `content_import_cases_convertedTaskId_tasks_id_fk` FOREIGN KEY (`convertedTaskId`) REFERENCES `tasks`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_events` ADD CONSTRAINT `content_import_events_importCaseId_content_import_cases_id_fk` FOREIGN KEY (`importCaseId`) REFERENCES `content_import_cases`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `content_import_events` ADD CONSTRAINT `content_import_events_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_variant_items` ADD CONSTRAINT `exam_variant_items_examVariantId_exam_variants_id_fk` FOREIGN KEY (`examVariantId`) REFERENCES `exam_variants`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_variant_items` ADD CONSTRAINT `exam_variant_items_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_variants` ADD CONSTRAINT `exam_variants_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_variants` ADD CONSTRAINT `exam_variants_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `variant_generation_schedules` ADD CONSTRAINT `variant_generation_schedules_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `content_import_cases_track_status_idx` ON `content_import_cases` (`examTrackId`,`status`,`createdAt`);--> statement-breakpoint
CREATE INDEX `content_import_cases_type_idx` ON `content_import_cases` (`examTaskTypeId`);--> statement-breakpoint
CREATE INDEX `content_import_events_case_created_idx` ON `content_import_events` (`importCaseId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `exam_variant_items_task_idx` ON `exam_variant_items` (`taskId`);--> statement-breakpoint
CREATE INDEX `exam_variants_track_status_published_idx` ON `exam_variants` (`examTrackId`,`status`,`publishedAt`);--> statement-breakpoint
ALTER TABLE `task_visuals` ADD CONSTRAINT `task_visuals_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;