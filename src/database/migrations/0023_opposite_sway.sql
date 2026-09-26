CREATE TABLE `e2e_command_project` (
	`run_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`path` text NOT NULL,
	`manifest` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `e2e_fixture_run`(`run_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `e2e_command_project_path_unique` ON `e2e_command_project` (`path`);