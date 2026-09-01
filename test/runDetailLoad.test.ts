import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { journalWriteCreate } from "../src/journal/actions/journalWriteCreate.js"
import { apiRunRoutesAdd } from "../src/run/api/apiRunRoutesAdd.js"
import { runDetailLoad } from "../src/run/actions/runDetailLoad.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runTerminalFinalize } from "../src/run/actions/runTerminalFinalize.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runRepositoryToolDetailLoad } from "../src/run/db/runRepositoryToolDetailLoad.js"
import { runActiveStateRepositoryUpsert } from "../src/run/db/runActiveStateRepositoryUpsert.js"
import { runActiveStateTable } from "../src/run/db/runActiveStateTable.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionBoundedSnapshot } from "../src/session/actions/sessionBoundedSnapshot.js"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixturePrefix = `run-detail-${uuidv7()}`
const fixture = {
  agentId: `${fixturePrefix}-agent`,
  organizationId: `${fixturePrefix}-organization`,
  serverId: `${fixturePrefix}-server`,
  sessionId: `${fixturePrefix}-session`,
  userId: `${fixturePrefix}-user`,
}

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://run-detail-server.test",
    id: fixture.serverId,
    name: fixture.serverId,
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: fixture.agentId,
    role: "coding",
    serverId: fixture.serverId,
  })
  await database.insert(sessionTable).values({
    clientRequestId: `${fixturePrefix}-request`,
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Run detail session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(journalEventTable).where(eq(journalEventTable.userId, fixture.userId))
    await database.delete(journalSequenceCounterTable).where(eq(journalSequenceCounterTable.userId, fixture.userId))
    await database.delete(sessionTable).where(eq(sessionTable.id, fixture.sessionId))
    await database.delete(agentTable).where(eq(agentTable.id, fixture.agentId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("loads bounded run details", async () => {
  const created = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${fixturePrefix}-client-run`,
    snapshot: {
      configuration: { model: "run-detail-model", provider: "deterministic" },
      configurationRevision: `${fixturePrefix}-revision`,
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `${fixturePrefix}-stream`,
  })
  expect(created.success).toBe(true)
  if (!created.success) return

  const started = await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, {
    status: "running",
  })
  expect(started.success).toBe(true)
  if (!started.success) return

  const toolCallId = `${fixturePrefix}-tool-call`
  const oversized = `raw-prefix-${"x".repeat(12_000)}-retained-tail`
  const journal = journalWriteCreate({
    database,
    postCommitPublish: async () => createResult(undefined),
    resolveRecipients: async () => createResult([fixture.userId]),
  })
  const written = await journal.run({
    resources: [{ resourceId: created.data.run.id, resourceType: "run" }],
    write: async (_transaction, writer) => {
      for (const [eventType, payload] of [
        ["run-started", { runId: created.data.run.id, sessionId: fixture.sessionId }],
        [
          "delta",
          {
            delta: JSON.stringify({ toolCallId, toolName: "read" }),
            deltaKind: "tool",
            messageId: null,
            runId: created.data.run.id,
            sessionId: fixture.sessionId,
          },
        ],
        [
          "delta",
          {
            delta: JSON.stringify({ output: oversized, toolCallId, truncated: false }),
            deltaKind: "tool",
            messageId: null,
            runId: created.data.run.id,
            sessionId: fixture.sessionId,
          },
        ],
        [
          "delta",
          {
            delta: JSON.stringify({ outcome: "success", result: "read completed", toolCallId, truncated: false }),
            deltaKind: "tool",
            messageId: null,
            runId: created.data.run.id,
            sessionId: fixture.sessionId,
          },
        ],
      ] as const) {
        const appended = await writer.append({
          eventType,
          payload,
          resource: { resourceId: created.data.run.id, resourceType: "run" },
        })
        if (!appended.success) return appended
      }
      return createResult(undefined)
    },
  })
  expect(written.success).toBe(true)

  const finalized = await runTerminalFinalize(
    {
      database,
      journalPostCommitPublish: async () => createResult(undefined),
      runId: created.data.run.id,
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    },
    { status: "succeeded" },
  )
  expect(finalized.success).toBe(true)
  if (!finalized.success) return
  await database.delete(journalEventTable).where(eq(journalEventTable.runId, created.data.run.id))
  await database.delete(attemptTable).where(eq(attemptTable.runId, created.data.run.id))
  await database.delete(runActiveStateTable).where(eq(runActiveStateTable.runId, created.data.run.id))

  const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    cursorCodec: { encodeSessionPosition: () => createResult("detail-cursor") },
  })
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return
  expect(v.safeParse(sessionBoundedSnapshotSchema, snapshot.data).success).toBe(true)
  expect(snapshot.data.semanticSteps).toHaveLength(2)
  expect(snapshot.data.semanticSteps[0]).toMatchObject({
    detailId: created.data.run.id,
    kind: "run",
    summary: "Run completed",
  })
  expect(snapshot.data.semanticSteps[1]).toMatchObject({
    detailId: toolCallId,
    kind: "tool",
    runId: created.data.run.id,
    summary: "read · success",
  })
  expect(JSON.stringify(snapshot.data.semanticSteps)).not.toContain("raw-prefix-")

  const detail = await runDetailLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    created.data.run.id,
  )
  expect(detail.success).toBe(true)
  if (!detail.success) return
  expect(detail.data.kind).toBe("finalized")
  if (detail.data.kind !== "finalized") return
  expect(detail.data.detail.tools).toMatchObject([{ detailId: toolCallId, toolCallId, toolName: "read" }])
  expect(detail.data.detail.tools[0]?.output).toContain("[Earlier output truncated]")
  expect(detail.data.detail.tools[0]?.output).not.toContain("raw-prefix-")
  expect(detail.data.detail.transcript.activities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "tool", phase: "output", toolCallId, truncated: true }),
      expect.objectContaining({ kind: "tool", outcome: "success", phase: "result", toolCallId }),
    ]),
  )

  const tool = await runRepositoryToolDetailLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    created.data.run.id,
    toolCallId,
  )
  expect(tool).toMatchObject({
    success: true,
    data: { detail: { tool: { detailId: toolCallId, toolCallId } }, kind: "finalized" },
  })
  const unauthorized = await runDetailLoad(
    database,
    fixture.userId,
    `${fixture.organizationId}-other`,
    fixture.sessionId,
    created.data.run.id,
  )
  expect(unauthorized).toMatchObject({ code: "run.not-found", success: false })

  const api = new Hono<AppEnvironment>()
  api.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId: fixture.organizationId, userId: fixture.userId })
    await next()
  })
  apiRunRoutesAdd(api)
  const response = await api.request(
    `http://run-detail.test/sessions/${fixture.sessionId}/runs/${created.data.run.id}/detail`,
  )
  expect(response.status).toBe(200)
  expect((await response.json()) as { detail: { tools: unknown[] }; kind: string }).toMatchObject({
    detail: { tools: expect.any(Array) },
    kind: "finalized",
  })

  const unauthorizedApi = new Hono<AppEnvironment>()
  unauthorizedApi.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId: `${fixture.organizationId}-other`, userId: fixture.userId })
    await next()
  })
  apiRunRoutesAdd(unauthorizedApi)
  const unauthorizedResponse = await unauthorizedApi.request(
    `http://run-detail.test/sessions/${fixture.sessionId}/runs/${created.data.run.id}/detail`,
  )
  expect(unauthorizedResponse.status).toBe(404)
})

