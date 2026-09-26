PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`role` text NOT NULL,
	`sequence` integer NOT NULL,
	`content` text NOT NULL,
	`client_request_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`finalized_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "message_sequence_positive" CHECK("__new_message"."sequence" > 0),
	CONSTRAINT "message_role_allowed" CHECK("__new_message"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
INSERT INTO `__new_message`("id", "session_id", "agent_id", "role", "sequence", "content", "client_request_id", "metadata", "finalized_at", "created_at") SELECT "id", "session_id", "agent_id", "role", "sequence", "content", "client_request_id", "metadata", "finalized_at", "created_at" FROM `message`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `message_session_sequence_idx` ON `message` (`session_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `message_role_idx` ON `message` (`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_session_sequence_unique` ON `message` (`session_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_session_client_request_unique` ON `message` (`session_id`,`client_request_id`);