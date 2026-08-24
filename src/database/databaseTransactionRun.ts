import { createResultError, type Result, type ResultErr } from "@adaptive-ds/result"
import { sql } from "drizzle-orm"
import type {
  DatabaseClient,
  DatabaseConnection,
  DatabaseTransaction,
  DatabaseTransactionHandle,
} from "./databaseClient.js"
import { databaseConnectionClose } from "./databaseConnectionClose.js"

class DatabaseTransactionRollback extends Error {
  readonly result: ResultErr

  constructor(result: ResultErr) {
    super(result.errorMessage)
    this.result = result
  }
}

export async function databaseTransactionRun<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseTransaction) => Promise<Result<T>>,
): Promise<Result<T>> {
  const op = "databaseTransactionRun"
  const busyTimeoutMilliseconds = 5_000

  let connection: DatabaseConnection | undefined
  let transactionResult: Result<T> | undefined
  try {
    const acquired = database.rootTransactionConnectionCreate
      ? await databaseTransactionConnectionAcquire(database, busyTimeoutMilliseconds)
      : undefined
    connection = acquired?.connection
    const transactionDatabase = acquired?.connection.db ?? database

    if (acquired?.transactionHandle !== undefined) {
      const transactionHandle = acquired.transactionHandle

      try {
        await transactionHandle.transaction.run(sql.raw(`pragma busy_timeout = ${busyTimeoutMilliseconds}`))
        const result = await operation(transactionHandle.transaction)
        if (!result.success) throw new DatabaseTransactionRollback(result)
        await transactionHandle.commit()
        transactionResult = result
      } catch (error: unknown) {
        try {
          await transactionHandle.rollback()
        } catch (_rollbackError) {
          // The original transaction error is the useful result for callers.
        }
        transactionResult =
          error instanceof DatabaseTransactionRollback
            ? error.result
            : createResultError(op, "The database transaction failed.")
      } finally {
        try {
          transactionHandle.close()
        } catch (_closeError) {
          // The transaction result is the useful result for callers.
        }
      }
    }

    if (acquired?.transactionHandle === undefined) {
      if (connection === undefined && database.$client !== undefined)
        await database.$client.execute("PRAGMA busy_timeout = 0")

      transactionResult = await transactionDatabase.transaction(
        async (transaction) => {
          if (connection !== undefined || database.$client !== undefined)
            await transaction.run(sql.raw(`pragma busy_timeout = ${busyTimeoutMilliseconds}`))
          const result = await operation(transaction)
          if (!result.success) throw new DatabaseTransactionRollback(result)
          return result
        },
        { behavior: "immediate" },
      )
    }
  } catch (error: unknown) {
    transactionResult =
      error instanceof DatabaseTransactionRollback
        ? error.result
        : createResultError(op, "The database transaction failed.")
  }

  if (connection !== undefined) {
    const cleanupResult = await databaseConnectionClose(connection)
    if (transactionResult?.success && !cleanupResult.success) return cleanupResult
  }

  return transactionResult ?? createResultError(op, "The database transaction failed.")
}

async function databaseTransactionConnectionAcquire(
  database: DatabaseClient,
  timeoutMilliseconds: number,
): Promise<{ connection: DatabaseConnection; transactionHandle?: DatabaseTransactionHandle }> {
  const startedAt = Date.now()

  while (true) {
    const connection = database.rootTransactionConnectionCreate?.()
    if (connection === undefined) throw new Error("The root transaction connection could not be created.")

    try {
      await connection.client.execute("PRAGMA busy_timeout = 0")
    } catch (error: unknown) {
      await databaseConnectionClose(connection)
      throw error
    }

    if (connection.transactionCreate === undefined) return { connection }

    try {
      const transactionHandle = await connection.transactionCreate()
      return { connection, transactionHandle }
    } catch (error: unknown) {
      await databaseConnectionClose(connection)
      if (!databaseTransactionBusy(error) || Date.now() - startedAt >= timeoutMilliseconds) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, 1))
    }
  }
}

function databaseTransactionBusy(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("code" in error)) return false
  const code = error.code
  return code === "SQLITE_BUSY" || code === "SQLITE_LOCKED"
}
