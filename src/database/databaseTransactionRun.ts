import { createResultError, type Result, type ResultErr } from "@adaptive-ds/result"
import type { DatabaseClient, DatabaseTransaction } from "./databaseClient.js"

class DatabaseTransactionRollback extends Error {
  readonly result: ResultErr

  constructor(result: ResultErr) {
    super(result.errorMessage)
    this.result = result
  }
}

// The local @libsql/client starts transactions on synchronous native connections.
// A concurrent BEGIN IMMEDIATE can block the event loop before the active callback
// can commit, so root transactions are serialized within this API process.
const databaseTransactionQueues = new WeakMap<DatabaseClient, Promise<void>>()

export async function databaseTransactionRun<T>(
  database: DatabaseClient,
  operation: (transaction: DatabaseTransaction) => Promise<Result<T>>,
): Promise<Result<T>> {
  const op = "databaseTransactionRun"
  const previousTransaction = databaseTransactionQueues.get(database) ?? Promise.resolve()
  let releaseTransaction: () => void = () => undefined
  const currentTransaction = new Promise<void>((resolve) => {
    releaseTransaction = resolve
  })
  const queuedTransaction = previousTransaction.then(
    () => currentTransaction,
    () => currentTransaction,
  )
  databaseTransactionQueues.set(database, queuedTransaction)
  await previousTransaction.catch(() => undefined)

  try {
    // LibSQLSession delegates to client.transaction(), whose libSQL default is a
    // write transaction (BEGIN IMMEDIATE). Keep the SQLite intent explicit here;
    // the current adapter does not forward SQLiteTransactionConfig to the client.
    return await database.transaction(
      async (transaction) => {
        const result = await operation(transaction)
        if (!result.success) throw new DatabaseTransactionRollback(result)
        return result
      },
      { behavior: "immediate" },
    )
  } catch (error: unknown) {
    if (error instanceof DatabaseTransactionRollback) return error.result
    return createResultError(op, "The database transaction failed.")
  } finally {
    releaseTransaction()
    if (databaseTransactionQueues.get(database) === queuedTransaction) databaseTransactionQueues.delete(database)
  }
}
