import "fake-indexeddb/auto"
import { afterEach, expect, mock, test } from "bun:test"
import { deleteDB, type IDBPDatabase } from "idb"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { RunDetailResponse } from "../src/run/api/runDetailResponseSchema.js"
import type { RunToolDetailResponse } from "../src/run/api/runToolDetailResponseSchema.js"
import type { SessionBoundedHistoryPage } from "../src/session/api/sessionBoundedHistoryPageSchema.js"
import type { SessionBoundedSnapshot } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionLastActiveAccountRead } from "../src/session/client/sessionLastActiveAccountRead.js"
import { sessionLastActiveAccountWrite } from "../src/session/client/sessionLastActiveAccountWrite.js"
import { sessionCacheDatabaseOpen } from "../src/session/storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../src/session/storage/sessionCacheDatabaseSchema.js"
import { sessionCacheHistoryPageRead } from "../src/session/storage/sessionCacheHistoryPageRead.js"
import { sessionCacheHistoryPageWrite } from "../src/session/storage/sessionCacheHistoryPageWrite.js"
import { sessionCacheRunDetailRead } from "../src/session/storage/sessionCacheRunDetailRead.js"
import { sessionCacheRunDetailWrite } from "../src/session/storage/sessionCacheRunDetailWrite.js"
import { sessionCacheSnapshotRead } from "../src/session/storage/sessionCacheSnapshotRead.js"
import { sessionCacheSnapshotReplace } from "../src/session/storage/sessionCacheSnapshotReplace.js"
import { sessionCacheToolDetailRead } from "../src/session/storage/sessionCacheToolDetailRead.js"

mock.module("solid-js", () => solidRuntime)
const { sessionBoundedHistoryStateCreate } = await import("../src/session/client/sessionBoundedHistoryStateCreate.js")
const { sessionSemanticStepRowStateCreate } = await import("../src/ui/sessionSemanticStepRowStateCreate.js")

const databaseNames: string[] = []
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await deleteDB(name)
})

async function databaseCreate(): Promise<IDBPDatabase<SessionCacheDatabaseSchema>> {
  const name = `bounded-history-state-${crypto.randomUUID()}`
  databaseNames.push(name)
  const opened = await sessionCacheDatabaseOpen({ name, version: 1 })
  if (!opened.success) throw new Error(opened.errorMessage)
  return opened.data
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
  options: { olderCursor?: string | null; title?: string; throughPosition?: number } = {},
): SessionBoundedSnapshot {
  const olderCursor = options.olderCursor ?? null
  const throughPosition = options.throughPosition ?? Math.max(0, ...positions)
  return {
    detailCursor: `detail-${sessionId}-${throughPosition}`,
    hasMore: olderCursor !== null,
    latestAnswer: null,
    olderCursor,
    semanticSteps: positions.map(stepCreate),
    session: {
      id: sessionId,
      pinned: false,
      projectPath: "/workspace",
      revision: throughPosition,
      title: options.title ?? sessionId,
    },
    state: { input: null, run: null },
    throughPosition,
  }
}

function pageCreate(positions: number[], nextCursor: string | null, throughPosition: number) {
  return {
    hasMore: nextCursor !== null,
    nextCursor,
    semanticSteps: positions.map(stepCreate),
    throughPosition,
  } satisfies SessionBoundedHistoryPage
}

function runDetailCreate(sessionId: string, runId: string): Extract<RunDetailResponse, { kind: "finalized" }> {
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

test("renders a cached bounded snapshot while online revalidation is pending and persists the accepted response", async () => {
  const database = await databaseCreate()
  const cached = snapshotCreate("session-1", [1], { title: "Cached" })
  const revalidated = snapshotCreate("session-1", [2], { title: "Online" })
  await sessionCacheSnapshotReplace(database, { snapshot: cached, storedAt: 1, userId: "user-a" })
  let releaseFetch: (() => void) | undefined
  const fetchReleased = new Promise<void>((resolve) => {
    releaseFetch = resolve
  })
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      fetch: async () => {
        await fetchReleased
        return Response.json(revalidated)
      },
      isOnline: () => true,
      sessionId: () => "session-1",
      userId: () => "user-a",
    }),
  }))

  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Cached")
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["entry-1"])
  expect(root.state.cacheStatus()).toBe("revalidating")

  releaseFetch?.()
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Online")
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-1", userId: "user-a" })).toEqual({
    success: true,
    data: revalidated,
  })
  root.dispose()
  database.close()
})

