CREATE TABLE `editorial_access_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`role` enum('owner','admin','editor') NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`grantedByUserId` int,
	`revokedByUserId` int,
	`revokedAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `editorial_access_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `editorial_access_roles_user_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `exam_task_types` ADD `requiresVisual` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `internalId` varchar(64);--> statement-breakpoint
ALTER TABLE `tasks` ADD `sourceExamYear` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_internal_id_unique` UNIQUE(`internalId`);--> statement-breakpoint
ALTER TABLE `editorial_access_roles` ADD CONSTRAINT `editorial_access_roles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_access_roles` ADD CONSTRAINT `editorial_access_roles_grantedByUserId_users_id_fk` FOREIGN KEY (`grantedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `editorial_access_roles` ADD CONSTRAINT `editorial_access_roles_revokedByUserId_users_id_fk` FOREIGN KEY (`revokedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `editorial_access_roles_active_idx` ON `editorial_access_roles` (`isActive`,`role`);