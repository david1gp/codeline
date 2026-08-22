CREATE TABLE "journal_event" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_event_user_sequence_unique" UNIQUE("user_id","sequence"),
	CONSTRAINT "journal_event_sequence_positive" CHECK ("journal_event"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "journal_sequence_counter" (
	"user_id" text PRIMARY KEY NOT NULL,
	"next_sequence" bigint DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_sequence_counter_next_sequence_positive" CHECK ("journal_sequence_counter"."next_sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "journal_event" ADD CONSTRAINT "journal_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "journal_sequence_counter" ADD CONSTRAINT "journal_sequence_counter_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "journal_event_user_sequence_idx" ON "journal_event" USING btree ("user_id","sequence");
--> statement-breakpoint
CREATE INDEX "journal_event_created_idx" ON "journal_event" USING btree ("created_at");
