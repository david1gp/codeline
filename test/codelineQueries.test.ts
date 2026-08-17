import { expect, test } from "bun:test"
import { mustGetQuery } from "@rocicorp/zero"
import { codelineQueries } from "../src/ui/codelineQueries.js"

test("active session query definitions expose list and selected-session requests", () => {
  const listRequest = codelineQueries.activeSessions()
  const selectedRequest = codelineQueries.activeSession({ sessionId: "session-1" })

  expect(listRequest.query.queryName).toBe("activeSessions")
  expect(selectedRequest).toMatchObject({
    args: { sessionId: "session-1" },
    query: { queryName: "activeSession" },
  })
})

test("empty session search uses the unfiltered Zero active-session query", () => {
  const request = codelineQueries.activeSessions()

  expect(request).toMatchObject({
    query: { queryName: "activeSessions" },
  })
  expect(request.args).toBeUndefined()
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
    ["activeSessions", undefined],
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
