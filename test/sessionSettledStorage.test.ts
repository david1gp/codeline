import "fake-indexeddb/auto"
import { afterEach, expect, test } from "bun:test"
import { deleteDB, type IDBPDatabase } from "idb"
import type { SessionSettledRecord } from "../src/session/schema/sessionSettledRecordSchema.js"
import { sessionSettledDatabaseOpen } from "../src/session/storage/sessionSettledDatabaseOpen.js"
import type { SessionSettledDatabaseSchema } from "../src/session/storage/sessionSettledDatabaseSchema.js"
import { sessionSettledRecordDelete } from "../src/session/storage/sessionSettledRecordDelete.js"
import { sessionSettledRecordIndex } from "../src/session/storage/sessionSettledRecordIndex.js"
import { sessionSettledRecordRead } from "../src/session/storage/sessionSettledRecordRead.js"
import { sessionSettledRecordWrite } from "../src/session/storage/sessionSettledRecordWrite.js"

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => deleteDB(name)))
})

function recordCreate(
  userId: string,
  sessionId: string,
  revision = 1,
  updatedAt = "2026-08-23T00:00:00.000Z",
): SessionSettledRecord {
  return {
    asOfSequence: revision,
    etag: `"${sessionId}-${revision}"`,
    payload: {
      messages: [],
      session: {
        archivedAt: null,
        createdAt: "2026-08-23T00:00:00.000Z",
        id: sessionId,
        metadata: {},
        parentSessionId: null,
        pinned: false,
        primaryAgentId: "agent",
        projectPath: "/workspace",
        revision,
        serverId: "server",
        title: `${sessionId}-${revision}`,
        updatedAt,
      },
      settled: true,
    },
    revision,
    schemaVersion: "session.v2",
    sessionId,
    userId,
  }
}

async function databaseCreate(): Promise<IDBPDatabase<SessionSettledDatabaseSchema>> {
  const name = `settled-session-${crypto.randomUUID()}`
  databaseNames.push(name)
  const opened = await sessionSettledDatabaseOpen({ name, version: 1 })
  expect(opened.success).toBe(true)
  if (!opened.success) throw new Error(opened.errorMessage)
  return opened.data
}

test("opens the versioned database with the account index", async () => {
  const database = await databaseCreate()
  const store = database.transaction("settledSessions").store

  expect(database.version).toBe(1)
  expect(database.objectStoreNames.contains("settledSessions")).toBe(true)
  expect(store.indexNames.contains("by-user")).toBe(true)
  database.close()
})

test("upgrades the database with the settled-session age index", async () => {
  const database = await databaseCreate()
  database.close()

  const upgraded = await sessionSettledDatabaseOpen({ name: databaseNames[0] as string, version: 2 })
  expect(upgraded.success).toBe(true)
  if (!upgraded.success) return
  expect(upgraded.data.version).toBe(2)
  expect(upgraded.data.transaction("settledSessions").store.indexNames.contains("by-user-updated-at")).toBe(true)
  upgraded.data.close()
})

test("reads, indexes, deletes, and retains account-namespaced records", async () => {
  const database = await databaseCreate()
  const first = recordCreate("user-a", "session-a")
  const second = recordCreate("user-a", "session-b")
  const other = recordCreate("user-b", "session-a")

  expect((await sessionSettledRecordWrite(database, first)).success).toBe(true)
  expect((await sessionSettledRecordWrite(database, second)).success).toBe(true)
  expect((await sessionSettledRecordWrite(database, other)).success).toBe(true)

  const ownRecords = await sessionSettledRecordIndex(database, { userId: "user-a" })
  expect(ownRecords).toEqual({ success: true, data: [first, second] })
  const otherAccountRead = await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-b" })
  expect(otherAccountRead).toEqual({ success: true, data: other })
  const missing = await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-c" })
  expect(missing).toEqual({ success: true, data: undefined })

  expect((await sessionSettledRecordDelete(database, { sessionId: "session-a", userId: "user-a" })).success).toBe(true)
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })

  database.close()
  const reopened = await sessionSettledDatabaseOpen({ name: databaseNames[0] as string, version: 1 })
  expect(reopened.success).toBe(true)
  if (!reopened.success) return
  expect(await sessionSettledRecordRead(reopened.data, { sessionId: "session-b", userId: "user-a" })).toEqual({
    success: true,
    data: second,
  })
  reopened.data.close()
})

