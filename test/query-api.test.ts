import { expect, test } from "bun:test"
import { appCreate } from "../src/app/appCreate.js"

const app = appCreate()

test("query protocol serves workspace and notes named queries", async () => {
  const response = await app.request("http://codeline.test/api/query", {
    body: JSON.stringify([
      "transform",
      [
        { args: [], id: "active-sessions", name: "activeSessions" },
        { args: [{ sessionId: "session-1" }], id: "active-session", name: "activeSession" },
        { args: [{ sessionId: "session-1" }], id: "finalized-messages", name: "finalizedMessages" },
        { args: [], id: "notes", name: "notes" },
      ],
    ]),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ kind: "QueryResponse", userID: "local-development" })
  expect(body.queries).toHaveLength(4)
  expect(body.queries.map((query: { name: string }) => query.name)).toEqual([
    "activeSessions",
    "activeSession",
    "finalizedMessages",
    "notes",
  ])
})

test("query protocol reports unknown named queries without serving an unregistered query", async () => {
  const response = await app.request("http://codeline.test/api/query", {
    body: JSON.stringify(["transform", [{ args: [], id: "unknown", name: "unknown" }]]),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ kind: "QueryResponse", userID: "local-development" })
  expect(body.queries[0]).toMatchObject({ error: "app", id: "unknown", name: "unknown" })
})
