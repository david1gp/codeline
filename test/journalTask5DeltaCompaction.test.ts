import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult, createResultError } from "@adaptive-ds/result"
import { asc, eq } from "drizzle-orm"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalRunFinalize } from "../src/journal/actions/journalRunFinalize.js"
import { journalWriteCreate } from "../src/journal/actions/journalWriteCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import type { JournalEventAppendInput } from "../src/journal/schema/journalEventAppendInputSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const fixturePrefix = `task5-delta-${uuidv7()}`
const commitUserId = `${fixturePrefix}-commit`
const rollbackUserId = `${fixturePrefix}-rollback`
const isolationUserAId = `${fixturePrefix}-isolation-a`
const isolationUserBId = `${fixturePrefix}-isolation-b`
const orderingUserId = `${fixturePrefix}-ordering`
const publicationUserId = `${fixturePrefix}-publication`
const concurrencyUserId = `${fixturePrefix}-concurrency`
const fixtureUserIds = [
  commitUserId,
  rollbackUserId,
  isolationUserAId,
  isolationUserBId,
  orderingUserId,
  publicationUserId,
  concurrencyUserId,
]
const recipientsByResourceId = new Map<string, readonly string[]>()

beforeAll(async () => {
  await database.insert(applicationUserTable).values(fixtureUserIds.map((id) => ({ displayName: id, id })))
})

afterAll(async () => {
  for (const userId of fixtureUserIds) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

function journalWriterCreate(published: Array<typeof journalEventTable.$inferSelect>) {
  return journalWriteCreate({
    database,
    resolveRecipients: async (_transaction, resource) =>
      createResult(recipientsByResourceId.get(resource.resourceId) ?? []),
    postCommitPublish: async (events) => {
      published.push(...events)
      return createResult(undefined)
    },
  })
}

function journalAppend(writer: ReturnType<typeof journalWriteCreate>, input: JournalEventAppendInput) {
  return writer.run({
    resources: [input.resource],
    write: async (_transaction, journal) => {
      const appended = await journal.append(input)
      if (!appended.success) return createResultError("journalTask5Append", appended.errorMessage)
      return createResult(undefined)
    },
  })
}

function journalFinalizerCreate(published: Array<typeof journalEventTable.$inferSelect>) {
  return journalRunFinalize({
    database,
    resolveRecipients: async (_transaction, resource) =>
      createResult(recipientsByResourceId.get(resource.resourceId) ?? []),
    postCommitPublish: async (events) => {
      published.push(...events)
      return createResult(undefined)
    },
  })
}

function journalResource(resourceId: string, userIds: readonly string[], resourceType = "run") {
  recipientsByResourceId.set(resourceId, userIds)
  return { resourceId, resourceType }
}

function completedEvent(runId: string, sessionId = `session-${runId}`, sessionRevision = 42) {
  return {
    eventType: "run-completed" as const,
    payload: {
      messageId: `message-${runId}`,
      runId,
      sessionId,
      sessionRevision,
    },
  }
}

async function appendDelta(
  userId: string,
  runId: string,
  delta: string,
  eventType = "delta",
  published: Array<typeof journalEventTable.$inferSelect> = [],
) {
  const existingRecipients = recipientsByResourceId.get(runId)
  const resource =
    existingRecipients === undefined ? journalResource(runId, [userId]) : { resourceId: runId, resourceType: "run" }
  const writer = journalWriterCreate(published)
  return journalAppend(writer, {
    eventType,
    payload: {
      delta,
      deltaKind: "text",
      runId,
      sessionId: `session-${runId}`,
    },
    resource,
  })
}

test("commits delta deletion and the compact terminal checkpoint with a gap", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  const otherRunId = `run-${uuidv7()}`
  await appendDelta(commitUserId, runId, "first", "delta", published)
  await appendDelta(commitUserId, runId, "second", "delta", published)
  await appendDelta(commitUserId, otherRunId, "other", "delta", published)

  const finalized = await journalFinalizerCreate(published).finalize(
    {
      runId,
      terminalEvent: completedEvent(runId),
    },
    async () => createResult({ finalized: true }),
  )

  expect(finalized).toMatchObject({ success: true, data: { finalized: true } })
  const events = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, commitUserId))
    .orderBy(asc(journalEventTable.sequence))
  expect(events.map((event) => [event.sequence, event.eventType])).toEqual([
    [3, "delta"],
    [4, "run-completed"],
  ])
  const terminal = events[1]
  expect(terminal).toBeDefined()
  if (terminal === undefined) return
  expect((terminal.payload as { runId?: string; sessionRevision?: number }).runId).toBe(runId)
  expect((terminal.payload as { runId?: string; sessionRevision?: number }).sessionRevision).toBe(42)
  expect(published.at(-1)?.eventType).toBe("run-completed")
  const [counter] = await database
    .select()
    .from(journalSequenceCounterTable)
    .where(eq(journalSequenceCounterTable.userId, commitUserId))
  expect(counter?.nextSequence).toBe(5)
})

