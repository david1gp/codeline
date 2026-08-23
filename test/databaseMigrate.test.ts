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
  } finally {
    client.close()
    await rm(directoryPath, { recursive: true, force: true })
  }
})
