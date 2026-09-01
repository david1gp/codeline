import { afterAll, expect, test } from "bun:test"
import { createResult, createResultErrorCode } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { apiRunRoutesAdd } from "../src/run/api/apiRunRoutesAdd.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runRepositoryActiveListLoad } from "../src/run/db/runRepositoryActiveListLoad.js"
import { runRepositoryActiveSnapshotLoad } from "../src/run/db/runRepositoryActiveSnapshotLoad.js"
import { runRepositorySessionSnapshotLoad } from "../src/run/db/runRepositorySessionSnapshotLoad.js"
import { runActiveStateTable } from "../src/run/db/runActiveStateTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { runErrorCodes } from "../src/run/errors/runErrorCodes.js"
import { runActiveSnapshotFetch } from "../src/run/ui/runActiveSnapshotFetch.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)

afterAll(async () => {
  await databaseConnectionClose(connection)
})

test("active snapshot route passes authorization scope and validates its response", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: unknown[] | undefined

  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })
  apiRunRoutesAdd(app, {
    runActiveSnapshotLoad: async (...input) => {
      received = input
      return createResult({
        failure: { code: "provider_timeout", message: "The provider timed out." },
        lastSequence: 12,
        partialText: "partial",
        status: "failed",
      })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/runs/run-1/snapshot`)

  expect(response.status).toBe(200)
  expect(received?.slice(1, 5)).toEqual([scope.userId, scope.organizationId, scope.sessionId, "run-1"])
  expect(await response.json()).toEqual({
    failure: { code: "provider_timeout", message: "The provider timed out." },
    lastSequence: 12,
    partialText: "partial",
    status: "failed",
  })
})

test("active snapshot route hides unauthorized and malformed results", async () => {
  const app = new Hono<AppEnvironment>()
  let loaded = false
  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
    await next()
  })
  apiRunRoutesAdd(app, {
    runActiveSnapshotLoad: async () => {
      loaded = true
      return createResult({ lastSequence: 0, partialText: "", status: "running" })
    },
  })

  const unauthorized = await app.request("http://codeline.test/sessions/session-1/runs/run-1/snapshot")
  expect(unauthorized.status).toBe(404)
  expect(loaded).toBe(false)

  const malformedApp = new Hono<AppEnvironment>()
  malformedApp.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { organizationId: "organization-1", userId: "user-1" })
    await next()
  })
  apiRunRoutesAdd(malformedApp, {
    runActiveSnapshotLoad: async () => createResult({ lastSequence: -1, partialText: "", status: "running" }),
  })
  const malformed = await malformedApp.request("http://codeline.test/sessions/session-1/runs/run-1/snapshot")
  expect(malformed.status).toBe(500)

  const missingApp = new Hono<AppEnvironment>()
  missingApp.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { organizationId: "organization-1", userId: "user-1" })
    await next()
  })
  apiRunRoutesAdd(missingApp, {
    runActiveSnapshotLoad: async () =>
      createResultErrorCode("runActiveSnapshotLoad", "The target is unavailable.", runErrorCodes.notFound),
  })
  const missing = await missingApp.request("http://codeline.test/sessions/session-1/runs/run-1/snapshot")
  expect(missing.status).toBe(404)
})

test("active run list route scopes by organization and validates its response", async () => {
  const app = new Hono<AppEnvironment>()
  const scope = { organizationId: "organization-1", sessionId: "session-1", userId: "user-1" }
  let received: unknown[] | undefined

  app.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", scope)
    await next()
  })
  apiRunRoutesAdd(app, {
    runActiveListLoad: async (...input) => {
      received = input
      return createResult({ runs: [{ runId: "run-1", status: "running" as const }] })
    },
  })

  const response = await app.request(`http://codeline.test/sessions/${scope.sessionId}/active-runs`)
  expect(response.status).toBe(200)
  expect(received?.slice(1)).toEqual([scope.userId, scope.organizationId, scope.sessionId])
  expect(response.headers.get("cache-control")).toBe("private, no-cache")
  expect(await response.json()).toEqual({ runs: [{ runId: "run-1", status: "running" }] })

  const unscoped = new Hono<AppEnvironment>()
  let loaded = false
  unscoped.use("*", async (context, next) => {
    context.set("database", {} as AppEnvironment["Variables"]["database"])
    context.set("requestIdentity", { userId: "user-1" })
    await next()
  })
  apiRunRoutesAdd(unscoped, {
    runActiveListLoad: async () => {
      loaded = true
      return createResult({ runs: [] })
    },
  })
  expect((await unscoped.request("http://codeline.test/sessions/session-1/active-runs")).status).toBe(404)
  expect(loaded).toBe(false)
})

test("active snapshot client requests and validates the typed response", async () => {
  let request: { input: RequestInfo | URL; init?: RequestInit } | undefined
  const loaded = await runActiveSnapshotFetch("session/a", "run/a", {
    fetch: async (input, init) => {
      request = { input, init }
      return new Response(
        JSON.stringify({
          failure: { code: "provider_timeout", message: "The provider timed out." },
          lastSequence: 7,
          partialText: "hello",
          status: "failed",
        }),
        {
          headers: { "Content-Type": "application/json" },
          status: 200,
        },
      )
    },
  })

  expect(loaded).toMatchObject({
    success: true,
    data: {
      failure: { code: "provider_timeout", message: "The provider timed out." },
      lastSequence: 7,
      partialText: "hello",
      status: "failed",
    },
  })
  expect(request?.input).toBe("/api/sessions/session%2Fa/runs/run%2Fa/snapshot")
  expect(request?.init?.method).toBe("GET")

  const invalid = await runActiveSnapshotFetch("session-1", "run-1", {
    fetch: async () =>
      new Response(JSON.stringify({ lastSequence: -1, partialText: "hello", status: "accepted" }), { status: 200 }),
  })
  expect(invalid).toMatchObject({ code: "invalid_response", success: false })
})

const activeSnapshotRepositoryTest = async () => {
  const suffix = uuidv7()
  const userId = `active-snapshot-user-${suffix}`
  const otherUserId = `active-snapshot-other-user-${suffix}`
  const organizationId = `active-snapshot-organization-${suffix}`
  const serverId = `active-snapshot-server-${suffix}`
  const agentId = `active-snapshot-agent-${suffix}`
  const sessionId = `active-snapshot-session-${suffix}`
  const runId = `active-snapshot-run-${suffix}`
  const now = new Date()

  try {
    await database.insert(applicationUserTable).values([
      { displayName: userId, id: userId },
      { displayName: otherUserId, id: otherUserId },
    ])
    await database.insert(organizationTable).values({
      externalId: organizationId,
      id: organizationId,
      name: organizationId,
    })
    await database.insert(serverTable).values({
      endpoint: "http://active-snapshot.test",
      id: serverId,
      name: serverId,
      organizationId,
    })
    await database.insert(agentTable).values({ id: agentId, name: agentId, role: "coding", serverId })
    await database.insert(sessionTable).values({
      clientRequestId: uuidv7(),
      id: sessionId,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title: "Active snapshot",
      userId,
    })
    await database.insert(runTable).values({
      budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
      clientRunId: `client-${suffix}`,
      deadlineAt: new Date(now.getTime() + 10_000),
      id: runId,
      sessionId,
      snapshot: {
        configuration: { model: "deterministic", provider: "deterministic" },
        configurationRevision: "revision",
        target: { agentId, serverId },
      },
      status: "running",
      streamId: `stream-${suffix}`,
      updatedAt: now,
      userId,
    })
    await database.insert(attemptTable).values({
      budget: { maxAttempts: 1, maxChildDepth: 0, maxChildRuns: 0, maxDurationMs: 10_000 },
      id: `attempt-${suffix}`,
      ordinal: 1,
      runId,
      sessionId,
      snapshot: {
        configuration: { model: "deterministic", provider: "deterministic" },
        configurationRevision: "revision",
        target: { agentId, serverId },
      },
      status: "running",
      streamId: `stream-${suffix}`,
      updatedAt: now,
      userId,
    })
    await database.insert(runActiveStateTable).values({
      changePosition: 1,
      lastSequence: 8,
      partialText: "hello world",
      runId,
      sessionId,
      status: "running",
      userId,
    })
    await database.insert(journalEventTable).values([
      {
        createdAt: now,
        eventType: "delta",
        id: `delta-thinking-${suffix}`,
        payload: { delta: "internal", deltaKind: "thinking", messageId: null, runId, sessionId },
        runId,
        sequence: 2,
        serializedBytes: 1,
        userId,
      },
      {
        createdAt: now,
        eventType: "delta",
        id: `delta-text-a-${suffix}`,
        payload: { delta: "hello ", deltaKind: "text", messageId: null, runId, sessionId },
        runId,
        sequence: 5,
        serializedBytes: 1,
        userId,
      },
      {
        createdAt: now,
        eventType: "delta",
        id: `delta-text-b-${suffix}`,
        payload: { delta: "world", deltaKind: "text", messageId: null, runId, sessionId },
        runId,
        sequence: 8,
        serializedBytes: 1,
        userId,
      },
    ])

    expect(await runRepositoryActiveSnapshotLoad(database, userId, organizationId, sessionId, runId)).toMatchObject({
      success: true,
      data: { lastCursor: null, lastSequence: 8, partialText: "hello world", status: "running" },
    })
    // The route encodes deterministically so repeated snapshot reads of identical
    // state return one cursor a reloaded tab can compare and attach after.
    const codec = journalCursorCodecCreate({
      randomBytes: () => new Uint8Array(12).fill(7),
      secret: "active-snapshot-cursor-secret",
    })
    if (!codec.success) throw new Error(codec.errorMessage)
    const cursored = async () =>
      runRepositoryActiveSnapshotLoad(database, userId, organizationId, sessionId, runId, {
        cursorEncode: codec.data.encodeDeterministic,
      })
    const first = await cursored()
    const second = await cursored()
    expect(first).toMatchObject({ success: true })
    expect(first.success && second.success && first.data.lastCursor).toBe(
      (second.success && second.data.lastCursor) as string,
    )
    expect(codec.data.validate(first.success ? first.data.lastCursor : "", userId)).toMatchObject({
      success: true,
      data: { sequence: 8 },
    })

    // The opaque cursor lets a reloaded tab attach the feed after the folded output.
    expect(
      await runRepositoryActiveSnapshotLoad(database, userId, organizationId, sessionId, runId, {
        cursorEncode: (journalId, sequence) => createResult(`cursor-${String(journalId)}-${String(sequence)}`),
      }),
    ).toMatchObject({
      success: true,
      data: { lastCursor: `cursor-${userId}-8`, lastSequence: 8 },
    })
    expect(await runRepositoryActiveListLoad(database, userId, organizationId, sessionId)).toMatchObject({
      success: true,
      data: { runs: [{ runId, status: "running" }] },
    })
    expect(await runRepositorySessionSnapshotLoad(database, userId, organizationId, sessionId)).toMatchObject({
      success: true,
      data: {
        events: [
          { attemptOrdinal: 1, eventType: "delta", sequence: 2, streamId: `stream-${suffix}` },
          { attemptOrdinal: 1, eventType: "delta", sequence: 5, streamId: `stream-${suffix}` },
          { attemptOrdinal: 1, eventType: "delta", sequence: 8, streamId: `stream-${suffix}` },
        ],
        runs: [
          {
            attempts: [{ id: `attempt-${suffix}`, ordinal: 1, status: "running", streamId: `stream-${suffix}` }],
            id: runId,
            status: "running",
          },
        ],
      },
    })

    const failure = { code: "provider_timeout", message: "The provider timed out." }
    await database.update(runTable).set({ failure, status: "failed" }).where(eq(runTable.id, runId))
    await database.update(attemptTable).set({ failure, status: "failed" }).where(eq(attemptTable.runId, runId))
    expect(await runRepositoryActiveSnapshotLoad(database, userId, organizationId, sessionId, runId)).toMatchObject({
      success: true,
      data: { failure, status: "failed" },
    })
    expect(await runRepositorySessionSnapshotLoad(database, userId, organizationId, sessionId)).toMatchObject({
      success: true,
      data: { runs: [{ failure, id: runId, status: "failed" }] },
    })
    expect(await runRepositoryActiveListLoad(database, otherUserId, organizationId, sessionId)).toMatchObject({
      code: runErrorCodes.sessionNotFound,
      errorMessage: "The session could not be found.",
      success: false,
    })
    expect(
      await runRepositoryActiveSnapshotLoad(database, otherUserId, organizationId, sessionId, runId),
    ).toMatchObject({
      code: runErrorCodes.notFound,
      errorMessage: "The run could not be found.",
      success: false,
    })
    expect(
      await runRepositoryActiveSnapshotLoad(database, userId, "other-organization", sessionId, runId),
    ).toMatchObject({
      code: runErrorCodes.notFound,
      errorMessage: "The run could not be found.",
      success: false,
    })
  } finally {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, otherUserId))
    await database.delete(serverTable).where(eq(serverTable.id, serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, organizationId))
  }
}

test.skipIf(!databaseAvailable)(
  "active snapshot repository folds authorized journal deltas in one snapshot",
  activeSnapshotRepositoryTest,
)
