import { createResultError, type Result } from "@adaptive-ds/result"
import { is } from "drizzle-orm"
import { LibSQLTransaction } from "drizzle-orm/libsql"
import type { DatabaseClient, DatabaseExecutor } from "./databaseClient.js"
import { databaseTransactionRun } from "./databaseTransactionRun.js"

export async function databaseExecutorTransactionRun<T>(
  database: DatabaseExecutor,
  operation: (executor: DatabaseExecutor) => Promise<Result<T>>,
): Promise<Result<T>> {
  if (is(database, LibSQLTransaction)) return await operation(database)

  const candidate = database as DatabaseClient
  if (typeof candidate.transaction !== "function") return await operation(database)

  try {
    return await databaseTransactionRun(candidate, operation)
  } catch (_error) {
    return createResultError("databaseExecutorTransactionRun", "The database transaction failed.")
  }
}
