CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "organization_member" (
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organization_member_pkey" PRIMARY KEY("organization_id","user_id"),
	CONSTRAINT "organization_member_identity_unique" UNIQUE("organization_id","issuer","subject")
);
--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "organization_member" ADD CONSTRAINT "organization_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "organization_member_user_idx" ON "organization_member" USING btree ("user_id");
--> statement-breakpoint
DO $organization_external_id$
DECLARE
	organization_external_id text;
BEGIN
	organization_external_id := NULLIF(btrim(current_setting('codeline.organization_external_id', true)), '');
	IF organization_external_id IS NULL THEN
		RAISE EXCEPTION 'ZITADEL_ORGANIZATION_ID is required to apply the organization ownership migration.'
			USING ERRCODE = '22023';
	END IF;

	INSERT INTO "organization" ("id", "external_id", "name")
	VALUES ('contentoren', organization_external_id, 'Contentoren')
	ON CONFLICT ("id") DO UPDATE SET
		"external_id" = EXCLUDED."external_id",
		"name" = EXCLUDED."name",
		"updated_at" = now();
END
$organization_external_id$;
--> statement-breakpoint
ALTER TABLE "server" ADD COLUMN "organization_id" text;
--> statement-breakpoint
UPDATE "server" SET "organization_id" = 'contentoren' WHERE "organization_id" IS NULL;
--> statement-breakpoint
ALTER TABLE "server" ALTER COLUMN "organization_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT IF EXISTS "server_owner_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT IF EXISTS "server_owner_user_id_development_user_id_fk";
--> statement-breakpoint
ALTER TABLE "server" DROP CONSTRAINT IF EXISTS "server_owner_name_unique";
--> statement-breakpoint
DROP INDEX IF EXISTS "server_owner_idx";
--> statement-breakpoint
DO $duplicate_server_names$
DECLARE
	server_record record;
	candidate_name text;
	candidate_suffix integer;
BEGIN
	FOR server_record IN
		SELECT duplicate_servers.server_id, duplicate_servers.organization_id, duplicate_servers.original_name
		FROM (
			SELECT
				"id" AS server_id,
				"organization_id" AS organization_id,
				"name" AS original_name,
				row_number() OVER (PARTITION BY "organization_id", "name" ORDER BY "id") AS duplicate_number
			FROM "server"
		) AS duplicate_servers
		WHERE duplicate_servers.duplicate_number > 1
		ORDER BY duplicate_servers.organization_id, duplicate_servers.original_name, duplicate_servers.server_id
	LOOP
		candidate_name := server_record.original_name || ' [' || server_record.server_id || ']';
		candidate_suffix := 1;
		WHILE EXISTS (
			SELECT 1
			FROM "server"
			WHERE "organization_id" = server_record.organization_id
				AND "name" = candidate_name
				AND "id" <> server_record.server_id
		) LOOP
			candidate_suffix := candidate_suffix + 1;
			candidate_name := server_record.original_name || ' [' || server_record.server_id || '-' || candidate_suffix || ']';
		END LOOP;

		UPDATE "server"
		SET "name" = candidate_name, "updated_at" = now()
		WHERE "id" = server_record.server_id;
	END LOOP;
END
$duplicate_server_names$;
--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "server" ADD CONSTRAINT "server_organization_name_unique" UNIQUE("organization_id","name");
--> statement-breakpoint
CREATE INDEX "server_organization_idx" ON "server" USING btree ("organization_id");
--> statement-breakpoint
ALTER TABLE "server" DROP COLUMN "owner_user_id";
