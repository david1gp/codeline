import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { apiEventsRoutesAdd } from "../src/events/api/apiEventsRoutesAdd.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../src/journal/actions/journalWriteCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionBoundedHistoryPage } from "../src/session/actions/sessionBoundedHistoryPage.js"
import { sessionBoundedSnapshot } from "../src/session/actions/sessionBoundedSnapshot.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import type { SessionBoundedHistoryPage } from "../src/session/api/sessionBoundedHistoryPageSchema.js"
import { sessionBoundedHistoryPageSchema } from "../src/session/api/sessionBoundedHistoryPageSchema.js"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../src/stream/actions/streamSseSchedulerCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixturePrefix = `bounded-snapshot-${crypto.randomUUID()}`
const fixture = {
  agentId: `${fixturePrefix}-agent`,
  organizationId: `${fixturePrefix}-organization`,
  serverId: `${fixturePrefix}-server`,
  sessionId: `${fixturePrefix}-session`,
  userId: `${fixturePrefix}-user`,
}
const shellOnlyMetadata = `bounded-shell-metadata-${"x".repeat(50_000)}`
const shellOnlyAgentPrompt = `bounded-shell-agent-prompt-${"y".repeat(50_000)}`
const cursorCodecResult = journalCursorCodecCreate({
  randomBytes: (size) => randomBytes(size),
  secret: `${fixturePrefix}-cursor-secret`,
})
if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
const cursorCodec = cursorCodecResult.data
const liveSubscription = streamLiveSubscriptionCreate()
const postCommitPublish = journalPostCommitPublishCreate({ cursorCodec, liveSubscription })
const metricsCollector = metricsCollectorCreate()
const api = new Hono<AppEnvironment>()
api.use("*", async (context, next) => {
  context.set("database", database)
  context.set("requestIdentity", { organizationId: fixture.organizationId, userId: fixture.userId })
  await next()
})
apiSessionRoutesAdd(api, {
  database,
  journalCursorCodec: cursorCodec,
  journalPostCommitPublish: postCommitPublish,
  metricsCollector,
})
apiEventsRoutesAdd(api, {
  backlogRead: journalBacklogRead,
  connectionWriterCreate: streamSseConnectionWriterCreate,
  cursorCodec,
  liveSubscription,
  metricsCollector,
  now: Date.now,
  scheduler: streamSseSchedulerCreate(),
})

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://bounded-snapshot-server.test",
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
    title: "Bounded snapshot session",
    userId: fixture.userId,
  })
  await database.insert(journalSequenceCounterTable).values({ nextSequence: 1, userId: fixture.userId })
  await database.insert(messageTable).values(
    Array.from({ length: 30 }, (_, index) => {
      const sequence = index + 1
      return {
        agentId: fixture.agentId,
        clientRequestId: `${fixturePrefix}-message-${sequence}`,
        content: sequence === 30 ? "The latest agent answer." : `Message ${sequence}`,
        createdAt: new Date(`2026-08-31T12:00:${String(sequence).padStart(2, "0")}.000Z`),
        finalizedAt: new Date(`2026-08-31T12:00:${String(sequence).padStart(2, "0")}.000Z`),
        id: `${fixturePrefix}-message-${sequence}`,
        metadata: {},
        role: sequence % 2 === 0 ? ("assistant" as const) : ("user" as const),
        sequence,
        sessionId: fixture.sessionId,
      }
    }),
  )
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

