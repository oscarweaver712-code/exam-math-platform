CREATE TABLE `task_additional_materials` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`title` varchar(180) NOT NULL,
	`bodyMarkdown` text NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `task_additional_materials_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `task_visuals` MODIFY COLUMN `placement` enum('statement','supplement','solution') NOT NULL DEFAULT 'statement';--> statement-breakpoint
ALTER TABLE `task_additional_materials` ADD CONSTRAINT `task_additional_materials_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `task_additional_materials_task_order_idx` ON `task_additional_materials` (`taskId`,`sortOrder`);