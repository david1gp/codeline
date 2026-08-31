import { expect, test } from "bun:test"
import { createResult, createResultErrorCode } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { runActiveRegistryCreate } from "../src/run/actions/runActiveRegistryCreate.js"
import { runCancel } from "../src/run/actions/runCancel.js"
import { runDelegationsLoad } from "../src/run/actions/runDelegationsLoad.js"
import { apiRunRoutesAdd } from "../src/run/api/apiRunRoutesAdd.js"
import type { runTable } from "../src/run/db/runTable.js"
import { runErrorCodes } from "../src/run/errors/runErrorCodes.js"

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

test("run cancellation route rejects an invalid response contract", async () => {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
    await next()
  })
  apiRunRoutesAdd(app, {
    runCancel: async () =>
      createResult({
        cancelledRunIds: [1] as unknown as string[],
        changed: true,
        descendantsCancelled: 0,
        run: {} as never,
      }),
    runLoad: async () => createResult({ attempt: {} as never, attempts: [], run: {} as never }),
  })

  const response = await app.request("http://codeline.test/sessions/session-1/runs/target/cancel", {
    body: JSON.stringify({}),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  expect(response.status).toBe(500)
})

test("delegation read route passes the authenticated organization and session scope and preserves the response shape", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: Parameters<typeof runDelegationsLoad> | undefined
  let revision = 4

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
            childSessionId: "child-session-1",
            childRunId: "child-1",
            delegationKey: "task-1",
            id: "delegation-1",
            parentAttemptId: "attempt-1",
            parentRunId: "run-1",
            parentSessionId: scope.sessionId,
            task: "Inspect the implementation.",
          },
        ],
        revision,
      })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/delegations`)

  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId])
  expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(response.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
  const firstEtag = response.headers.get("ETag")
  expect(firstEtag).toMatch(/^".+"$/)
  expect(await response.json()).toMatchObject({
    delegations: [
      {
        childSessionId: "child-session-1",
        childRunId: "child-1",
        delegationKey: "task-1",
        id: "delegation-1",
        parentAttemptId: "attempt-1",
        parentRunId: "run-1",
        parentSessionId: scope.sessionId,
        task: "Inspect the implementation.",
      },
    ],
    etag: firstEtag,
    revision: 4,
    schemaVersion: "run-delegations.v1",
  })

  const notModified = await app.request(`http://codeline.test/sessions/${scope.sessionId}/delegations`, {
    headers: { "If-None-Match": firstEtag ?? "" },
  })
  expect(notModified.status).toBe(304)
  expect(notModified.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(await notModified.text()).toBe("")

  revision = 5
  const changed = await app.request(`http://codeline.test/sessions/${scope.sessionId}/delegations`, {
    headers: { "If-None-Match": firstEtag ?? "" },
  })
  expect(changed.status).toBe(200)
  expect(changed.headers.get("ETag")).not.toBe(firstEtag)
  expect((await changed.json()).revision).toBe(5)
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
      return createResult({ delegations: [], revision: 1 })
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
    runDelegationsLoad: async () => {
      const result = createResultErrorCode(
        "runDelegationsLoad",
        "The session lookup returned no visible resource.",
        runErrorCodes.sessionNotFound,
      )
      result.errorData = JSON.stringify({ sessionId: "session-1" })
      return result
    },
  })

  const response = await app.request("http://codeline.test/sessions/session-1/delegations")

  expect(response.status).toBe(404)
  expect(await response.json()).toMatchObject({
    error: {
      code: runErrorCodes.sessionNotFound,
      details: { sessionId: "session-1" },
      message: "The session lookup returned no visible resource.",
      op: "runDelegationsLoad",
      retryable: false,
      status: 404,
    },
  })
})