test("ignores a stale online revalidation after switching accounts", async () => {
  const database = await databaseCreate()
  const accountA = snapshotCreate("session-1", [1], { title: "Account A" })
  const accountB = snapshotCreate("session-1", [9], { title: "Account B", throughPosition: 9 })
  await sessionCacheSnapshotReplace(database, { snapshot: accountA, storedAt: 1, userId: "user-a" })
  await sessionCacheSnapshotReplace(database, { snapshot: accountB, storedAt: 2, userId: "user-b" })

  let releaseA: (() => void) | undefined
  let releaseB: (() => void) | undefined
  const responseA = new Promise<Response>((resolve) => {
    releaseA = () => resolve(Response.json(accountA))
  })
  const responseB = new Promise<Response>((resolve) => {
    releaseB = () => resolve(Response.json(accountB))
  })
  let requestCount = 0
  const [userId, userIdSet] = createSignal("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      fetch: async () => {
        requestCount += 1
        return requestCount === 1 ? responseA : responseB
      },
      isOnline: () => true,
      sessionId: () => "session-1",
      userId,
    }),
  }))

  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account A")
  userIdSet("user-b")
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account B")

  releaseA?.()
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account B")
  releaseB?.()
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account B")
  root.dispose()
  database.close()
})

test("retains offline records across sign-out and isolates the same session id when accounts switch", async () => {
  const database = await databaseCreate()
  const accountA = snapshotCreate("session-1", [1], { title: "Account A" })
  const accountB = snapshotCreate("session-1", [9], { title: "Account B", throughPosition: 9 })
  await sessionCacheSnapshotReplace(database, { snapshot: accountA, storedAt: 1, userId: "user-a" })
  await sessionCacheSnapshotReplace(database, { snapshot: accountB, storedAt: 2, userId: "user-b" })
  const [userId, userIdSet] = createSignal("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      enabled: () => false,
      isOnline: () => false,
      sessionId: () => "session-1",
      userId,
    }),
  }))

  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account A")
  expect(root.state.hasOnlineSnapshot()).toBe(false)
  expect(root.state.cacheStatus()).toBe("offline")

  userIdSet("user-b")
  expect(root.state.snapshot()).toBeUndefined()
  expect(root.state.semanticSteps()).toEqual([])
  expect(root.state.hasMore()).toBe(false)
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account B")
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["entry-9"])

  userIdSet("user-a")
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account A")
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-1", userId: "user-a" })).toEqual({
    success: true,
    data: accountA,
  })
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-1", userId: "user-b" })).toEqual({
    success: true,
    data: accountB,
  })
  root.dispose()
  database.close()
})

test("renders the last active account cache while signed out without deleting retained records", async () => {
  const database = await databaseCreate()
  const snapshot = snapshotCreate("session-1", [1], { title: "Retained after sign-out" })
  await sessionCacheSnapshotReplace(database, { snapshot, storedAt: 1, userId: "user-a" })

  let storedAccount: string | null = null
  const storage = {
    getItem: () => storedAccount,
    setItem: (_key: string, value: string) => {
      storedAccount = value
    },
  }
  sessionLastActiveAccountWrite("user-a", storage)
  await settle()
  expect(sessionLastActiveAccountRead(storage)).toBe("user-a")

  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      enabled: () => false,
      isOnline: () => false,
      sessionId: () => "session-1",
      userId: () => sessionLastActiveAccountRead(storage),
    }),
  }))
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Retained after sign-out")
  expect(root.state.cacheStatus()).toBe("offline")
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-1", userId: "user-a" })).toEqual({
    success: true,
    data: snapshot,
  })
  root.dispose()
  database.close()
})

test("offline cache rendering stays empty without an account or matching cache", async () => {
  const database = await databaseCreate()
  const accountB = snapshotCreate("session-1", [2], { title: "Account B", throughPosition: 2 })
  await sessionCacheSnapshotReplace(database, { snapshot: accountB, storedAt: 1, userId: "user-b" })
  const [userId, userIdSet] = createSignal<string | null>(null)
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      enabled: () => false,
      isOnline: () => false,
      sessionId: () => "session-1",
      userId,
    }),
  }))

  await settle()
  expect(root.state.snapshot()).toBeUndefined()
  userIdSet("user-a")
  await settle()
  expect(root.state.snapshot()).toBeUndefined()
  userIdSet("user-b")
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Account B")
  root.dispose()
  database.close()
})

test("clears expanded cached detail before reading the same detail for another account", async () => {
  const database = await databaseCreate()
  const snapshot = snapshotCreate("session-1", [1])
  const detailA = runDetailCreate("session-1", "run-1")
  const detailBBase = runDetailCreate("session-1", "run-1")
  const detailB = {
    ...detailBBase,
    detail: {
      ...detailBBase.detail,
      transcript: { ...detailBBase.detail.transcript, assistantText: "Account B" },
    },
  } satisfies Extract<RunDetailResponse, { kind: "finalized" }>
  for (const [userId, detail, storedAt] of [
    ["user-a", detailA, 1],
    ["user-b", detailB, 2],
  ] as const) {
    await sessionCacheSnapshotReplace(database, { snapshot, storedAt, userId })
    await sessionCacheRunDetailWrite(database, {
      detail,
      runId: "run-1",
      sessionId: "session-1",
      storedAt,
      userId,
    })
  }
  const [userId, userIdSet] = createSignal("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionSemanticStepRowStateCreate({
      database,
      isOnline: () => false,
      sessionId: () => "session-1",
      step: () => ({ detailId: "run-1", id: "run-entry-1", kind: "run", sequence: 1, summary: "Run" }),
      userId,
    }),
  }))

  root.state.detailExpand()
  await settle()
  expect(root.state.detail()).toEqual(detailA)
  userIdSet("user-b")
  expect(root.state.detail()).toBeUndefined()
  await settle()
  expect(root.state.detail()).toEqual(detailB)
  root.dispose()
  database.close()
})

