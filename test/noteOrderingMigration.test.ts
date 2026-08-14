import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const migrationPath = new URL("../src/database/migrations/0006_note_ordering.sql", import.meta.url)

test("note ordering migration backfills deterministic per-user project positions", async () => {
  const migration = await readFile(migrationPath, "utf8")

  expect(migration).toContain('ALTER TABLE "note" ADD COLUMN "sort_order" integer;')
  expect(migration).toContain('PARTITION BY "user_id", "project_path"')
  expect(migration).toContain('ORDER BY "updated_at" DESC, "id" DESC')
  expect(migration).toContain("ROW_NUMBER()")
  expect(migration).toContain(' - 1 AS "sort_order"')
})
