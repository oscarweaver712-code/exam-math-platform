CREATE TABLE `task_hints` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`title` varchar(160) NOT NULL,
	`bodyMarkdown` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `task_hints_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_solution_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`bodyMarkdown` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `task_solution_steps_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `theory_unit_versions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`theoryUnitId` int NOT NULL,
	`version` int NOT NULL,
	`snapshot` json NOT NULL,
	`changeNote` varchar(500),
	`createdByUserId` int,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `theory_unit_versions_id` PRIMARY KEY(`id`),
	CONSTRAINT `theory_versions_unit_version_unique` UNIQUE(`theoryUnitId`,`version`)
);
--> statement-breakpoint
CREATE TABLE `theory_visuals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`theoryUnitId` int NOT NULL,
	`kind` enum('inline_svg','image_asset') NOT NULL,
	`placement` enum('lead','body') NOT NULL DEFAULT 'body',
	`diagramKey` varchar(120),
	`assetKey` varchar(2048),
	`assetUrl` varchar(2048),
	`altText` text NOT NULL,
	`caption` varchar(500),
	`sourceKind` enum('author','external') NOT NULL DEFAULT 'author',
	`sourceUrl` varchar(2048),
	`reviewStatus` enum('draft','review','approved','rejected') NOT NULL DEFAULT 'draft',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `theory_visuals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_hints` ADD CONSTRAINT `task_hints_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_solution_steps` ADD CONSTRAINT `task_solution_steps_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_unit_versions` ADD CONSTRAINT `theory_unit_versions_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_unit_versions` ADD CONSTRAINT `theory_unit_versions_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_visuals` ADD CONSTRAINT `theory_visuals_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_hints_task_order_idx` ON `task_hints` (`taskId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `task_solution_steps_task_order_idx` ON `task_solution_steps` (`taskId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `theory_versions_unit_created_idx` ON `theory_unit_versions` (`theoryUnitId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `theory_visuals_unit_placement_idx` ON `theory_visuals` (`theoryUnitId`,`placement`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `theory_visuals_review_idx` ON `theory_visuals` (`reviewStatus`);