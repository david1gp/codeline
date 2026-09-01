import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { and, asc, eq, inArray } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { runActiveRegistryCreate } from "../src/run/actions/runActiveRegistryCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runStartupInterruptionReconcile } from "../src/run/actions/runStartupInterruptionReconcile.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runActiveStateTable } from "../src/run/db/runActiveStateTable.js"
import { runFinalizedDetailTable } from "../src/run/db/runFinalizedDetailTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverStart } from "../src/server/serverStart.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const databaseDirectory = mkdtempSync(path.join(os.tmpdir(), "codeline-startup-interruption-"))
const testDatabasePath = path.join(databaseDirectory, "database.sqlite")
const migrated = await databaseMigrate(testDatabasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(testDatabasePath)
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `startup-interrupt-agent-${uuidv7()}`,
  organizationId: `startup-interrupt-organization-${uuidv7()}`,
  serverId: `startup-interrupt-server-${uuidv7()}`,
  sessionId: `startup-interrupt-session-${uuidv7()}`,
  userId: `startup-interrupt-user-${uuidv7()}`,
}
const scheduler = {
  clearTimeout: (_handle: unknown) => undefined,
  setTimeout: (_handler: () => void, _timeoutMs: number) => 1,
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
    endpoint: "http://startup-interrupt-server.test",
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
    clientRequestId: uuidv7(),
    id: fixture.sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Startup interruption session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  rmSync(databaseDirectory, { force: true, recursive: true })
})

test.skipIf(!databaseAvailable)("interrupts active runs atomically and retains their partial output", async () => {
  const runInput = (clientRunId: string, streamId: string) => ({
    budget: { maxDurationMs: 10_000 },
    clientRunId,
    snapshot: {
      configuration: { model: "deterministic-model", provider: "deterministic" as const },
      configurationRevision: "configuration-revision-1",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId,
  })
  const accepted = await runCreate(
    database,
    fixture.userId,
    fixture.sessionId,
    runInput(`accepted-${uuidv7()}`, `accepted-stream-${uuidv7()}`),
  )
  const running = await runCreate(
    database,
    fixture.userId,
    fixture.sessionId,
    runInput(`running-${uuidv7()}`, `running-stream-${uuidv7()}`),
  )
  expect(accepted.success).toBe(true)
  expect(running.success).toBe(true)
  if (!accepted.success || !running.success) return
  expect(
    await runTransition(database, fixture.userId, fixture.sessionId, running.data.run.id, { status: "running" }),
  ).toMatchObject({ success: true })

  await database.insert(journalSequenceCounterTable).values({
    nextSequence: 2,
    userId: fixture.userId,
  })
  await database.insert(journalEventTable).values({
    eventType: "delta",
    id: uuidv7(),
    payload: {
      delta: "partial output",
      deltaKind: "text",
      messageId: null,
      runId: running.data.run.id,
      sessionId: fixture.sessionId,
    },
    runId: running.data.run.id,
    sequence: 1,
    serializedBytes: 100,
    userId: fixture.userId,
  })

  const published: Array<typeof journalEventTable.$inferSelect> = []
  let observedCommittedState = false
  const reconciled = await runStartupInterruptionReconcile({
    database,
    postCommitPublish: async (events) => {
      const [session] = await database
        .select({ revision: sessionTable.revision })
        .from(sessionTable)
        .where(eq(sessionTable.id, fixture.sessionId))
      const runs = await database
        .select({ id: runTable.id, status: runTable.status })
        .from(runTable)
        .where(inArray(runTable.id, [accepted.data.run.id, running.data.run.id]))
      observedCommittedState = session?.revision === 2 && runs.every((run) => run.status === "aborted")
      published.push(...events)
      return createResult(undefined)
    },
  })

  expect(reconciled).toMatchObject({
    success: true,
    data: { interruptedRunIds: [accepted.data.run.id, running.data.run.id].sort() },
  })
  expect(observedCommittedState).toBe(true)
  expect(
    await database
      .select({ status: runTable.status, failure: runTable.failure })
      .from(runTable)
      .where(inArray(runTable.id, [accepted.data.run.id, running.data.run.id]))
      .orderBy(asc(runTable.id)),
  ).toMatchObject([
    { failure: { code: "chat_interrupted" }, status: "aborted" },
    { failure: { code: "chat_interrupted" }, status: "aborted" },
  ])
  expect(
    await database
      .select({ status: attemptTable.status })
      .from(attemptTable)
      .where(inArray(attemptTable.runId, [accepted.data.run.id, running.data.run.id])),
  ).toMatchObject([{ status: "aborted" }, { status: "aborted" }])
  const journalEvents = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, fixture.userId))
    .orderBy(asc(journalEventTable.sequence))
  const interruptionEvents = journalEvents.filter((event) => event.eventType === "run-interrupted")
  expect(interruptionEvents).toHaveLength(2)
  expect(interruptionEvents.map((event) => (event.payload as { sessionRevision: number }).sessionRevision)).toEqual([
    2, 2,
  ])
  expect(published.map((event) => event.eventType)).toEqual(["run-interrupted", "run-interrupted"])
  expect(
    await database
      .select({ id: runActiveStateTable.runId })
      .from(runActiveStateTable)
      .where(inArray(runActiveStateTable.runId, [accepted.data.run.id, running.data.run.id])),
  ).toHaveLength(0)
  expect(
    await database
      .select({ id: runFinalizedDetailTable.runId })
      .from(runFinalizedDetailTable)
      .where(inArray(runFinalizedDetailTable.runId, [accepted.data.run.id, running.data.run.id])),
  ).toHaveLength(2)
  const interruptedHistoryEntries = await database
    .select({
      changePosition: sessionHistoryEntryTable.changePosition,
      payload: sessionHistoryEntryTable.payload,
      sourceId: sessionHistoryEntryTable.sourceId,
    })
    .from(sessionHistoryEntryTable)
    .where(
      and(
        eq(sessionHistoryEntryTable.sessionId, fixture.sessionId),
        inArray(sessionHistoryEntryTable.sourceId, [accepted.data.run.id, running.data.run.id]),
        eq(sessionHistoryEntryTable.sourceType, "run"),
      ),
    )
  expect(interruptedHistoryEntries).toMatchObject([
    { payload: { status: "aborted", terminalKind: "interrupted" } },
    { payload: { status: "aborted", terminalKind: "interrupted" } },
  ])
  for (const event of interruptionEvents) {
    const entry = interruptedHistoryEntries.find((candidate) => candidate.sourceId === event.runId)
    expect(event.payload).toMatchObject({ changePosition: entry?.changePosition })
  }
  expect(
    await database
      .select({ id: journalEventTable.id })
      .from(journalEventTable)
      .where(and(eq(journalEventTable.runId, running.data.run.id), eq(journalEventTable.eventType, "delta"))),
  ).toHaveLength(0)
  const [interruptedDetail] = await database
    .select()
    .from(runFinalizedDetailTable)
    .where(eq(runFinalizedDetailTable.runId, running.data.run.id))
  expect(interruptedDetail).toMatchObject({
    transcript: { terminalOutcome: { reason: "The API process stopped while the run was active.", status: "aborted" } },
  })

  const repeated = await runStartupInterruptionReconcile({
    database,
    postCommitPublish: async (events) => {
      published.push(...events)
      return createResult(undefined)
    },
  })
  expect(repeated).toEqual({ success: true, data: { interruptedRunIds: [] } })
  expect(published).toHaveLength(2)
})

