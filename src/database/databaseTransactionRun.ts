import { createResultError, type Result, type ResultErr } from "@adaptive-ds/result"
import type { DatabaseClient, DatabaseTransaction } from "./databaseClient.js"

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

  try {
    return await database.transaction(async (transaction) => {
      const result = await operation(transaction)
      if (!result.success) throw new DatabaseTransactionRollback(result)
      return result
    })
  } catch (error: unknown) {
    if (error instanceof DatabaseTransactionRollback) return error.result
    return createResultError(op, "The database transaction failed.")
  }
}
