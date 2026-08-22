ALTER TABLE "session" ADD COLUMN "revision" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE "mutation_idempotency" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"operation" text NOT NULL,
	"resource_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_hash" text NOT NULL,
	"status" integer NOT NULL,
	"response_body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mutation_idempotency_user_operation_key_unique" UNIQUE("user_id","operation","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "mutation_idempotency" ADD CONSTRAINT "mutation_idempotency_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "mutation_idempotency_user_resource_idx" ON "mutation_idempotency" USING btree ("user_id","resource_id");
