import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot, createSignal } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@solidjs/router", () => ({ useNavigate: () => () => {} }))

const { httpQueryCacheCreate } = await import("../src/ui/httpQueryCacheCreate.js")
const { notePageStateCreate } = await import("../src/note/ui/notePageStateCreate.js")

const noteCreate = (id: string, content: string, revision: number) => ({
  content,
  createdAt: 100,
  id,
  projectId: null,
  projectPath: null,
  revision,
  sortOrder: 0,
  updatedAt: 100,
  userId: "user-1",
})

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

type NoteFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

test("the note detail retains its cached note across a conditional 304 revalidation", async () => {
  const conditions: Array<string | null> = []
  const fetcher: NoteFetch = async (input, init) => {
    if (!String(input).startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    const ifNoneMatch = new Headers(init?.headers).get("If-None-Match")
    conditions.push(ifNoneMatch)
    if (ifNoneMatch !== null) return new Response(null, { status: 304, headers: { ETag: ifNoneMatch } })
    return Response.json(noteCreate("note-1", "Cached body", 3), { headers: { ETag: '"note-3"' } })
  }

  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({
      accountId: () => "detail-304",
      fetcher,
      isOnline: () => true,
      noteId: "note-1",
    }),
  }))

  await tick()
  expect(root.state.content()).toBe("Cached body")
  expect(root.state.hasNote()).toBe(true)
  expect(root.state.dataStatus()).toBe("ready")

  root.state.revalidate()
  expect(root.state.dataStatus()).toBe("reconciling")
  await tick()

  expect(conditions).toEqual([null, '"note-3"'])
  expect(root.state.content()).toBe("Cached body")
  expect(root.state.hasNote()).toBe(true)
  expect(root.state.dataStatus()).toBe("ready")
  expect(httpQueryCacheCreate("detail-304").get("detail-304 /api/notes/note-1")?.revision).toBe(3)
  root.dispose()
})

test("a failed note-detail revalidation reports stale and keeps the note editable", async () => {
  let shouldFail = false
  const fetcher: NoteFetch = async (input) => {
    if (!String(input).startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    if (shouldFail) return Response.json({ error: { code: "conflict", message: "no" } }, { status: 500 })
    return Response.json(noteCreate("note-2", "Editable body", 1), { headers: { ETag: '"note-2-1"' } })
  }

  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({ accountId: () => "detail-stale", fetcher, isOnline: () => true, noteId: "note-2" }),
  }))

  await tick()
  shouldFail = true
  root.state.revalidate()
  await tick()

  expect(root.state.content()).toBe("Editable body")
  expect(root.state.hasNote()).toBe(true)
  expect(root.state.hasError()).toBe(false)
  expect(root.state.isNotFound()).toBe(false)
  expect(root.state.dataStatus()).toBe("stale")
  root.dispose()
})

test("changing the selected note never renders the previous note's body", async () => {
  const fetcher: NoteFetch = async (input) => {
    const path = String(input)
    if (!path.startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    const id = path.slice("/api/notes/".length)
    return Response.json(noteCreate(id, `Body of ${id}`, 1), { headers: { ETag: `"${id}-1"` } })
  }

  const [noteId, noteIdSet] = createSignal("note-a")
  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({ accountId: () => "detail-switch", fetcher, isOnline: () => true, noteId }),
  }))

  await tick()
  expect(root.state.hasNote()).toBe(true)

  noteIdSet("note-b")
  expect(root.state.hasNote()).toBe(false)
  await tick()
  expect(root.state.hasNote()).toBe(true)
  root.dispose()
})

test("an offline note detail reports offline while the cached note stays visible", async () => {
  const fetcher: NoteFetch = async (input) =>
    String(input).startsWith("/api/notes")
      ? Response.json(noteCreate("note-3", "Offline body", 1), { headers: { ETag: '"note-3-1"' } })
      : Response.json({ projects: [], truncated: false })

  let online = true
  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({
      accountId: () => "detail-offline",
      fetcher,
      isOnline: () => online,
      noteId: "note-3",
    }),
  }))

  await tick()
  expect(root.state.dataStatus()).toBe("ready")
  online = false
  expect(root.state.dataStatus()).toBe("offline")
  expect(root.state.content()).toBe("Offline body")
  root.dispose()
})

