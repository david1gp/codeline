import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { type IDBPDatabase, openDB } from "idb"
import * as v from "valibot"
import type { SessionSettledDatabaseSchema } from "./sessionSettledDatabaseSchema.js"
import { sessionSettledStorageFailureDescribe } from "./sessionSettledStorageFailureDescribe.js"

const sessionSettledDatabaseOpenInputSchema = v.strictObject({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  version: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(2)),
})

export async function sessionSettledDatabaseOpen(options: {
  name: string
  version: number
}): Promise<Result<IDBPDatabase<SessionSettledDatabaseSchema>>> {
  const op = "sessionSettledDatabaseOpen"
  const parsedOptions = v.safeParse(sessionSettledDatabaseOpenInputSchema, options)
  if (!parsedOptions.success) return createResultError(op, "The settled-session database options are invalid.")

  try {
    const database = await openDB<SessionSettledDatabaseSchema>(
      parsedOptions.output.name,
      parsedOptions.output.version,
      {
        upgrade(database, oldVersion, newVersion, transaction) {
          const store =
            oldVersion < 1
              ? database.createObjectStore("settledSessions", { keyPath: ["userId", "sessionId"] })
              : transaction.objectStore("settledSessions")

          if (oldVersion < 1) store.createIndex("by-user", "userId", { unique: false })
          if (oldVersion < 2 && (newVersion ?? 0) >= 2 && !store.indexNames.contains("by-user-updated-at")) {
            store.createIndex("by-user-updated-at", ["userId", "payload.session.updatedAt"], { unique: false })
          }
        },
      },
    )

    if (!database.objectStoreNames.contains("settledSessions")) {
      database.close()
      return createResultError(op, "The settled-session database schema is invalid.")
    }

    const transaction = database.transaction("settledSessions", "readonly")
    if (!transaction.store.indexNames.contains("by-user")) {
      database.close()
      return createResultError(op, "The settled-session database schema is invalid.")
    }
    if (database.version >= 2 && !transaction.store.indexNames.contains("by-user-updated-at")) {
      database.close()
      return createResultError(op, "The settled-session database schema is invalid.")
    }
    await transaction.done
    return createResult(database)
  } catch (error) {
    const failure = sessionSettledStorageFailureDescribe(error)
    if (failure.kind === "quota") return createResultError(op, "The settled-session storage quota was exceeded.")
    if (failure.kind === "schema") return createResultError(op, "The settled-session database schema is invalid.")
    if (failure.kind === "transaction") return createResultError(op, "The settled-session database transaction failed.")
    return createResultError(op, "The settled-session database could not be opened.")
  }
}
