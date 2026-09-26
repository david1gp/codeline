PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text NOT NULL,
	`primary_agent_id` text NOT NULL,
	`project_path` text DEFAULT '~' NOT NULL,
	`parent_session_id` text,
	`title` text NOT NULL,
	`client_request_id` text NOT NULL,
	`agent_prompt` text,
	`execution_selection` text,
	`skill_selection` text DEFAULT '{"activeSkills":[],"excludedSkillNames":[],"missingFolderPaths":[],"missingSkillNames":[],"presetName":"default","userOverride":{"disabledSkills":[],"enabledSkills":[]},"version":1}' NOT NULL,
	`execution_manifest` text,
	`instruction_snapshot` text DEFAULT '{"snapshots":[],"version":1}' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`pinned` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`next_history_position` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `server`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "session_next_history_position_positive" CHECK("__new_session"."next_history_position" > 0),
	CONSTRAINT "session_next_history_position_safe" CHECK("__new_session"."next_history_position" <= 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "user_id", "server_id", "primary_agent_id", "project_path", "parent_session_id", "title", "client_request_id", "agent_prompt", "execution_selection", "skill_selection", "execution_manifest", "instruction_snapshot", "metadata", "pinned", "revision", "next_history_position", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "server_id", "primary_agent_id", "project_path", "parent_session_id", "title", "client_request_id", "agent_prompt", "execution_selection", "skill_selection", "execution_manifest", "instruction_snapshot", "metadata", "pinned", "revision", "next_history_position", "archived_at", "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_user_updated_idx` ON `session` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `session_user_archived_idx` ON `session` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `session_server_idx` ON `session` (`server_id`);--> statement-breakpoint
CREATE INDEX `session_parent_idx` ON `session` (`parent_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_client_request_unique` ON `session` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_id_unique` ON `session` (`user_id`,`id`);