test.skipIf(!databaseAvailable)("returns typed active results and hides missing or unauthorized runs", async () => {
  const active = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${fixturePrefix}-active-client-run`,
    snapshot: {
      configuration: { model: "run-detail-active-model", provider: "deterministic" },
      configurationRevision: `${fixturePrefix}-active-revision`,
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `${fixturePrefix}-active-stream`,
  })
  expect(active.success).toBe(true)
  if (!active.success) return
  const activeState = await runActiveStateRepositoryUpsert(
    database,
    fixture.userId,
    fixture.sessionId,
    active.data.run.id,
    { lastSequence: 4, partialText: "active output", status: "accepted" },
  )
  expect(activeState).toMatchObject({
    success: true,
    data: { state: { lastSequence: 4, partialText: "active output" } },
  })

  const detail = await runDetailLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    active.data.run.id,
  )
  expect(detail).toMatchObject({
    success: true,
    data: {
      detail: { failure: null, lastSequence: 4, partialText: "active output" },
      kind: "active",
      run: { id: active.data.run.id, sessionId: fixture.sessionId, status: "accepted" },
    },
  })

  const tool = await runRepositoryToolDetailLoad(
    database,
    fixture.userId,
    fixture.organizationId,
    fixture.sessionId,
    active.data.run.id,
    `${fixturePrefix}-active-tool`,
  )
  expect(tool).toMatchObject({
    success: true,
    data: {
      detail: { failure: null, lastSequence: 4, partialText: "active output" },
      detailId: `${fixturePrefix}-active-tool`,
      kind: "active",
    },
  })

  expect(
    await runDetailLoad(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      `${fixturePrefix}-missing-run`,
    ),
  ).toMatchObject({ code: "run.not-found", success: false })
  expect(
    await runDetailLoad(
      database,
      fixture.userId,
      `${fixturePrefix}-other-organization`,
      fixture.sessionId,
      active.data.run.id,
    ),
  ).toMatchObject({ code: "run.not-found", success: false })
  expect(
    await runDetailLoad(
      database,
      `${fixturePrefix}-other-user`,
      fixture.organizationId,
      fixture.sessionId,
      active.data.run.id,
    ),
  ).toMatchObject({ code: "run.not-found", success: false })

  const terminal = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${fixturePrefix}-missing-finalized-client-run`,
    snapshot: {
      configuration: { model: "run-detail-missing-finalized-model", provider: "deterministic" },
      configurationRevision: `${fixturePrefix}-missing-finalized-revision`,
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `${fixturePrefix}-missing-finalized-stream`,
  })
  expect(terminal.success).toBe(true)
  if (!terminal.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, terminal.data.run.id, { status: "running" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, terminal.data.run.id, { status: "succeeded" }),
  ).toMatchObject({
    success: true,
  })
  expect(
    await runDetailLoad(database, fixture.userId, fixture.organizationId, fixture.sessionId, terminal.data.run.id),
  ).toMatchObject({ code: "run.detail-invalid", success: false })
})
