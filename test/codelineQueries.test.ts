import { expect, test } from "bun:test"
import { mustGetQuery } from "@rocicorp/zero"
import { codelineQueries } from "../src/ui/codelineQueries.js"

test("active session query definitions expose list and selected-session requests", () => {
  const listRequest = codelineQueries.activeSessions({ limit: 25, start: null })
  const selectedRequest = codelineQueries.activeSession({ sessionId: "session-1" })

  expect(listRequest.query.queryName).toBe("activeSessions")
  expect(selectedRequest).toMatchObject({
    args: { sessionId: "session-1" },
    query: { queryName: "activeSession" },
  })
})

test("active session pages preserve ordering, limit, and exclusive cursor semantics", () => {
  const query = mustGetQuery(codelineQueries, "activeSessions").fn({
    args: { limit: 7, start: { id: "session-cursor", updatedAt: 123 } },
    ctx: { userId: "user-1" },
  }) as unknown as {
    ast: {
      limit: number
      orderBy: readonly (readonly [string, string])[]
      start: { exclusive: boolean; row: { id: string; updatedAt: number } }
      where: { conditions: readonly unknown[] }
    }
  }

  expect(query.ast.limit).toBe(7)
  expect(query.ast.orderBy).toEqual([
    ["updatedAt", "desc"],
    ["id", "desc"],
  ])
  expect(query.ast.start).toEqual({
    exclusive: true,
    row: { id: "session-cursor", updatedAt: 123 },
  })
  expect(JSON.stringify(query.ast.where)).toContain('"value":"user-1"')
  expect(JSON.stringify(query.ast.where)).toContain('"name":"archivedAt"')
  expect(JSON.stringify(query.ast.where)).toContain('"op":"IS"')
})

test("empty session search uses the unfiltered Zero active-session query", () => {
  const request = codelineQueries.activeSessions({ limit: 25, start: null })

  expect(request).toMatchObject({
    query: { queryName: "activeSessions" },
  })
  expect(request.args).toEqual({ limit: 25, start: null })
})

test("finalized message query definition exposes a session-scoped request", () => {
  const request = codelineQueries.finalizedMessages({ sessionId: "session-1" })

  expect(request).toMatchObject({
    args: { sessionId: "session-1" },
    query: { queryName: "finalizedMessages" },
  })
})

test("identity-scoped queries use the canonical userId context property", () => {
  const queries = [
    ["activeSessions", { limit: 25, start: null }],
    ["activeRuns", undefined],
    ["activeSession", { sessionId: "session-1" }],
    ["finalizedMessages", { sessionId: "session-1" }],
    ["latestSessionRun", { sessionId: "session-1" }],
    ["sessionStreamEvents", { sessionId: "session-1" }],
    ["notes", undefined],
    ["note", { noteId: "note-1" }],
  ] as const

  for (const [name, args] of queries) {
    const query = mustGetQuery(codelineQueries, name).fn({
      args,
      ctx: { userId: "development:server-user" },
    })
    const ast = JSON.stringify((query as unknown as { ast: unknown }).ast)

    expect(ast).toContain('"value":"development:server-user"')
    expect(ast).not.toContain("browser-spoof")
  }
})

test("note query definitions expose ordered listing and selected-note requests", () => {
  const listRequest = codelineQueries.notes()
  const selectedRequest = codelineQueries.note({ noteId: "note-1" })

  expect(listRequest.query.queryName).toBe("notes")
  expect(selectedRequest).toMatchObject({
    args: { noteId: "note-1" },
    query: { queryName: "note" },
  })
})
