import { expect, test } from "bun:test"
import { createRoot } from "solid-js/dist/solid.js"
import { sessionSearchStateCreate } from "../src/ui/sessionSearchStateCreate.js"

function navigationCreate(initialUrl: string) {
  let href = new URL(initialUrl).href
  const replacedUrls: string[] = []
  const popstateListeners: Array<() => void> = []

  return {
    location: {
      get href() {
        return href
      },
    },
    history: {
      replaceState: (_state: unknown, _title: string, url?: string | URL | null) => {
        if (url === undefined || url === null) return
        href = new URL(url, href).href
        replacedUrls.push(href)
      },
    },
    addEventListener: (_type: "popstate", listener: () => void) => popstateListeners.push(listener),
    removeEventListener: (_type: "popstate", listener: () => void) => {
      const index = popstateListeners.indexOf(listener)
      if (index >= 0) popstateListeners.splice(index, 1)
    },
    navigateExternally: (url: string) => {
      href = new URL(url, href).href
      for (const listener of popstateListeners) listener()
    },
    replacedUrls,
    get href() {
      return href
    },
  }
}

function sessionCreate(id: string, title: string) {
  return {
    archivedAt: null,
    createdAt: "2026-08-23T00:00:00.000Z",
    id,
    metadata: {},
    parentSessionId: null,
    pinned: false,
    primaryAgentId: "agent-1",
    projectPath: "~",
    revision: 1,
    serverId: "server-1",
    title,
    updatedAt: "2026-08-23T00:00:00.000Z",
  }
}

function searchResponse(sessions: ReturnType<typeof sessionCreate>[]) {
  return Response.json({
    asOfCursor: "cursor-as-of",
    etag: '"session-search"',
    nextCursor: null,
    revision: 1,
    schemaVersion: "session-list.v3",
    sessions,
  })
}

test("search state reads and replaces the URL query and parses results", async () => {
  const navigation = navigationCreate("https://codeline.test/sessions/search?session=selected&search=title")
  const calls: string[] = []
  const dispose = createRoot((rootDispose) => {
    const state = sessionSearchStateCreate(navigation, {
      fetcher: async (input) => {
        calls.push(String(input))
        return searchResponse([sessionCreate("one", "Title match")])
      },
    })

    return { rootDispose, state }
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(dispose.state.query()).toBe("title")
  expect(dispose.state.sessions()).toEqual([sessionCreate("one", "Title match")])
  expect(dispose.state.isComplete()).toBe(true)
  expect(calls).toEqual(["/api/sessions?includeArchived=0&limit=100&search=title"])

  dispose.state.updateQuery("  metadata value  ")
  expect(dispose.state.query()).toBe("metadata value")
  expect(navigation.href).toBe("https://codeline.test/sessions/search?session=selected&search=metadata+value")
  expect(navigation.replacedUrls).toHaveLength(1)
  dispose.state.updateQuery("")
  expect(navigation.href).toBe("https://codeline.test/sessions/search?session=selected")
  expect(dispose.state.sessions()).toEqual([])
  expect(dispose.state.isActive()).toBe(false)
  expect(dispose.state.isLoading()).toBe(false)
  navigation.navigateExternally("https://codeline.test/sessions/search?session=selected&search=title")
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(dispose.state.query()).toBe("title")
  expect(dispose.state.isComplete()).toBe(true)
  dispose.rootDispose()
})

test("search state exposes request failures and retries", async () => {
  const navigation = navigationCreate("https://codeline.test/sessions/search")
  let attempt = 0
  const dispose = createRoot((rootDispose) => {
    const state = sessionSearchStateCreate(navigation, {
      fetcher: async () => {
        attempt += 1
        if (attempt === 1)
          return Response.json({ error: { code: "internal_server_error", message: "failed" } }, { status: 500 })
        return searchResponse([])
      },
    })
    state.updateQuery("missing")
    return { rootDispose, state }
  })

  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(dispose.state.isError()).toBe(true)
  dispose.state.retry()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(dispose.state.isComplete()).toBe(true)
  expect(attempt).toBe(2)
  dispose.rootDispose()
})
