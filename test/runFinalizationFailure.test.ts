import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventsAppendPersist } from "../src/journal/actions/journalEventsAppendPersist.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runProviderOutputCreate } from "../src/run/actions/runProviderOutputCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { attemptTable } from "../src/run/db/attemptTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `run-finalization-failure-agent-${uuidv7()}`,
  organizationId: `run-finalization-failure-organization-${uuidv7()}`,
  serverId: `run-finalization-failure-server-${uuidv7()}`,
  sessionId: `run-finalization-failure-session-${uuidv7()}`,
  userId: `run-finalization-failure-user-${uuidv7()}`,
}

type ProviderOverrides = Partial<
  Pick<
    Parameters<typeof runProviderOutputCreate>[0],
    "journalEventsAppendPersist" | "journalRunDeltasDelete" | "messageAppend" | "runTransition"
  >
>

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
    endpoint: "http://run-finalization-failure-server.test",
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
    title: "Run finalization failure session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(sessionTable).where(eq(sessionTable.id, fixture.sessionId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  }
  await databaseConnectionClose(connection)
})

async function runningRun(label: string): Promise<{ requestId: string; runId: string }> {
  const requestId = `run-finalization-failure-request-${label}-${uuidv7()}`
  const created = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: requestId,
    snapshot: {
      configuration: { model: "deterministic-model", provider: "deterministic" as const },
      configurationRevision: "configuration-revision-1",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `run-finalization-failure-stream-${uuidv7()}`,
  })
  if (!created.success) throw new Error(created.errorMessage)
  const transitioned = await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, {
    status: "running",
  })
  if (!transitioned.success) throw new Error(transitioned.errorMessage)
  return { requestId, runId: created.data.run.id }
}

function providerCreate(runId: string, requestId: string, overrides: ProviderOverrides = {}) {
  return runProviderOutputCreate({
    database,
    journalPostCommitPublish: async () => createResult(undefined),
    requestId,
    runId,
    scheduler,
    sessionId: fixture.sessionId,
    userId: fixture.userId,
    ...overrides,
  })
}

async function appendReplayableDelta(provider: ReturnType<typeof runProviderOutputCreate>): Promise<void> {
  const appended = await provider.append({ delta: "replayable delta", type: "TEXT_MESSAGE_CONTENT" })
  expect(appended).toMatchObject({ success: true })
}

async function runState(runId: string) {
  const [run] = await database.select().from(runTable).where(eq(runTable.id, runId)).limit(1)
  const [attempt] = await database.select().from(attemptTable).where(eq(attemptTable.runId, runId)).limit(1)
  return { attempt, run }
}

async function runJournalEventTypes(runId: string): Promise<string[]> {
  const events = await database
    .select({ eventType: journalEventTable.eventType })
    .from(journalEventTable)
    .where(eq(journalEventTable.runId, runId))
  return events.map((event) => event.eventType)
}

async function assistantMessages(requestId: string) {
  return database
    .select()
    .from(messageTable)
    .where(eq(messageTable.clientRequestId, `${requestId}:assistant`))
}

async function expectFinalizationRolledBack(runId: string, requestId: string, finalized: unknown): Promise<void> {
  expect(finalized).toMatchObject({ success: false })
  const state = await runState(runId)
  expect(state.run).toMatchObject({ status: "running" })
  expect(state.attempt).toMatchObject({ status: "running" })
  expect(await assistantMessages(requestId)).toHaveLength(0)
  expect(await runJournalEventTypes(runId)).toEqual(["delta"])
}

test.skipIf(!databaseAvailable)(
  "rolls back assistant insertion failure without a phantom finalized message",
  async () => {
    const { requestId, runId } = await runningRun("assistant")
    const provider = providerCreate(runId, requestId, {
      messageAppend: async (transaction, userId, sessionId, input) => {
        const inserted = await messageAppend(transaction, userId, sessionId, input)
        if (!inserted.success) return inserted
        return createResultError("failureInjection", "assistant insertion failed after the insert")
      },
    })
    await appendReplayableDelta(provider)

    const finalized = await provider.finalize({ assistantText: "phantom", status: "succeeded" })
    await expectFinalizationRolledBack(runId, requestId, finalized)
  },
)

test.skipIf(!databaseAvailable)(
  "rolls back terminal journal persistence failure and retains replayable deltas",
  async () => {
    const { requestId, runId } = await runningRun("journal-persist")
    const provider = providerCreate(runId, requestId, {
      journalEventsAppendPersist: async (transaction, input, userIds, locksAlreadyHeld) => {
        if (input.eventType === "run-completed")
          return createResultError("failureInjection", "terminal journal persistence failed")
        return journalEventsAppendPersist(transaction, input, userIds, locksAlreadyHeld)
      },
    })
    await appendReplayableDelta(provider)

    const finalized = await provider.finalize({ assistantText: "not persisted", status: "succeeded" })
    await expectFinalizationRolledBack(runId, requestId, finalized)
  },
)

test.skipIf(!databaseAvailable)("rolls back delta deletion failure and retains replayable deltas", async () => {
  const { requestId, runId } = await runningRun("delta-delete")
  const provider = providerCreate(runId, requestId, {
    journalRunDeltasDelete: async () => createResultError("failureInjection", "delta deletion failed"),
  })
  await appendReplayableDelta(provider)

  const finalized = await provider.finalize({ assistantText: "not finalized", status: "succeeded" })
  await expectFinalizationRolledBack(runId, requestId, finalized)
})

test.skipIf(!databaseAvailable)("rolls back run transition failure and retains replayable deltas", async () => {
  const { requestId, runId } = await runningRun("run-transition")
  const provider = providerCreate(runId, requestId, {
    runTransition: async () => createResultError("failureInjection", "run transition failed"),
  })
  await appendReplayableDelta(provider)

  const finalized = await provider.finalize({ assistantText: "not finalized", status: "succeeded" })
  await expectFinalizationRolledBack(runId, requestId, finalized)
})

test.skipIf(!databaseAvailable)(
  "reports publication staging failure after the finalization transaction commits",
  async () => {
    const { requestId, runId } = await runningRun("publication")
    let failTerminalPublication = false
    const publishedEventTypes: string[] = []
    const provider = runProviderOutputCreate({
      database,
      journalPostCommitPublish: async (events) => {
        if (failTerminalPublication && events.some((event) => event.eventType === "run-completed"))
          return createResultError("failureInjection", "terminal publication failed")
        publishedEventTypes.push(...events.map((event) => event.eventType))
        return createResult(undefined)
      },
      requestId,
      runId,
      scheduler,
      sessionId: fixture.sessionId,
      userId: fixture.userId,
    })
    await appendReplayableDelta(provider)
    failTerminalPublication = true

    const finalized = await provider.finalize({ assistantText: "committed", status: "succeeded" })
    expect(finalized).toMatchObject({ code: "journal_publication_failed", success: false })
    expect(await runState(runId)).toMatchObject({ run: { status: "succeeded" }, attempt: { status: "succeeded" } })
    expect(await assistantMessages(requestId)).toHaveLength(1)
    expect(await runJournalEventTypes(runId)).toEqual(["run-completed"])
    expect(publishedEventTypes).toEqual(["delta"])
  },
)
