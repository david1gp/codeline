CREATE SCHEMA IF NOT EXISTS "identity";
--> statement-breakpoint
ALTER TABLE "development_user" RENAME TO "user";
--> statement-breakpoint
ALTER INDEX "development_user_display_name_idx" RENAME TO "user_display_name_idx";
--> statement-breakpoint
ALTER TABLE "server" RENAME CONSTRAINT "server_owner_user_id_development_user_id_fk" TO "server_owner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "session" RENAME CONSTRAINT "session_user_id_development_user_id_fk" TO "session_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "note" RENAME CONSTRAINT "note_user_id_development_user_id_fk" TO "note_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "run" RENAME CONSTRAINT "run_user_id_development_user_id_fk" TO "run_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "attempt" RENAME CONSTRAINT "attempt_user_id_development_user_id_fk" TO "attempt_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "run_delegation" RENAME CONSTRAINT "run_delegation_user_id_development_user_id_fk" TO "run_delegation_user_id_user_id_fk";
--> statement-breakpoint
CREATE TABLE "identity"."external_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "external_identity_issuer_subject_unique" UNIQUE("issuer","subject"),
	CONSTRAINT "external_identity_user_issuer_unique" UNIQUE("user_id","issuer")
);
--> statement-breakpoint
CREATE TABLE "identity"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "identity_session_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "identity"."oidc_login_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"state_hash" text NOT NULL,
	"nonce_hash" text NOT NULL,
	"code_verifier" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_login_transaction_state_hash_unique" UNIQUE("state_hash")
);
--> statement-breakpoint
ALTER TABLE "identity"."external_identity" ADD CONSTRAINT "external_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "identity"."session" ADD CONSTRAINT "identity_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "external_identity_user_idx" ON "identity"."external_identity" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "identity_session_user_expires_idx" ON "identity"."session" USING btree ("user_id","expires_at");
--> statement-breakpoint
CREATE INDEX "oidc_login_transaction_expires_idx" ON "identity"."oidc_login_transaction" USING btree ("expires_at");
--> statement-breakpoint
INSERT INTO "identity"."external_identity" ("id", "user_id", "issuer", "subject", "created_at", "updated_at")
SELECT 'external:' || md5('urn:codeline:development:' || "identity_key"), "id", 'urn:codeline:development', "identity_key", "created_at", "updated_at"
FROM "public"."user";
--> statement-breakpoint
ALTER TABLE "user" DROP CONSTRAINT "development_user_identity_key_unique";
--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "identity_key";
