CREATE TABLE `task_visuals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`kind` enum('inline_svg','image_asset') NOT NULL,
	`placement` enum('statement','solution') NOT NULL DEFAULT 'statement',
	`diagramKey` varchar(120),
	`assetUrl` varchar(2048),
	`altText` text NOT NULL,
	`caption` varchar(500),
	`sourceKind` enum('author','external') NOT NULL DEFAULT 'author',
	`sourceUrl` varchar(2048),
	`reviewStatus` enum('draft','review','approved','rejected') NOT NULL DEFAULT 'draft',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `task_visuals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_visuals` ADD CONSTRAINT `task_visuals_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_visuals_task_placement_idx` ON `task_visuals` (`taskId`,`placement`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `task_visuals_review_idx` ON `task_visuals` (`reviewStatus`);