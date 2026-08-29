CREATE TABLE `session_compaction` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`compaction_version` integer NOT NULL,
	`status` text NOT NULL,
	`source_revision` integer NOT NULL,
	`covered_sequence` integer NOT NULL,
	`summary` text,
	`error_message` text,
	`started_at` integer DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer)) NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`session_id`) REFERENCES `session`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "session_compaction_schema_version_positive" CHECK("session_compaction"."schema_version" > 0),
	CONSTRAINT "session_compaction_version_positive" CHECK("session_compaction"."compaction_version" > 0),
	CONSTRAINT "session_compaction_source_revision_positive" CHECK("session_compaction"."source_revision" > 0),
	CONSTRAINT "session_compaction_covered_sequence_non_negative" CHECK("session_compaction"."covered_sequence" >= 0),
	CONSTRAINT "session_compaction_status_allowed" CHECK("session_compaction"."status" IN ('running', 'succeeded', 'failed')),
	CONSTRAINT "session_compaction_lifecycle_consistent" CHECK((
        ("session_compaction"."status" = 'running' AND "session_compaction"."summary" IS NULL AND "session_compaction"."error_message" IS NULL AND "session_compaction"."completed_at" IS NULL)
        OR ("session_compaction"."status" = 'succeeded' AND "session_compaction"."summary" IS NOT NULL AND "session_compaction"."error_message" IS NULL AND "session_compaction"."completed_at" IS NOT NULL)
        OR ("session_compaction"."status" = 'failed' AND "session_compaction"."summary" IS NULL AND "session_compaction"."error_message" IS NOT NULL AND "session_compaction"."completed_at" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_compaction_session_version_unique` ON `session_compaction` (`session_id`,`compaction_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `session_compaction_session_running_unique` ON `session_compaction` (`session_id`) WHERE "session_compaction"."status" = 'running';--> statement-breakpoint
CREATE INDEX `session_compaction_session_version_idx` ON `session_compaction` (`session_id`,`compaction_version`);