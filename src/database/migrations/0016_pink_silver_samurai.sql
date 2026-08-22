CREATE TABLE "journal_replay_boundary" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pruned_through_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_replay_boundary_sequence_non_negative" CHECK ("journal_replay_boundary"."pruned_through_sequence" >= 0),
	CONSTRAINT "journal_replay_boundary_sequence_safe" CHECK ("journal_replay_boundary"."pruned_through_sequence" <= 9007199254740991)
);
--> statement-breakpoint
CREATE FUNCTION "journal_event_serialized_bytes"(p_id text, p_user_id text, p_sequence bigint, p_event_type text, p_payload jsonb, p_created_at timestamp with time zone)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT octet_length(convert_to(json_build_object(
    'id', p_id,
    'userId', p_user_id,
    'sequence', p_sequence,
    'eventType', p_event_type,
    'payload', p_payload,
    'createdAt', (extract(epoch from p_created_at) * 1000)::bigint
  )::text, 'UTF8'))::bigint;
$$;
--> statement-breakpoint
ALTER TABLE "journal_event" ADD COLUMN "serialized_bytes" bigint GENERATED ALWAYS AS (journal_event_serialized_bytes(id, user_id, sequence, event_type, payload, created_at)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "journal_replay_boundary" ADD CONSTRAINT "journal_replay_boundary_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "journal_event_compact_retention_idx" ON "journal_event" USING btree ("user_id","created_at","sequence","id") WHERE "journal_event"."event_type" in ('invalidate', 'run-completed', 'run-failed', 'run-cancelled', 'run-interrupted');--> statement-breakpoint
ALTER TABLE "journal_event" ADD CONSTRAINT "journal_event_sequence_safe" CHECK ("journal_event"."sequence" <= 9007199254740991);--> statement-breakpoint
ALTER TABLE "journal_event" ADD CONSTRAINT "journal_event_serialized_bytes_positive" CHECK ("journal_event"."serialized_bytes" > 0);
