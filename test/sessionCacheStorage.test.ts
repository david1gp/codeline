import "fake-indexeddb/auto"
import { afterEach, expect, test } from "bun:test"
import { deleteDB, type IDBPDatabase, openDB } from "idb"
import type { RunDetailResponse } from "../src/run/api/runDetailResponseSchema.js"
import type { RunToolDetailResponse } from "../src/run/api/runToolDetailResponseSchema.js"
import type { SessionBoundedHistoryPage } from "../src/session/api/sessionBoundedHistoryPageSchema.js"
import type { SessionBoundedSnapshot } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import {
  type SessionCacheLimits,
  sessionCacheDatabaseConfig,
} from "../src/session/storage/sessionCacheDatabaseConfig.js"
import { sessionCacheDatabaseOpen } from "../src/session/storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../src/session/storage/sessionCacheDatabaseSchema.js"
import { sessionCacheHistoryPageRead } from "../src/session/storage/sessionCacheHistoryPageRead.js"
import { sessionCacheHistoryPageWrite } from "../src/session/storage/sessionCacheHistoryPageWrite.js"
import { sessionCacheObsoleteDatabaseName } from "../src/session/storage/sessionCacheObsoleteDatabaseName.js"
import { sessionCacheRunDetailRead } from "../src/session/storage/sessionCacheRunDetailRead.js"
import { sessionCacheRunDetailWrite } from "../src/session/storage/sessionCacheRunDetailWrite.js"
import { sessionCacheSnapshotRead } from "../src/session/storage/sessionCacheSnapshotRead.js"
import { sessionCacheSnapshotReplace } from "../src/session/storage/sessionCacheSnapshotReplace.js"
import { sessionCacheToolDetailRead } from "../src/session/storage/sessionCacheToolDetailRead.js"
import { sessionCacheToolDetailWrite } from "../src/session/storage/sessionCacheToolDetailWrite.js"

const databaseNames: string[] = []

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await deleteDB(name)
})

async function databaseCreate(): Promise<IDBPDatabase<SessionCacheDatabaseSchema>> {
  const name = `session-cache-${crypto.randomUUID()}`
  databaseNames.push(name)
  const opened = await sessionCacheDatabaseOpen({ name, version: 1 })
  if (!opened.success) throw new Error(opened.errorMessage)
  return opened.data
}

type SessionCacheSchemaMutation =
  | { kind: "extra-index"; storeName: string }
  | { kind: "extra-store" }
  | { kind: "missing-store"; storeName: string }
  | { kind: "missing-store-key-path"; storeName: string }
  | { kind: "wrong-store-key-path"; storeName: string }
  | { kind: "missing-index"; indexName: string; storeName: string }
  | { kind: "wrong-index-key-path"; indexName: string; storeName: string }
  | { kind: "wrong-index-unique"; indexName: string; storeName: string }

type SessionCacheSchemaContract = {
  indexes: Array<{ keyPath: string | string[]; name: string; unique: boolean }>
  keyPath: string | string[]
  name: string
}

const sessionCacheSchemaContracts: SessionCacheSchemaContract[] = [
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
]

async function malformedDatabaseCreate(mutation: SessionCacheSchemaMutation): Promise<string> {
  const name = `session-cache-malformed-${crypto.randomUUID()}`
  databaseNames.push(name)
  const database = await openDB(name, 1, {
    upgrade(database) {
      for (const storeContract of sessionCacheSchemaContracts) {
        if (mutation.kind === "missing-store" && mutation.storeName === storeContract.name) continue

        const missingKeyPath = mutation.kind === "missing-store-key-path" && mutation.storeName === storeContract.name
        const keyPath =
          mutation.kind === "wrong-store-key-path" && mutation.storeName === storeContract.name
            ? ["unexpectedStoreKeyPath"]
            : storeContract.keyPath
        const store = missingKeyPath
          ? database.createObjectStore(storeContract.name)
          : database.createObjectStore(storeContract.name, { keyPath })

        for (const indexContract of storeContract.indexes) {
          if (
            mutation.kind === "missing-index" &&
            mutation.storeName === storeContract.name &&
            mutation.indexName === indexContract.name
          )
            continue

          const keyPath =
            mutation.kind === "wrong-index-key-path" &&
            mutation.storeName === storeContract.name &&
            mutation.indexName === indexContract.name
              ? ["unexpectedIndexKeyPath"]
              : indexContract.keyPath
          const unique =
            mutation.kind === "wrong-index-unique" &&
            mutation.storeName === storeContract.name &&
            mutation.indexName === indexContract.name
              ? !indexContract.unique
              : indexContract.unique
          store.createIndex(indexContract.name, keyPath, { unique })
        }

        if (mutation.kind === "extra-index" && mutation.storeName === storeContract.name)
          store.createIndex("unexpected-index", "unexpectedIndexKeyPath")
      }

      if (mutation.kind === "extra-store") database.createObjectStore("unexpected-store")
    },
  })
  database.close()
  return name
}