test.skipIf(!databaseAvailable)("returns a bounded snapshot with an opaque fixed-boundary cursor", async () => {
  const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    cursorCodec,
  })
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return

  expect(v.safeParse(sessionBoundedSnapshotSchema, snapshot.data).success).toBe(true)
  expect(snapshot.data.session.title).toBe("Bounded snapshot session")
  expect(snapshot.data.latestAnswer?.content).toBe("The latest agent answer.")
  expect(snapshot.data.semanticSteps).toHaveLength(25)
  expect(snapshot.data.semanticSteps.map((step) => step.sequence)).toEqual(
    Array.from({ length: 25 }, (_, index) => index + 6),
  )
  expect(snapshot.data.semanticSteps.at(-1)).toMatchObject({ kind: "message", role: "assistant" })
  expect(snapshot.data.hasMore).toBe(true)
  expect(snapshot.data.olderCursor).not.toBeNull()
  expect(snapshot.data.state).toEqual({ input: null, run: null })
  expect(snapshot.data.throughSeq).toBe(0)

  const decoded = cursorCodec.decodePayload?.(snapshot.data.olderCursor)
  expect(decoded).toMatchObject({
    success: true,
    data: {
      boundary: { sequence: 6 },
      kind: "session-older",
      messageThroughSeq: 30,
      sessionId: fixture.sessionId,
      throughSeq: 0,
      userId: fixture.userId,
      version: 1,
    },
  })
})

test.skipIf(!databaseAvailable)("projects only the selected-session shell fields", async () => {
  await database
    .update(sessionTable)
    .set({ agentPrompt: shellOnlyAgentPrompt, metadata: { shellOnly: shellOnlyMetadata } })
    .where(eq(sessionTable.id, fixture.sessionId))
  try {
    const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      cursorCodec,
    })
    expect(snapshot.success).toBe(true)
    if (!snapshot.success) return

    expect(snapshot.data.session).toEqual({
      id: fixture.sessionId,
      pinned: true,
      projectPath: "~",
      revision: 1,
      title: "Bounded snapshot session",
    })
    expect(JSON.stringify(snapshot.data.session)).not.toContain(shellOnlyMetadata)
    expect(JSON.stringify(snapshot.data.session)).not.toContain(shellOnlyAgentPrompt)
    expect(JSON.stringify(snapshot.data)).not.toContain(shellOnlyMetadata)
    expect(JSON.stringify(snapshot.data)).not.toContain(shellOnlyAgentPrompt)
    expect(new TextEncoder().encode(JSON.stringify(snapshot.data)).byteLength).toBeLessThan(10_000)
  } finally {
    await database
      .update(sessionTable)
      .set({ agentPrompt: null, metadata: {} })
      .where(eq(sessionTable.id, fixture.sessionId))
  }
})

test.skipIf(!databaseAvailable)("truncates oversized latest answers without changing the stored message", async () => {
  const originalContent = "The latest agent answer."
  const originalMetadata = {}
  const oversizedContent = `discarded-prefix-${"x".repeat(20_000)}-final-answer`
  const oversizedMetadata = Object.fromEntries(
    Array.from({ length: 60 }, (_, index) => [`metadata-${index}`, `value-${index}`]),
  )

  await database
    .update(messageTable)
    .set({ content: oversizedContent, metadata: oversizedMetadata })
    .where(eq(messageTable.id, `${fixturePrefix}-message-30`))
  try {
    const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      cursorCodec,
    })
    expect(snapshot.success).toBe(true)
    if (!snapshot.success) return

    const latestAnswer = snapshot.data.latestAnswer
    expect(latestAnswer).not.toBeNull()
    if (latestAnswer === null) return
    expect(latestAnswer.content).toContain("[Earlier output truncated]")
    expect(latestAnswer.content.endsWith("-final-answer")).toBe(true)
    expect(new TextEncoder().encode(latestAnswer.content).byteLength).toBeLessThanOrEqual(16_384)
    expect(Object.keys(latestAnswer.metadata as Record<string, unknown>)).toHaveLength(50)
    expect(new TextEncoder().encode(JSON.stringify(latestAnswer.metadata)).byteLength).toBeLessThanOrEqual(16_384)

    const [stored] = await database
      .select({ content: messageTable.content, metadata: messageTable.metadata })
      .from(messageTable)
      .where(eq(messageTable.id, `${fixturePrefix}-message-30`))
      .limit(1)
    expect(stored).toEqual({ content: oversizedContent, metadata: oversizedMetadata })
  } finally {
    await database
      .update(messageTable)
      .set({ content: originalContent, metadata: originalMetadata })
      .where(eq(messageTable.id, `${fixturePrefix}-message-30`))
  }
})

