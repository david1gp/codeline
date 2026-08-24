import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { httpQueryCacheCreate } = await import("../src/ui/httpQueryCacheCreate.js")
const { notesPageStateCreate } = await import("../src/note/ui/notesPageStateCreate.js")
const { noteWorkspacePageStateCreate } = await import("../src/note/ui/noteWorkspacePageStateCreate.js")

const note = {
  content: "Heading\nDetails",
  createdAt: 100,
  id: "note-1",
  projectPath: "/workspace/codeline",
  revision: 1,
  sortOrder: 0,
  updatedAt: 100,
  userId: "user-1",
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

type NoteFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

function rootCreate<T>(create: () => T) {
  return createRoot((dispose) => ({ dispose, value: create() }))
}

function noteListResponseCreate(notes: readonly (typeof note)[], etag: string): Response {
  return Response.json(notes, { headers: { ETag: etag } })
}

test("the note list retains its cached representation across a conditional 304 revalidation", async () => {
  const requests: Array<string | null> = []
  const fetcher: NoteFetch = async (input, init) => {
    if (!String(input).startsWith("/api/notes"))
      return Response.json({ projects: [{ id: "/workspace/codeline", label: "Codeline" }], truncated: false })
    const ifNoneMatch = new Headers(init?.headers).get("If-None-Match")
    requests.push(ifNoneMatch)
    if (ifNoneMatch === '"notes-1"') return new Response(null, { status: 304, headers: { ETag: '"notes-1"' } })
    return noteListResponseCreate([note], '"notes-1"')
  }

  const root = rootCreate(() => notesPageStateCreate({ accountId: () => "user-304", fetcher, isOnline: () => true }))
  await tick()
  expect(root.value.groups()[0]?.notes[0]?.content).toBe(note.content)
  expect(root.value.dataStatus()).toBe("ready")

  root.value.revalidate()
  // The retained rows stay rendered while the conditional revalidation is in flight.
  expect(root.value.groups()[0]?.notes[0]?.content).toBe(note.content)
  expect(root.value.dataStatus()).toBe("reconciling")
  await tick()

  expect(requests).toEqual([null, '"notes-1"'])
  expect(root.value.groups()[0]?.notes[0]?.content).toBe(note.content)
  expect(root.value.dataStatus()).toBe("ready")
  expect(httpQueryCacheCreate("user-304").get("user-304 /api/notes")?.etag).toBe('"notes-1"')
  root.dispose()
})

test("a failed note-list revalidation reports stale without discarding the retained rows", async () => {
  let shouldFail = false
  const fetcher: NoteFetch = async (input) => {
    if (!String(input).startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    if (shouldFail) return Response.json({ error: { code: "conflict", message: "no" } }, { status: 500 })
    return noteListResponseCreate([note], '"notes-stale-1"')
  }

  const root = rootCreate(() => notesPageStateCreate({ accountId: () => "user-stale", fetcher, isOnline: () => true }))
  await tick()
  expect(root.value.dataStatus()).toBe("ready")

  shouldFail = true
  root.value.revalidate()
  await tick()

  expect(root.value.groups()[0]?.notes[0]?.id).toBe("note-1")
  expect(root.value.isError()).toBe(false)
  expect(root.value.dataStatus()).toBe("stale")
  root.dispose()
})

test("an offline note list reports offline and keeps the retained rows", async () => {
  const fetcher: NoteFetch = async (input) =>
    String(input).startsWith("/api/notes")
      ? noteListResponseCreate([note], '"notes-offline-1"')
      : Response.json({ projects: [], truncated: false })

  let online = true
  const root = rootCreate(() =>
    notesPageStateCreate({ accountId: () => "user-offline", fetcher, isOnline: () => online }),
  )
  await tick()
  expect(root.value.dataStatus()).toBe("ready")

  online = false
  expect(root.value.dataStatus()).toBe("offline")
  expect(root.value.groups()[0]?.notes[0]?.id).toBe("note-1")
  root.dispose()
})

test("the note list and workspace sidebar share one account-scoped representation", async () => {
  let listRequests = 0
  const fetcher: NoteFetch = async (input, init) => {
    if (!String(input).startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    listRequests += 1
    if (new Headers(init?.headers).get("If-None-Match") === '"notes-shared-1"')
      return new Response(null, { status: 304, headers: { ETag: '"notes-shared-1"' } })
    return noteListResponseCreate([note], '"notes-shared-1"')
  }

  const accountId = () => "user-shared"
  const list = rootCreate(() => notesPageStateCreate({ accountId, fetcher, isOnline: () => true }))
  await tick()
  expect(list.value.groups()).toHaveLength(1)

  const sidebar = rootCreate(() =>
    noteWorkspacePageStateCreate({ accountId, fetcher, isOnline: () => true, noteId: () => "note-1" }),
  )
  // The second consumer renders the shared cached rows before its own revalidation settles.
  expect(sidebar.value.groups()[0]?.notes[0]?.id).toBe("note-1")
  expect(sidebar.value.isLoading()).toBe(false)
  await tick()
  expect(listRequests).toBe(2)
  expect(sidebar.value.dataStatus()).toBe("ready")
  list.dispose()
  sidebar.dispose()
})

test("one account's cached notes are never exposed to another account", async () => {
  const fetcher: NoteFetch = async (input) =>
    String(input).startsWith("/api/notes")
      ? noteListResponseCreate([note], '"notes-isolated-1"')
      : Response.json({ projects: [], truncated: false })

  const first = rootCreate(() => notesPageStateCreate({ accountId: () => "user-a", fetcher, isOnline: () => true }))
  await tick()
  expect(first.value.groups()).toHaveLength(1)

  const second = rootCreate(() => notesPageStateCreate({ accountId: () => "user-b", fetcher, isOnline: () => true }))
  expect(second.value.groups()).toHaveLength(0)
  expect(httpQueryCacheCreate("user-b").get("user-b /api/notes")).toBeUndefined()
  first.dispose()
  second.dispose()
})
