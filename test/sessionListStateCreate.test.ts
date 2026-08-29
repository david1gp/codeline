import { afterAll, expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = createSignal(value)
    return { get, set }
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

function session(id: string, updatedAt: string) {
  return {
    archivedAt: null,
    createdAt: updatedAt,
    id,
    metadata: {},
    parentSessionId: null,
    pinned: false,
    primaryAgentId: "agent-1",
    projectPath: "~",
    revision: 1,
    serverId: "server-1",
    title: id,
    updatedAt,
  }
}

function pageResponse(sessions: ReturnType<typeof session>[], nextCursor: string | null) {
  return Response.json({
    asOfCursor: "cursor-as-of",
    etag: '"session-list"',
    nextCursor,
    revision: 1,
    schemaVersion: "session-list.v3",
    sessions,
  })
}

async function flush() {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
  await new Promise((resolve) => setTimeout(resolve, 0))
}

test("session list loads one HTTP page at a time until the cursor is exhausted", async () => {
  const requests: string[] = []
  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async (input) => {
        const url = String(input)
        requests.push(url)
        if (url.includes("cursor=page-2")) return pageResponse([session("older", "2026-08-20T00:00:00.000Z")], null)
        return pageResponse(
          [session("new", "2026-08-23T00:00:00.000Z"), session("cursor", "2026-08-22T00:00:00.000Z")],
          "page-2",
        )
      },
    }),
  }))

  expect(root.state.isLoading()).toBe(true)
  await flush()

  expect(requests).toEqual(["/api/sessions?includeArchived=0&limit=2"])
  expect(root.state.isLoading()).toBe(false)
  expect(root.state.sidebar.canLoadMore()).toBe(true)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor"])

  root.state.sidebar.loadMore()
  root.state.sidebar.loadMore()
  expect(root.state.sidebar.isLoadingMore()).toBe(true)
  await flush()

  expect(requests.at(-1)).toBe("/api/sessions?cursor=page-2&includeArchived=0&limit=2")
  expect(requests).toHaveLength(2)
  expect(root.state.sidebar.isLoadingMore()).toBe(false)
  expect(root.state.sidebar.canLoadMore()).toBe(false)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new", "cursor", "older"])
  expect(root.state.isEmpty()).toBe(false)
  root.rootDispose()
})

test("session list revalidates the first page without clearing retained rows", async () => {
  let attempt = 0
  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async () => {
        attempt += 1
        return pageResponse([session(attempt === 1 ? "old" : "fresh", `2026-08-${attempt + 22}T00:00:00.000Z`)], null)
      },
    }),
  }))

  await flush()
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["old"])

  root.state.revalidate()
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["old"])
  await flush()

  expect(attempt).toBe(2)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["fresh"])
  root.rootDispose()
})

test("session list surfaces first-page failures and retries them", async () => {
  let attempt = 0
  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async () => {
        attempt += 1
        if (attempt === 1)
          return Response.json({ error: { code: "internal_server_error", message: "failed" } }, { status: 500 })
        return pageResponse([session("new", "2026-08-23T00:00:00.000Z")], null)
      },
    }),
  }))

  await flush()
  expect(root.state.isError()).toBe(true)
  expect(root.state.isLoading()).toBe(false)

  root.state.retry()
  await flush()

  expect(attempt).toBe(2)
  expect(root.state.isError()).toBe(false)
  expect(root.state.sidebar.canLoadMore()).toBe(false)
  expect(root.state.sidebar.activeRows().map((row) => row.session.id)).toEqual(["new"])
  root.rootDispose()
})