test.skipIf(!databaseAvailable)(
  "keeps the session projection and journal watermark at one database boundary",
  async () => {
    let releaseWriter: (() => void) | undefined
    let writerReadyResolve: (() => void) | undefined
    const writerReady = new Promise<void>((resolve) => {
      writerReadyResolve = resolve
    })
    const writer = database.transaction(async (transaction) => {
      await transaction
        .update(sessionTable)
        .set({ revision: 9, title: "Uncommitted bounded title" })
        .where(eq(sessionTable.id, fixture.sessionId))
      await transaction
        .update(journalSequenceCounterTable)
        .set({ nextSequence: 100 })
        .where(eq(journalSequenceCounterTable.userId, fixture.userId))
      writerReadyResolve?.()
      await new Promise<void>((resolve) => {
        releaseWriter = resolve
      })
    })

    await writerReady
    const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      cursorCodec,
    })
    releaseWriter?.()
    await writer

    expect(snapshot.success).toBe(true)
    if (snapshot.success) {
      expect(snapshot.data.session.title).toBe("Bounded snapshot session")
      expect(snapshot.data.session.revision).toBe(1)
      expect(snapshot.data.throughSeq).toBe(0)
    }
    await database
      .update(sessionTable)
      .set({ revision: 1, title: "Bounded snapshot session" })
      .where(eq(sessionTable.id, fixture.sessionId))
    await database
      .update(journalSequenceCounterTable)
      .set({ nextSequence: 1 })
      .where(eq(journalSequenceCounterTable.userId, fixture.userId))
  },
)

test.skipIf(!databaseAvailable)("serves the bounded API and attaches the tail strictly after throughSeq", async () => {
  const created = await runCreate(database, fixture.userId, fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${fixturePrefix}-run-client`,
    snapshot: {
      configuration: { model: "bounded-model", provider: "deterministic" },
      configurationRevision: `${fixturePrefix}-revision`,
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: `${fixturePrefix}-stream`,
  })
  expect(created.success).toBe(true)
  if (!created.success) return
  const running = await runTransition(database, fixture.userId, fixture.sessionId, created.data.run.id, {
    status: "running",
  })
  expect(running.success).toBe(true)
  if (!running.success) return

  const journalWrite = journalWriteCreate({
    database,
    postCommitPublish,
    resolveRecipients: async () => createResult([fixture.userId]),
  })
  const delta = await journalWrite.run({
    resources: [{ resourceId: created.data.run.id, resourceType: "run" }],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "delta",
        payload: {
          delta: "Working on it.",
          deltaKind: "text",
          messageId: null,
          runId: created.data.run.id,
          sessionId: fixture.sessionId,
        },
        resource: { resourceId: created.data.run.id, resourceType: "run" },
      })
      return appended.success ? createResult(undefined) : appended
    },
  })
  expect(delta.success).toBe(true)
  if (!delta.success) return

  const toolDelta = await journalWrite.run({
    resources: [{ resourceId: created.data.run.id, resourceType: "run" }],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "delta",
        payload: {
          delta: JSON.stringify({ toolCallId: "call-1", toolName: "request_user_input" }),
          deltaKind: "tool",
          messageId: null,
          runId: created.data.run.id,
          sessionId: fixture.sessionId,
        },
        resource: { resourceId: created.data.run.id, resourceType: "run" },
      })
      return appended.success ? createResult(undefined) : appended
    },
  })
  expect(toolDelta.success).toBe(true)
  if (!toolDelta.success) return

  const response = await api.request(`http://bounded-snapshot.test/sessions/${fixture.sessionId}/bounded-snapshot`)
  expect(response.status).toBe(200)
  const body = await response.json()
  const parsed = v.safeParse(sessionBoundedSnapshotSchema, body)
  expect(parsed.success).toBe(true)
  if (!parsed.success) return
  expect(parsed.output.throughSeq).toBe(2)
  expect(parsed.output.state.input).toBeNull()
  expect(parsed.output.state.run).toMatchObject({
    lastSequence: 2,
    partialText: "Working on it.",
    runId: created.data.run.id,
    status: "running",
  })

  const throughCursor = cursorCodec.encodeDeterministic(fixture.userId, parsed.output.throughSeq)
  expect(throughCursor.success).toBe(true)
  if (!throughCursor.success) return
  const invalidated = await journalWrite.run({
    resources: [{ resourceId: fixture.sessionId, resourceType: "session" }],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "invalidate",
        payload: { resourceId: fixture.sessionId, resourceType: "session", revision: 1 },
        resource: { resourceId: fixture.sessionId, resourceType: "session" },
      })
      return appended.success ? createResult(undefined) : appended
    },
  })
  expect(invalidated.success).toBe(true)

  const feedResponse = await api.request(
    `http://bounded-snapshot.test/events?after=${encodeURIComponent(throughCursor.data)}`,
  )
  expect(feedResponse.status).toBe(200)
  const reader = feedResponse.body?.getReader()
  expect(reader).toBeDefined()
  if (reader === undefined) return
  const first = await Promise.race([
    reader.read(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timed out waiting for the tail.")), 1_000)),
  ])
  expect(first.done).toBe(false)
  if (first.done || first.value === undefined) return
  const text = new TextDecoder().decode(first.value)
  const dataLines = [...text.matchAll(/^data: (.+)$/gm)].map((match) => match[1])
  expect(dataLines).toHaveLength(1)
  expect(JSON.parse(dataLines[0] ?? "null")).toMatchObject({
    eventType: "invalidate",
    sequence: 3,
    resourceId: fixture.sessionId,
  })
  await reader.cancel()
  await database.delete(runTable).where(eq(runTable.id, created.data.run.id))
})