async function malformedSchemaAssertRejected(mutation: SessionCacheSchemaMutation): Promise<void> {
  const name = await malformedDatabaseCreate(mutation)
  const opened = await sessionCacheDatabaseOpen({ name, version: 1 })
  expect(opened.success).toBe(false)
  if (!opened.success) expect(opened.errorMessage).toBe("The session cache database schema is invalid.")
  if (opened.success) opened.data.close()
}

function stepCreate(sequence: number) {
  return {
    id: `entry-${sequence}`,
    kind: "message" as const,
    role: sequence % 2 === 0 ? ("assistant" as const) : ("user" as const),
    sequence,
    summary: `Entry ${sequence}`,
  }
}

function snapshotCreate(
  sessionId: string,
  positions: number[],
  options?: { olderCursor?: string | null; title?: string },
) {
  const olderCursor = options?.olderCursor === undefined ? null : options.olderCursor
  return {
    detailCursor: `detail-${sessionId}-${Math.max(0, ...positions)}`,
    hasMore: olderCursor !== null,
    latestAnswer: null,
    olderCursor,
    semanticSteps: positions.map(stepCreate),
    session: {
      id: sessionId,
      pinned: false,
      projectPath: "/workspace",
      revision: 1,
      title: options?.title ?? sessionId,
    },
    state: { input: null, run: null },
    throughPosition: Math.max(0, ...positions),
  } satisfies SessionBoundedSnapshot
}

function pageCreate(positions: number[], nextCursor: string | null, throughPosition: number) {
  return {
    hasMore: nextCursor !== null,
    nextCursor,
    semanticSteps: positions.map(stepCreate),
    throughPosition,
  } satisfies SessionBoundedHistoryPage
}

function runDetailCreate(sessionId: string, runId: string): RunDetailResponse {
  return {
    detail: {
      run: { cancellationKind: null, failure: null, id: runId, sessionId, status: "succeeded" },
      tools: [],
      transcript: {
        activities: [],
        assistantText: "Final answer",
        attempts: [{ ordinal: 1, status: "succeeded" }],
        cancellation: null,
        failure: null,
        invariantViolations: [],
        terminalOutcome: { status: "completed" },
      },
    },
    kind: "finalized",
  }
}

function toolDetailCreate(
  sessionId: string,
  runId: string,
  detailId: string,
): Extract<RunToolDetailResponse, { kind: "finalized" }> {
  return {
    detail: {
      runId,
      sessionId,
      tool: { detailId, sequence: 1, toolCallId: "call-1", toolName: "read" },
    },
    kind: "finalized",
  }
}

function limitsCreate(overrides: Partial<SessionCacheLimits>): SessionCacheLimits {
  return { ...sessionCacheDatabaseConfig.limits, ...overrides }
}

test("creates the new schema generation with account and session compound keys and indexes", async () => {
  const database = await databaseCreate()

  expect(database.version).toBe(1)
  expect(Array.from(database.objectStoreNames)).toEqual([
    "historyEntries",
    "historyPages",
    "runDetails",
    "sessionSnapshots",
    "toolDetails",
  ])
  const transaction = database.transaction(
    ["sessionSnapshots", "historyEntries", "historyPages", "runDetails", "toolDetails"],
    "readonly",
  )
  expect(transaction.objectStore("sessionSnapshots").keyPath).toEqual(["userId", "sessionId"])
  expect(transaction.objectStore("historyEntries").keyPath).toEqual(["userId", "sessionId", "entryId"])
  expect(transaction.objectStore("historyPages").keyPath).toEqual(["userId", "sessionId", "requestCursor"])
  expect(transaction.objectStore("runDetails").keyPath).toEqual(["userId", "sessionId", "runId"])
  expect(transaction.objectStore("toolDetails").keyPath).toEqual(["userId", "sessionId", "runId", "detailId"])
  expect(Array.from(transaction.objectStore("historyEntries").indexNames)).toContain("by-session-position")
  expect(Array.from(transaction.objectStore("sessionSnapshots").indexNames)).toContain("by-user-stored-at")
  expect(Array.from(transaction.objectStore("toolDetails").indexNames)).toContain("by-run")
  await transaction.done
  database.close()
})

