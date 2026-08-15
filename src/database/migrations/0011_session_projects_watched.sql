ALTER TABLE "session" ADD COLUMN "project_path" text;
--> statement-breakpoint
UPDATE "session" SET "project_path" = '~' WHERE "project_path" IS NULL;
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "project_path" SET DEFAULT '~';
--> statement-breakpoint
ALTER TABLE "session" ALTER COLUMN "project_path" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "watched" boolean DEFAULT true NOT NULL;
