CREATE TABLE `learning_promos` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examTrackId` int,
	`placement` enum('theory','bank','homework') NOT NULL DEFAULT 'theory',
	`eyebrow` varchar(140) NOT NULL,
	`title` varchar(220) NOT NULL,
	`description` text NOT NULL,
	`ctaLabel` varchar(120) NOT NULL,
	`ctaUrl` varchar(1024) NOT NULL,
	`isActive` boolean NOT NULL DEFAULT false,
	`startsAt` bigint,
	`endsAt` bigint,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `learning_promos_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `learning_promos` ADD CONSTRAINT `learning_promos_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `learning_promos_track_placement_active_idx` ON `learning_promos` (`examTrackId`,`placement`,`isActive`);