test("deletes corrupt records encountered by reads and indexes", async () => {
  const database = await databaseCreate()
  const valid = recordCreate("user-a", "session-valid")
  await sessionSettledRecordWrite(database, valid)
  await database.put("settledSessions", { sessionId: "session-read-corrupt", userId: "user-a" } as never)
  await database.put("settledSessions", { sessionId: "session-index-corrupt", userId: "user-a" } as never)

  const read = await sessionSettledRecordRead(database, { sessionId: "session-read-corrupt", userId: "user-a" })
  expect(read.success).toBe(false)
  expect(await sessionSettledRecordRead(database, { sessionId: "session-read-corrupt", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })

  const indexed = await sessionSettledRecordIndex(database, { userId: "user-a" })
  expect(indexed).toEqual({ success: true, data: [valid] })
  expect(await sessionSettledRecordRead(database, { sessionId: "session-index-corrupt", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  database.close()
})

test("replaces complete records atomically and preserves the previous record on failure", async () => {
  const database = await databaseCreate()
  const initial = recordCreate("user-a", "session-a", 1)
  const replacement = recordCreate("user-a", "session-a", 2)
  expect((await sessionSettledRecordWrite(database, initial)).success).toBe(true)
  expect((await sessionSettledRecordWrite(database, replacement)).success).toBe(true)
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: replacement,
  })

  const invalid = { ...recordCreate("user-a", "session-a", 3), payload: undefined } as never
  expect((await sessionSettledRecordWrite(database, invalid)).success).toBe(false)
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: replacement,
  })

  database.close()
  const failedWrite = await sessionSettledRecordWrite(database, recordCreate("user-a", "session-a", 3))
  expect(failedWrite.success).toBe(false)
  const reopened = await sessionSettledDatabaseOpen({ name: databaseNames[0] as string, version: 1 })
  expect(reopened.success).toBe(true)
  if (!reopened.success) return
  expect(await sessionSettledRecordRead(reopened.data, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: replacement,
  })
  reopened.data.close()
})

test("evicts the oldest account record after a quota failure", async () => {
  const database = await databaseCreate()
  const oldest = recordCreate("user-a", "session-oldest", 1, "2026-08-20T00:00:00.000Z")
  const newest = recordCreate("user-a", "session-newest", 2, "2026-08-22T00:00:00.000Z")
  const otherAccount = recordCreate("user-b", "session-other-account", 1, "2026-08-19T00:00:00.000Z")
  const replacement = recordCreate("user-a", "session-replacement", 1, "2026-08-23T00:00:00.000Z")
  await sessionSettledRecordWrite(database, oldest)
  await sessionSettledRecordWrite(database, newest)
  await sessionSettledRecordWrite(database, otherAccount)

  const originalPut = IDBObjectStore.prototype.put
  let quotaFailures = 1
  IDBObjectStore.prototype.put = function (...args) {
    if (quotaFailures > 0) {
      quotaFailures -= 1
      throw new DOMException("The storage quota was exceeded.", "QuotaExceededError")
    }
    return originalPut.apply(this, args)
  }
  try {
    expect(await sessionSettledRecordWrite(database, replacement)).toEqual({ success: true, data: undefined })
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }

  expect(await sessionSettledRecordRead(database, { userId: "user-a", sessionId: "session-oldest" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionSettledRecordRead(database, { userId: "user-a", sessionId: "session-newest" })).toEqual({
    success: true,
    data: newest,
  })
  expect(await sessionSettledRecordRead(database, { userId: "user-a", sessionId: "session-replacement" })).toEqual({
    success: true,
    data: replacement,
  })
  expect(await sessionSettledRecordRead(database, { userId: "user-b", sessionId: "session-other-account" })).toEqual({
    success: true,
    data: otherAccount,
  })
  database.close()
})

test("retains the previous complete record when quota eviction cannot replace it", async () => {
  const database = await databaseCreate()
  const previous = recordCreate("user-a", "session-target", 1, "2026-08-21T00:00:00.000Z")
  const other = recordCreate("user-a", "session-other", 1, "2026-08-20T00:00:00.000Z")
  const replacement = recordCreate("user-a", "session-target", 2, "2026-08-23T00:00:00.000Z")
  await sessionSettledRecordWrite(database, previous)
  await sessionSettledRecordWrite(database, other)

  const originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = (..._args) => {
    throw new DOMException("The storage quota was exceeded.", "QuotaExceededError")
  }
  let result: Awaited<ReturnType<typeof sessionSettledRecordWrite>> | undefined
  try {
    result = await sessionSettledRecordWrite(database, replacement)
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }

  expect(result).toEqual({
    success: false,
    op: "sessionSettledRecordWrite",
    errorMessage: "The settled-session storage quota was exceeded.",
  })
  expect(await sessionSettledRecordRead(database, { userId: "user-a", sessionId: "session-target" })).toEqual({
    success: true,
    data: previous,
  })
  database.close()
})

test("returns Result errors for expected database failures", async () => {
  const invalidOpen = await sessionSettledDatabaseOpen({ name: `invalid-${crypto.randomUUID()}`, version: 0 })
  expect(invalidOpen.success).toBe(false)
})