test("rejects a schema with an extra object store", async () => {
  await malformedSchemaAssertRejected({ kind: "extra-store" })
})

for (const storeContract of sessionCacheSchemaContracts) {
  test(`rejects a schema with an extra ${storeContract.name} index`, async () => {
    await malformedSchemaAssertRejected({ kind: "extra-index", storeName: storeContract.name })
  })

  test(`rejects a schema missing the ${storeContract.name} store`, async () => {
    await malformedSchemaAssertRejected({ kind: "missing-store", storeName: storeContract.name })
  })

  test(`rejects a schema missing the ${storeContract.name} store key path`, async () => {
    await malformedSchemaAssertRejected({ kind: "missing-store-key-path", storeName: storeContract.name })
  })

  test(`rejects a schema with the wrong ${storeContract.name} store key path`, async () => {
    await malformedSchemaAssertRejected({ kind: "wrong-store-key-path", storeName: storeContract.name })
  })

  for (const indexContract of storeContract.indexes) {
    test(`rejects a schema missing the ${storeContract.name}.${indexContract.name} index`, async () => {
      await malformedSchemaAssertRejected({
        indexName: indexContract.name,
        kind: "missing-index",
        storeName: storeContract.name,
      })
    })

    test(`rejects a schema with the wrong ${storeContract.name}.${indexContract.name} index key path`, async () => {
      await malformedSchemaAssertRejected({
        indexName: indexContract.name,
        kind: "wrong-index-key-path",
        storeName: storeContract.name,
      })
    })

    test(`rejects a schema with the wrong ${storeContract.name}.${indexContract.name} unique flag`, async () => {
      await malformedSchemaAssertRejected({
        indexName: indexContract.name,
        kind: "wrong-index-unique",
        storeName: storeContract.name,
      })
    })
  }
}

test("deletes the obsolete full-message database without migrating its records", async () => {
  databaseNames.push(sessionCacheObsoleteDatabaseName)
  const obsoleteDatabase = await openDB(sessionCacheObsoleteDatabaseName, 2, {
    upgrade(database) {
      database.createObjectStore("settledSessions", { keyPath: ["userId", "sessionId"] })
    },
  })
  await obsoleteDatabase.put("settledSessions", {
    payload: { messages: [{ content: "must not migrate" }] },
    sessionId: "session-a",
    userId: "user-a",
  })
  obsoleteDatabase.close()

  const database = await databaseCreate()
  expect(await database.count("sessionSnapshots")).toBe(0)
  expect(await database.count("historyEntries")).toBe(0)

  let recreatedFromVersion: number | undefined
  const recreatedObsoleteDatabase = await openDB(sessionCacheObsoleteDatabaseName, 1, {
    upgrade(database, oldVersion) {
      recreatedFromVersion = oldVersion
      database.createObjectStore("probe")
    },
  })
  expect(recreatedFromVersion).toBe(0)
  expect(Array.from(recreatedObsoleteDatabase.objectStoreNames)).toEqual(["probe"])
  recreatedObsoleteDatabase.close()
  database.close()
})

test("atomically replaces normalized snapshots and invalidates pages from the previous watermark", async () => {
  const database = await databaseCreate()
  const initial = snapshotCreate("session-a", [3, 4, 5], { olderCursor: "cursor-a", title: "Initial" })
  expect(await sessionCacheSnapshotReplace(database, { snapshot: initial, storedAt: 1, userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(
    await sessionCacheHistoryPageWrite(database, {
      page: pageCreate([1, 2], null, 5),
      requestCursor: "cursor-a",
      sessionId: "session-a",
      storedAt: 2,
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: initial,
  })

  const replacement = snapshotCreate("session-a", [6], { title: "Replacement" })
  expect(await sessionCacheSnapshotReplace(database, { snapshot: replacement, storedAt: 3, userId: "user-a" })).toEqual(
    { success: true, data: undefined },
  )
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: replacement,
  })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(await database.count("historyEntries")).toBe(1)
  database.close()
})

test("rolls back snapshot deletion and replacement writes when an entry write fails", async () => {
  const database = await databaseCreate()
  const initial = snapshotCreate("session-a", [3, 4, 5], { olderCursor: "cursor-a", title: "Initial" })
  const page = pageCreate([1, 2], null, 5)
  await sessionCacheSnapshotReplace(database, { snapshot: initial, storedAt: 1, userId: "user-a" })
  await sessionCacheHistoryPageWrite(database, {
    page,
    requestCursor: "cursor-a",
    sessionId: "session-a",
    storedAt: 2,
    userId: "user-a",
  })

  const originalPut = IDBObjectStore.prototype.put
  IDBObjectStore.prototype.put = function (...args) {
    if (this.name === "historyEntries")
      throw new DOMException("The replacement entry could not be written.", "DataError")
    return originalPut.apply(this, args)
  }
  let replaced: Awaited<ReturnType<typeof sessionCacheSnapshotReplace>> | undefined
  try {
    replaced = await sessionCacheSnapshotReplace(database, {
      snapshot: snapshotCreate("session-a", [6], { title: "Replacement" }),
      storedAt: 3,
      userId: "user-a",
    })
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }

  expect(replaced?.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: initial,
  })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: page })
  expect(await database.count("historyEntries")).toBe(5)
  database.close()
})

