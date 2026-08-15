CREATE TABLE `user_theory_progress` (
	`userId` int NOT NULL,
	`theoryUnitId` int NOT NULL,
	`completedAt` bigint NOT NULL,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `user_theory_progress_userId_theoryUnitId_pk` PRIMARY KEY(`userId`,`theoryUnitId`)
);
--> statement-breakpoint
ALTER TABLE `user_theory_progress` ADD CONSTRAINT `user_theory_progress_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_theory_progress` ADD CONSTRAINT `user_theory_progress_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `user_theory_progress_theory_idx` ON `user_theory_progress` (`theoryUnitId`);