test("session run snapshot route passes the authenticated scope and returns persisted run state", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: unknown[] | undefined
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })

  apiRunRoutesAdd(app, {
    runSessionSnapshotLoad: async (...input) => {
      received = input
      return createResult({
        events: [
          {
            attemptOrdinal: 1,
            eventType: "delta",
            payload: { delta: "hello", deltaKind: "text", messageId: null, runId: "run-1", sessionId: scope.sessionId },
            sequence: 2,
            streamId: "stream-1",
          },
        ],
        runs: [
          {
            attempts: [{ id: "attempt-1", ordinal: 1, status: "failed", streamId: "stream-1" }],
            cancellationKind: null,
            createdAt: 1,
            failure: { code: "provider_failed", message: "The provider failed." },
            id: "run-1",
            status: "failed",
            streamId: "stream-1",
          },
        ],
      })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/runs/snapshot`)

  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId])
  expect(response.headers.get("cache-control")).toBe("private, no-cache")
  expect(await response.json()).toMatchObject({
    events: [{ eventType: "delta", sequence: 2, streamId: "stream-1" }],
    runs: [
      {
        attempts: [{ id: "attempt-1" }],
        failure: { code: "provider_failed", message: "The provider failed." },
        id: "run-1",
        status: "failed",
      },
    ],
  })
})

test("session run snapshot client encodes the session ID and validates the response", async () => {
  const { runSessionSnapshotFetch } = await import("../src/run/ui/runSessionSnapshotFetch.js")
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined
  const loaded = await runSessionSnapshotFetch("session/a", {
    fetch: async (input, init) => {
      request = { input, init }
      return new Response(JSON.stringify({ events: [], runs: [] }), { status: 200 })
    },
  })

  expect(loaded).toMatchObject({ success: true, data: { events: [], runs: [] } })
  expect(request?.input).toBe("/api/sessions/session%2Fa/runs/snapshot")
  expect(request?.init?.method).toBe("GET")
})

test("run detail routes pass the authenticated scope and keep run and tool detail separate", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let runScope: unknown[] | undefined
  let toolScope: unknown[] | undefined
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })

  apiRunRoutesAdd(app, {
    runDetailLoad: async (...input) => {
      runScope = input
      return createResult({
        run: { cancellationKind: null, failure: null, id: "run-1", sessionId: scope.sessionId, status: "succeeded" },
        tools: [
          {
            detailId: "tool-1",
            outcome: "success",
            result: "bounded result",
            resultTruncated: false,
            sequence: 2,
            toolCallId: "call-1",
            toolName: "read",
          },
        ],
        transcript: {
          activities: [],
          assistantText: "",
          attempts: [{ ordinal: 1, status: "succeeded" }],
          cancellation: null,
          failure: null,
          invariantViolations: [],
          terminalOutcome: { status: "completed" },
        },
      })
    },
    runToolDetailLoad: async (...input) => {
      toolScope = input
      return createResult({
        runId: "run-1",
        sessionId: scope.sessionId,
        tool: {
          detailId: "tool-1",
          outcome: "success",
          result: "bounded result",
          resultTruncated: false,
          sequence: 2,
          toolCallId: "call-1",
          toolName: "read",
        },
      })
    },
  })

  const runResponse = await app.request(`http://codeline.test/sessions/${scope.sessionId}/runs/run-1/detail`)
  expect(runResponse.status).toBe(200)
  expect(runScope?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId, "run-1"])
  expect(await runResponse.json()).toMatchObject({
    run: { id: "run-1", status: "succeeded" },
    tools: [{ detailId: "tool-1", toolCallId: "call-1" }],
    transcript: { activities: [] },
  })

  const toolResponse = await app.request(
    `http://codeline.test/sessions/${scope.sessionId}/runs/run-1/tools/tool-1/detail`,
  )
  expect(toolResponse.status).toBe(200)
  expect(toolScope?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId, "run-1", "tool-1"])
  expect(await toolResponse.json()).toMatchObject({ tool: { detailId: "tool-1", result: "bounded result" } })
})
