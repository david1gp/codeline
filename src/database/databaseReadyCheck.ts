import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { sql } from "drizzle-orm"
import type { DatabaseClient } from "./databaseClient.js"

export async function databaseReadyCheck(database: DatabaseClient): Promise<Result<void>> {
  const op = "databaseReadyCheck"

  try {
    await database.get(sql`select 1`)
    return createResult(undefined)
  } catch (_error) {
    return createResultError(op, "The database is not ready.")
  }
}
