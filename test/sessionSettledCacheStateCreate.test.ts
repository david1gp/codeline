import "fake-indexeddb/auto"
import { afterEach, expect, test } from "bun:test"
import { createResultError } from "@adaptive-ds/result"
import { deleteDB, type IDBPDatabase } from "idb"
import { sessionSettledCacheStateCreate } from "../src/session/client/sessionSettledCacheStateCreate.js"
import type { SessionSettledRecord } from "../src/session/schema/sessionSettledRecordSchema.js"
import { sessionSettledDatabaseOpen } from "../src/session/storage/sessionSettledDatabaseOpen.js"
import type { SessionSettledDatabaseSchema } from "../src/session/storage/sessionSettledDatabaseSchema.js"
import { sessionSettledRecordRead } from "../src/session/storage/sessionSettledRecordRead.js"
import { sessionSettledRecordWrite } from "../src/session/storage/sessionSettledRecordWrite.js"
import { eventFeedReconciliationCreate } from "../src/ui/eventFeedReconciliationCreate.js"

const databaseNames: string[] = []

afterEach(async () => {
  await Promise.all(databaseNames.splice(0).map((name) => deleteDB(name)))
})

function snapshot(userId: string, sessionId: string, revision: number, sequence: number) {
  return {
    asOfCursor: `cursor-${sequence}`,
    asOfSequence: sequence,
    etag: `"${sessionId}-${revision}"`,
    messages: [],
    revision,
    schemaVersion: "session.v2",
    session: {
      archivedAt: null,
      createdAt: "2026-08-23T00:00:00.000Z",
      id: sessionId,
      metadata: { userId },
      parentSessionId: null,
      pinned: false,
      primaryAgentId: "agent",
      projectPath: "/workspace",
      revision,
      serverId: "server",
      title: `${sessionId}-${revision}`,
      updatedAt: "2026-08-23T00:00:00.000Z",
    },
    settled: true as const,
  }
}

function recordCreate(userId: string, sessionId: string, revision: number): SessionSettledRecord {
  const value = snapshot(userId, sessionId, revision, revision)
  return {
    asOfSequence: revision,
    etag: value.etag,
    payload: { messages: value.messages, session: value.session, settled: true },
    revision,
    schemaVersion: value.schemaVersion,
    sessionId,
    userId,
  }
}

async function databaseCreate(): Promise<IDBPDatabase<SessionSettledDatabaseSchema>> {
  const name = `settled-cache-${crypto.randomUUID()}`
  databaseNames.push(name)
  const opened = await sessionSettledDatabaseOpen({ name, version: 1 })
  expect(opened.success).toBe(true)
  if (!opened.success) throw new Error(opened.errorMessage)
  return opened.data
}

test("loads the cached record before a pending online revalidation", async () => {
  const database = await databaseCreate()
  const cached = recordCreate("user-a", "session-a", 1)
  await sessionSettledRecordWrite(database, cached)
  let releaseFetch: (() => void) | undefined
  const fetchFinished = new Promise<void>((resolve) => {
    releaseFetch = resolve
  })
  const state = sessionSettledCacheStateCreate({
    database,
    fetch: async () => {
      await fetchFinished
      return new Response(null, { status: 304, headers: { ETag: cached.etag } })
    },
    sessionId: "session-a",
    userId: "user-a",
  })

  await state.load()
  expect(state.state().record).toEqual(cached)
  releaseFetch?.()
  expect(await state.ready).toEqual({ success: true, data: cached })
  database.close()
})