test("session list renames and deletes selected sessions through conditional HTTP requests", async () => {
  const requests: Array<{ ifMatch: string | null; method: string; url: string }> = []
  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async (input, init) => {
        const url = String(input)
        const method = init?.method ?? "GET"
        const headers = new Headers(init?.headers)
        requests.push({ ifMatch: headers.get("If-Match"), method, url })

        if (url === "/api/sessions?includeArchived=0&limit=2")
          return pageResponse([session("new", "2026-08-23T00:00:00.000Z")], null)
        if (method === "GET")
          return Response.json({
            agent: { id: "agent-1" },
            etag: '"session-etag"',
            revision: 1,
            schemaVersion: "session.v1",
            server: { id: "server-1" },
            session: session("new", "2026-08-23T00:00:00.000Z"),
          })
        if (method === "DELETE") return Response.json({ deleted: true, session: { id: "new", revision: 2 } })
        return Response.json({
          agent: { id: "agent-1" },
          etag: '"session-etag-2"',
          revision: 2,
          schemaVersion: "session.v1",
          server: { id: "server-1" },
          session: { ...session("new", "2026-08-23T00:00:00.000Z"), revision: 2, title: "Renamed" },
        })
      },
    }),
  }))

  await flush()
  root.state.actions.sessionRenameOpen("new")
  root.state.actions.draftChange("  Renamed  ")
  await root.state.actions.sessionRenameSubmit()

  expect(requests.at(-2)).toEqual({ ifMatch: null, method: "GET", url: "/api/sessions/new" })
  expect(requests.at(-1)).toEqual({ ifMatch: '"session-etag"', method: "PATCH", url: "/api/sessions/new" })
  expect(root.state.actions.errorMessage()).toBe(null)

  await root.state.actions.sessionDeleteImmediate("new")
  expect(requests.at(-1)).toEqual({ ifMatch: '"session-etag"', method: "DELETE", url: "/api/sessions/new" })
  root.rootDispose()
})

test("session list rejects invalid rename titles before issuing a request", async () => {
  const requests: string[] = []
  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async (input) => {
        requests.push(String(input))
        return pageResponse([session("new", "2026-08-23T00:00:00.000Z")], null)
      },
    }),
  }))

  await flush()
  requests.length = 0
  root.state.actions.sessionRenameOpen("new")
  root.state.actions.draftChange("   ")
  await root.state.actions.sessionRenameSubmit()

  expect(requests).toEqual([])
  expect(root.state.actions.errorMessage()).toBe("Enter a session title.")
  root.rootDispose()
})

test("session list projects tab merges registered projects with 0 sessions", async () => {
  const projectId = "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fab"
  const registeredProjects = [{ available: true, id: projectId, label: "Empty Registered Project" }]
  const mockRegistry = {
    availableProjects: () => registeredProjects,
    errorMessage: () => undefined,
    isEmpty: () => false,
    isError: () => false,
    isLoading: () => false,
    openCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectFind: (id: string) => registeredProjects.find((p) => p.id === id),
    projectOpenCodeImport: async () => ({ success: true as const, data: { importedCount: 0 } }),
    projectRegister: async () => ({ success: true as const, data: { project: registeredProjects[0]! } }),
    projectRemove: async () => ({ success: true as const, data: undefined }),
    projectRename: async () => ({ success: true as const, data: { project: registeredProjects[0]! } }),
    projects: () => registeredProjects,
    refresh: () => {},
    retry: () => {},
    status: () => "ready" as const,
  }

  const root = createRoot((rootDispose) => ({
    rootDispose,
    state: sessionListStateCreate(() => navigation, undefined, {
      fetcher: async () => pageResponse([session("session-1", "2026-08-23T00:00:00.000Z")], null),
      projectRegistry: mockRegistry,
    }),
  }))

  await flush()
  root.state.sidebar.selectTab("projects")
  expect(root.state.isEmpty()).toBe(false)
  const groups = root.state.sidebar.projectGroups()
  expect(groups.length).toBe(2)
  expect(groups[0]?.projectLabel).toBe("Home")
  expect(groups[0]?.sessions).toHaveLength(1)
  expect(groups[1]?.projectLabel).toBe("Empty Registered Project")
  expect(groups[1]?.sessions).toHaveLength(0)
  expect(groups[1]?.projectId).toBe(projectId)
  root.rootDispose()
})
