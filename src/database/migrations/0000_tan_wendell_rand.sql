CREATE TABLE "agent" (
	"id" text PRIMARY KEY NOT NULL,
	"server_id" text NOT NULL,
	"parent_agent_id" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"configuration" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_server_name_unique" UNIQUE("server_id","name"),
	CONSTRAINT "agent_sort_order_nonnegative" CHECK ("agent"."sort_order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "development_user" (
	"id" text PRIMARY KEY NOT NULL,
	"identity_key" text NOT NULL,
	"display_name" text NOT NULL,
	"email" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "development_user_identity_key_unique" UNIQUE("identity_key")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"role" text NOT NULL,
	"sequence" integer NOT NULL,
	"content" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "message_session_sequence_unique" UNIQUE("session_id","sequence"),
	CONSTRAINT "message_session_idempotency_unique" UNIQUE("session_id","idempotency_key"),
	CONSTRAINT "message_sequence_positive" CHECK ("message"."sequence" > 0)
);
--> statement-breakpoint
CREATE TABLE "server" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"endpoint" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "server_owner_name_unique" UNIQUE("owner_user_id","name")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"server_id" text NOT NULL,
	"primary_agent_id" text NOT NULL,
	"title" text NOT NULL,
	"client_request_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_user_client_request_unique" UNIQUE("user_id","client_request_id")
);
--> statement-breakpoint
CREATE TABLE "stream_checkpoint" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"last_sequence" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_checkpoint_session_stream_unique" UNIQUE("session_id","stream_id"),
	CONSTRAINT "stream_checkpoint_sequence_nonnegative" CHECK ("stream_checkpoint"."last_sequence" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stream_event" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"stream_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stream_event_stream_sequence_unique" UNIQUE("stream_id","sequence"),
	CONSTRAINT "stream_event_idempotency_unique" UNIQUE("stream_id","idempotency_key"),
	CONSTRAINT "stream_event_sequence_positive" CHECK ("stream_event"."sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_parent_agent_id_agent_id_fk" FOREIGN KEY ("parent_agent_id") REFERENCES "public"."agent"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_agent_id_agent_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_owner_user_id_development_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_development_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."development_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_server_id_server_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."server"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_primary_agent_id_agent_id_fk" FOREIGN KEY ("primary_agent_id") REFERENCES "public"."agent"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_checkpoint" ADD CONSTRAINT "stream_checkpoint_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stream_event" ADD CONSTRAINT "stream_event_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_server_idx" ON "agent" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "agent_parent_idx" ON "agent" USING btree ("parent_agent_id");--> statement-breakpoint
CREATE INDEX "development_user_display_name_idx" ON "development_user" USING btree ("display_name");--> statement-breakpoint
CREATE INDEX "message_session_sequence_idx" ON "message" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE INDEX "message_role_idx" ON "message" USING btree ("role");--> statement-breakpoint
CREATE INDEX "server_owner_idx" ON "server" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "server_name_idx" ON "server" USING btree ("name");--> statement-breakpoint
CREATE INDEX "server_metadata_gin_idx" ON "server" USING gin ("metadata");--> statement-breakpoint
CREATE INDEX "session_user_updated_idx" ON "session" USING btree ("user_id","updated_at");--> statement-breakpoint
CREATE INDEX "session_server_idx" ON "session" USING btree ("server_id");--> statement-breakpoint
CREATE INDEX "stream_event_session_stream_sequence_idx" ON "stream_event" USING btree ("session_id","stream_id","sequence");--> statement-breakpoint
CREATE INDEX "stream_event_created_idx" ON "stream_event" USING btree ("created_at");