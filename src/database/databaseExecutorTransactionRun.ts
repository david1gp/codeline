import { createResultError, type Result } from "@adaptive-ds/result"
import { is } from "drizzle-orm"
import { PgTransaction } from "drizzle-orm/pg-core"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"

export async function databaseExecutorTransactionRun<T>(
  database: DatabaseExecutor,
  operation: (executor: DatabaseExecutor) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (is(database, PgTransaction)) return operation(database)

  const candidate = database as DatabaseClient
  if (typeof candidate.transaction !== "function") return operation(database)

  try {
    return await databaseTransactionRun(candidate, operation)
  } catch (_error) {
    return createResultError("databaseExecutorTransactionRun", "The database transaction failed.")
  }
}
