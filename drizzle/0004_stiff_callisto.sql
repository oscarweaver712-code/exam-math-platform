ALTER TABLE `theory_units` ADD `sourceKind` enum('author','licensed','external_reference') DEFAULT 'author' NOT NULL;--> statement-breakpoint
ALTER TABLE `theory_units` ADD `sourceTitle` varchar(255);--> statement-breakpoint
ALTER TABLE `theory_units` ADD `sourceUrl` varchar(1024);--> statement-breakpoint
ALTER TABLE `theory_units` ADD `contentVersion` int DEFAULT 1 NOT NULL;