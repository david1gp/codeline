CREATE TABLE IF NOT EXISTS `e2e_fixture_run` (
	`run_id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`issuer` text NOT NULL,
	`organization_id` text NOT NULL,
	`organization_external_id` text NOT NULL,
	`first_user_id` text NOT NULL,
	`second_user_id` text NOT NULL
);
