ALTER TABLE "session" ADD CONSTRAINT "session_user_id_unique" UNIQUE("user_id","id");
--> statement-breakpoint
CREATE TABLE "run" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"client_run_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"failure" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_session_client_run_unique" UNIQUE("session_id","client_run_id"),
	CONSTRAINT "run_stream_id_unique" UNIQUE("stream_id"),
	CONSTRAINT "run_user_session_id_unique" UNIQUE("user_id","session_id","id"),
	CONSTRAINT "run_status_allowed" CHECK ("run"."status" IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')),
	CONSTRAINT "run_client_run_id_bounded" CHECK (char_length("run"."client_run_id") BETWEEN 1 AND 200),
	CONSTRAINT "run_stream_id_bounded" CHECK (char_length("run"."stream_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_user_id_development_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_user_session_consistency_fk" FOREIGN KEY ("user_id","session_id") REFERENCES "public"."session"("user_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "run_user_updated_idx" ON "run" USING btree ("user_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "run_session_updated_idx" ON "run" USING btree ("session_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "run_stream_idx" ON "run" USING btree ("stream_id");
--> statement-breakpoint
CREATE TABLE "attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"stream_id" text NOT NULL,
	"status" text DEFAULT 'accepted' NOT NULL,
	"snapshot" jsonb NOT NULL,
	"budget" jsonb NOT NULL,
	"failure" jsonb,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attempt_run_ordinal_unique" UNIQUE("run_id","ordinal"),
	CONSTRAINT "attempt_stream_id_unique" UNIQUE("stream_id"),
	CONSTRAINT "attempt_status_allowed" CHECK ("attempt"."status" IN ('accepted', 'running', 'succeeded', 'failed', 'aborted')),
	CONSTRAINT "attempt_ordinal_positive" CHECK ("attempt"."ordinal" > 0),
	CONSTRAINT "attempt_stream_id_bounded" CHECK (char_length("attempt"."stream_id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_id_development_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_run_ownership_consistency_fk" FOREIGN KEY ("user_id","session_id","run_id") REFERENCES "public"."run"("user_id","session_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "attempt_session_updated_idx" ON "attempt" USING btree ("session_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "attempt_run_idx" ON "attempt" USING btree ("run_id","ordinal");
--> statement-breakpoint
CREATE INDEX "attempt_stream_idx" ON "attempt" USING btree ("stream_id");
