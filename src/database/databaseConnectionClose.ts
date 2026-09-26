import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseConnection } from "./databaseClient.js"

const closePromises = new WeakMap<DatabaseConnection, Promise<Result<void>>>()

export function databaseConnectionClose(connection: DatabaseConnection): Promise<Result<void>> {
  const existing = closePromises.get(connection)
  if (existing !== undefined) return existing

  const closePromise = Promise.resolve()
    .then(() => {
      const cleanupErrors: unknown[] = []

      try {
        for (const transaction of connection.transactionHandles ?? []) {
          try {
            if (transaction.closed !== true) transaction.close()
          } catch (error: unknown) {
            cleanupErrors.push(error)
          }
        }
      } finally {
        try {
          connection.client.close()
        } catch (error: unknown) {
          cleanupErrors.push(error)
        } finally {
          try {
            connection.transactionHandles?.clear()
          } catch (error: unknown) {
            cleanupErrors.push(error)
          }
        }
      }

      if (cleanupErrors.length > 0)
        return createResultError(
          "databaseConnectionClose",
          "The database client could not be closed.",
          cleanupErrors.map(databaseConnectionCleanupErrorDescribe).join("; "),
        )
      return createResult(undefined)
    })
    .catch(() => createResultError("databaseConnectionClose", "The database client could not be closed."))
  closePromises.set(connection, closePromise)
  return closePromise
}

function databaseConnectionCleanupErrorDescribe(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) return error.message
  return String(error)
}
