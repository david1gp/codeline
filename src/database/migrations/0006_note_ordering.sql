ALTER TABLE "note" ADD COLUMN "sort_order" integer;
--> statement-breakpoint
WITH ranked_notes AS (
	SELECT
		"id",
		ROW_NUMBER() OVER (
				PARTITION BY "user_id", "project_path"
				ORDER BY "updated_at" DESC, "id" DESC
			) - 1 AS "sort_order"
	FROM "note"
)
UPDATE "note"
SET "sort_order" = "ranked_notes"."sort_order"
FROM ranked_notes
WHERE "note"."id" = "ranked_notes"."id";
