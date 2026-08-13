import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import type { DatabaseConnection } from "./databaseClient.js"

const closePromises = new WeakMap<DatabaseConnection, Promise<Result<void>>>()

export function databaseConnectionClose(connection: DatabaseConnection): Promise<Result<void>> {
  const existing = closePromises.get(connection)
  if (existing !== undefined) return existing

  const closePromise = Promise.resolve()
    .then(() => connection.client.end())
    .then(() => createResult(undefined))
    .catch(() => createResultError("databaseConnectionClose", "The database client could not be closed."))
  closePromises.set(connection, closePromise)
  return closePromise
}
