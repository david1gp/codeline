CREATE TABLE `mutation_idempotency` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`operation` text NOT NULL,
	`resource_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_hash` text NOT NULL,
	`status` integer NOT NULL,
	`response_body` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mutation_idempotency_user_resource_idx` ON `mutation_idempotency` (`user_id`,`resource_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mutation_idempotency_user_operation_key_unique` ON `mutation_idempotency` (`user_id`,`operation`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `identity_user` (
	`id` text PRIMARY KEY NOT NULL,
	`display_name` text NOT NULL,
	`email` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `user_display_name_idx` ON `identity_user` (`display_name`);--> statement-breakpoint
CREATE TABLE `identity_external_identity` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `external_identity_user_idx` ON `identity_external_identity` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_identity_issuer_subject_unique` ON `identity_external_identity` (`issuer`,`subject`);--> statement-breakpoint
CREATE UNIQUE INDEX `external_identity_user_issuer_unique` ON `identity_external_identity` (`user_id`,`issuer`);--> statement-breakpoint
CREATE TABLE `identity_session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`last_used_at` integer,
	`revoked_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `identity_session_user_expires_idx` ON `identity_session` (`user_id`,`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `identity_session_token_hash_unique` ON `identity_session` (`token_hash`);--> statement-breakpoint
CREATE TABLE `identity_oidc_login_transaction` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`state_hash` text NOT NULL,
	`browser_binding_hash` text DEFAULT '' NOT NULL,
	`nonce_hash` text NOT NULL,
	`code_verifier` text NOT NULL,
	`redirect_uri` text NOT NULL,
	`return_to` text DEFAULT '/' NOT NULL,
	`expires_at` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `oidc_login_transaction_expires_idx` ON `identity_oidc_login_transaction` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `oidc_login_transaction_state_hash_unique` ON `identity_oidc_login_transaction` (`state_hash`);--> statement-breakpoint
CREATE TABLE `identity_organization_member` (
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`issuer` text NOT NULL,
	`subject` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	PRIMARY KEY(`organization_id`, `user_id`),
	FOREIGN KEY (`organization_id`) REFERENCES `identity_organization`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `organization_member_user_idx` ON `identity_organization_member` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `organization_member_identity_unique` ON `identity_organization_member` (`organization_id`,`issuer`,`subject`);--> statement-breakpoint
CREATE TABLE `identity_organization` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `organization_external_id_unique` ON `identity_organization` (`external_id`);--> statement-breakpoint
CREATE TABLE `server` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`endpoint` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `identity_organization`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `server_organization_idx` ON `server` (`organization_id`);--> statement-breakpoint
CREATE INDEX `server_name_idx` ON `server` (`name`);--> statement-breakpoint
CREATE INDEX `server_metadata_gin_idx` ON `server` (`metadata`);--> statement-breakpoint
CREATE UNIQUE INDEX `server_organization_name_unique` ON `server` (`organization_id`,`name`);--> statement-breakpoint
CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`server_id` text NOT NULL,
	`parent_agent_id` text,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`configuration` text DEFAULT '{}' NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`server_id`) REFERENCES `server`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`parent_agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "agent_sort_order_nonnegative" CHECK("agent"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE INDEX `agent_server_idx` ON `agent` (`server_id`);--> statement-breakpoint
CREATE INDEX `agent_parent_idx` ON `agent` (`parent_agent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_server_name_unique` ON `agent` (`server_id`,`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_server_id_unique` ON `agent` (`server_id`,`id`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`server_id` text NOT NULL,
	`primary_agent_id` text NOT NULL,
	`project_path` text DEFAULT '~' NOT NULL,
	`parent_session_id` text,
	`title` text NOT NULL,
	`client_request_id` text NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`pinned` integer DEFAULT true NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`server_id`) REFERENCES `server`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`server_id`,`primary_agent_id`) REFERENCES `agent`(`server_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `session_user_updated_idx` ON `session` (`user_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `session_user_archived_idx` ON `session` (`user_id`,`archived_at`);--> statement-breakpoint
CREATE INDEX `session_server_idx` ON `session` (`server_id`);--> statement-breakpoint
CREATE INDEX `session_parent_idx` ON `session` (`parent_session_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_client_request_unique` ON `session` (`user_id`,`client_request_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_user_id_unique` ON `session` (`user_id`,`id`);--> statement-breakpoint
CREATE TABLE `message` (
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
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "message_sequence_positive" CHECK("message"."sequence" > 0),
	CONSTRAINT "message_role_allowed" CHECK("message"."role" in ('user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX `message_session_sequence_idx` ON `message` (`session_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `message_role_idx` ON `message` (`role`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_session_sequence_unique` ON `message` (`session_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `message_session_client_request_unique` ON `message` (`session_id`,`client_request_id`);--> statement-breakpoint
CREATE TABLE `note` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`project_path` text,
	`sort_order` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `note_user_updated_idx` ON `note` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `note_user_project_idx` ON `note` (`user_id`,`project_path`);--> statement-breakpoint
CREATE TABLE `attempt` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`stream_id` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL,
	`snapshot` text NOT NULL,
	`budget` text NOT NULL,
	`failure` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "attempt_status_allowed" CHECK("attempt"."status" IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')),
	CONSTRAINT "attempt_ordinal_positive" CHECK("attempt"."ordinal" > 0),
	CONSTRAINT "attempt_stream_id_bounded" CHECK(length("attempt"."stream_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX `attempt_session_updated_idx` ON `attempt` (`session_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `attempt_run_idx` ON `attempt` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE INDEX `attempt_stream_idx` ON `attempt` (`stream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_run_ordinal_unique` ON `attempt` (`run_id`,`ordinal`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_stream_id_unique` ON `attempt` (`stream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `attempt_user_session_run_id_unique` ON `attempt` (`user_id`,`session_id`,`run_id`,`id`);--> statement-breakpoint
CREATE TABLE `run_delegation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`child_run_id` text NOT NULL,
	`root_run_id` text NOT NULL,
	`parent_run_id` text NOT NULL,
	`parent_attempt_id` text NOT NULL,
	`delegation_key` text NOT NULL,
	`root_ordinal` integer NOT NULL,
	`depth` integer NOT NULL,
	`task` text NOT NULL,
	`finalized_result` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`child_run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`root_run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`parent_run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`parent_run_id`,`parent_attempt_id`) REFERENCES `attempt`(`user_id`,`session_id`,`run_id`,`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "run_delegation_key_bounded" CHECK(length("run_delegation"."delegation_key") BETWEEN 1 AND 200),
	CONSTRAINT "run_delegation_root_ordinal_positive" CHECK("run_delegation"."root_ordinal" > 0),
	CONSTRAINT "run_delegation_depth_bounded" CHECK("run_delegation"."depth" BETWEEN 1 AND 3),
	CONSTRAINT "run_delegation_task_bounded" CHECK(length("run_delegation"."task") BETWEEN 1 AND 100000)
);
--> statement-breakpoint
CREATE INDEX `run_delegation_user_updated_idx` ON `run_delegation` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `run_delegation_session_updated_idx` ON `run_delegation` (`session_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `run_delegation_root_idx` ON `run_delegation` (`root_run_id`,`root_ordinal`);--> statement-breakpoint
CREATE INDEX `run_delegation_parent_idx` ON `run_delegation` (`parent_run_id`,`parent_attempt_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_delegation_child_run_unique` ON `run_delegation` (`child_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_delegation_parent_key_unique` ON `run_delegation` (`parent_run_id`,`parent_attempt_id`,`delegation_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_delegation_root_ordinal_unique` ON `run_delegation` (`root_run_id`,`root_ordinal`);--> statement-breakpoint
CREATE TABLE `run` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`client_run_id` text NOT NULL,
	`stream_id` text NOT NULL,
	`status` text DEFAULT 'accepted' NOT NULL,
	`snapshot` text NOT NULL,
	`budget` text NOT NULL,
	`deadline_at` integer NOT NULL,
	`failure` text,
	`cancellation_requested_at` integer,
	`cancellation_kind` text,
	`cancellation_source_run_id` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`) REFERENCES `session`(`user_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`,`session_id`,`cancellation_source_run_id`) REFERENCES `run`(`user_id`,`session_id`,`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "run_status_allowed" CHECK("run"."status" IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')),
	CONSTRAINT "run_cancellation_fields_allowed" CHECK((
        ("run"."cancellation_kind" IS NULL AND "run"."cancellation_requested_at" IS NULL AND "run"."cancellation_source_run_id" IS NULL)
        OR ("run"."cancellation_kind" = 'requested' AND "run"."cancellation_requested_at" IS NOT NULL AND "run"."cancellation_source_run_id" IS NULL)
        OR ("run"."cancellation_kind" = 'ancestor' AND "run"."cancellation_requested_at" IS NOT NULL AND "run"."cancellation_source_run_id" IS NOT NULL)
      )),
	CONSTRAINT "run_client_run_id_bounded" CHECK(length("run"."client_run_id") BETWEEN 1 AND 200),
	CONSTRAINT "run_stream_id_bounded" CHECK(length("run"."stream_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX `run_user_updated_idx` ON `run` (`user_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `run_session_updated_idx` ON `run` (`session_id`,`updated_at`,`id`);--> statement-breakpoint
CREATE INDEX `run_stream_idx` ON `run` (`stream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_session_client_run_unique` ON `run` (`session_id`,`client_run_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_stream_id_unique` ON `run` (`stream_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `run_user_session_id_unique` ON `run` (`user_id`,`session_id`,`id`);--> statement-breakpoint
CREATE TABLE `stream_checkpoint` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`stream_id` text NOT NULL,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stream_checkpoint_sequence_nonnegative" CHECK("stream_checkpoint"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stream_checkpoint_session_stream_unique` ON `stream_checkpoint` (`session_id`,`stream_id`);--> statement-breakpoint
CREATE TABLE `stream_event` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`stream_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "stream_event_sequence_positive" CHECK("stream_event"."sequence" > 0)
);
--> statement-breakpoint
CREATE INDEX `stream_event_session_stream_sequence_idx` ON `stream_event` (`session_id`,`stream_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `stream_event_created_idx` ON `stream_event` (`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `stream_event_stream_sequence_unique` ON `stream_event` (`stream_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `stream_event_idempotency_unique` ON `stream_event` (`stream_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `journal_event` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload` text NOT NULL,
	`run_id` text,
	`created_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`serialized_bytes` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journal_event_sequence_positive" CHECK("journal_event"."sequence" > 0),
	CONSTRAINT "journal_event_sequence_safe" CHECK("journal_event"."sequence" <= 9007199254740991),
	CONSTRAINT "journal_event_serialized_bytes_positive" CHECK("journal_event"."serialized_bytes" > 0)
);
--> statement-breakpoint
CREATE INDEX `journal_event_user_sequence_idx` ON `journal_event` (`user_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `journal_event_run_idx` ON `journal_event` (`run_id`);--> statement-breakpoint
CREATE INDEX `journal_event_created_idx` ON `journal_event` (`created_at`);--> statement-breakpoint
CREATE INDEX `journal_event_compact_retention_idx` ON `journal_event` (`user_id`,`created_at`,`sequence`,`id`) WHERE "journal_event"."event_type" in ('invalidate', 'run-completed', 'run-failed', 'run-cancelled', 'run-interrupted');--> statement-breakpoint
CREATE UNIQUE INDEX `journal_event_user_sequence_unique` ON `journal_event` (`user_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `journal_replay_boundary` (
	`user_id` text PRIMARY KEY NOT NULL,
	`pruned_through_sequence` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journal_replay_boundary_sequence_non_negative" CHECK("journal_replay_boundary"."pruned_through_sequence" >= 0),
	CONSTRAINT "journal_replay_boundary_sequence_safe" CHECK("journal_replay_boundary"."pruned_through_sequence" <= 9007199254740991)
);
--> statement-breakpoint
CREATE TABLE `journal_sequence_counter` (
	`user_id` text PRIMARY KEY NOT NULL,
	`next_sequence` integer DEFAULT 1 NOT NULL,
	`updated_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `identity_user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "journal_sequence_counter_next_sequence_positive" CHECK("journal_sequence_counter"."next_sequence" > 0),
	CONSTRAINT "journal_sequence_counter_next_sequence_safe" CHECK("journal_sequence_counter"."next_sequence" <= 9007199254740991)
);