test("sends the cached ETag, retains on 304, and atomically replaces on validated 200", async () => {
  const database = await databaseCreate()
  const cached = recordCreate("user-a", "session-a", 1)
  await sessionSettledRecordWrite(database, cached)
  const requests: Array<{ etag: string | null }> = []
  const replacement = snapshot("user-a", "session-a", 2, 2)
  const replacementRecord = recordCreate("user-a", "session-a", 2)
  let attempt = 0
  let online = false
  const state = sessionSettledCacheStateCreate({
    database,
    fetch: async (_input, init) => {
      requests.push({ etag: new Headers(init?.headers).get("If-None-Match") })
      attempt += 1
      return attempt === 1
        ? new Response(null, { status: 304, headers: { ETag: cached.etag } })
        : Response.json(replacement, { headers: { ETag: replacement.etag } })
    },
    isOnline: () => online,
    sessionId: "session-a",
    userId: "user-a",
  })
  expect(await state.ready).toEqual({ success: true, data: cached })
  expect(requests).toEqual([])

  online = true
  const first = await state.revalidate()
  expect(first).toEqual({ success: true, data: cached })
  expect(requests).toEqual([{ etag: cached.etag }])

  const onlineState = sessionSettledCacheStateCreate({
    database,
    fetch: async (_input, init) => {
      requests.push({ etag: new Headers(init?.headers).get("If-None-Match") })
      return Response.json(replacement, { headers: { ETag: replacement.etag } })
    },
    sessionId: "session-a",
    userId: "user-a",
  })
  expect(await onlineState.ready).toEqual({ success: true, data: replacementRecord })
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: replacementRecord,
  })
  expect(requests.at(-1)).toEqual({ etag: cached.etag })
  database.close()
})

test("retains the previous record when the download or response validation fails", async () => {
  const database = await databaseCreate()
  const cached = recordCreate("user-a", "session-a", 1)
  await sessionSettledRecordWrite(database, cached)
  let failNetwork = true
  const state = sessionSettledCacheStateCreate({
    database,
    fetch: async () => {
      if (failNetwork) throw new Error("offline")
      return Response.json({ invalid: true })
    },
    sessionId: "session-a",
    userId: "user-a",
  })
  const result = await state.ready
  expect(result.success).toBe(false)
  failNetwork = false
  expect((await state.revalidate()).success).toBe(false)
  expect(state.state().record).toEqual(cached)
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toEqual({
    success: true,
    data: cached,
  })
  database.close()
})

test("caches validated completion snapshots and never crosses account boundaries", async () => {
  const database = await databaseCreate()
  const accountA = recordCreate("user-a", "session-a", 1)
  const accountB = recordCreate("user-b", "session-a", 2)
  await sessionSettledRecordWrite(database, accountA)
  await sessionSettledRecordWrite(database, accountB)
  const state = sessionSettledCacheStateCreate({
    database,
    isOnline: () => false,
    sessionId: "session-a",
    userId: "user-a",
  })
  expect(await state.ready).toEqual({ success: true, data: accountA })
  const completion = snapshot("user-a", "session-a", 3, 3)
  const reconciliation = eventFeedReconciliationCreate({
    fetch: async () => Response.json({}),
    settledSnapshotCacheWrite: state.completionReconcile,
  })
  expect(await reconciliation.sessionSnapshotReplace(completion)).toEqual({ success: true, data: undefined })
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-a" })).toMatchObject({
    success: true,
    data: { revision: 3, userId: "user-a" },
  })
  expect(await sessionSettledRecordRead(database, { sessionId: "session-a", userId: "user-b" })).toEqual({
    success: true,
    data: accountB,
  })

  const signedOut = sessionSettledCacheStateCreate({
    database,
    isOnline: () => false,
    lastLocallyActiveUserId: "user-a",
    sessionId: "session-a",
    userId: null,
  })
  expect(await signedOut.ready).toMatchObject({ success: true, data: { revision: 3, userId: "user-a" } })
  expect(signedOut.state().record?.userId).toBe("user-a")
  database.close()
})

test("propagates settled-session cache replacement failures", async () => {
  const reconciliation = eventFeedReconciliationCreate({
    fetch: async () => Response.json({}),
    settledSnapshotCacheWrite: () => createResultError("cacheWrite", "cache failed"),
  })

  const result = await reconciliation.sessionSnapshotReplace(snapshot("user-a", "session-a", 1, 1))

  expect(result).toEqual({ success: false, op: "cacheWrite", errorMessage: "cache failed" })
})
