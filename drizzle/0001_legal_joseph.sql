CREATE TABLE IF NOT EXISTS `curriculum_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`parentId` int,
	`slug` varchar(120) NOT NULL,
	`title` varchar(180) NOT NULL,
	`description` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `curriculum_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `curriculum_units_subject_slug_unique` UNIQUE(`subjectId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_task_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`examTrackId` int NOT NULL,
	`kimNumber` varchar(32) NOT NULL,
	`title` varchar(180) NOT NULL,
	`part` enum('part1','part2') NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `exam_task_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_task_types_track_kim_unique` UNIQUE(`examTrackId`,`kimNumber`)
);
--> statement-breakpoint
CREATE TABLE `exam_track_curriculum_units` (
	`examTrackId` int NOT NULL,
	`curriculumUnitId` int NOT NULL,
	CONSTRAINT `exam_track_curriculum_units_examTrackId_curriculumUnitId_pk` PRIMARY KEY(`examTrackId`,`curriculumUnitId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_tracks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`slug` varchar(96) NOT NULL,
	`title` varchar(160) NOT NULL,
	`examKind` enum('oge','ege','other') NOT NULL,
	`description` text,
	`isPrototype` boolean NOT NULL DEFAULT false,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `exam_tracks_id` PRIMARY KEY(`id`),
	CONSTRAINT `exam_tracks_subject_slug_unique` UNIQUE(`subjectId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `homework_assignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tutorUserId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`subjectId` int NOT NULL,
	`title` varchar(220) NOT NULL,
	`note` text,
	`dueAt` bigint,
	`status` enum('draft','assigned','closed','archived') NOT NULL DEFAULT 'draft',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `homework_assignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `homework_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`homeworkAssignmentId` int NOT NULL,
	`taskId` int NOT NULL,
	`taskContentVersion` int NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `homework_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `homework_items_assignment_task_unique` UNIQUE(`homeworkAssignmentId`,`taskId`)
);
--> statement-breakpoint
CREATE TABLE `platform_profiles` (
	`userId` int NOT NULL,
	`learningRole` enum('unselected','student','tutor') NOT NULL DEFAULT 'unselected',
	`displayName` varchar(160),
	`roleChosenAt` bigint,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `platform_profiles_userId` PRIMARY KEY(`userId`)
);
--> statement-breakpoint
CREATE TABLE `saved_tasks` (
	`userId` int NOT NULL,
	`taskId` int NOT NULL,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `saved_tasks_userId_taskId_pk` PRIMARY KEY(`userId`,`taskId`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `subjects` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(96) NOT NULL,
	`title` varchar(160) NOT NULL,
	`shortTitle` varchar(80) NOT NULL,
	`description` text,
	`isActive` boolean NOT NULL DEFAULT false,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `subjects_id` PRIMARY KEY(`id`),
	CONSTRAINT `subjects_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `task_attempts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`taskId` int NOT NULL,
	`homeworkItemId` int,
	`rawAnswer` text NOT NULL,
	`normalizedAnswer` varchar(1024),
	`checkStatus` enum('correct','incorrect','awaiting_review','reviewed') NOT NULL,
	`isCorrect` boolean,
	`feedback` text,
	`reviewedByUserId` int,
	`submittedAt` bigint NOT NULL,
	`reviewedAt` bigint,
	CONSTRAINT `task_attempts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `task_curriculum_units` (
	`taskId` int NOT NULL,
	`curriculumUnitId` int NOT NULL,
	CONSTRAINT `task_curriculum_units_taskId_curriculumUnitId_pk` PRIMARY KEY(`taskId`,`curriculumUnitId`)
);
--> statement-breakpoint
CREATE TABLE `task_theory_units` (
	`taskId` int NOT NULL,
	`theoryUnitId` int NOT NULL,
	CONSTRAINT `task_theory_units_taskId_theoryUnitId_pk` PRIMARY KEY(`taskId`,`theoryUnitId`)
);
--> statement-breakpoint
CREATE TABLE `task_type_curriculum_units` (
	`examTaskTypeId` int NOT NULL,
	`curriculumUnitId` int NOT NULL,
	CONSTRAINT `task_type_curriculum_units_examTaskTypeId_curriculumUnitId_pk` PRIMARY KEY(`examTaskTypeId`,`curriculumUnitId`)
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`examTrackId` int NOT NULL,
	`examTaskTypeId` int NOT NULL,
	`slug` varchar(160) NOT NULL,
	`title` varchar(220) NOT NULL,
	`statementMarkdown` text NOT NULL,
	`answerChoices` json,
	`answerKind` enum('short_integer','short_decimal','short_text','manual') NOT NULL,
	`correctAnswer` varchar(1024),
	`acceptableAnswers` json,
	`solutionMarkdown` text NOT NULL,
	`difficulty` enum('basic','standard','advanced') NOT NULL DEFAULT 'standard',
	`sourceKind` enum('author','fipi','partner') NOT NULL DEFAULT 'author',
	`sourceUrl` varchar(1024),
	`sourceRecordId` varchar(255),
	`contentVersion` int NOT NULL DEFAULT 1,
	`status` enum('draft','review','published','archived') NOT NULL DEFAULT 'draft',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	`publishedAt` bigint,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`),
	CONSTRAINT `tasks_track_slug_unique` UNIQUE(`examTrackId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `theory_curriculum_units` (
	`theoryUnitId` int NOT NULL,
	`curriculumUnitId` int NOT NULL,
	CONSTRAINT `theory_curriculum_units_theoryUnitId_curriculumUnitId_pk` PRIMARY KEY(`theoryUnitId`,`curriculumUnitId`)
);
--> statement-breakpoint
CREATE TABLE `theory_exam_tracks` (
	`theoryUnitId` int NOT NULL,
	`examTrackId` int NOT NULL,
	CONSTRAINT `theory_exam_tracks_theoryUnitId_examTrackId_pk` PRIMARY KEY(`theoryUnitId`,`examTrackId`)
);
--> statement-breakpoint
CREATE TABLE `theory_task_types` (
	`theoryUnitId` int NOT NULL,
	`examTaskTypeId` int NOT NULL,
	CONSTRAINT `theory_task_types_theoryUnitId_examTaskTypeId_pk` PRIMARY KEY(`theoryUnitId`,`examTaskTypeId`)
);
--> statement-breakpoint
CREATE TABLE `theory_units` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subjectId` int NOT NULL,
	`slug` varchar(140) NOT NULL,
	`title` varchar(220) NOT NULL,
	`lead` text NOT NULL,
	`bodyMarkdown` text NOT NULL,
	`status` enum('draft','review','published','archived') NOT NULL DEFAULT 'draft',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	`publishedAt` bigint,
	CONSTRAINT `theory_units_id` PRIMARY KEY(`id`),
	CONSTRAINT `theory_units_subject_slug_unique` UNIQUE(`subjectId`,`slug`)
);
--> statement-breakpoint
CREATE TABLE `tutor_student_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tutorUserId` int NOT NULL,
	`studentUserId` int NOT NULL,
	`subjectId` int NOT NULL,
	`inviteCode` varchar(64) NOT NULL,
	`status` enum('pending','active','archived') NOT NULL DEFAULT 'pending',
	`createdAt` bigint NOT NULL,
	`updatedAt` bigint NOT NULL,
	CONSTRAINT `tutor_student_links_id` PRIMARY KEY(`id`),
	CONSTRAINT `tutor_student_invite_code_unique` UNIQUE(`inviteCode`),
	CONSTRAINT `tutor_student_subject_unique` UNIQUE(`tutorUserId`,`studentUserId`,`subjectId`)
);
--> statement-breakpoint
CREATE TABLE `tutor_subject_specialties` (
	`tutorUserId` int NOT NULL,
	`subjectId` int NOT NULL,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` bigint NOT NULL,
	CONSTRAINT `tutor_subject_specialties_tutorUserId_subjectId_pk` PRIMARY KEY(`tutorUserId`,`subjectId`)
);
--> statement-breakpoint
ALTER TABLE `curriculum_units` ADD CONSTRAINT `curriculum_units_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_task_types` ADD CONSTRAINT `exam_task_types_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_track_curriculum_units` ADD CONSTRAINT `exam_track_curriculum_units_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_track_curriculum_units` ADD CONSTRAINT `etcu_curriculum_fk` FOREIGN KEY (`curriculumUnitId`) REFERENCES `curriculum_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exam_tracks` ADD CONSTRAINT `exam_tracks_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework_assignments` ADD CONSTRAINT `homework_assignments_tutorUserId_users_id_fk` FOREIGN KEY (`tutorUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework_assignments` ADD CONSTRAINT `homework_assignments_studentUserId_users_id_fk` FOREIGN KEY (`studentUserId`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework_assignments` ADD CONSTRAINT `homework_assignments_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework_items` ADD CONSTRAINT `homework_items_homeworkAssignmentId_homework_assignments_id_fk` FOREIGN KEY (`homeworkAssignmentId`) REFERENCES `homework_assignments`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `homework_items` ADD CONSTRAINT `homework_items_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `platform_profiles` ADD CONSTRAINT `platform_profiles_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_tasks` ADD CONSTRAINT `saved_tasks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `saved_tasks` ADD CONSTRAINT `saved_tasks_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_attempts` ADD CONSTRAINT `task_attempts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_attempts` ADD CONSTRAINT `task_attempts_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_attempts` ADD CONSTRAINT `task_attempts_homeworkItemId_homework_items_id_fk` FOREIGN KEY (`homeworkItemId`) REFERENCES `homework_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_attempts` ADD CONSTRAINT `task_attempts_reviewedByUserId_users_id_fk` FOREIGN KEY (`reviewedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_curriculum_units` ADD CONSTRAINT `task_curriculum_units_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_curriculum_units` ADD CONSTRAINT `tcu_curriculum_fk` FOREIGN KEY (`curriculumUnitId`) REFERENCES `curriculum_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_theory_units` ADD CONSTRAINT `task_theory_units_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_theory_units` ADD CONSTRAINT `task_theory_units_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_type_curriculum_units` ADD CONSTRAINT `task_type_curriculum_units_examTaskTypeId_exam_task_types_id_fk` FOREIGN KEY (`examTaskTypeId`) REFERENCES `exam_task_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_type_curriculum_units` ADD CONSTRAINT `ttcu_curriculum_fk` FOREIGN KEY (`curriculumUnitId`) REFERENCES `curriculum_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tasks` ADD CONSTRAINT `tasks_examTaskTypeId_exam_task_types_id_fk` FOREIGN KEY (`examTaskTypeId`) REFERENCES `exam_task_types`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_curriculum_units` ADD CONSTRAINT `theory_curriculum_units_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_curriculum_units` ADD CONSTRAINT `thcu_curriculum_fk` FOREIGN KEY (`curriculumUnitId`) REFERENCES `curriculum_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_exam_tracks` ADD CONSTRAINT `theory_exam_tracks_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_exam_tracks` ADD CONSTRAINT `theory_exam_tracks_examTrackId_exam_tracks_id_fk` FOREIGN KEY (`examTrackId`) REFERENCES `exam_tracks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_task_types` ADD CONSTRAINT `theory_task_types_theoryUnitId_theory_units_id_fk` FOREIGN KEY (`theoryUnitId`) REFERENCES `theory_units`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_task_types` ADD CONSTRAINT `theory_task_types_examTaskTypeId_exam_task_types_id_fk` FOREIGN KEY (`examTaskTypeId`) REFERENCES `exam_task_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `theory_units` ADD CONSTRAINT `theory_units_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tutor_student_links` ADD CONSTRAINT `tutor_student_links_tutorUserId_users_id_fk` FOREIGN KEY (`tutorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tutor_student_links` ADD CONSTRAINT `tutor_student_links_studentUserId_users_id_fk` FOREIGN KEY (`studentUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tutor_student_links` ADD CONSTRAINT `tutor_student_links_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tutor_subject_specialties` ADD CONSTRAINT `tutor_subject_specialties_tutorUserId_users_id_fk` FOREIGN KEY (`tutorUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `tutor_subject_specialties` ADD CONSTRAINT `tutor_subject_specialties_subjectId_subjects_id_fk` FOREIGN KEY (`subjectId`) REFERENCES `subjects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `curriculum_units_subject_parent_idx` ON `curriculum_units` (`subjectId`,`parentId`);--> statement-breakpoint
CREATE INDEX `exam_task_types_track_part_idx` ON `exam_task_types` (`examTrackId`,`part`);--> statement-breakpoint
CREATE INDEX `track_curriculum_unit_idx` ON `exam_track_curriculum_units` (`curriculumUnitId`);--> statement-breakpoint
CREATE INDEX `exam_tracks_subject_idx` ON `exam_tracks` (`subjectId`);--> statement-breakpoint
CREATE INDEX `homework_student_status_due_idx` ON `homework_assignments` (`studentUserId`,`status`,`dueAt`);--> statement-breakpoint
CREATE INDEX `homework_tutor_status_idx` ON `homework_assignments` (`tutorUserId`,`status`);--> statement-breakpoint
CREATE INDEX `homework_items_task_idx` ON `homework_items` (`taskId`);--> statement-breakpoint
CREATE INDEX `saved_tasks_task_idx` ON `saved_tasks` (`taskId`);--> statement-breakpoint
CREATE INDEX `task_attempts_user_task_submitted_idx` ON `task_attempts` (`userId`,`taskId`,`submittedAt`);--> statement-breakpoint
CREATE INDEX `task_attempts_homework_item_idx` ON `task_attempts` (`homeworkItemId`);--> statement-breakpoint
CREATE INDEX `task_curriculum_units_unit_idx` ON `task_curriculum_units` (`curriculumUnitId`);--> statement-breakpoint
CREATE INDEX `task_theory_units_theory_idx` ON `task_theory_units` (`theoryUnitId`);--> statement-breakpoint
CREATE INDEX `task_type_curriculum_unit_idx` ON `task_type_curriculum_units` (`curriculumUnitId`);--> statement-breakpoint
CREATE INDEX `tasks_public_catalog_idx` ON `tasks` (`examTrackId`,`status`,`difficulty`);--> statement-breakpoint
CREATE INDEX `tasks_task_type_idx` ON `tasks` (`examTaskTypeId`);--> statement-breakpoint
CREATE INDEX `theory_curriculum_units_unit_idx` ON `theory_curriculum_units` (`curriculumUnitId`);--> statement-breakpoint
CREATE INDEX `theory_exam_tracks_track_idx` ON `theory_exam_tracks` (`examTrackId`);--> statement-breakpoint
CREATE INDEX `theory_task_types_task_type_idx` ON `theory_task_types` (`examTaskTypeId`);--> statement-breakpoint
CREATE INDEX `theory_units_subject_status_idx` ON `theory_units` (`subjectId`,`status`);--> statement-breakpoint
CREATE INDEX `tutor_student_student_subject_idx` ON `tutor_student_links` (`studentUserId`,`subjectId`);--> statement-breakpoint
CREATE INDEX `tutor_specialties_subject_idx` ON `tutor_subject_specialties` (`subjectId`);
