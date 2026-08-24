import { createResultError, type Result } from "@adaptive-ds/result"
import type { Client } from "@libsql/client"
import { drizzle } from "drizzle-orm/libsql"
import type { DatabaseClient, DatabaseConnection, DatabaseExecutor } from "./databaseClient.js"
import { databaseConnectionClose } from "./databaseConnectionClose.js"
import { databaseSchema } from "./databaseSchema.js"

export async function databaseReadTransactionRun<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseExecutor) => Promise<Result<T>>,
): Promise<Result<T>> {
  const op = "databaseReadTransactionRun"
  let transaction: Awaited<ReturnType<DatabaseClient["$client"]["transaction"]>> | undefined

  try {
    if (database.rootTransactionConnectionCreate !== undefined)
      return await databaseReadTransactionConnectionRun(database.rootTransactionConnectionCreate(), operation)

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

async function databaseReadTransactionConnectionRun<T>(
  connection: DatabaseConnection,
  operation: (transaction: DatabaseExecutor) => Promise<Result<T>>,
): Promise<Result<T>> {
  const op = "databaseReadTransactionRun"
  let transactionResult: Result<T> | undefined
  try {
    if (connection.transactionCreate === undefined) throw new Error("The read transaction could not be created.")
    const transactionHandle = await connection.transactionCreate("read")
    try {
      transactionResult = await operation(transactionHandle.transaction)
      await transactionHandle.commit()
    } catch (_error) {
      try {
        await transactionHandle.rollback()
      } catch (_rollbackError) {
        // The original transaction error is the useful result for callers.
      }
      transactionResult = createResultError(op, "The database read transaction failed.")
    } finally {
      try {
        transactionHandle.close()
      } catch (_closeError) {
        // The transaction result is the useful result for callers.
      }
    }
  } catch (_error) {
    transactionResult = createResultError(op, "The database read transaction failed.")
  }

  const cleanupResult = await databaseConnectionClose(connection)
  if (transactionResult?.success && !cleanupResult.success) return cleanupResult
  return transactionResult ?? createResultError(op, "The database read transaction failed.")
}