test.skipIf(!databaseAvailable)("finalizes interrupted tool details before deleting their deltas", async () => {
  const sessionId = `startup-tool-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Startup tool interruption",
    userId: fixture.userId,
  })

  try {
    const created = await runCreate(database, fixture.userId, sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `startup-tool-client-${uuidv7()}`,
      snapshot: {
        configuration: { model: "deterministic-model", provider: "deterministic" as const },
        configurationRevision: "configuration-revision-1",
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `startup-tool-stream-${uuidv7()}`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return
    expect(
      await runTransition(database, fixture.userId, sessionId, created.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    const provider = runProviderOutputCreate({
      database,
      journalPostCommitPublish: async () => createResult(undefined),
      requestId: `startup-tool-request-${uuidv7()}`,
      runId: created.data.run.id,
      scheduler,
      sessionId,
      userId: fixture.userId,
    })
    const toolCallId = "startup-interrupted-tool"
    expect(await provider.append({ eventType: "tool_start", payload: { toolCallId, toolName: "bash" } })).toMatchObject(
      {
        success: true,
      },
    )
    await provider.flush()
    expect(
      await provider.append({
        eventType: "tool_output",
        payload: { output: "partial output", toolCallId, truncated: false },
      }),
    ).toMatchObject({ success: true })
    await provider.flush()

    const reconciled = await runStartupInterruptionReconcile({
      database,
      postCommitPublish: async () => createResult(undefined),
    })
    expect(reconciled).toEqual({ success: true, data: { interruptedRunIds: [created.data.run.id] } })
    expect(
      await database
        .select({ id: journalEventTable.id })
        .from(journalEventTable)
        .where(and(eq(journalEventTable.runId, created.data.run.id), eq(journalEventTable.eventType, "delta"))),
    ).toHaveLength(0)
    const [detail] = await database
      .select()
      .from(runFinalizedDetailTable)
      .where(eq(runFinalizedDetailTable.runId, created.data.run.id))
    expect(detail).toMatchObject({
      tools: [expect.objectContaining({ output: "partial output", toolCallId, toolName: "bash" })],
      transcript: { terminalOutcome: { status: "aborted" } },
    })
    expect(
      await database
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.sourceType, "tool"),
            eq(sessionHistoryEntryTable.sourceId, created.data.run.id),
            eq(sessionHistoryEntryTable.sourceDetailId, toolCallId),
          ),
        ),
    ).toMatchObject([{ payload: { outputAvailable: true, summary: "bash · running", toolCallId } }])
  } finally {
    await database.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  }
})

test.skipIf(!databaseAvailable)("rolls back startup interruption when finalized detail persistence fails", async () => {
  const sessionId = `startup-rollback-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Startup interruption rollback",
    userId: fixture.userId,
  })

  try {
    const created = await runCreate(database, fixture.userId, sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `startup-rollback-client-${uuidv7()}`,
      snapshot: {
        configuration: { model: "deterministic-model", provider: "deterministic" as const },
        configurationRevision: "configuration-revision-1",
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `startup-rollback-stream-${uuidv7()}`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return
    expect(
      await runTransition(database, fixture.userId, sessionId, created.data.run.id, { status: "running" }),
    ).toMatchObject({
      success: true,
    })
    const provider = runProviderOutputCreate({
      database,
      journalPostCommitPublish: async () => createResult(undefined),
      requestId: `startup-rollback-request-${uuidv7()}`,
      runId: created.data.run.id,
      scheduler,
      sessionId,
      userId: fixture.userId,
    })
    expect(await provider.append({ delta: "retain this delta", type: "TEXT_MESSAGE_CONTENT" })).toMatchObject({
      success: true,
    })
    await provider.flush()

    const reconciled = await runStartupInterruptionReconcile({
      database,
      postCommitPublish: async () => createResult(undefined),
      runFinalizedDetailUpsert: async () => createResultError("failureInjection", "detail persistence failed"),
    })
    expect(reconciled).toMatchObject({ success: false })
    expect(
      await database.select({ status: runTable.status }).from(runTable).where(eq(runTable.id, created.data.run.id)),
    ).toEqual([{ status: "running" }])
    expect(
      await database
        .select({ status: attemptTable.status })
        .from(attemptTable)
        .where(eq(attemptTable.runId, created.data.run.id)),
    ).toEqual([{ status: "running" }])
    expect(
      await database.select().from(runActiveStateTable).where(eq(runActiveStateTable.runId, created.data.run.id)),
    ).toHaveLength(1)
    expect(
      await database
        .select()
        .from(runFinalizedDetailTable)
        .where(eq(runFinalizedDetailTable.runId, created.data.run.id)),
    ).toHaveLength(0)
    expect(
      await database
        .select({ eventType: journalEventTable.eventType })
        .from(journalEventTable)
        .where(eq(journalEventTable.runId, created.data.run.id)),
    ).toEqual([{ eventType: "delta" }])
    expect(
      await database
        .select()
        .from(sessionHistoryEntryTable)
        .where(
          and(
            eq(sessionHistoryEntryTable.sourceType, "run"),
            eq(sessionHistoryEntryTable.sourceId, created.data.run.id),
          ),
        ),
    ).toMatchObject([{ payload: { status: "running" } }])
  } finally {
    await database.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  }
})