test("rejects a page that would overwrite an authoritative snapshot entry", async () => {
  const database = await databaseCreate()
  const snapshot = snapshotCreate("session-a", [5], { olderCursor: "cursor-a" })
  await sessionCacheSnapshotReplace(database, { snapshot, storedAt: 1, userId: "user-a" })

  const conflicting = await sessionCacheHistoryPageWrite(database, {
    page: pageCreate([5], null, 5),
    requestCursor: "cursor-a",
    sessionId: "session-a",
    storedAt: 2,
    userId: "user-a",
  })
  expect(conflicting.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: snapshot,
  })
  database.close()
})

test("validates serialization on reads and removes corrupt records", async () => {
  const database = await databaseCreate()
  const snapshot = snapshotCreate("session-a", [1])
  await sessionCacheSnapshotReplace(database, { snapshot, storedAt: 1, userId: "user-a" })
  const raw = await database.get("sessionSnapshots", ["user-a", "session-a"])
  if (raw === undefined) throw new Error("missing fixture")
  await database.put("sessionSnapshots", { ...raw, byteSize: raw.byteSize + 1 })

  const corrupt = await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })
  expect(corrupt.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  database.close()
})

test("removes corrupt page, history-entry, run-detail, and tool-detail records on read", async () => {
  const database = await databaseCreate()

  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("corrupt-entry", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  const rawEntry = await database.get("historyEntries", ["user-a", "corrupt-entry", "entry-1"])
  if (rawEntry === undefined) throw new Error("missing corrupt entry fixture")
  await database.put("historyEntries", { ...rawEntry, byteSize: rawEntry.byteSize + 1 })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "corrupt-entry", userId: "user-a" })).toMatchObject({
    success: false,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "corrupt-entry", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })

  const page = pageCreate([1, 2], null, 3)
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("corrupt-page", [3], { olderCursor: "cursor-a" }),
    storedAt: 2,
    userId: "user-a",
  })
  await sessionCacheHistoryPageWrite(database, {
    page,
    requestCursor: "cursor-a",
    sessionId: "corrupt-page",
    storedAt: 3,
    userId: "user-a",
  })
  const rawPage = await database.get("historyPages", ["user-a", "corrupt-page", "cursor-a"])
  if (rawPage === undefined) throw new Error("missing corrupt page fixture")
  await database.put("historyPages", { ...rawPage, byteSize: rawPage.byteSize + 1 })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "corrupt-page",
      userId: "user-a",
    }),
  ).toMatchObject({ success: false })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "corrupt-page",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })

  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("corrupt-details", [1]),
    storedAt: 4,
    userId: "user-a",
  })
  await sessionCacheRunDetailWrite(database, {
    detail: runDetailCreate("corrupt-details", "run-a"),
    runId: "run-a",
    sessionId: "corrupt-details",
    storedAt: 5,
    userId: "user-a",
  })
  await sessionCacheToolDetailWrite(database, {
    detail: toolDetailCreate("corrupt-details", "run-a", "tool-a"),
    detailId: "tool-a",
    runId: "run-a",
    sessionId: "corrupt-details",
    storedAt: 6,
    userId: "user-a",
  })
  const rawRun = await database.get("runDetails", ["user-a", "corrupt-details", "run-a"])
  const rawTool = await database.get("toolDetails", ["user-a", "corrupt-details", "run-a", "tool-a"])
  if (rawRun === undefined || rawTool === undefined) throw new Error("missing corrupt detail fixture")
  await database.put("runDetails", { ...rawRun, byteSize: rawRun.byteSize + 1 })
  await database.put("toolDetails", { ...rawTool, byteSize: rawTool.byteSize + 1 })

  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-a", sessionId: "corrupt-details", userId: "user-a" }),
  ).toMatchObject({ success: false })
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-a",
      runId: "run-a",
      sessionId: "corrupt-details",
      userId: "user-a",
    }),
  ).toMatchObject({ success: false })
  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-a", sessionId: "corrupt-details", userId: "user-a" }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-a",
      runId: "run-a",
      sessionId: "corrupt-details",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  database.close()
})

