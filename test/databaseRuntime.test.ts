import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { sql } from "drizzle-orm"
import type { DatabaseClient } from "../src/database/databaseClient.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { openLibsql } from "../src/database/openLibsql.js"

test("the SQLite runtime is ready and persists data across connection restarts", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codeline-database-runtime-"))
  const filePath = path.join(directory, "db.sqlite")
  const database = openLibsql(filePath)
  let reopened: ReturnType<typeof openLibsql> | undefined

  try {
    const ready = await databaseReadyCheck(database as unknown as DatabaseClient)
    expect(ready.success).toBe(true)

    await database.run(sql`create table runtime_probe (value text not null)`)
    await database.run(sql`insert into runtime_probe (value) values ('persisted')`)

    const connection = {
      client: database.$client,
      db: database as unknown as DatabaseClient,
    }
    const firstClose = databaseConnectionClose(connection)
    const secondClose = databaseConnectionClose(connection)
    expect(firstClose).toBe(secondClose)
    expect((await firstClose).success).toBe(true)

    reopened = openLibsql(filePath)
    const row = await reopened.get<{ value: string }>(sql`select value from runtime_probe`)
    expect(row?.value).toBe("persisted")
  } finally {
    reopened?.$client.close()
    database.$client.close()
    await rm(directory, { recursive: true, force: true })
  }
})