test.skipIf(!databaseAvailable)("does not reconcile a run already owned by the current process", async () => {
  const sessionId = `startup-owned-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Current-process startup ownership",
    userId: fixture.userId,
  })

  try {
    const created = await runCreate(database, fixture.userId, sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `owned-client-${uuidv7()}`,
      snapshot: {
        configuration: { model: "deterministic-model", provider: "deterministic" as const },
        configurationRevision: "configuration-revision-1",
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `owned-stream-${uuidv7()}`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const registry = runActiveRegistryCreate()
    const registered = registry.register({
      runId: created.data.run.id,
      sessionId,
      userId: fixture.userId,
    })
    expect(registered.success).toBe(true)
    if (!registered.success) return

    const reconciled = await runStartupInterruptionReconcile({
      database,
      postCommitPublish: async () => createResult(undefined),
      runActiveRegistry: registry,
    })

    expect(reconciled).toEqual({ success: true, data: { interruptedRunIds: [] } })
    expect(registry.lookup(created.data.run.id)).toBe(registered.data.lifecycle)
    expect(
      await database.select({ status: runTable.status }).from(runTable).where(eq(runTable.id, created.data.run.id)),
    ).toEqual([{ status: "accepted" }])

    registered.data.cleanup()
  } finally {
    await database.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  }
})

test.skipIf(!databaseAvailable)("reconciles abandoned work before a later registration", async () => {
  const sessionId = `startup-before-registration-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Startup reconciliation before registration",
    userId: fixture.userId,
  })

  try {
    const created = await runCreate(database, fixture.userId, sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `before-registration-client-${uuidv7()}`,
      snapshot: {
        configuration: { model: "deterministic-model", provider: "deterministic" as const },
        configurationRevision: "configuration-revision-1",
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `before-registration-stream-${uuidv7()}`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const registry = runActiveRegistryCreate()
    const reconciled = await runStartupInterruptionReconcile({
      database,
      postCommitPublish: async () => createResult(undefined),
      runActiveRegistry: registry,
    })
    expect(reconciled).toEqual({ success: true, data: { interruptedRunIds: [created.data.run.id] } })

    const registered = registry.register({ runId: created.data.run.id, sessionId, userId: fixture.userId })
    expect(registered.success).toBe(true)
    if (!registered.success) return
    expect(registered.data.lifecycle.status).toBe("cancelled")
    expect(registered.data.lifecycle.signal.aborted).toBe(true)
    registered.data.cleanup()
  } finally {
    await database.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  }
})

