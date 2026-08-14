ALTER TABLE "session" ADD COLUMN "parent_session_id" text;
--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_parent_session_id_session_id_fk" FOREIGN KEY ("parent_session_id") REFERENCES "public"."session"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "session_parent_idx" ON "session" USING btree ("parent_session_id");
