import "fake-indexeddb/auto"
import { afterEach, expect, mock, test } from "bun:test"
import { deleteDB, type IDBPDatabase } from "idb"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"
import type { RunDetailResponse } from "../src/run/api/runDetailResponseSchema.js"
import { sessionCacheDatabaseOpen } from "../src/session/storage/sessionCacheDatabaseOpen.js"
import type { SessionCacheDatabaseSchema } from "../src/session/storage/sessionCacheDatabaseSchema.js"
import { sessionCacheRunDetailRead } from "../src/session/storage/sessionCacheRunDetailRead.js"
import { sessionCacheRunDetailWrite } from "../src/session/storage/sessionCacheRunDetailWrite.js"

mock.module("solid-js", () => solidRuntime)

let historyOptions: { userId?: () => string | null } | undefined
mock.module("../src/session/client/sessionBoundedHistoryStateCreate.js", () => ({
  sessionBoundedHistoryStateCreate: (options: { userId?: () => string | null }) => {
    historyOptions = options
    return { latestAnswer: () => undefined }
  },
}))

const { applicationAccountContext } = await import("../src/ui/applicationAccountContext.js")
const { childSessionConversationStateCreate } = await import("../src/ui/childSessionConversationStateCreate.js")
const createComponent = (
  solidRuntime as unknown as {
    createComponent: (component: unknown, props: Record<string, unknown>) => unknown
  }
).createComponent

const databaseNames: string[] = []
const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

async function databaseCreate(): Promise<IDBPDatabase<SessionCacheDatabaseSchema>> {
  const name = `child-conversation-cache-${crypto.randomUUID()}`
  databaseNames.push(name)
  const opened = await sessionCacheDatabaseOpen({ name, version: 1 })
  if (!opened.success) throw new Error(opened.errorMessage)
  return opened.data
}

