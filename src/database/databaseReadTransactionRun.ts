import { createResultError, type Result } from "@adaptive-ds/result"
import type { Client } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import type { DatabaseClient } from "./databaseClient.js"
import { databaseSchema } from "./databaseSchema.js"

export async function databaseReadTransactionRun<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseClient) => Promise<Result<T>>,
): Promise<Result<T>> {
  const op = "databaseReadTransactionRun"
  let transaction: Awaited<ReturnType<DatabaseClient["$client"]["transaction"]>> | undefined

  try {
    transaction = await database.$client.transaction("read")
    const transactionDatabase = drizzle(transaction as unknown as Client, { schema: databaseSchema })
    const result = await operation(transactionDatabase)
    await transaction.commit()
    return result
  } catch (_error) {
    try {
      await transaction?.rollback()
    } catch (_rollbackError) {
      // The original transaction error is the useful result for callers.
    }
    return createResultError(op, "The database read transaction failed.")
  }
}
