CREATE TABLE "note" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"content" text NOT NULL,
	"project_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note" ADD CONSTRAINT "note_user_id_development_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "note_user_updated_idx" ON "note" USING btree ("user_id", "updated_at", "id");
--> statement-breakpoint
CREATE INDEX "note_user_project_idx" ON "note" USING btree ("user_id", "project_path");
