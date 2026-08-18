import { expect, test } from "bun:test"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiQueryRoutesAdd } from "../src/api/query/apiQueryRoutesAdd.js"

const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("database", {} as never)
  context.set("requestIdentity", { userId: "development:server-derived" })
  await next()
})
apiQueryRoutesAdd(app)

test("query protocol serves workspace and notes named queries", async () => {
  const response = await app.request("http://codeline.test/query?userID=browser-spoof", {
    body: JSON.stringify([
      "transform",
      [
        { args: [{ limit: 25, start: null }], id: "active-sessions", name: "activeSessions" },
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
  expect(body).toMatchObject({ kind: "QueryResponse", userID: "development:server-derived" })
  expect(body.queries).toHaveLength(4)
  expect(body.queries.map((query: { name: string }) => query.name)).toEqual([
    "activeSessions",
    "activeSession",
    "finalizedMessages",
    "notes",
  ])
})

test("query protocol reports unknown named queries without serving an unregistered query", async () => {
  const response = await app.request("http://codeline.test/query?userID=browser-spoof", {
    body: JSON.stringify(["transform", [{ args: [], id: "unknown", name: "unknown" }]]),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ kind: "QueryResponse", userID: "development:server-derived" })
  expect(body.queries[0]).toMatchObject({ error: "app", id: "unknown", name: "unknown" })
})
