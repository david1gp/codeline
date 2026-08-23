import { fileURLToPath } from "node:url"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { migrate } from "drizzle-orm/libsql/migrator"
import { databasePath } from "./databasePath.js"
import { openLibsql } from "./openLibsql.js"

const migrationsFolder = fileURLToPath(new URL("./migrations", import.meta.url))

export async function databaseMigrate(filePath = databasePath): Promise<Result<void>> {
  const op = "databaseMigrate"
  let database: ReturnType<typeof openLibsql> | undefined
  let result: Result<void>

  try {
    database = openLibsql(filePath)
    await migrate(database, { migrationsFolder })
    result = createResult(undefined)
  } catch (_error) {
    result = createResultError(op, "The database migrations could not be applied.")
  }

  if (database !== undefined) {
    try {
      database.$client.close()
    } catch (_error) {
      return createResultError(op, "The database client could not be closed.")
    }
  }

  return result
}
