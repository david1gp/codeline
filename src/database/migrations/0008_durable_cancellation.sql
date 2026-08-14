ALTER TABLE "run" ADD COLUMN "cancellation_requested_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "cancellation_kind" text;
--> statement-breakpoint
ALTER TABLE "run" ADD COLUMN "cancellation_source_run_id" text;
--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_cancellation_fields_allowed" CHECK (
  ("cancellation_kind" IS NULL AND "cancellation_requested_at" IS NULL AND "cancellation_source_run_id" IS NULL)
  OR ("cancellation_kind" = 'requested' AND "cancellation_requested_at" IS NOT NULL AND "cancellation_source_run_id" IS NULL)
  OR ("cancellation_kind" = 'ancestor' AND "cancellation_requested_at" IS NOT NULL AND "cancellation_source_run_id" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "run" ADD CONSTRAINT "run_cancellation_source_ownership_fk" FOREIGN KEY ("user_id","session_id","cancellation_source_run_id") REFERENCES "public"."run"("user_id","session_id","id") ON DELETE no action ON UPDATE no action;
