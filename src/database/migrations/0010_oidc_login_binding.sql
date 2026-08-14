ALTER TABLE "identity"."oidc_login_transaction" ADD COLUMN "browser_binding_hash" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "identity"."oidc_login_transaction" ADD COLUMN "return_to" text DEFAULT '/' NOT NULL;