test.skipIf(!databaseAvailable)("rejects registration while reconciliation owns its candidate", async () => {
  const sessionId = `startup-during-registration-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Startup registration during reconciliation",
    userId: fixture.userId,
  })

  try {
    const created = await runCreate(database, fixture.userId, sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `during-registration-client-${uuidv7()}`,
      snapshot: {
        configuration: { model: "deterministic-model", provider: "deterministic" as const },
        configurationRevision: "configuration-revision-1",
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `during-registration-stream-${uuidv7()}`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    const registry = runActiveRegistryCreate()
    let registration: ReturnType<typeof registry.register> | undefined
    const reconciled = await runStartupInterruptionReconcile({
      database,
      postCommitPublish: async () => {
        registration = registry.register({ runId: created.data.run.id, sessionId, userId: fixture.userId })
        return createResult(undefined)
      },
      runActiveRegistry: registry,
    })

    expect(reconciled).toEqual({ success: true, data: { interruptedRunIds: [created.data.run.id] } })
    expect(registration?.success).toBe(false)
    expect(registry.lookup(created.data.run.id)).toBeUndefined()

    const retried = registry.register({ runId: created.data.run.id, sessionId, userId: fixture.userId })
    expect(retried.success).toBe(true)
    if (!retried.success) return
    expect(retried.data.lifecycle.status).toBe("cancelled")
    retried.data.cleanup()
  } finally {
    await database.delete(sessionTable).where(eq(sessionTable.id, sessionId))
  }
})

test("passes one active registry to the app and reconciliation before serving", async () => {
  const registry = runActiveRegistryCreate()
  let receivedAppRegistry: typeof registry | undefined
  let receivedReconcileRegistry: typeof registry | undefined
  let serving = false

  await serverStart({
    appCreate: (options) => {
      receivedAppRegistry = options.runActiveRegistry
      return appCreate()
    },
    configuration: { databaseUrl: "file:./data/db.sqlite", nodeEnv: "test" } as never,
    configurationStore: {} as never,
    database: { client: { close: () => undefined }, db: {} } as never,
    journalCursorCodec: {} as never,
    providerAgentCatalog: {} as never,
    runActiveRegistry: registry,
    runStartupInterruptionReconcile: async (options) => {
      receivedReconcileRegistry = options.runActiveRegistry
      expect(serving).toBe(false)
      return createResult({ interruptedRunIds: [] })
    },
    serve: () => {
      serving = true
      return {
        stop: async () => undefined,
        url: new URL("http://codeline.test"),
      }
    },
    signalSource: {
      once: () => undefined,
      removeListener: () => undefined,
    },
  })

  expect(receivedAppRegistry).toBe(registry)
  expect(receivedReconcileRegistry).toBe(registry)
  expect(serving).toBe(true)
})
