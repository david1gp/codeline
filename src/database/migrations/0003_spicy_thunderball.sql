CREATE TABLE `session_execution_selection_default` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`project_path` text NOT NULL,
	`execution_selection` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `session_execution_selection_default_user_project_idx` ON `session_execution_selection_default` (`user_id`,`project_path`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_execution_selection_default_user_project_unique` ON `session_execution_selection_default` (`user_id`,`project_path`);