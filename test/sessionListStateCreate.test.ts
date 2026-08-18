import { afterAll, expect, mock, test } from "bun:test"
import { createEffect, createRoot, createSignal } from "solid-js/dist/solid.js"
import * as solidRuntime from "solid-js/dist/solid.js"

type QueryResult = { type: "unknown" } | { type: "complete" } | { type: "error"; retry: () => void }

type QuerySlot = {
  requests: unknown[]
  rows: ReturnType<typeof createSignal<readonly unknown[]>>
  result: ReturnType<typeof createSignal<QueryResult>>
}

const querySlots: QuerySlot[] = []

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = createSignal(value)
    return { get, set }
  },
}))
mock.module("@rocicorp/zero/solid", () => ({
  useQuery: (queryAccessor: () => unknown) => {
    const rows = createSignal<readonly unknown[]>([])
    const result = createSignal<QueryResult>({ type: "unknown" })
    const slot: QuerySlot = { requests: [], result, rows }
    querySlots.push(slot)
    createEffect(() => {
      if (slot.requests.length > 0) result[1]({ type: "unknown" })
      slot.requests.push(queryAccessor())
    })
    return [rows[0], result[0]]
  },
}))

const environment = Bun.env as Record<string, string | undefined>
const previousPageSize = environment.VITE_SESSIONS_SIDEBAR_PAGE_SIZE
environment.VITE_SESSIONS_SIDEBAR_PAGE_SIZE = "2"
const { sessionListStateCreate } = await import("../src/ui/sessionListStateCreate.js")

afterAll(() => {
  if (previousPageSize === undefined) delete environment.VITE_SESSIONS_SIDEBAR_PAGE_SIZE
  else environment.VITE_SESSIONS_SIDEBAR_PAGE_SIZE = previousPageSize
})

const navigation = {
  isNewSessionRoute: () => false,
  selectedSessionId: () => null,
  selectSession: (_sessionId: string) => {},
  clearSession: () => {},
  startNewSession: () => {},
}

const windowNavigation = {
  innerWidth: 1440,
  location: { href: "https://codeline.test/sessions" },
  history: { replaceState: () => {} },
  addEventListener: () => {},
  removeEventListener: () => {},
}
Object.defineProperty(globalThis, "window", { configurable: true, value: windowNavigation })

function session(id: string, updatedAt: number) {
  return {
    id,
    parentSessionId: null,
    pinned: false,
    projectPath: "~",
    title: id,
    updatedAt,
  }
}

async function flush() {
  await Promise.resolve()
  await Promise.resolve()
}

function stateCreate() {
  querySlots.length = 0
  return createRoot((rootDispose) => ({ rootDispose, state: sessionListStateCreate(() => navigation) }))
}

test("session list expands one live page at a time until the end", async () => {
  const root = stateCreate()
  const sessionsQuery = querySlots[0]!
  expect(root.state.isLoading()).toBe(true)
  sessionsQuery.rows[1]([session("new", 300), session("cursor", 200)])
  sessionsQuery.result[1]({ type: "complete" })
  await flush()

  expect(sessionsQuery.requests[0]).toMatchObject({ args: { limit: 2, start: null } })
  expect(root.state.sidebar.canLoadMore()).toBe(true)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor"])

  root.state.sidebar.loadMore()
  root.state.sidebar.loadMore()
  expect(root.state.sidebar.isLoadingMore()).toBe(true)
  await flush()
  expect(sessionsQuery.requests.at(-1)).toMatchObject({ args: { limit: 4, start: null } })

  sessionsQuery.rows[1]([session("new", 300), session("cursor", 200), session("older", 100), session("oldest", 50)])
  sessionsQuery.result[1]({ type: "complete" })
  await flush()
  expect(root.state.sidebar.isLoadingMore()).toBe(false)
  expect(root.state.sidebar.canLoadMore()).toBe(true)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor", "older", "oldest"])

  root.state.sidebar.loadMore()
  await flush()
  expect(sessionsQuery.requests.at(-1)).toMatchObject({ args: { limit: 6, start: null } })
  sessionsQuery.rows[1]([session("new", 300), session("cursor", 200), session("older", 100), session("oldest", 50)])
  sessionsQuery.result[1]({ type: "complete" })
  await flush()

  expect(root.state.sidebar.canLoadMore()).toBe(false)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor", "older", "oldest"])

  sessionsQuery.rows[1]([{ ...session("new", 400), title: "renamed" }, session("older", 100), session("oldest", 50)])
  await flush()
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "older", "oldest"])
  expect(root.state.sidebar.activeRows()[0]?.session.title).toBe("renamed")
  root.rootDispose()
})

test("session list keeps the first page state when a later page fails", async () => {
  const root = stateCreate()
  const sessionsQuery = querySlots[0]!
  sessionsQuery.result[1]({ type: "error", retry: () => {} })
  await flush()
  expect(root.state.isError()).toBe(true)
  expect(root.state.isLoading()).toBe(false)
  sessionsQuery.rows[1]([session("new", 300)])
  sessionsQuery.result[1]({ type: "complete" })
  await flush()

  expect(root.state.sidebar.canLoadMore()).toBe(false)
  expect(root.state.isLoading()).toBe(false)
  expect(root.state.isEmpty()).toBe(false)

  // A full first page is required before the additional-page boundary is reachable.
  sessionsQuery.rows[1]([session("new", 300), session("cursor", 200)])
  await flush()
  root.state.sidebar.loadMore()
  await flush()
  sessionsQuery.result[1]({ type: "error", retry: () => {} })
  await flush()

  expect(root.state.sidebar.isLoadingMore()).toBe(false)
  expect(root.state.isError()).toBe(false)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor"])
  root.rootDispose()
})
