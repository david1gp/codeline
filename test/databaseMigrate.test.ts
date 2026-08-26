import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createClient } from "@libsql/client"
import { databaseMigrate } from "../src/database/databaseMigrate.js"

test("database migrations apply the checked-in SQLite baseline", async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-migrate."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const client = createClient({ url: `file://${filePath}` })

  try {
    const result = await databaseMigrate(filePath)
    expect(result.success).toBe(true)

    const migrations = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'",
    )
    expect(migrations.rows).toHaveLength(1)

    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
    const tableNames = tables.rows.map((row) => row.name)
    expect(tableNames).toContain("identity_user")
    expect(tableNames).toContain("journal_event")
    expect(tableNames).toContain("session_execution_selection_default")

    const sessionColumns = await client.execute("PRAGMA table_info('session')")
    const executionSelection = sessionColumns.rows.find((row) => row.name === "execution_selection")
    expect(executionSelection).toMatchObject({ name: "execution_selection", notnull: 0, type: "TEXT" })
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})

test("the session selection migration preserves sessions created before the column existed", async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-selection-migrate."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const client = createClient({ url: `file://${filePath}` })

  try {
    const baseline = await Bun.file(
      new URL("../src/database/migrations/0000_sqlite_baseline.sql", import.meta.url),
    ).text()
    for (const statement of baseline.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.execute(statement)
    }

    await client.execute("INSERT INTO identity_user (id, display_name) VALUES ('migration-user', 'Migration User')")
    await client.execute(
      "INSERT INTO identity_organization (id, external_id, name) VALUES ('migration-organization', 'migration-organization', 'Migration Organization')",
    )
    await client.execute(
      "INSERT INTO server (id, organization_id, name, endpoint) VALUES ('migration-server', 'migration-organization', 'Migration Server', 'http://migration.test')",
    )
    await client.execute(
      "INSERT INTO agent (id, server_id, name, role) VALUES ('migration-agent', 'migration-server', 'Migration Agent', 'coding')",
    )
    await client.execute(
      "INSERT INTO session (id, user_id, server_id, primary_agent_id, title, client_request_id) VALUES ('migration-session', 'migration-user', 'migration-server', 'migration-agent', 'Migration Session', 'migration-request')",
    )

    const migration = await Bun.file(
      new URL("../src/database/migrations/0002_slimy_randall_flagg.sql", import.meta.url),
    ).text()
    for (const statement of migration.split("--> statement-breakpoint")) {
      if (statement.trim() !== "") await client.execute(statement)
    }

    const selection = await client.execute("SELECT execution_selection FROM session WHERE id = 'migration-session'")
    expect(selection.rows).toHaveLength(1)
    expect(selection.rows[0]?.execution_selection).toBeNull()
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})

test("the default execution selection migration adds a user/project scoped table", async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-selection-default-migrate."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const client = createClient({ url: `file://${filePath}` })

  try {
    const result = await databaseMigrate(filePath)
    expect(result.success).toBe(true)
    const columns = await client.execute("PRAGMA table_info('session_execution_selection_default')")
    expect(columns.rows.map((row) => row.name)).toEqual([
      "id",
      "user_id",
      "project_path",
      "execution_selection",
      "revision",
      "created_at",
      "updated_at",
    ])
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})