test.skipIf(!databaseAvailable)(
  "does not leak finalized messages past the snapshot message watermark into older history",
  async () => {
    const created = await runCreate(database, fixture.userId, fixture.sessionId, {
      budget: { maxDurationMs: 10_000 },
      clientRunId: `${fixturePrefix}-watermark-run-client`,
      snapshot: {
        configuration: { model: "bounded-model", provider: "deterministic" },
        configurationRevision: `${fixturePrefix}-watermark-revision`,
        target: { agentId: fixture.agentId, serverId: fixture.serverId },
      },
      streamId: `${fixturePrefix}-watermark-stream`,
    })
    expect(created.success).toBe(true)
    if (!created.success) return

    await database
      .update(journalSequenceCounterTable)
      .set({ nextSequence: 100 })
      .where(eq(journalSequenceCounterTable.userId, fixture.userId))
    const journalWrite = journalWriteCreate({
      database,
      postCommitPublish,
      resolveRecipients: async () => createResult([fixture.userId]),
    })
    const highSequenceTools = await journalWrite.run({
      resources: [{ resourceId: created.data.run.id, resourceType: "run" }],
      write: async (_transaction, journal) => {
        for (const index of Array.from({ length: 25 }, (_, value) => value)) {
          const appended = await journal.append({
            eventType: "delta",
            payload: {
              delta: JSON.stringify({
                toolCallId: `${fixturePrefix}-watermark-tool-${index}`,
                toolName: "bounded-watermark-tool",
              }),
              deltaKind: "tool",
              messageId: null,
              runId: created.data.run.id,
              sessionId: fixture.sessionId,
            },
            resource: { resourceId: created.data.run.id, resourceType: "run" },
          })
          if (!appended.success) return appended
        }
        return createResult(undefined)
      },
    })
    expect(highSequenceTools.success).toBe(true)
    if (!highSequenceTools.success) return

    const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      cursorCodec,
    })
    expect(snapshot.success).toBe(true)
    if (!snapshot.success || snapshot.data.olderCursor === null) return
    expect(snapshot.data.throughSeq).toBe(124)
    expect(snapshot.data.semanticSteps.every((step) => step.sequence >= 100)).toBe(true)

    const decoded = cursorCodec.decodePayload?.(snapshot.data.olderCursor)
    expect(decoded).toMatchObject({
      success: true,
      data: {
        boundary: { sequence: 100 },
        messageThroughSeq: 30,
        throughSeq: 124,
      },
    })

    const newMessageId = `${fixturePrefix}-message-after-watermark-snapshot`
    await database.insert(messageTable).values({
      agentId: fixture.agentId,
      clientRequestId: `${fixturePrefix}-message-after-watermark-snapshot`,
      content: "Written after the watermark snapshot.",
      createdAt: new Date("2026-08-31T12:02:00.000Z"),
      finalizedAt: new Date("2026-08-31T12:02:00.000Z"),
      id: newMessageId,
      metadata: {},
      role: "assistant",
      sequence: 31,
      sessionId: fixture.sessionId,
    })

    const page = await sessionBoundedHistoryPage(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      { cursor: snapshot.data.olderCursor, limit: 2 },
      { cursorCodec },
    )
    expect(page.success).toBe(true)
    if (!page.success) return
    expect(page.data.throughSeq).toBe(snapshot.data.throughSeq)
    expect(page.data.semanticSteps.map((step) => step.id)).toEqual([`${fixturePrefix}-message-30`, created.data.run.id])
    expect(page.data.semanticSteps.some((step) => step.id === newMessageId)).toBe(false)

    await database.delete(journalEventTable).where(eq(journalEventTable.runId, created.data.run.id))
    await database.delete(runTable).where(eq(runTable.id, created.data.run.id))
    await database.delete(messageTable).where(eq(messageTable.id, newMessageId))
    await database
      .update(journalSequenceCounterTable)
      .set({ nextSequence: 1 })
      .where(eq(journalSequenceCounterTable.userId, fixture.userId))
  },
)

