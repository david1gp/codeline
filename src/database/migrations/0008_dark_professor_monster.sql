CREATE TABLE `project_registry_session_path_backfill` (
	`id` text PRIMARY KEY NOT NULL,
	`completed_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
