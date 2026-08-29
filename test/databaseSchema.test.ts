import { expect, test } from "bun:test"
import { getTableName } from "drizzle-orm"
import { getTableConfig } from "drizzle-orm/sqlite-core"
import { databaseSchema } from "../src/database/databaseSchema.js"

const expectedTables = [
  "agent",
  "attempt",
  "identity_external_identity",
  "identity_oidc_login_transaction",
  "identity_organization",
  "identity_organization_member",
  "identity_session",
  "identity_user",
  "journal_event",
  "journal_replay_boundary",
  "journal_sequence_counter",
  "message",
  "mutation_idempotency",
  "note",
  "project",
  "project_folder",
  "project_folder_assignment_backfill",
  "project_registry_session_path_backfill",
  "run",
  "run_delegation",
  "server",
  "session_compaction",
  "session",
  "session_execution_selection_default",
  "session_view",
  "skill_selection_default",
] as const

test("SQLite exposes all durable tables with flattened identity names", () => {
  const databaseTableNames = Object.values(databaseSchema)
    .map((table) => getTableName(table))
    .sort()

  expect(databaseTableNames).toEqual([...expectedTables].sort())
  expect(databaseTableNames).not.toContain("external_identity")
  expect(databaseTableNames).not.toContain("oidc_login_transaction")
})

test("Drizzle keeps note ordering nullable for compatibility", () => {
  const noteColumns = getTableConfig(databaseSchema.noteTable).columns
  const sortOrder = noteColumns.find((column) => column.name === "sort_order")

  expect(sortOrder?.dataType).toBe("number")
  expect(sortOrder?.notNull).toBe(false)
})

test("SQLite stores JSON, dates, booleans, and numeric sequences with native modes", () => {
  const sessionColumns = getTableConfig(databaseSchema.sessionTable).columns
  const defaultColumns = getTableConfig(databaseSchema.sessionExecutionSelectionDefaultTable).columns
  const runColumns = getTableConfig(databaseSchema.runTable).columns
  const journalColumns = getTableConfig(databaseSchema.journalEventTable).columns

  expect(sessionColumns.find((column) => column.name === "metadata")?.dataType).toBe("json")
  expect(sessionColumns.find((column) => column.name === "execution_selection")?.dataType).toBe("json")
  expect(sessionColumns.find((column) => column.name === "execution_selection")?.notNull).toBe(false)
  expect(sessionColumns.find((column) => column.name === "pinned")?.dataType).toBe("boolean")
  expect(sessionColumns.find((column) => column.name === "created_at")?.dataType).toBe("date")
  expect(defaultColumns.find((column) => column.name === "execution_selection")?.dataType).toBe("json")
  expect(defaultColumns.find((column) => column.name === "revision")?.notNull).toBe(true)
  expect(defaultColumns.find((column) => column.name === "created_at")?.dataType).toBe("date")
  expect(defaultColumns.find((column) => column.name === "updated_at")?.dataType).toBe("date")
  expect(runColumns.find((column) => column.name === "snapshot")?.dataType).toBe("json")
  expect(runColumns.find((column) => column.name === "deadline_at")?.dataType).toBe("date")
  expect(journalColumns.find((column) => column.name === "sequence")?.dataType).toBe("number")
  expect(journalColumns.find((column) => column.name === "serialized_bytes")?.dataType).toBe("number")
  expect(journalColumns.find((column) => column.name === "run_id")?.notNull).toBe(false)
})

test("SQLite keeps run and attempt stream IDs and ownership unique", () => {
  const runConfig = getTableConfig(databaseSchema.runTable)
  const attemptConfig = getTableConfig(databaseSchema.attemptTable)
  const sessionConfig = getTableConfig(databaseSchema.sessionTable)

  expect(runConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "run_session_client_run_unique",
    "run_stream_id_unique",
    "run_user_session_id_unique",
  ])
  expect(attemptConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "attempt_run_ordinal_unique",
    "attempt_stream_id_unique",
    "attempt_user_session_run_id_unique",
  ])
  const delegationConfig = getTableConfig(databaseSchema.runDelegationTable)
  expect(sessionConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain("session_user_id_unique")
  const runOwnershipForeignKey = runConfig.foreignKeys.find(
    (foreignKey) => foreignKey.getName() === "run_user_session_consistency_fk",
  )
  const attemptOwnershipForeignKey = attemptConfig.foreignKeys.find(
    (foreignKey) => foreignKey.getName() === "attempt_run_ownership_consistency_fk",
  )
  expect(runOwnershipForeignKey?.onDelete).toBe("cascade")
  expect(attemptOwnershipForeignKey?.onDelete).toBe("cascade")
  expect(runConfig.checks.map((checkConstraint) => checkConstraint.name)).toContain("run_cancellation_fields_allowed")
  expect(runConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    "run_cancellation_source_ownership_fk",
  )
  expect(delegationConfig.uniqueConstraints.map((constraint) => constraint.name)).toEqual([
    "run_delegation_child_run_unique",
    "run_delegation_parent_key_unique",
    "run_delegation_root_ordinal_unique",
  ])
  const defaultConfig = getTableConfig(databaseSchema.sessionExecutionSelectionDefaultTable)
  expect(defaultConfig.uniqueConstraints.map((constraint) => constraint.name)).toContain(
    "session_execution_selection_default_user_project_unique",
  )
  expect(delegationConfig.checks.map((checkConstraint) => checkConstraint.name)).toEqual([
    "run_delegation_key_bounded",
    "run_delegation_root_ordinal_positive",
    "run_delegation_depth_bounded",
    "run_delegation_task_bounded",
  ])
  expect(delegationConfig.foreignKeys.map((foreignKey) => foreignKey.getName()).sort()).toEqual([
    "run_delegation_child_ownership_consistency_fk",
    "run_delegation_parent_attempt_consistency_fk",
    "run_delegation_parent_ownership_consistency_fk",
    "run_delegation_root_ownership_consistency_fk",
    "run_delegation_user_id_identity_user_id_fk",
  ])
})

test("SQLite table configurations preserve foreign keys, checks, and indexes", () => {
  const runConfig = getTableConfig(databaseSchema.runTable)
  const journalConfig = getTableConfig(databaseSchema.journalEventTable)

  expect(runConfig.foreignKeys.map((foreignKey) => foreignKey.getName())).toContain(
    "run_cancellation_source_ownership_fk",
  )
  expect(runConfig.checks.map((checkConstraint) => checkConstraint.name)).toContain("run_cancellation_fields_allowed")
  expect(journalConfig.indexes.map((index) => index.config.name)).toContain("journal_event_run_idx")
})

test("SQLite compaction records are versioned and have one active row per session", () => {
  const compactionConfig = getTableConfig(databaseSchema.sessionCompactionTable)

  expect(compactionConfig.indexes.map((index) => index.config.name)).toEqual([
    "session_compaction_session_version_unique",
    "session_compaction_session_running_unique",
    "session_compaction_session_version_idx",
  ])
  expect(compactionConfig.checks.map((check) => check.name)).toEqual([
    "session_compaction_schema_version_positive",
    "session_compaction_version_positive",
    "session_compaction_source_revision_positive",
    "session_compaction_covered_sequence_non_negative",
    "session_compaction_status_allowed",
    "session_compaction_lifecycle_consistent",
  ])
})
