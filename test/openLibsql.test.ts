import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sql } from "drizzle-orm"
import { openLibsql } from "../src/database/openLibsql.js"

test("openLibsql applies the Gruppenplan SQLite PRAGMAs", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codeline-open-libsql-"))
  const database = openLibsql(path.join(directory, "db.sqlite"))

  try {
    const pragmaValues = await Promise.all([
      database.get<{ value: unknown }>(sql`pragma journal_mode`),
      database.get<{ value: unknown }>(sql`pragma synchronous`),
      database.get<{ value: unknown }>(sql`pragma temp_store`),
      database.get<{ value: unknown }>(sql`pragma busy_timeout`),
      database.get<{ value: unknown }>(sql`pragma legacy_alter_table`),
      database.get<{ value: unknown }>(sql`pragma mmap_size`),
      database.get<{ value: unknown }>(sql`pragma journal_size_limit`),
      database.get<{ value: unknown }>(sql`pragma cache_size`),
    ])

    expect(pragmaValues.map((value) => Object.values(value ?? {})[0])).toEqual([
      "wal",
      1,
      2,
      5000,
      0,
      134217728,
      27103364,
      2000,
    ])
  } finally {
    database.$client.close()
    await rm(directory, { recursive: true, force: true })
  }
})
