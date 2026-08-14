import { expect, test } from "bun:test"
import { readFile } from "node:fs/promises"

const migrationPath = new URL("../src/database/migrations/0007_bounded_subagents.sql", import.meta.url)

test("bounded subagent migration carries deadlines and delegation integrity", async () => {
  const migration = await readFile(migrationPath, "utf8")

  expect(migration).toContain('ALTER TABLE "run" ADD COLUMN "deadline_at" timestamp with time zone;')
  expect(migration).toContain("\"budget\" ->> 'maxDurationMs'")
  expect(migration).toContain('ALTER TABLE "run" ALTER COLUMN "deadline_at" SET NOT NULL;')
  expect(migration).toContain('CREATE TABLE "run_delegation"')
  expect(migration).toContain('"parent_attempt_id" text NOT NULL')
  expect(migration).toContain('"finalized_result" jsonb')
  expect(migration).toContain('"run_delegation_parent_attempt_consistency_fk"')
  expect(migration).toContain('"run_delegation_parent_key_unique"')
  expect(migration).toContain('"run_delegation_task_bounded"')
  expect(migration).toContain('"run_delegation_session_updated_idx"')
})
