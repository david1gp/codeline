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
    expect(tableNames).toContain("run_active_state")
    expect(tableNames).toContain("run_finalized_detail")
    expect(tableNames).toContain("session_execution_selection_default")
    expect(tableNames).toContain("session_history_entry")

    const sessionColumns = await client.execute("PRAGMA table_info('session')")
    const executionSelection = sessionColumns.rows.find((row) => row.name === "execution_selection")
    expect(executionSelection).toMatchObject({ name: "execution_selection", notnull: 0, type: "TEXT" })
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})

test("the bounded history migration creates position and ownership indexes", async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-bounded-history-migrate."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const client = createClient({ url: `file://${filePath}` })

  try {
    const result = await databaseMigrate(filePath)
    expect(result.success).toBe(true)

    const sessionColumns = await client.execute("PRAGMA table_info('session')")
    expect(sessionColumns.rows.map((row) => row.name)).toContain("next_history_position")

    const historyIndexes = await client.execute("PRAGMA index_list('session_history_entry')")
    expect(
      historyIndexes.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string" && name.startsWith("session_history_entry_"))
        .sort(),
    ).toEqual([
      "session_history_entry_session_change_position_idx",
      "session_history_entry_session_position_unique",
      "session_history_entry_session_source_unique",
    ])

    const activeIndexes = await client.execute("PRAGMA index_list('run_active_state')")
    expect(
      activeIndexes.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string" && name.startsWith("run_active_state_"))
        .sort(),
    ).toEqual(["run_active_state_session_change_position_idx", "run_active_state_user_session_idx"])

    const finalizedIndexes = await client.execute("PRAGMA index_list('run_finalized_detail')")
    expect(
      finalizedIndexes.rows
        .map((row) => row.name)
        .filter((name): name is string => typeof name === "string" && name.startsWith("run_finalized_detail_")),
    ).toEqual(["run_finalized_detail_session_idx"])
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})

test("the bounded history migration enforces source, position, and session ownership", async () => {
  const directoryPath = await mkdtemp(path.join(os.tmpdir(), "codeline-bounded-history-constraints."))
  const filePath = path.join(directoryPath, "db.sqlite")
  const client = createClient({ url: `file://${filePath}` })

  try {
    const result = await databaseMigrate(filePath)
    expect(result.success).toBe(true)
    await client.execute("PRAGMA foreign_keys = ON")
    await client.execute("INSERT INTO identity_user (id, display_name) VALUES ('history-user', 'History User')")
    await client.execute("INSERT INTO identity_user (id, display_name) VALUES ('other-user', 'Other User')")
    await client.execute(
      "INSERT INTO identity_organization (id, external_id, name) VALUES ('history-organization', 'history-organization', 'History Organization')",
    )
    await client.execute(
      "INSERT INTO server (id, organization_id, name, endpoint) VALUES ('history-server', 'history-organization', 'History Server', 'http://history.test')",
    )
    await client.execute(
      "INSERT INTO agent (id, server_id, name, role) VALUES ('history-agent', 'history-server', 'History Agent', 'coding')",
    )
    await client.execute(
      "INSERT INTO session (id, user_id, server_id, primary_agent_id, title, client_request_id) VALUES ('history-session', 'history-user', 'history-server', 'history-agent', 'History Session', 'history-request')",
    )

    const entryInsert =
      "INSERT INTO session_history_entry (id, user_id, session_id, kind, source_type, source_id, source_detail_id, position, change_position, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    await client.execute({
      sql: entryInsert,
      args: ["history-entry-1", "history-user", "history-session", "message", "message", "message-1", "", 1, 1, "{}"],
    })
    await expect(
      client.execute({
        sql: entryInsert,
        args: ["history-entry-2", "history-user", "history-session", "message", "message", "message-1", "", 2, 2, "{}"],
      }),
    ).rejects.toThrow()
    await expect(
      client.execute({
        sql: entryInsert,
        args: ["history-entry-2", "history-user", "history-session", "run", "run", "run-1", "", 1, 2, "{}"],
      }),
    ).rejects.toThrow()
    await expect(
      client.execute({
        sql: entryInsert,
        args: ["history-entry-3", "other-user", "history-session", "message", "message", "message-2", "", 2, 2, "{}"],
      }),
    ).rejects.toThrow()
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
