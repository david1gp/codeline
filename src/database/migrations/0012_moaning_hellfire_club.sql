CREATE TABLE `session_view` (
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`acknowledged_finished_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`user_id`, `session_id`),
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`) REFERENCES `session`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_view_session_idx` ON `session_view` (`session_id`);--> statement-breakpoint
CREATE TABLE `project_folder` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`bootstrap_key` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "project_folder_bootstrap_key_allowed" CHECK("project_folder"."bootstrap_key" IS NULL OR "project_folder"."bootstrap_key" IN ('adaptive', 'leo', 'personal'))
);
--> statement-breakpoint
CREATE INDEX `project_folder_user_updated_idx` ON `project_folder` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_folder_user_name_unique` ON `project_folder` (`user_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_folder_user_bootstrap_unique` ON `project_folder` (`user_id`,`bootstrap_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_folder_user_id_unique` ON `project_folder` (`user_id`,`id`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_project` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`path` text NOT NULL,
	`display_name` text,
	`parent_folder_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_folder_id`) REFERENCES `project_folder`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`user_id`,`parent_folder_id`) REFERENCES `project_folder`(`user_id`,`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_project`("id", "user_id", "path", "display_name", "parent_folder_id", "created_at", "updated_at") SELECT "id", "user_id", "path", "display_name", NULL, "created_at", "updated_at" FROM `project`;--> statement-breakpoint
DROP TABLE `project`;--> statement-breakpoint
ALTER TABLE `__new_project` RENAME TO `project`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `project_user_updated_idx` ON `project` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `project_user_parent_folder_idx` ON `project` (`user_id`,`parent_folder_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_user_path_unique` ON `project` (`user_id`,`path`);