test.skipIf(!databaseAvailable)("pages older semantic history without duplicates at a fixed watermark", async () => {
  const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
    cursorCodec,
  })
  expect(snapshot.success).toBe(true)
  if (!snapshot.success || snapshot.data.olderCursor === null) return

  const throughSeq = snapshot.data.throughSeq
  await database.insert(messageTable).values({
    agentId: fixture.agentId,
    clientRequestId: `${fixturePrefix}-message-after-snapshot`,
    content: "Written after the snapshot.",
    createdAt: new Date("2026-08-31T12:01:00.000Z"),
    finalizedAt: new Date("2026-08-31T12:01:00.000Z"),
    id: `${fixturePrefix}-message-after-snapshot`,
    metadata: {},
    role: "assistant",
    sequence: 31,
    sessionId: fixture.sessionId,
  })
  await database
    .update(journalSequenceCounterTable)
    .set({ nextSequence: throughSeq + 100 })
    .where(eq(journalSequenceCounterTable.userId, fixture.userId))

  const pages: Array<Array<string>> = []
  let cursor: string | undefined = snapshot.data.olderCursor
  let lastPage: SessionBoundedHistoryPage | undefined
  while (cursor !== undefined) {
    const page = await sessionBoundedHistoryPage(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      { cursor, limit: 2 },
      { cursorCodec },
    )
    expect(page.success).toBe(true)
    if (!page.success) return
    expect(v.safeParse(sessionBoundedHistoryPageSchema, page.data).success).toBe(true)
    expect(page.data.throughSeq).toBe(throughSeq)
    pages.push(page.data.semanticSteps.map((step) => step.id))
    lastPage = page.data
    cursor = page.data.nextCursor ?? undefined
  }

  expect(pages).toEqual([
    [4, 5].map((sequence) => `${fixturePrefix}-message-${sequence}`),
    [2, 3].map((sequence) => `${fixturePrefix}-message-${sequence}`),
    [`${fixturePrefix}-message-1`],
  ])
  const pageIds = pages.flat()
  expect(new Set(pageIds).size).toBe(pageIds.length)
  expect(lastPage).toMatchObject({ hasMore: false, nextCursor: null, semanticSteps: [{ sequence: 1 }] })

  const apiResponse = await api.request(
    `http://bounded-snapshot.test/sessions/${fixture.sessionId}/bounded-history?cursor=${encodeURIComponent(
      snapshot.data.olderCursor,
    )}&limit=2`,
  )
  expect(apiResponse.status).toBe(200)
  const apiPage = await apiResponse.json()
  expect(v.safeParse(sessionBoundedHistoryPageSchema, apiPage).success).toBe(true)
  expect(apiPage).toMatchObject({
    semanticSteps: [{ sequence: 4 }, { sequence: 5 }],
    throughSeq,
  })
})

