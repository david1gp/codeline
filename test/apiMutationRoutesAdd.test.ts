import { expect, test } from "bun:test"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiMutationRoutesAdd } from "../src/api/mutation/apiMutationRoutesAdd.js"

const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("database", {} as never)
  context.set("requestIdentity", { userId: "development:server-derived" })
  await next()
})
apiMutationRoutesAdd(app)

test("mutation protocol uses the server-derived durable identity instead of browser query identity", async () => {
  const response = await app.request("http://codeline.test/mutate?schema=test&appID=test&userID=browser-spoof", {
    body: JSON.stringify({
      clientGroupID: "client-group",
      mutations: [],
      pushVersion: 1,
      requestID: "request",
      schemaVersion: 1,
      timestamp: Date.now(),
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  const body = await response.json()

  expect(response.status).toBe(200)
  expect(body).toMatchObject({ kind: "MutateResponse", userID: "development:server-derived" })
})
