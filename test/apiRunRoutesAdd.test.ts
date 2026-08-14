import { expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import type { DevelopmentUser } from "../src/identity/db/developmentUserUpsert.js"
import { apiRunRoutesAdd } from "../src/run/api/apiRunRoutesAdd.js"
import { runCancel } from "../src/run/actions/runCancel.js"
import { runCancellationCoordinatorCreate } from "../src/run/actions/runCancellationCoordinatorCreate.js"
import type { runTable } from "../src/run/db/runTable.js"

test("run cancellation route passes the authenticated session scope and exact durable IDs to the coordinator", async () => {
  const app = new Hono<AppEnvironment>()
  const coordinator = runCancellationCoordinatorCreate()
  const target = new AbortController()
  const descendant = new AbortController()
  const sibling = new AbortController()
  const scope = { sessionId: "session-1", userId: "user-1" }
  const run = { id: "durable-target" } as typeof runTable.$inferSelect
  let received: Parameters<typeof runCancel> | undefined

  coordinator.register({ ...scope, controller: target, runId: "durable-target" })
  coordinator.register({ ...scope, controller: descendant, runId: "descendant" })
  coordinator.register({ ...scope, controller: sibling, runId: "sibling" })
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("developmentUser", { id: scope.userId } as DevelopmentUser)
    await next()
  })

  apiRunRoutesAdd(app, {
    runLoad: async (...input) => {
      expect(input.slice(1)).toEqual([scope.userId, scope.sessionId, "client-target"])
      return createResult({ attempt: {} as never, attempts: [], run })
    },
    runCancel: async (...input) => {
      received = input
      return createResult({
        cancelledRunIds: ["durable-target", "descendant"],
        changed: true,
        descendantsCancelled: 1,
        run,
      })
    },
    runCancellationCoordinator: coordinator,
  })

  const response = await app.request("http://codeline.test/sessions/session-1/runs/client-target/cancel", {
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.sessionId, "durable-target", { kind: "requested" }])
  expect(await response.json()).toMatchObject({
    cancelledRunIds: ["durable-target", "descendant"],
    descendantsCancelled: 1,
    signalledRunIds: ["durable-target", "descendant"],
  })
  expect(target.signal.aborted).toBe(true)
  expect(descendant.signal.aborted).toBe(true)
  expect(sibling.signal.aborted).toBe(false)
})

test("run cancellation route rejects an invalid command body", async () => {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("developmentUser", { id: "user-1" } as DevelopmentUser)
    await next()
  })
  apiRunRoutesAdd(app, {
    runCancel: async () => createResult({} as never),
    runLoad: async () => createResult({ attempt: {} as never, attempts: [], run: {} as never }),
  })

  const response = await app.request("http://codeline.test/sessions/session-1/runs/target/cancel", {
    body: JSON.stringify({ unexpected: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(400)
})
