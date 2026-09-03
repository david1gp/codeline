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

const sessionCacheDatabaseSchemaContracts = [
  {
    indexes: [
      { keyPath: ["userId", "sessionId"], name: "by-session", unique: false },
      { keyPath: ["userId", "sessionId", "position"], name: "by-session-position", unique: true },
      { keyPath: ["userId", "storedAt"], name: "by-user-stored-at", unique: false },
    ],
    keyPath: ["userId", "sessionId", "entryId"],
    name: "historyEntries",
  },
  {
    indexes: [
      { keyPath: ["userId", "sessionId"], name: "by-session", unique: false },
      { keyPath: ["userId", "storedAt"], name: "by-user-stored-at", unique: false },
    ],
    keyPath: ["userId", "sessionId", "requestCursor"],
    name: "historyPages",
  },
  {
    indexes: [
      { keyPath: ["userId", "sessionId"], name: "by-session", unique: false },
      { keyPath: ["userId", "storedAt"], name: "by-user-stored-at", unique: false },
    ],
    keyPath: ["userId", "sessionId", "runId"],
    name: "runDetails",
  },
  {
    indexes: [
      { keyPath: "storedAt", name: "by-stored-at", unique: false },
      { keyPath: "userId", name: "by-user", unique: false },
      { keyPath: ["userId", "storedAt"], name: "by-user-stored-at", unique: false },
    ],
    keyPath: ["userId", "sessionId"],
    name: "sessionSnapshots",
  },
  {
    indexes: [
      { keyPath: ["userId", "sessionId", "runId"], name: "by-run", unique: false },
      { keyPath: ["userId", "sessionId"], name: "by-session", unique: false },
      { keyPath: ["userId", "storedAt"], name: "by-user-stored-at", unique: false },
    ],
    keyPath: ["userId", "sessionId", "runId", "detailId"],
    name: "toolDetails",
  },
] as const

function sessionCacheDatabaseNamesMatch(actualNames: readonly string[], expectedNames: readonly string[]): boolean {
  return actualNames.length === expectedNames.length && expectedNames.every((name) => actualNames.includes(name))
}

function sessionCacheDatabaseKeyPathsMatch(
  actualKeyPath: string | string[] | null,
  expectedKeyPath: string | readonly string[],
): boolean {
  return JSON.stringify(actualKeyPath) === JSON.stringify(expectedKeyPath)
}

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

    const expectedStoreNames = sessionCacheDatabaseSchemaContracts.map(({ name }) => name)
    const actualStoreNames = Array.from(database.objectStoreNames)
    if (!sessionCacheDatabaseNamesMatch(actualStoreNames, expectedStoreNames)) {
      database.close()
      return createResultError(op, "The session cache database schema is invalid.")
    }

    const transaction = database.transaction(expectedStoreNames, "readonly")
    const schemaIsValid = sessionCacheDatabaseSchemaContracts.every((storeContract) => {
      const store = transaction.objectStore(storeContract.name)
      const expectedIndexNames = storeContract.indexes.map(({ name }) => name)
      const actualIndexNames = Array.from(store.indexNames)
      if (
        !sessionCacheDatabaseKeyPathsMatch(store.keyPath, storeContract.keyPath) ||
        !sessionCacheDatabaseNamesMatch(actualIndexNames, expectedIndexNames)
      )
        return false

      return storeContract.indexes.every((indexContract) => {
        const index = store.index(indexContract.name as never)
        return (
          sessionCacheDatabaseKeyPathsMatch(index.keyPath, indexContract.keyPath) &&
          index.unique === indexContract.unique
        )
      })
    })
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
