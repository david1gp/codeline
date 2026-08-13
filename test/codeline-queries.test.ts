import { expect, test } from "bun:test"
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

test("finalized message query definition exposes a session-scoped request", () => {
  const request = codelineQueries.finalizedMessages({ sessionId: "session-1" })

  expect(request).toMatchObject({
    args: { sessionId: "session-1" },
    query: { queryName: "finalizedMessages" },
  })
})
