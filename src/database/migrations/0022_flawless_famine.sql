CREATE TABLE IF NOT EXISTS `e2e_fixture_diagnostic` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`entry` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `e2e_fixture_run`(`run_id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `e2e_fixture_diagnostic_run_id_idx` ON `e2e_fixture_diagnostic` (`run_id`,`id`);