test("persists older pages, finalized run-tool details, and an authoritative terminal replacement", async () => {
  const database = await databaseCreate()
  const initial = snapshotCreate("session-1", [4, 5], { olderCursor: "older-1", title: "Running" })
  const page = pageCreate([1, 2], null, 5)
  const terminal = snapshotCreate("session-1", [6], { title: "Completed", throughPosition: 6 })
  let snapshotReads = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      fetch: async (input) => {
        if (String(input).includes("bounded-history")) return Response.json(page)
        snapshotReads += 1
        return Response.json(snapshotReads === 1 ? initial : terminal)
      },
      isOnline: () => true,
      sessionId: () => "session-1",
      userId: () => "user-a",
    }),
  }))
  await settle()
  await root.state.loadOlder()
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "older-1",
      sessionId: "session-1",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: page })

  const runDetail = runDetailCreate("session-1", "run-1")
  const runRow = createRoot((dispose) => ({
    dispose,
    state: sessionSemanticStepRowStateCreate({
      database,
      fetch: async () => Response.json(runDetail),
      isOnline: () => true,
      sessionId: () => "session-1",
      step: () => ({ detailId: "run-1", id: "run-entry-1", kind: "run", sequence: 5, summary: "Run" }),
      userId: () => "user-a",
    }),
  }))
  runRow.state.detailExpand()
  await settle()
  expect(
    await sessionCacheRunDetailRead(database, {
      runId: "run-1",
      sessionId: "session-1",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: runDetail })

  const toolDetail = toolDetailCreate("session-1", "run-1", "tool-1")
  const toolRow = createRoot((dispose) => ({
    dispose,
    state: sessionSemanticStepRowStateCreate({
      database,
      fetch: async () => Response.json(toolDetail),
      isOnline: () => true,
      sessionId: () => "session-1",
      step: () => ({
        detailId: "tool-1",
        id: "tool-entry-1",
        kind: "tool",
        runId: "run-1",
        sequence: 5,
        summary: "Tool",
      }),
      userId: () => "user-a",
    }),
  }))
  toolRow.state.detailExpand()
  await settle()
  expect(
    await sessionCacheToolDetailRead(database, {
      detailId: "tool-1",
      runId: "run-1",
      sessionId: "session-1",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: toolDetail })

  root.state.refresh()
  await settle()
  expect(root.state.snapshot()?.session.title).toBe("Completed")
  expect(await sessionCacheSnapshotRead(database, { sessionId: "session-1", userId: "user-a" })).toEqual({
    success: true,
    data: terminal,
  })
  runRow.dispose()
  toolRow.dispose()
  root.dispose()
  database.close()
})

test("clears volatile page state on account change without deleting cached pages", async () => {
  const database = await databaseCreate()
  const accountA = snapshotCreate("session-1", [4, 5], { olderCursor: "older-1" })
  const accountB = snapshotCreate("session-1", [9], { title: "Account B", throughPosition: 9 })
  const page = pageCreate([1, 2], null, 5)
  await sessionCacheSnapshotReplace(database, { snapshot: accountA, storedAt: 1, userId: "user-a" })
  await sessionCacheHistoryPageWrite(database, {
    page,
    requestCursor: "older-1",
    sessionId: "session-1",
    storedAt: 2,
    userId: "user-a",
  })
  await sessionCacheSnapshotReplace(database, { snapshot: accountB, storedAt: 3, userId: "user-b" })
  const [userId, userIdSet] = createSignal("user-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionBoundedHistoryStateCreate({
      database,
      enabled: () => false,
      isOnline: () => false,
      sessionId: () => "session-1",
      userId,
    }),
  }))

  await settle()
  await root.state.loadOlder()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["entry-1", "entry-2", "entry-4", "entry-5"])
  userIdSet("user-b")
  expect(root.state.semanticSteps()).toEqual([])
  expect(root.state.hasMore()).toBe(false)
  await settle()
  expect(root.state.semanticSteps().map((step) => step.id)).toEqual(["entry-9"])
  expect(
    await sessionCacheHistoryPageRead(database, {
      requestCursor: "older-1",
      sessionId: "session-1",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: page })
  root.dispose()
  database.close()
})
