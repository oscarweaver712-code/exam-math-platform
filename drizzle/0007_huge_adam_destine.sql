CREATE TABLE `task_editorial_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`editorUserId` int NOT NULL,
	`eventType` enum('created','updated','published','archived','restored','soft_deleted','source_updated','media_added','media_removed') NOT NULL,
	`note` varchar(500),
	`snapshot` json,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `task_editorial_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `sourceTitle` varchar(255);--> statement-breakpoint
ALTER TABLE `tasks` ADD `sourceAccessedAt` bigint;--> statement-breakpoint
ALTER TABLE `tasks` ADD `archivedAt` bigint;--> statement-breakpoint
ALTER TABLE `tasks` ADD `archivedReason` varchar(500);--> statement-breakpoint
ALTER TABLE `tasks` ADD `deletedAt` bigint;--> statement-breakpoint
ALTER TABLE `tasks` ADD `deletedReason` varchar(500);--> statement-breakpoint
ALTER TABLE `task_editorial_events` ADD CONSTRAINT `task_editorial_events_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_editorial_events` ADD CONSTRAINT `task_editorial_events_editorUserId_users_id_fk` FOREIGN KEY (`editorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_editorial_events_task_created_idx` ON `task_editorial_events` (`taskId`,`createdAt`);