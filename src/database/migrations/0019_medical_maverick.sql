CREATE TABLE IF NOT EXISTS `e2e_sample_sessions` (
	`run_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`organization_id` text NOT NULL,
	`mapping` text NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `e2e_fixture_run`(`run_id`) ON UPDATE no action ON DELETE restrict
);