test("bounds projected entry retention by invalidating the oldest cached page", async () => {
  const database = await databaseCreate()
  const limits = limitsCreate({ maxHistoryEntriesPerSession: 3 })
  await sessionCacheSnapshotReplace(database, {
    limits,
    snapshot: snapshotCreate("session-a", [5], { olderCursor: "cursor-a" }),
    storedAt: 1,
    userId: "user-a",
  })
  await sessionCacheHistoryPageWrite(database, {
    limits,
    page: pageCreate([3, 4], "cursor-b", 5),
    requestCursor: "cursor-a",
    sessionId: "session-a",
    storedAt: 2,
    userId: "user-a",
  })
  await sessionCacheHistoryPageWrite(database, {
    limits,
    page: pageCreate([1, 2], null, 5),
    requestCursor: "cursor-b",
    sessionId: "session-a",
    storedAt: 3,
    userId: "user-a",
  })

  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-b",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: pageCreate([1, 2], null, 5) })
  expect(await database.count("historyEntries")).toBe(3)
  database.close()
})

test("enforces session, account, and per-record byte limits oldest first", async () => {
  const database = await databaseCreate()
  const limits = limitsCreate({ maxAccounts: 2, maxSessionsPerAccount: 2 })
  for (const fixture of [
    { sessionId: "session-a", storedAt: 1, userId: "user-a" },
    { sessionId: "session-b", storedAt: 2, userId: "user-a" },
    { sessionId: "session-c", storedAt: 3, userId: "user-a" },
    { sessionId: "session-d", storedAt: 4, userId: "user-b" },
    { sessionId: "session-e", storedAt: 5, userId: "user-c" },
  ]) {
    const written = await sessionCacheSnapshotReplace(database, {
      limits,
      snapshot: snapshotCreate(fixture.sessionId, [1]),
      storedAt: fixture.storedAt,
      userId: fixture.userId,
    })
    expect(written.success).toBe(true)
  }

  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-b", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-c", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-d", userId: "user-b" })).toEqual({
    success: true,
    data: snapshotCreate("session-d", [1]),
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-e", userId: "user-c" })).toEqual({
    success: true,
    data: snapshotCreate("session-e", [1]),
  })

  const tooSmall = limitsCreate({ maxSnapshotBytes: 1 })
  const rejected = await sessionCacheSnapshotReplace(database, {
    limits: tooSmall,
    snapshot: snapshotCreate("session-e", [2], { title: "Must not replace" }),
    storedAt: 6,
    userId: "user-c",
  })
  expect(rejected.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-e", userId: "user-c" })).toEqual({
    success: true,
    data: snapshotCreate("session-e", [1]),
  })
  database.close()
})