function detailCreate(answer: string): RunDetailResponse {
  return {
    detail: {
      run: { cancellationKind: null, failure: null, id: "child-run", sessionId: "parent-session", status: "succeeded" },
      tools: [],
      transcript: {
        activities: [],
        assistantText: answer,
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

afterEach(async () => {
  for (const name of databaseNames.splice(0)) await deleteDB(name)
})

test("child history cache namespace follows the current account and clears on sign-out", () => {
  const [userId, userIdSet] = createSignal<string | null>("user-a")
  let dispose: (() => void) | undefined

  createRoot((rootDispose) => {
    dispose = rootDispose
    createComponent(applicationAccountContext.Provider, {
      value: { userId },
      get children() {
        childSessionConversationStateCreate(() => ({
          childRunId: "child-run-1",
          childSessionId: "child-session-1",
          delegationId: "delegation-1",
          parentSessionId: "parent-session-1",
          task: "Inspect the delegated session.",
        }))
        return null
      },
    })
  })

  expect(historyOptions?.userId?.()).toBe("user-a")
  userIdSet("user-b")
  expect(historyOptions?.userId?.()).toBe("user-b")
  userIdSet(null)
  expect(historyOptions?.userId?.()).toBeNull()
  dispose?.()
})

test("child detail renders its account-scoped cache while revalidating and persists the authorized response", async () => {
  const database = await databaseCreate()
  const cached = detailCreate("Cached answer")
  const refreshed = detailCreate("Refreshed answer")
  await sessionCacheRunDetailWrite(database, {
    delegationId: "delegation-1",
    detail: cached,
    runId: "child-run",
    sessionId: "parent-session",
    storedAt: 1,
    userId: "user-a",
  })
  let resolveRemote!: (response: Response) => void
  const remote = new Promise<Response>((resolve) => {
    resolveRemote = resolve
  })
  const [userId] = createSignal<string | null>("user-a")
  let state: ReturnType<typeof childSessionConversationStateCreate> | undefined
  let dispose: (() => void) | undefined
  createRoot((rootDispose) => {
    dispose = rootDispose
    createComponent(applicationAccountContext.Provider, {
      value: { userId },
      get children() {
        state = childSessionConversationStateCreate(
          () => ({
            childRunId: "child-run",
            delegationId: "delegation-1",
            parentSessionId: "parent-session",
            task: "Inspect the delegated session.",
          }),
          {
            database,
            fetch: async () => remote,
            isOnline: () => true,
            now: () => 2,
          },
        )
        return null
      },
    })
  })

  await settle()
  expect(state?.childDetail.data()).toEqual(cached)
  resolveRemote(Response.json(refreshed))
  await settle()
  await settle()
  expect(state?.childDetail.data()).toEqual(refreshed)
  expect(
    await sessionCacheRunDetailRead(database, {
      delegationId: "delegation-1",
      runId: "child-run",
      sessionId: "parent-session",
      userId: "user-a",
    }),
  ).toEqual({ success: true, data: refreshed })
  expect(await database.count("sessionSnapshots")).toBe(0)
  dispose?.()
  database.close()
})

test("child detail falls back offline without crossing account namespaces", async () => {
  const database = await databaseCreate()
  const accountA = detailCreate("Account A")
  const accountB = detailCreate("Account B")
  await sessionCacheRunDetailWrite(database, {
    delegationId: "delegation-1",
    detail: accountA,
    runId: "child-run",
    sessionId: "parent-session",
    storedAt: 1,
    userId: "user-a",
  })
  await sessionCacheRunDetailWrite(database, {
    delegationId: "delegation-1",
    detail: accountB,
    runId: "child-run",
    sessionId: "parent-session",
    storedAt: 2,
    userId: "user-b",
  })
  const [userId, userIdSet] = createSignal<string | null>("user-a")
  let state: ReturnType<typeof childSessionConversationStateCreate> | undefined
  let dispose: (() => void) | undefined
  let requests = 0
  createRoot((rootDispose) => {
    dispose = rootDispose
    createComponent(applicationAccountContext.Provider, {
      value: { userId },
      get children() {
        state = childSessionConversationStateCreate(
          () => ({
            childRunId: "child-run",
            delegationId: "delegation-1",
            parentSessionId: "parent-session",
            task: "Inspect the delegated session.",
          }),
          {
            database,
            fetch: async () => {
              requests += 1
              return Response.json(accountB)
            },
            isOnline: () => false,
          },
        )
        return null
      },
    })
  })

  await settle()
  expect(state?.childDetail.data()).toEqual(accountA)
  userIdSet("user-b")
  await settle()
  expect(state?.childDetail.data()).toEqual(accountB)
  expect(requests).toBe(0)
  dispose?.()
  database.close()
})

test("child detail remains available after sign-out through the last active account namespace", async () => {
  const database = await databaseCreate()
  const detail = detailCreate("Signed-out answer")
  await sessionCacheRunDetailWrite(database, {
    delegationId: "delegation-1",
    detail,
    runId: "child-run",
    sessionId: "parent-session",
    storedAt: 1,
    userId: "user-a",
  })
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: { getItem: () => "user-a" },
  })
  try {
    const [userId] = createSignal<string | null>(null)
    let state: ReturnType<typeof childSessionConversationStateCreate> | undefined
    let dispose: (() => void) | undefined
    createRoot((rootDispose) => {
      dispose = rootDispose
      createComponent(applicationAccountContext.Provider, {
        value: { userId },
        get children() {
          state = childSessionConversationStateCreate(
            () => ({
              childRunId: "child-run",
              delegationId: "delegation-1",
              parentSessionId: "parent-session",
              task: "Inspect the delegated session.",
            }),
            { database, isOnline: () => false },
          )
          return null
        },
      })
    })
    await settle()
    expect(state?.childDetail.data()).toEqual(detail)
    dispose?.()
  } finally {
    if (previousStorage === undefined) delete (globalThis as { localStorage?: Storage }).localStorage
    else Object.defineProperty(globalThis, "localStorage", previousStorage)
    database.close()
  }
})
