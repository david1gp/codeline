ALTER TABLE "session" ADD COLUMN "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_server_primary_agent_consistency_fk" FOREIGN KEY ("server_id","primary_agent_id") REFERENCES "public"."agent"("server_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_user_archived_idx" ON "session" USING btree ("user_id","archived_at");--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_server_id_unique" UNIQUE("server_id","id");