test("serializes a concurrent delta append before finalization deletion", async () => {
  const runId = `run-${uuidv7()}`
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const writer = journalWriterCreate(published)
  let appendReadyResolve!: () => void
  const appendReady = new Promise<void>((resolve) => {
    appendReadyResolve = resolve
  })
  const resource = journalResource(runId, [concurrencyUserId])
  const appending = writer.run({
    mutate: async () => {
      appendReadyResolve()
      await Bun.sleep(25)
      return createResult(undefined)
    },
    resources: [resource],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "delta",
        payload: { delta: "concurrent", deltaKind: "text", runId, sessionId: `session-${runId}` },
        resource,
      })
      if (!appended.success) return createResultError("journalTask5Append", appended.errorMessage)
      return createResult(undefined)
    },
  })
  await appendReady

  const finalized = journalFinalizerCreate(published).finalize(
    { runId, terminalEvent: completedEvent(runId) },
    async () => createResult(undefined),
  )
  const [appended, finalizedResult] = await Promise.all([appending, finalized])
  expect(appended.success).toBe(true)
  expect(finalizedResult.success).toBe(true)

  const events = await database.select().from(journalEventTable).where(eq(journalEventTable.userId, concurrencyUserId))
  expect(
    events.filter((event) => (event.payload as { runId?: string }).runId === runId).map((event) => event.eventType),
  ).toEqual(["run-completed"])
})

test("rejects a delta that reaches a finalized run after the terminal commit", async () => {
  const runId = `run-${uuidv7()}`
  journalResource(runId, [concurrencyUserId])
  let operationStarted!: () => void
  let releaseOperation!: () => void
  const operationHasStarted = new Promise<void>((resolve) => {
    operationStarted = resolve
  })
  const operationRelease = new Promise<void>((resolve) => {
    releaseOperation = resolve
  })
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const finalizer = journalFinalizerCreate(published)
  const finalizing = finalizer.finalize({ runId, terminalEvent: completedEvent(runId) }, async () => {
    operationStarted()
    await operationRelease
    return createResult(undefined)
  })
  await operationHasStarted

  const appended = appendDelta(concurrencyUserId, runId, "late")
  releaseOperation()
  const [finalized, appendResult] = await Promise.all([finalizing, appended])
  expect(finalized.success).toBe(true)
  expect(appendResult.success).toBe(false)
  if (appendResult.success) return
  expect(appendResult.errorMessage).toContain("already been finalized")

  const events = await database.select().from(journalEventTable).where(eq(journalEventTable.userId, concurrencyUserId))
  expect(
    events.filter((event) => (event.payload as { runId?: string }).runId === runId).map((event) => event.eventType),
  ).toEqual(["run-completed"])
})

test("rolls back compaction and publication when the run finalization fails", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  await appendDelta(rollbackUserId, runId, "retained", "delta", published)

  const finalized = await journalFinalizerCreate(published).finalize(
    {
      runId,
      terminalEvent: completedEvent(runId),
    },
    async () => createResultError("journalTask5DeltaRollback", "The authoritative run write failed."),
  )

  expect(finalized).toMatchObject({ success: false })
  expect(published).toHaveLength(1)
  expect(
    await database.select().from(journalEventTable).where(eq(journalEventTable.userId, rollbackUserId)),
  ).toHaveLength(1)
  expect(
    await database
      .select()
      .from(journalSequenceCounterTable)
      .where(eq(journalSequenceCounterTable.userId, rollbackUserId)),
  ).toHaveLength(1)
})

test("deletes only the selected run deltas for the selected journal users", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  const otherRunId = `run-${uuidv7()}`
  await appendDelta(isolationUserAId, runId, "selected user")
  await appendDelta(isolationUserAId, otherRunId, "other run")
  await appendDelta(isolationUserAId, runId, "same run lifecycle", "invalidate")
  await appendDelta(isolationUserBId, `run-${uuidv7()}`, "other user")

  const finalized = await journalFinalizerCreate(published).finalize(
    {
      runId,
      terminalEvent: completedEvent(runId),
    },
    async () => createResult(undefined),
  )

  expect(finalized.success).toBe(true)
  const userAEvents = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, isolationUserAId))
    .orderBy(asc(journalEventTable.sequence))
  expect(
    userAEvents.map((event) => [event.sequence, event.eventType, (event.payload as { delta?: string }).delta]),
  ).toEqual([
    [2, "delta", "other run"],
    [3, "invalidate", "same run lifecycle"],
    [4, "run-completed", undefined],
  ])
  const userBEvents = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, isolationUserBId))
  expect(userBEvents).toHaveLength(1)
  const userBEvent = userBEvents[0]
  expect(userBEvent).toBeDefined()
  if (userBEvent === undefined) return
  expect((userBEvent.payload as { delta?: string }).delta).toBe("other user")
})