test.skipIf(!databaseAvailable)(
  "rejects invalid or mismatched bounded history cursors and handles empty pages",
  async () => {
    const snapshot = await sessionBoundedSnapshot(database, fixture.userId, fixture.organizationId, fixture.sessionId, {
      cursorCodec,
    })
    expect(snapshot.success).toBe(true)
    if (!snapshot.success || snapshot.data.olderCursor === null) return

    const invalid = await sessionBoundedHistoryPage(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      { cursor: "invalid-cursor", limit: 2 },
      { cursorCodec },
    )
    expect(invalid.success).toBe(false)

    const mismatchedCursor = cursorCodec.encodePayload?.({
      boundary: { id: `${fixturePrefix}-message-6`, sequence: 6 },
      kind: "session-older",
      messageThroughSeq: 30,
      sessionId: `${fixturePrefix}-other-session`,
      throughSeq: snapshot.data.throughSeq,
      userId: fixture.userId,
      version: 1,
    })
    expect(mismatchedCursor?.success).toBe(true)
    if (mismatchedCursor === undefined || !mismatchedCursor.success) return
    const mismatched = await sessionBoundedHistoryPage(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      { cursor: mismatchedCursor.data, limit: 2 },
      { cursorCodec },
    )
    expect(mismatched.success).toBe(false)
    const mismatchedResponse = await api.request(
      `http://bounded-snapshot.test/sessions/${fixture.sessionId}/bounded-history?cursor=${encodeURIComponent(
        mismatchedCursor.data,
      )}&limit=2`,
    )
    expect(mismatchedResponse.status).toBe(400)

    const emptyCursor = cursorCodec.encodePayload?.({
      boundary: { id: `${fixturePrefix}-message-1`, sequence: 1 },
      kind: "session-older",
      messageThroughSeq: 30,
      sessionId: fixture.sessionId,
      throughSeq: snapshot.data.throughSeq,
      userId: fixture.userId,
      version: 1,
    })
    expect(emptyCursor?.success).toBe(true)
    if (emptyCursor === undefined || !emptyCursor.success) return
    const empty = await sessionBoundedHistoryPage(
      database,
      fixture.userId,
      fixture.organizationId,
      fixture.sessionId,
      { cursor: emptyCursor.data, limit: 2 },
      { cursorCodec },
    )
    expect(empty).toMatchObject({ success: true, data: { hasMore: false, nextCursor: null, semanticSteps: [] } })

    const missingCursorResponse = await api.request(
      `http://bounded-snapshot.test/sessions/${fixture.sessionId}/bounded-history`,
    )
    expect(missingCursorResponse.status).toBe(400)
    const invalidCursorResponse = await api.request(
      `http://bounded-snapshot.test/sessions/${fixture.sessionId}/bounded-history?cursor=invalid-cursor`,
    )
    expect(invalidCursorResponse.status).toBe(400)
  },
)
