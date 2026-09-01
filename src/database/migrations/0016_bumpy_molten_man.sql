CREATE TABLE `session_history_entry` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`source_detail_id` text DEFAULT '' NOT NULL,
	`position` integer NOT NULL,
	`change_position` integer NOT NULL,
	`payload` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`) REFERENCES `session`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_history_entry_kind_allowed" CHECK("session_history_entry"."kind" IN ('message', 'run', 'tool')),
	CONSTRAINT "session_history_entry_source_type_allowed" CHECK("session_history_entry"."source_type" IN ('message', 'run', 'tool')),
	CONSTRAINT "session_history_entry_source_id_bounded" CHECK(length("session_history_entry"."source_id") BETWEEN 1 AND 256),
	CONSTRAINT "session_history_entry_source_detail_id_bounded" CHECK("session_history_entry"."source_detail_id" = '' OR length("session_history_entry"."source_detail_id") BETWEEN 1 AND 256),
	CONSTRAINT "session_history_entry_position_positive" CHECK("session_history_entry"."position" > 0),
	CONSTRAINT "session_history_entry_position_safe" CHECK("session_history_entry"."position" <= 9007199254740991),
	CONSTRAINT "session_history_entry_change_position_positive" CHECK("session_history_entry"."change_position" > 0),
	CONSTRAINT "session_history_entry_change_position_safe" CHECK("session_history_entry"."change_position" <= 9007199254740991),
	CONSTRAINT "session_history_entry_change_position_ordered" CHECK("session_history_entry"."change_position" >= "session_history_entry"."position")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_history_entry_session_source_unique` ON `session_history_entry` (`session_id`,`source_type`,`source_id`,`source_detail_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_history_entry_session_position_unique` ON `session_history_entry` (`session_id`,`position`);--> statement-breakpoint
CREATE INDEX `session_history_entry_session_change_position_idx` ON `session_history_entry` (`session_id`,`change_position`);--> statement-breakpoint
CREATE TABLE `run_active_state` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`status` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`partial_text` text DEFAULT '' NOT NULL,
	`failure` text,
	`change_position` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_active_state_status_allowed" CHECK("run_active_state"."status" IN ('accepted', 'running')),
	CONSTRAINT "run_active_state_last_sequence_non_negative" CHECK("run_active_state"."last_sequence" >= 0),
	CONSTRAINT "run_active_state_last_sequence_safe" CHECK("run_active_state"."last_sequence" <= 9007199254740991),
	CONSTRAINT "run_active_state_partial_text_bounded" CHECK(length("run_active_state"."partial_text") <= 16384),
	CONSTRAINT "run_active_state_change_position_positive" CHECK("run_active_state"."change_position" > 0),
	CONSTRAINT "run_active_state_change_position_safe" CHECK("run_active_state"."change_position" <= 9007199254740991)
);
--> statement-breakpoint
CREATE INDEX `run_active_state_session_change_position_idx` ON `run_active_state` (`session_id`,`change_position`,`run_id`);--> statement-breakpoint
CREATE INDEX `run_active_state_user_session_idx` ON `run_active_state` (`user_id`,`session_id`,`run_id`);--> statement-breakpoint
CREATE TABLE `run_finalized_detail` (
	`run_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`transcript` text NOT NULL,
	`tools` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_finalized_detail_transcript_json" CHECK(json_valid("run_finalized_detail"."transcript")),
	CONSTRAINT "run_finalized_detail_tools_json" CHECK(json_valid("run_finalized_detail"."tools"))
);
--> statement-breakpoint
CREATE INDEX `run_finalized_detail_session_idx` ON `run_finalized_detail` (`user_id`,`session_id`,`run_id`);--> statement-breakpoint
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
	FOREIGN KEY (`primary_agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`server_id`,`primary_agent_id`) REFERENCES `agent`(`server_id`,`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "session_next_history_position_positive" CHECK("__new_session"."next_history_position" > 0),
	CONSTRAINT "session_next_history_position_safe" CHECK("__new_session"."next_history_position" <= 9007199254740991)
);
--> statement-breakpoint
INSERT INTO `__new_session`("id", "user_id", "server_id", "primary_agent_id", "project_path", "parent_session_id", "title", "client_request_id", "agent_prompt", "execution_selection", "skill_selection", "execution_manifest", "instruction_snapshot", "metadata", "pinned", "revision", "archived_at", "created_at", "updated_at") SELECT "id", "user_id", "server_id", "primary_agent_id", "project_path", "parent_session_id", "title", "client_request_id", "agent_prompt", "execution_selection", "skill_selection", "execution_manifest", "instruction_snapshot", "metadata", "pinned", "revision", "archived_at", "created_at", "updated_at" FROM `session`;--> statement-breakpoint
DROP TABLE `session`;--> statement-breakpoint
ALTER TABLE `__new_session` RENAME TO `session`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `session_user_updated_idx` ON `session` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `session_user_archived_idx` ON `session` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `session_server_idx` ON `session` (`server_id`);--> statement-breakpoint
CREATE INDEX `session_parent_idx` ON `session` (`parent_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_client_request_unique` ON `session` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_id_unique` ON `session` (`user_id`,`id`);