test("allocates the terminal checkpoint after prior events and keeps later events ordered", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  await appendDelta(orderingUserId, runId, "first", "delta", published)
  await appendDelta(orderingUserId, runId, "second", "delta", published)
  await appendDelta(orderingUserId, `run-${uuidv7()}`, "before terminal", "invalidate", published)

  const finalized = await journalFinalizerCreate(published).finalize(
    {
      runId,
      terminalEvent: completedEvent(runId),
    },
    async () => createResult(undefined),
  )
  expect(finalized.success).toBe(true)

  const writer = journalWriterCreate(published)
  const after = await journalAppend(writer, {
    eventType: "invalidate",
    payload: { resourceId: "after-terminal" },
    resource: journalResource("after-terminal", [orderingUserId], "session"),
  })
  expect(after).toMatchObject({ success: true })

  const events = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, orderingUserId))
    .orderBy(asc(journalEventTable.sequence))
  expect(events.map((event) => [event.sequence, event.eventType])).toEqual([
    [3, "invalidate"],
    [4, "run-completed"],
    [5, "invalidate"],
  ])
})

test("publishes the compact terminal event only after committed compaction", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  let observedCommit = false
  const runId = `run-${uuidv7()}`
  await appendDelta(publicationUserId, runId, "obsolete")
  const finalizer = journalRunFinalize({
    database,
    resolveRecipients: async (_transaction, resource) =>
      createResult(recipientsByResourceId.get(resource.resourceId) ?? []),
    postCommitPublish: async (events) => {
      const [event] = events
      const remainingDeltas = await database
        .select()
        .from(journalEventTable)
        .where(eq(journalEventTable.userId, publicationUserId))
      observedCommit = event !== undefined && remainingDeltas.every((entry) => entry.eventType !== "delta")
      published.push(...events)
      return createResult(undefined)
    },
  })

  const finalized = await finalizer.finalize(
    {
      runId,
      terminalEvent: completedEvent(runId, undefined, 73),
    },
    async () => createResult(undefined),
  )

  expect(finalized.success).toBe(true)
  expect(observedCommit).toBe(true)
  expect(published).toHaveLength(1)
  const publishedEvent = published[0]
  expect(publishedEvent).toBeDefined()
  if (publishedEvent === undefined) return
  expect(publishedEvent.eventType).toBe("run-completed")
  expect((publishedEvent.payload as { sessionRevision?: number }).sessionRevision).toBe(73)
})

test("compacts deltas for prior recipients when authorization changes", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  await appendDelta(isolationUserAId, runId, "old recipient", "delta", published)
  recipientsByResourceId.set(runId, [isolationUserBId])

  const finalized = await journalFinalizerCreate(published).finalize(
    { runId, terminalEvent: completedEvent(runId) },
    async () => createResult(undefined),
  )

  expect(finalized.success).toBe(true)
  const priorRecipientEvents = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, isolationUserAId))
  const currentRecipientEvents = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, isolationUserBId))
  expect(priorRecipientEvents.some((event) => (event.payload as { runId?: string }).runId === runId)).toBe(false)
  expect(
    currentRecipientEvents
      .filter((event) => (event.payload as { runId?: string }).runId === runId)
      .map((event) => event.eventType),
  ).toEqual(["run-completed"])
  expect(
    published
      .filter((event) => event.eventType === "run-completed" && (event.payload as { runId?: string }).runId === runId)
      .map((event) => event.userId),
  ).toEqual([isolationUserBId])
})

test("rejects duplicate terminal finalization without rerunning the domain mutation", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const runId = `run-${uuidv7()}`
  journalResource(runId, [commitUserId])
  let operationCalls = 0
  const finalizer = journalFinalizerCreate(published)
  const first = await finalizer.finalize({ runId, terminalEvent: completedEvent(runId) }, async () => {
    operationCalls += 1
    return createResult(undefined)
  })
  const duplicate = await finalizer.finalize({ runId, terminalEvent: completedEvent(runId) }, async () => {
    operationCalls += 1
    return createResult(undefined)
  })

  expect(first.success).toBe(true)
  expect(duplicate).toMatchObject({ code: "journal_run_already_finalized", success: false })
  expect(operationCalls).toBe(1)
  expect(published.filter((event) => (event.payload as { runId?: string }).runId === runId)).toHaveLength(1)
})
