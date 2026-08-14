import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const migrationPath = new URL("../src/database/migrations/0008_durable_cancellation.sql", import.meta.url)

test("durable cancellation migration constrains intent and source ownership", async () => {
  const migration = await readFile(migrationPath, "utf8")

  expect(migration).toContain('ALTER TABLE "run" ADD COLUMN "cancellation_requested_at" timestamp with time zone;')
  expect(migration).toContain('ALTER TABLE "run" ADD COLUMN "cancellation_kind" text;')
  expect(migration).toContain('ALTER TABLE "run" ADD COLUMN "cancellation_source_run_id" text;')
  expect(migration).toContain("'requested'")
  expect(migration).toContain("'ancestor'")
  expect(migration).toContain('"run_cancellation_source_ownership_fk"')
})