test("a deleted note resolves to the not-found state instead of a load error", async () => {
  const fetcher: NoteFetch = async (input) =>
    String(input).startsWith("/api/notes")
      ? Response.json({ error: { code: "not_found", message: "Missing" } }, { status: 404 })
      : Response.json({ projects: [], truncated: false })

  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({ accountId: () => "detail-missing", fetcher, isOnline: () => true, noteId: "gone" }),
  }))

  await tick()
  expect(root.state.isNotFound()).toBe(true)
  expect(root.state.hasError()).toBe(false)
  root.dispose()
})

test("saving a note invalidates the shared cache entry so a stale 304 cannot resurrect it", async () => {
  const conditions: Array<string | null> = []
  let saved = false
  const fetcher: NoteFetch = async (input, init) => {
    if (!String(input).startsWith("/api/notes")) return Response.json({ projects: [], truncated: false })
    if (init?.method === "PATCH") {
      saved = true
      return Response.json(noteCreate("note-4", "Saved body", 2), { headers: { ETag: '"note-4-2"' } })
    }
    const ifNoneMatch = new Headers(init?.headers).get("If-None-Match")
    conditions.push(ifNoneMatch)
    // A stale validator would otherwise reinstate revision 1 after the save.
    if (ifNoneMatch === '"note-4-1"' && !saved)
      return new Response(null, { status: 304, headers: { ETag: '"note-4-1"' } })
    return Response.json(noteCreate("note-4", saved ? "Saved body" : "Original body", saved ? 2 : 1), {
      headers: { ETag: saved ? '"note-4-2"' : '"note-4-1"' },
    })
  }

  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({ accountId: () => "detail-save", fetcher, isOnline: () => true, noteId: "note-4" }),
  }))

  await tick()
  expect(root.state.content()).toBe("Original body")

  root.state.contentUpdate({ currentTarget: { value: "Saved body" } } as never)
  expect(root.state.isDirty()).toBe(true)
  root.state.submit({ preventDefault: () => {} } as never)
  await tick()
  await tick()

  expect(root.state.isSaving()).toBe(false)
  expect(root.state.content()).toBe("Saved body")
  expect(httpQueryCacheCreate("detail-save").get("detail-save /api/notes/note-4")?.revision).toBe(2)
  root.dispose()
})

test("note detail preserves existing unavailable project assignment in choices and allows reassignment", async () => {
  const availableProject = {
    available: true,
    faviconUrl: null,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc0",
    label: "Available Project",
    parentFolder: null,
  }
  const unavailableProject = {
    available: false,
    faviconUrl: null,
    id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fc1",
    label: "Unavailable Project",
    parentFolder: null,
  }
  const noteWithUnavailable = {
    ...noteCreate("note-5", "Note with project", 1),
    projectId: unavailableProject.id,
    projectPath: unavailableProject.id,
  }

  const fetcher: NoteFetch = async (input) => {
    const url = String(input)
    if (url === "/api/project/registry") {
      return Response.json({ folders: [], projects: [availableProject, unavailableProject], truncated: false })
    }
    return Response.json(noteWithUnavailable, { headers: { ETag: '"note-5-1"' } })
  }

  const root = createRoot((dispose) => ({
    dispose,
    state: notePageStateCreate({ accountId: () => "detail-proj", fetcher, isOnline: () => true, noteId: "note-5" }),
  }))

  await tick()
  expect(root.state.projectId()).toBe(unavailableProject.id)
  expect(root.state.projects()).toEqual([unavailableProject, availableProject])

  root.state.projectIdUpdate({ currentTarget: { value: availableProject.id } } as never)
  expect(root.state.projectId()).toBe(availableProject.id)
  expect(root.state.isDirty()).toBe(true)
  root.dispose()
})
