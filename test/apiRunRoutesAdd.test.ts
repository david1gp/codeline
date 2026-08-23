import { expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { runActiveRegistryCreate } from "../src/run/actions/runActiveRegistryCreate.js"
import { runCancel } from "../src/run/actions/runCancel.js"
import { runDelegationsLoad } from "../src/run/actions/runDelegationsLoad.js"
import { runSessionStreamSnapshotLoad } from "../src/run/actions/runSessionStreamSnapshotLoad.js"
import { apiRunRoutesAdd } from "../src/run/api/apiRunRoutesAdd.js"
import type { runTable } from "../src/run/db/runTable.js"

test("run cancellation route passes the authenticated session scope and exact durable IDs to the active registry", async () => {
  const app = new Hono<AppEnvironment>()
  const registry = runActiveRegistryCreate()
  const scope = { sessionId: "session-1", userId: "user-1" }
  const run = { id: "durable-target" } as typeof runTable.$inferSelect
  let received: Parameters<typeof runCancel> | undefined

  const target = registry.register({ ...scope, runId: "durable-target" })
  const descendant = registry.register({ ...scope, runId: "descendant" })
  const sibling = registry.register({ ...scope, runId: "sibling" })
  expect(target.success && descendant.success && sibling.success).toBe(true)
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: scope.userId })
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
    runActiveRegistry: registry,
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
  if (!target.success || !descendant.success || !sibling.success) return
  expect(target.data.lifecycle.signal.aborted).toBe(true)
  expect(descendant.data.lifecycle.signal.aborted).toBe(true)
  expect(sibling.data.lifecycle.signal.aborted).toBe(false)
})

test("run cancellation route rejects an invalid command body", async () => {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
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

test("delegation read route passes the authenticated organization and session scope and preserves the response shape", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: Parameters<typeof runDelegationsLoad> | undefined

  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })

  apiRunRoutesAdd(app, {
    runDelegationsLoad: async (...input) => {
      received = input
      return createResult({
        delegations: [
          {
            childRunId: "child-1",
            delegationKey: "task-1",
            id: "delegation-1",
            parentAttemptId: "attempt-1",
            parentRunId: "run-1",
            task: "Inspect the implementation.",
          },
        ],
      })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/delegations`)

  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId])
  expect(await response.json()).toEqual({
    delegations: [
      {
        childRunId: "child-1",
        delegationKey: "task-1",
        id: "delegation-1",
        parentAttemptId: "attempt-1",
        parentRunId: "run-1",
        task: "Inspect the implementation.",
      },
    ],
  })
})

test("stream snapshot route passes authenticated organization and session scope and validates its response", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: Parameters<typeof runSessionStreamSnapshotLoad> | undefined

  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })

  apiRunRoutesAdd(app, {
    runSessionStreamSnapshotLoad: async (...input) => {
      received = input
      return createResult({
        events: [
          {
            createdAt: 1,
            eventType: "text_delta",
            id: "event-1",
            payload: { delta: "hello" },
            sequence: 1,
            streamId: "stream-1",
          },
        ],
        runs: [
          {
            attempts: [{ id: "attempt-1", ordinal: 1, status: "succeeded", streamId: "stream-1" }],
            cancellationKind: null,
            clientRunId: "client-run-1",
            createdAt: 1,
            id: "run-1",
            snapshot: { target: { agentId: "agent-1" } },
            status: "succeeded",
            streamId: "stream-1",
          },
        ],
      })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/stream-snapshot`)

  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId])
  expect(await response.json()).toMatchObject({
    events: [{ eventType: "text_delta", sequence: 1, streamId: "stream-1" }],
    runs: [{ attempts: [{ ordinal: 1 }], id: "run-1" }],
  })
})

test("stream snapshot route masks missing organization authorization context", async () => {
  const app = new Hono<AppEnvironment>()
  let loaded = false
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
    await next()
  })

  apiRunRoutesAdd(app, {
    runSessionStreamSnapshotLoad: async () => {
      loaded = true
      return createResult({ events: [], runs: [] })
    },
  })

  const response = await app.request("http://codeline.test/sessions/session-1/stream-snapshot")

  expect(response.status).toBe(404)
  expect(loaded).toBe(false)
})

test("delegation read route masks a missing organization authorization context", async () => {
  const app = new Hono<AppEnvironment>()
  let loaded = false
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
    await next()
  })

  apiRunRoutesAdd(app, {
    runDelegationsLoad: async () => {
      loaded = true
      return createResult({ delegations: [] })
    },
  })

  const response = await app.request("http://codeline.test/sessions/session-1/delegations")

  expect(response.status).toBe(404)
  expect(loaded).toBe(false)
})

test("delegation read route masks an unauthorized session as not found", async () => {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { organizationId: "organization-1", userId: "user-1" })
    await next()
  })

  apiRunRoutesAdd(app, {
    runDelegationsLoad: async () => createResultError("runDelegationsLoad", "The session could not be found."),
  })

  const response = await app.request("http://codeline.test/sessions/session-1/delegations")

  expect(response.status).toBe(404)
})
