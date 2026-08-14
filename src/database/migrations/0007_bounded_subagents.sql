ALTER TABLE "run" ADD COLUMN "deadline_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "run"
SET "deadline_at" = "created_at" + (COALESCE(("budget" ->> 'maxDurationMs')::bigint, 300000) * INTERVAL '1 millisecond')
WHERE "deadline_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "run" ALTER COLUMN "deadline_at" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_user_session_run_id_unique" UNIQUE("user_id","session_id","run_id","id");
--> statement-breakpoint
CREATE TABLE "run_delegation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" text NOT NULL,
	"child_run_id" text NOT NULL,
	"root_run_id" text NOT NULL,
	"parent_run_id" text NOT NULL,
	"parent_attempt_id" text NOT NULL,
	"delegation_key" text NOT NULL,
	"root_ordinal" integer NOT NULL,
	"depth" integer NOT NULL,
	"task" text NOT NULL,
	"finalized_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_delegation_child_run_unique" UNIQUE("child_run_id"),
	CONSTRAINT "run_delegation_parent_key_unique" UNIQUE("parent_run_id","parent_attempt_id","delegation_key"),
	CONSTRAINT "run_delegation_root_ordinal_unique" UNIQUE("root_run_id","root_ordinal"),
	CONSTRAINT "run_delegation_key_bounded" CHECK (char_length("run_delegation"."delegation_key") BETWEEN 1 AND 200),
	CONSTRAINT "run_delegation_root_ordinal_positive" CHECK ("run_delegation"."root_ordinal" > 0),
	CONSTRAINT "run_delegation_depth_bounded" CHECK ("run_delegation"."depth" BETWEEN 1 AND 3),
	CONSTRAINT "run_delegation_task_bounded" CHECK (char_length("run_delegation"."task") BETWEEN 1 AND 100000)
);
--> statement-breakpoint
ALTER TABLE "run_delegation" ADD CONSTRAINT "run_delegation_user_id_development_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_delegation" ADD CONSTRAINT "run_delegation_child_ownership_consistency_fk" FOREIGN KEY ("user_id","session_id","child_run_id") REFERENCES "public"."run"("user_id","session_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_delegation" ADD CONSTRAINT "run_delegation_root_ownership_consistency_fk" FOREIGN KEY ("user_id","session_id","root_run_id") REFERENCES "public"."run"("user_id","session_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_delegation" ADD CONSTRAINT "run_delegation_parent_ownership_consistency_fk" FOREIGN KEY ("user_id","session_id","parent_run_id") REFERENCES "public"."run"("user_id","session_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "run_delegation" ADD CONSTRAINT "run_delegation_parent_attempt_consistency_fk" FOREIGN KEY ("user_id","session_id","parent_run_id","parent_attempt_id") REFERENCES "public"."attempt"("user_id","session_id","run_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "run_delegation_user_updated_idx" ON "run_delegation" USING btree ("user_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "run_delegation_session_updated_idx" ON "run_delegation" USING btree ("session_id","updated_at","id");
--> statement-breakpoint
CREATE INDEX "run_delegation_root_idx" ON "run_delegation" USING btree ("root_run_id","root_ordinal");
--> statement-breakpoint
CREATE INDEX "run_delegation_parent_idx" ON "run_delegation" USING btree ("parent_run_id","parent_attempt_id");