test("enforces history-entry, page-metadata, and durable-detail byte limits without replacing prior records", async () => {
  const database = await databaseCreate()
  const snapshot = snapshotCreate("session-a", [3], { olderCursor: "cursor-a" })
  await sessionCacheSnapshotReplace(database, { snapshot, storedAt: 1, userId: "user-a" })
  const entryRejected = await sessionCacheSnapshotReplace(database, {
    limits: limitsCreate({ maxHistoryEntryBytes: 1 }),
    snapshot: snapshotCreate("session-a", [4], { title: "Entry rejected" }),
    storedAt: 2,
    userId: "user-a",
  })
  expect(entryRejected.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: snapshot,
  })

  const page = pageCreate([1, 2], null, 3)
  await sessionCacheHistoryPageWrite(database, {
    page,
    requestCursor: "cursor-a",
    sessionId: "session-a",
    storedAt: 3,
    userId: "user-a",
  })
  const pageRecord = await database.get("historyPages", ["user-a", "session-a", "cursor-a"])
  if (pageRecord === undefined) throw new Error("missing page fixture")
  const pageRejected = await sessionCacheHistoryPageWrite(database, {
    limits: limitsCreate({ maxPageMetadataBytes: pageRecord.byteSize - 1 }),
    page,
    requestCursor: "cursor-a",
    sessionId: "session-a",
    storedAt: 4,
    userId: "user-a",
  })
  expect(pageRejected.success).toBe(false)
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: page })

  const runDetail = runDetailCreate("session-a", "run-a")
  await sessionCacheRunDetailWrite(database, {
    detail: runDetail,
    runId: "run-a",
    sessionId: "session-a",
    storedAt: 5,
    userId: "user-a",
  })
  const runRecord = await database.get("runDetails", ["user-a", "session-a", "run-a"])
  if (runRecord === undefined) throw new Error("missing run detail fixture")
  const runRejected = await sessionCacheRunDetailWrite(database, {
    detail: runDetail,
    limits: limitsCreate({ maxDetailBytes: runRecord.byteSize - 1 }),
    runId: "run-a",
    sessionId: "session-a",
    storedAt: 6,
    userId: "user-a",
  })
  expect(runRejected.success).toBe(false)
  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-a", sessionId: "session-a", userId: "user-a" }),
  ).toEqual({ success: true, data: runDetail })

  const toolDetail = toolDetailCreate("session-a", "run-a", "tool-a")
  await sessionCacheToolDetailWrite(database, {
    detail: toolDetail,
    detailId: "tool-a",
    runId: "run-a",
    sessionId: "session-a",
    storedAt: 7,
    userId: "user-a",
  })
  const toolRecord = await database.get("toolDetails", ["user-a", "session-a", "run-a", "tool-a"])
  if (toolRecord === undefined) throw new Error("missing tool detail fixture")
  const toolRejected = await sessionCacheToolDetailWrite(database, {
    detail: toolDetail,
    detailId: "tool-a",
    limits: limitsCreate({ maxDetailBytes: toolRecord.byteSize - 1 }),
    runId: "run-a",
    sessionId: "session-a",
    storedAt: 8,
    userId: "user-a",
  })
  expect(toolRejected.success).toBe(false)
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-a",
      runId: "run-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: toolDetail })
  database.close()
})

test("evicts the oldest same-account session to satisfy the configured byte limit", async () => {
  const database = await databaseCreate()
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-a", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  const firstSnapshot = await database.get("sessionSnapshots", ["user-a", "session-a"])
  const firstEntries = await database.getAllFromIndex(
    "historyEntries",
    "by-session",
    IDBKeyRange.only(["user-a", "session-a"]),
  )
  if (firstSnapshot === undefined) throw new Error("missing fixture")
  const firstSessionBytes = firstSnapshot.byteSize + firstEntries.reduce((total, entry) => total + entry.byteSize, 0)
  const limits = limitsCreate({ maxAccountBytes: Math.floor(firstSessionBytes * 1.5) })

  const written = await sessionCacheSnapshotReplace(database, {
    limits,
    snapshot: snapshotCreate("session-b", [1]),
    storedAt: 2,
    userId: "user-a",
  })
  expect(written.success).toBe(true)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-b", userId: "user-a" })).toEqual({
    success: true,
    data: snapshotCreate("session-b", [1]),
  })
  database.close()
})

