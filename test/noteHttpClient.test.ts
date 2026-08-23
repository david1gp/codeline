import { expect, test } from "bun:test"
import { noteCreateRequest } from "../src/note/client/noteCreateRequest.js"
import { noteDeleteRequest } from "../src/note/client/noteDeleteRequest.js"
import { noteDetailFetch } from "../src/note/client/noteDetailFetch.js"
import { noteListFetch } from "../src/note/client/noteListFetch.js"
import { noteReorderRequest } from "../src/note/client/noteReorderRequest.js"
import { noteUpdateRequest } from "../src/note/client/noteUpdateRequest.js"

const note = {
  content: "Heading\nDetails",
  createdAt: 100,
  id: "note-1",
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

  expect((await noteListFetch({ fetch: fetcher })).success).toBe(true)
  expect((await noteDetailFetch("note/1", { fetch: fetcher })).success).toBe(true)
  expect(
    (
      await noteCreateRequest(
        { content: "New", createdAt: 100, id: "note-2", projectPath: null, updatedAt: 100 },
        { fetch: fetcher },
      )
    ).success,
  ).toBe(true)
  expect(
    (
      await noteUpdateRequest(
        "note/1",
        { content: "Updated", id: "note/1", projectPath: null, updatedAt: 300 },
        { etag: '"note-etag"', fetch: fetcher },
      )
    ).success,
  ).toBe(true)
  expect((await noteDeleteRequest("note/1", { etag: '"note-etag"', fetch: fetcher })).success).toBe(true)
  expect(
    (
      await noteReorderRequest(
        "note/1",
        { direction: "down", id: "note/1", projectPath: null },
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
  expect(await requests[5]?.json()).toEqual({ direction: "down", id: "note/1", projectPath: null })
})

test("note detail treats an HTTP not-found as the existing detail empty state", async () => {
  const result = await noteDetailFetch("missing", {
    fetch: async () => Response.json({ error: { code: "not_found", message: "Missing" } }, { status: 404 }),
  })

  expect(result).toEqual({ success: true, data: undefined })
})
