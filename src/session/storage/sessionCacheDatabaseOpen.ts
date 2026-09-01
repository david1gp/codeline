import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { deleteDB, type IDBPDatabase, openDB } from "idb"
import * as v from "valibot"
import { sessionCacheDatabaseConfig } from "./sessionCacheDatabaseConfig.js"
import type { SessionCacheDatabaseSchema } from "./sessionCacheDatabaseSchema.js"
import { sessionCacheObsoleteDatabaseName } from "./sessionCacheObsoleteDatabaseName.js"
import { sessionCacheStorageFailureDescribe } from "./sessionCacheStorageFailureDescribe.js"

const sessionCacheDatabaseOpenInputSchema = v.strictObject({
  name: v.pipe(v.string(), v.trim(), v.minLength(1)),
  version: v.literal(sessionCacheDatabaseConfig.version),
})

const sessionCacheDatabaseStoreIndexes = [
  ["historyEntries", ["by-session", "by-session-position", "by-user-stored-at"]],
  ["historyPages", ["by-session", "by-user-stored-at"]],
  ["runDetails", ["by-session", "by-user-stored-at"]],
  ["sessionSnapshots", ["by-stored-at", "by-user", "by-user-stored-at"]],
  ["toolDetails", ["by-run", "by-session", "by-user-stored-at"]],
] as const

export async function sessionCacheDatabaseOpen(
  options: { name: string; version: number } = {
    name: sessionCacheDatabaseConfig.name,
    version: sessionCacheDatabaseConfig.version,
  },
): Promise<Result<IDBPDatabase<SessionCacheDatabaseSchema>>> {
  const op = "sessionCacheDatabaseOpen"
  const parsedOptions = v.safeParse(sessionCacheDatabaseOpenInputSchema, options)
  if (!parsedOptions.success) return createResultError(op, "The session cache database options are invalid.")

  try {
    await deleteDB(sessionCacheObsoleteDatabaseName)
    const database = await openDB<SessionCacheDatabaseSchema>(parsedOptions.output.name, parsedOptions.output.version, {
      upgrade(database, oldVersion) {
        if (oldVersion !== 0) throw new DOMException("Unexpected session cache schema version.", "VersionError")

        const snapshots = database.createObjectStore("sessionSnapshots", { keyPath: ["userId", "sessionId"] })
        snapshots.createIndex("by-user", "userId")
        snapshots.createIndex("by-user-stored-at", ["userId", "storedAt"])
        snapshots.createIndex("by-stored-at", "storedAt")

        const entries = database.createObjectStore("historyEntries", {
          keyPath: ["userId", "sessionId", "entryId"],
        })
        entries.createIndex("by-session", ["userId", "sessionId"])
        entries.createIndex("by-session-position", ["userId", "sessionId", "position"], { unique: true })
        entries.createIndex("by-user-stored-at", ["userId", "storedAt"])

        const pages = database.createObjectStore("historyPages", {
          keyPath: ["userId", "sessionId", "requestCursor"],
        })
        pages.createIndex("by-session", ["userId", "sessionId"])
        pages.createIndex("by-user-stored-at", ["userId", "storedAt"])

        const runs = database.createObjectStore("runDetails", { keyPath: ["userId", "sessionId", "runId"] })
        runs.createIndex("by-session", ["userId", "sessionId"])
        runs.createIndex("by-user-stored-at", ["userId", "storedAt"])

        const tools = database.createObjectStore("toolDetails", {
          keyPath: ["userId", "sessionId", "runId", "detailId"],
        })
        tools.createIndex("by-session", ["userId", "sessionId"])
        tools.createIndex("by-run", ["userId", "sessionId", "runId"])
        tools.createIndex("by-user-stored-at", ["userId", "storedAt"])
      },
    })

    for (const [storeName] of sessionCacheDatabaseStoreIndexes) {
      if (!database.objectStoreNames.contains(storeName)) {
        database.close()
        return createResultError(op, "The session cache database schema is invalid.")
      }
    }

    const transaction = database.transaction(
      ["sessionSnapshots", "historyEntries", "historyPages", "runDetails", "toolDetails"],
      "readonly",
    )
    const snapshots = transaction.objectStore("sessionSnapshots")
    const entries = transaction.objectStore("historyEntries")
    const pages = transaction.objectStore("historyPages")
    const runs = transaction.objectStore("runDetails")
    const tools = transaction.objectStore("toolDetails")
    const expectedIndexesPresent = sessionCacheDatabaseStoreIndexes.every(([storeName, indexNames]) => {
      const actualIndexNames: readonly string[] = Array.from(transaction.objectStore(storeName).indexNames)
      return indexNames.every((indexName) => actualIndexNames.includes(indexName))
    })
    const schemaIsValid =
      expectedIndexesPresent &&
      JSON.stringify(snapshots.keyPath) === JSON.stringify(["userId", "sessionId"]) &&
      JSON.stringify(entries.keyPath) === JSON.stringify(["userId", "sessionId", "entryId"]) &&
      JSON.stringify(pages.keyPath) === JSON.stringify(["userId", "sessionId", "requestCursor"]) &&
      JSON.stringify(runs.keyPath) === JSON.stringify(["userId", "sessionId", "runId"]) &&
      JSON.stringify(tools.keyPath) === JSON.stringify(["userId", "sessionId", "runId", "detailId"]) &&
      JSON.stringify(snapshots.index("by-user").keyPath) === JSON.stringify("userId") &&
      JSON.stringify(snapshots.index("by-user-stored-at").keyPath) === JSON.stringify(["userId", "storedAt"]) &&
      JSON.stringify(snapshots.index("by-stored-at").keyPath) === JSON.stringify("storedAt") &&
      JSON.stringify(entries.index("by-session").keyPath) === JSON.stringify(["userId", "sessionId"]) &&
      JSON.stringify(entries.index("by-session-position").keyPath) ===
        JSON.stringify(["userId", "sessionId", "position"]) &&
      entries.index("by-session-position").unique &&
      JSON.stringify(entries.index("by-user-stored-at").keyPath) === JSON.stringify(["userId", "storedAt"]) &&
      JSON.stringify(pages.index("by-session").keyPath) === JSON.stringify(["userId", "sessionId"]) &&
      JSON.stringify(pages.index("by-user-stored-at").keyPath) === JSON.stringify(["userId", "storedAt"]) &&
      JSON.stringify(runs.index("by-session").keyPath) === JSON.stringify(["userId", "sessionId"]) &&
      JSON.stringify(runs.index("by-user-stored-at").keyPath) === JSON.stringify(["userId", "storedAt"]) &&
      JSON.stringify(tools.index("by-session").keyPath) === JSON.stringify(["userId", "sessionId"]) &&
      JSON.stringify(tools.index("by-run").keyPath) === JSON.stringify(["userId", "sessionId", "runId"]) &&
      JSON.stringify(tools.index("by-user-stored-at").keyPath) === JSON.stringify(["userId", "storedAt"])
    await transaction.done
    if (!schemaIsValid) {
      database.close()
      return createResultError(op, "The session cache database schema is invalid.")
    }

    return createResult(database)
  } catch (error) {
    const failure = sessionCacheStorageFailureDescribe(error)
    if (failure.kind === "quota") return createResultError(op, "The session cache storage quota was exceeded.")
    if (failure.kind === "schema") return createResultError(op, "The session cache database schema is invalid.")
    if (failure.kind === "transaction") return createResultError(op, "The session cache database transaction failed.")
    return createResultError(op, "The session cache database could not be opened.")
  }
}
