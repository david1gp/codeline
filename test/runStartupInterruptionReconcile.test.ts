import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { asc, eq, inArray } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runStartupInterruptionReconcile } from "../src/run/actions/runStartupInterruptionReconcile.js"
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
  agentId: `startup-interrupt-agent-${uuidv7()}`,
  organizationId: `startup-interrupt-organization-${uuidv7()}`,
  serverId: `startup-interrupt-server-${uuidv7()}`,
  sessionId: `startup-interrupt-session-${uuidv7()}`,
  userId: `startup-interrupt-user-${uuidv7()}`,
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
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  await databaseConnectionClose(connection)
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
