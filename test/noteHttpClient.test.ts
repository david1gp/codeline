import { expect, test } from "bun:test"
import { noteCreateRequest } from "../src/note/client/noteCreateRequest.js"
import { noteDeleteRequest } from "../src/note/client/noteDeleteRequest.js"
import { noteDetailConditionalFetch } from "../src/note/client/noteDetailConditionalFetch.js"
import { noteListConditionalFetch } from "../src/note/client/noteListConditionalFetch.js"
import { noteReorderRequest } from "../src/note/client/noteReorderRequest.js"
import { noteUpdateRequest } from "../src/note/client/noteUpdateRequest.js"

const note = {
  content: "Heading\nDetails",
  createdAt: 100,
  id: "note-1",
  projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f80",
  projectPath: "/workspace/codeline",
  revision: 2,
  sortOrder: 0,
  updatedAt: 200,
  userId: "user-1",
}

test("note typed clients preserve routes, validation, and conditional mutations", async () => {
  const requests: Request[] = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(new URL(String(input), "http://localhost"), init)
    requests.push(request)
    return request.method === "GET" && request.url.endsWith("/api/notes") ? Response.json([note]) : Response.json(note)
  }

  expect((await noteListConditionalFetch({ fetch: fetcher })).success).toBe(true)
  expect((await noteDetailConditionalFetch("note/1", { fetch: fetcher })).success).toBe(true)
  expect(
    (
      await noteCreateRequest(
        { content: "New", createdAt: 100, id: "note-2", projectId: null, updatedAt: 100 },
        { fetch: fetcher },
      )
    ).success,
  ).toBe(true)
  expect(await requests[2]?.json()).toEqual({
    content: "New",
    createdAt: 100,
    id: "note-2",
    projectId: null,
    updatedAt: 100,
  })
  expect(
    (
      await noteUpdateRequest(
        "note/1",
        { content: "Updated", id: "note/1", projectId: null, updatedAt: 300 },
        { etag: '"note-etag"', fetch: fetcher },
      )
    ).success,
  ).toBe(true)
  expect((await noteDeleteRequest("note/1", { etag: '"note-etag"', fetch: fetcher })).success).toBe(true)
  expect(
    (
      await noteReorderRequest(
        "note/1",
        { direction: "down", id: "note/1", projectId: null },
        { etag: '"note-etag"', fetch: fetcher },
      )
    ).success,
  ).toBe(true)

  expect(requests.map((request) => `${request.method} ${new URL(request.url).pathname}`)).toEqual([
    "GET /api/notes",
    "GET /api/notes/note%2F1",
    "POST /api/notes",
    "PATCH /api/notes/note%2F1",
    "DELETE /api/notes/note%2F1",
    "POST /api/notes/note%2F1/reorder",
  ])
  expect(requests[0]?.cache).toBe("no-store")
  expect(requests[1]?.cache).toBe("no-store")
  expect(requests[3]?.headers.get("If-Match")).toBe('"note-etag"')
  expect(await requests[5]?.json()).toEqual({ direction: "down", id: "note/1", projectId: null })
})

test("note detail treats an HTTP not-found as the existing detail empty state", async () => {
  const result = await noteDetailConditionalFetch("missing", {
    fetch: async () => Response.json({ error: { code: "not_found", message: "Missing" } }, { status: 404 }),
  })

  expect(result).toEqual({ success: true, data: undefined })
})

test("conditional note reads send If-None-Match and report a 304 without a body", async () => {
  const requests: Array<string | null> = []
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push(new Headers(init?.headers).get("If-None-Match"))
    if (String(input) === "/api/notes") return new Response(null, { status: 304, headers: { ETag: '"notes-9"' } })
    return new Response(null, { status: 304, headers: { ETag: '"note-9"' } })
  }

  expect(await noteListConditionalFetch({ etag: '"notes-9"', fetch: fetcher })).toEqual({
    success: true,
    data: { status: 304 },
  })
  expect(await noteDetailConditionalFetch("note-1", { etag: '"note-9"', fetch: fetcher })).toEqual({
    success: true,
    data: { status: 304 },
  })
  expect(requests).toEqual(['"notes-9"', '"note-9"'])
})

test("conditional note reads carry the server ETag and representation revision on 200", async () => {
  const listResult = await noteListConditionalFetch({
    fetch: async () => Response.json([note], { headers: { ETag: '"notes-from-server"' } }),
  })
  const detailResult = await noteDetailConditionalFetch("note-1", {
    fetch: async () => Response.json(note, { headers: { ETag: '"note-from-server"' } }),
  })

  expect(listResult.success && listResult.data.status).toBe(200)
  expect(listResult.success && listResult.data.status === 200 && listResult.data.etag).toBe('"notes-from-server"')
  // One note at revision 2 plus the list length keeps the list version distinct from a member revision.
  expect(listResult.success && listResult.data.status === 200 && listResult.data.revision).toBe(3)
  expect(detailResult.success && detailResult.data?.status === 200 && detailResult.data.etag).toBe('"note-from-server"')
  expect(detailResult.success && detailResult.data?.status === 200 && detailResult.data.revision).toBe(2)
})

test("a conditional note read without a cached validator rejects an unexpected 304", async () => {
  const result = await noteListConditionalFetch({ fetch: async () => new Response(null, { status: 304 }) })

  expect(result.success).toBe(false)
})