test("caches only finalized run and tool detail under account and session keys", async () => {
  const database = await databaseCreate()
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-a", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  const runDetail = runDetailCreate("session-a", "run-a")
  const toolDetail = toolDetailCreate("session-a", "run-a", "tool-a")
  expect(
    await sessionCacheRunDetailWrite(database, {
      detail: runDetail,
      runId: "run-a",
      sessionId: "session-a",
      storedAt: 2,
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheToolDetailWrite(database, {
      detail: toolDetail,
      detailId: "tool-a",
      runId: "run-a",
      sessionId: "session-a",
      storedAt: 3,
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-a", sessionId: "session-a", userId: "user-a" }),
  ).toEqual({
    success: true,
    data: runDetail,
  })
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-a",
      runId: "run-a",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: toolDetail })
  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-a", sessionId: "session-a", userId: "user-b" }),
  ).toEqual({
    success: true,
    data: undefined,
  })

  const active = await sessionCacheRunDetailWrite(database, {
    detail: {
      detail: null,
      kind: "active",
      run: { id: "run-a", sessionId: "session-a", status: "running" },
    },
    runId: "run-a",
    sessionId: "session-a",
    storedAt: 4,
    userId: "user-a",
  })
  expect(active.success).toBe(false)
  database.close()
})

test("caches delegated finalized detail without creating a synthetic session and validates delegation identity", async () => {
  const database = await databaseCreate()
  const detail = runDetailCreate("parent-session", "child-run")
  expect(
    await sessionCacheRunDetailWrite(database, {
      delegationId: "delegation-a",
      detail,
      runId: "child-run",
      sessionId: "parent-session",
      storedAt: 1,
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(await database.count("sessionSnapshots")).toBe(0)
  expect(
    await sessionCacheRunDetailRead(database, {
      delegationId: "delegation-a",
      runId: "child-run",
      sessionId: "parent-session",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: detail })
  expect(
    await sessionCacheRunDetailRead(database, {
      delegationId: "delegation-b",
      runId: "child-run",
      sessionId: "parent-session",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheRunDetailRead(database, {
      runId: "child-run",
      sessionId: "parent-session",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheRunDetailRead(database, {
      delegationId: "delegation-a",
      runId: "child-run",
      sessionId: "parent-session",
      userId: "user-b",
    }),
  ).toEqual({ success: true, data: undefined })
  database.close()
})

test("keeps page and tool-detail records isolated for accounts sharing session identifiers", async () => {
  const database = await databaseCreate()
  const pageByUser = {
    "user-a": pageCreate([1], null, 2),
    "user-b": pageCreate([8], null, 9),
  } as const
  const snapshotsByUser = {
    "user-a": snapshotCreate("session-shared", [2], { olderCursor: "cursor-shared" }),
    "user-b": snapshotCreate("session-shared", [9], { olderCursor: "cursor-shared" }),
  } as const
  for (const [userId, snapshot] of Object.entries(snapshotsByUser)) {
    await sessionCacheSnapshotReplace(database, { snapshot, storedAt: userId === "user-a" ? 1 : 2, userId })
    await sessionCacheHistoryPageWrite(database, {
      page: pageByUser[userId as keyof typeof pageByUser],
      requestCursor: "cursor-shared",
      sessionId: "session-shared",
      storedAt: userId === "user-a" ? 3 : 4,
      userId,
    })
  }
  const toolByUser = {
    "user-a": toolDetailCreate("session-shared", "run-shared", "tool-shared"),
    "user-b": {
      ...toolDetailCreate("session-shared", "run-shared", "tool-shared"),
      detail: {
        ...toolDetailCreate("session-shared", "run-shared", "tool-shared").detail,
        tool: { detailId: "tool-shared", sequence: 1, toolCallId: "call-b", toolName: "write" },
      },
    },
  } as const
  for (const [userId, detail] of Object.entries(toolByUser)) {
    await sessionCacheToolDetailWrite(database, {
      detail,
      detailId: "tool-shared",
      runId: "run-shared",
      sessionId: "session-shared",
      storedAt: userId === "user-a" ? 5 : 6,
      userId,
    })
  }

  for (const userId of ["user-a", "user-b"] as const) {
    expect(
      await sessionCacheHistoryPageRead(database, {
        requestCursor: "cursor-shared",
        sessionId: "session-shared",
        userId,
      }),
    ).toEqual({ success: true, data: pageByUser[userId] })
    expect(
      await sessionCacheToolDetailRead(database, {
        detailId: "tool-shared",
        runId: "run-shared",
        sessionId: "session-shared",
        userId,
      }),
    ).toEqual({ success: true, data: toolByUser[userId] })
  }
  database.close()
})

test("evicts the oldest durable detail across run and tool records", async () => {
  const database = await databaseCreate()
  const limits = limitsCreate({ maxDetailsPerSession: 2 })
  await sessionCacheSnapshotReplace(database, {
    limits,
    snapshot: snapshotCreate("session-a", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  await sessionCacheRunDetailWrite(database, {
    detail: runDetailCreate("session-a", "run-old"),
    limits,
    runId: "run-old",
    sessionId: "session-a",
    storedAt: 2,
    userId: "user-a",
  })
  await sessionCacheToolDetailWrite(database, {
    detail: toolDetailCreate("session-a", "run-new", "tool-new"),
    detailId: "tool-new",
    limits,
    runId: "run-new",
    sessionId: "session-a",
    storedAt: 3,
    userId: "user-a",
  })
  await sessionCacheRunDetailWrite(database, {
    detail: runDetailCreate("session-a", "run-new"),
    limits,
    runId: "run-new",
    sessionId: "session-a",
    storedAt: 4,
    userId: "user-a",
  })

  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-old", sessionId: "session-a", userId: "user-a" }),
  ).toEqual({ success: true, data: undefined })
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-new",
      runId: "run-new",
      sessionId: "session-a",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: toolDetailCreate("session-a", "run-new", "tool-new") })
  expect(
    await sessionCacheRunDetailRead(database, { runId: "run-new", sessionId: "session-a", userId: "user-a" }),
  ).toEqual({ success: true, data: runDetailCreate("session-a", "run-new") })
  database.close()
})

test("retries page and durable-detail writes after quota eviction of an older session", async () => {
  const database = await databaseCreate()
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-old", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-page", [3], { olderCursor: "cursor-page" }),
    storedAt: 2,
    userId: "user-a",
  })

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
    expect(
      await sessionCacheHistoryPageWrite(database, {
        page: pageCreate([1, 2], null, 3),
        requestCursor: "cursor-page",
        sessionId: "session-page",
        storedAt: 3,
        userId: "user-a",
      }),
    ).toEqual({ success: true, data: undefined })
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-old", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "cursor-page",
      sessionId: "session-page",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: pageCreate([1, 2], null, 3) })

  const detailDatabase = await databaseCreate()
  await sessionCacheSnapshotReplace(detailDatabase, {
    snapshot: snapshotCreate("session-detail-old", [1]),
    storedAt: 4,
    userId: "user-a",
  })
  await sessionCacheSnapshotReplace(detailDatabase, {
    snapshot: snapshotCreate("session-detail", [1]),
    storedAt: 5,
    userId: "user-a",
  })
  quotaFailures = 1
  IDBObjectStore.prototype.put = function (...args) {
    if (quotaFailures > 0) {
      quotaFailures -= 1
      throw new DOMException("The storage quota was exceeded.", "QuotaExceededError")
    }
    return originalPut.apply(this, args)
  }
  try {
    expect(
      await sessionCacheRunDetailWrite(detailDatabase, {
        detail: runDetailCreate("session-detail", "run-a"),
        runId: "run-a",
        sessionId: "session-detail",
        storedAt: 6,
        userId: "user-a",
      }),
    ).toEqual({ success: true, data: undefined })
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }
  expect(await sessionCacheSnapshotRead(detailDatabase, { sessionId: "session-detail-old", userId: "user-a" })).toEqual(
    {
      success: true,
      data: undefined,
    },
  )
  expect(
    await sessionCacheRunDetailRead(detailDatabase, { runId: "run-a", sessionId: "session-detail", userId: "user-a" }),
  ).toEqual({ success: true, data: runDetailCreate("session-detail", "run-a") })
  detailDatabase.close()
  database.close()
})

test("quota retries evict the oldest session atomically and failed retries preserve prior data", async () => {
  const database = await databaseCreate()
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-old", [1]),
    storedAt: 1,
    userId: "user-a",
  })
  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-target", [1], { title: "Previous" }),
    storedAt: 2,
    userId: "user-a",
  })

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
    const replaced = await sessionCacheSnapshotReplace(database, {
      snapshot: snapshotCreate("session-target", [2], { title: "Replacement" }),
      storedAt: 3,
      userId: "user-a",
    })
    expect(replaced.success).toBe(true)
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-old", userId: "user-a" })).toEqual({
    success: true,
    data: undefined,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-target", userId: "user-a" })).toEqual({
    success: true,
    data: snapshotCreate("session-target", [2], { title: "Replacement" }),
  })

  await sessionCacheSnapshotReplace(database, {
    snapshot: snapshotCreate("session-other", [1]),
    storedAt: 4,
    userId: "user-a",
  })
  IDBObjectStore.prototype.put = () => {
    throw new DOMException("The storage quota was exceeded.", "QuotaExceededError")
  }
  let failed: Awaited<ReturnType<typeof sessionCacheSnapshotReplace>> | undefined
  try {
    failed = await sessionCacheSnapshotReplace(database, {
      snapshot: snapshotCreate("session-target", [3], { title: "Must roll back" }),
      storedAt: 5,
      userId: "user-a",
    })
  } finally {
    IDBObjectStore.prototype.put = originalPut
  }
  expect(failed?.success).toBe(false)
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-target", userId: "user-a" })).toEqual({
    success: true,
    data: snapshotCreate("session-target", [2], { title: "Replacement" }),
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-other", userId: "user-a" })).toEqual({
    success: true,
    data: snapshotCreate("session-other", [1]),
  })
  database.close()
})
