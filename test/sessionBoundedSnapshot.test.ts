import { afterEach, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { DatabaseClient, DatabaseConnection } from "../src/database/databaseClient.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import type { JournalCursorCodec } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runActiveStateRepositoryUpsert } from "../src/run/db/runActiveStateRepositoryUpsert.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionBoundedHistoryPage } from "../src/session/actions/sessionBoundedHistoryPage.js"
import { sessionBoundedSnapshot } from "../src/session/actions/sessionBoundedSnapshot.js"
import { sessionBoundedHistoryPageSchema } from "../src/session/api/sessionBoundedHistoryPageSchema.js"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionHistoryEntryRepositoryUpsert } from "../src/session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

type TestDatabase = {
  connection: DatabaseConnection
  database: DatabaseClient
  fixture: {
    agentId: string
    organizationId: string
    serverId: string
    sessionId: string
    userId: string
  }
  rootPath: string
  cursorCodec: JournalCursorCodec
}

const databases: TestDatabase[] = []

async function testDatabaseCreate(): Promise<TestDatabase> {
  const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-bounded-history."))
  const databasePath = path.join(rootPath, "db.sqlite")
  const migrated = await databaseMigrate(databasePath)
  if (!migrated.success) throw new Error(migrated.errorMessage)
  const connection = databaseConnectionCreate(databasePath)
  const database = connection.db
  const prefix = crypto.randomUUID()
  const fixture = {
    agentId: `${prefix}-agent`,
    organizationId: `${prefix}-organization`,
    serverId: `${prefix}-server`,
    sessionId: `${prefix}-session`,
    userId: `${prefix}-user`,
  }
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://bounded-history.test",
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
    clientRequestId: `${prefix}-request`,
    id: fixture.sessionId,
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Bounded history session",
    userId: fixture.userId,
  })
  const codec = journalCursorCodecCreate({
    randomBytes: (size) => crypto.getRandomValues(new Uint8Array(size)),
    secret: `${prefix}-secret`,
  })
  if (!codec.success) throw new Error(codec.errorMessage)
  const testDatabase = { connection, cursorCodec: codec.data, database, fixture, rootPath }
  databases.push(testDatabase)
  return testDatabase
}

afterEach(async () => {
  const testDatabase = databases.pop()
  if (testDatabase === undefined) return
  await databaseConnectionClose(testDatabase.connection)
  await rm(testDatabase.rootPath, { force: true, recursive: true })
})

function messagePayload(fixture: TestDatabase["fixture"], id: string, sequence: number, role: "assistant" | "user") {
  return {
    agentId: fixture.agentId,
    clientRequestId: `${id}-request`,
    content: `${role} message ${sequence}`,
    createdAt: "2026-09-01T12:00:00.000Z",
    finalizedAt: "2026-09-01T12:00:01.000Z",
    id,
    metadata: {},
    role,
    sequence,
    sessionId: fixture.sessionId,
  }
}

async function historyEntriesSeed(database: DatabaseClient, fixture: TestDatabase["fixture"], count: number) {
  const result = await databaseTransactionRun(database, async (transaction) => {
    for (let sequence = 1; sequence <= count; sequence += 1) {
      const entryId = `${fixture.sessionId}-entry-${sequence}`
      const kind = sequence % 3 === 0 ? "message" : sequence % 3 === 1 ? "run" : "tool"
      const saved = await sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
        id: entryId,
        kind,
        payload:
          kind === "message"
            ? messagePayload(fixture, `${fixture.sessionId}-message-${sequence}`, sequence, "assistant")
            : kind === "run"
              ? {
                  detailId: `${fixture.sessionId}-run-${sequence}`,
                  id: `${fixture.sessionId}-run-${sequence}`,
                  kind: "run",
                  status: "succeeded",
                  summary: `Run ${sequence}`,
                }
              : {
                  detailId: `${fixture.sessionId}-tool-${sequence}`,
                  id: `${fixture.sessionId}-tool-${sequence}`,
                  kind: "tool",
                  runId: `${fixture.sessionId}-run-${sequence}`,
                  summary: `Tool ${sequence}`,
                },
        ...(kind === "tool" ? { sourceDetailId: `${fixture.sessionId}-tool-${sequence}` } : {}),
        sourceId:
          kind === "message" ? `${fixture.sessionId}-message-${sequence}` : `${fixture.sessionId}-run-${sequence}`,
        sourceType: kind,
      })
      if (!saved.success) return saved
    }
    return createResult(undefined)
  })
  if (!result.success) throw new Error(result.errorMessage)
}

test("reads projected entries in position order and returns a position watermark", async () => {
  const testDatabase = await testDatabaseCreate()
  await historyEntriesSeed(testDatabase.database, testDatabase.fixture, 30)

  const snapshot = await sessionBoundedSnapshot(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.organizationId,
    testDatabase.fixture.sessionId,
    { cursorCodec: testDatabase.cursorCodec },
  )
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return

  expect(v.safeParse(sessionBoundedSnapshotSchema, snapshot.data).success).toBe(true)
  expect(snapshot.data.semanticSteps).toHaveLength(25)
  expect(snapshot.data.semanticSteps.map((step) => step.sequence)).toEqual(
    Array.from({ length: 25 }, (_, index) => index + 6),
  )
  expect(snapshot.data.semanticSteps[0]?.id).toBe(`${testDatabase.fixture.sessionId}-entry-6`)
  expect(snapshot.data.latestAnswer?.content).toBe("assistant message 30")
  expect(snapshot.data.throughPosition).toBe(30)
  expect(
    testDatabase.cursorCodec.validateSessionPosition?.(
      snapshot.data.detailCursor,
      testDatabase.fixture.userId,
      testDatabase.fixture.sessionId,
    ),
  ).toMatchObject({ success: true, data: { changePosition: 30 } })
  expect(snapshot.data.hasMore).toBe(true)
  expect(snapshot.data.olderCursor).not.toBeNull()

  const decoded = testDatabase.cursorCodec.decodePayload?.(snapshot.data.olderCursor)
  expect(decoded).toMatchObject({
    success: true,
    data: {
      beforePosition: 6,
      kind: "session-older",
      sessionId: testDatabase.fixture.sessionId,
      throughPosition: 30,
      userId: testDatabase.fixture.userId,
      version: 1,
    },
  })
  if (decoded?.success)
    expect(Object.keys(decoded.data as Record<string, unknown>).sort()).toEqual([
      "beforePosition",
      "kind",
      "sessionId",
      "throughPosition",
      "userId",
      "version",
    ])
})

test("pages by a fixed watermark while mutable entries update and new entries stay out", async () => {
  const testDatabase = await testDatabaseCreate()
  await historyEntriesSeed(testDatabase.database, testDatabase.fixture, 30)
  const snapshot = await sessionBoundedSnapshot(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.organizationId,
    testDatabase.fixture.sessionId,
    { cursorCodec: testDatabase.cursorCodec },
  )
  expect(snapshot.success).toBe(true)
  if (!snapshot.success || snapshot.data.olderCursor === null) return

  const updated = await sessionHistoryEntryRepositoryUpsert(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.sessionId,
    {
      id: `${testDatabase.fixture.sessionId}-entry-4`,
      kind: "run",
      payload: {
        detailId: `${testDatabase.fixture.sessionId}-run-4`,
        id: `${testDatabase.fixture.sessionId}-run-4`,
        kind: "run",
        status: "failed",
        summary: "Updated run",
      },
      sourceId: `${testDatabase.fixture.sessionId}-run-4`,
      sourceType: "run",
    },
  )
  expect(updated.success).toBe(true)
  const inserted = await sessionHistoryEntryRepositoryUpsert(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.sessionId,
    {
      id: `${testDatabase.fixture.sessionId}-entry-31`,
      kind: "message",
      payload: messagePayload(testDatabase.fixture, `${testDatabase.fixture.sessionId}-message-31`, 31, "assistant"),
      sourceId: `${testDatabase.fixture.sessionId}-message-31`,
      sourceType: "message",
    },
  )
  expect(inserted.success).toBe(true)

  const page = await sessionBoundedHistoryPage(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.organizationId,
    testDatabase.fixture.sessionId,
    { cursor: snapshot.data.olderCursor, limit: 2 },
    { cursorCodec: testDatabase.cursorCodec },
  )
  expect(page.success).toBe(true)
  if (!page.success) return
  expect(v.safeParse(sessionBoundedHistoryPageSchema, page.data).success).toBe(true)
  expect(page.data.throughPosition).toBe(snapshot.data.throughPosition)
  expect(page.data.semanticSteps.map((step) => step.sequence)).toEqual([4, 5])
  expect(page.data.semanticSteps[0]).toMatchObject({
    id: `${testDatabase.fixture.sessionId}-entry-4`,
    summary: "Updated run",
  })
  expect(page.data.semanticSteps.some((step) => step.id.endsWith("entry-31"))).toBe(false)
})

test("bounds the projection read and does not reconstruct canonical message history", async () => {
  const testDatabase = await testDatabaseCreate()
  await historyEntriesSeed(testDatabase.database, testDatabase.fixture, 60)
  await testDatabase.database.insert(messageTable).values({
    agentId: testDatabase.fixture.agentId,
    clientRequestId: `${testDatabase.fixture.sessionId}-legacy-request`,
    content: "This canonical message must not be read.",
    id: `${testDatabase.fixture.sessionId}-legacy-message`,
    metadata: {},
    role: "assistant",
    sequence: 10_000,
    sessionId: testDatabase.fixture.sessionId,
  })

  const snapshot = await sessionBoundedSnapshot(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.organizationId,
    testDatabase.fixture.sessionId,
    { cursorCodec: testDatabase.cursorCodec },
  )
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return
  expect(snapshot.data.semanticSteps).toHaveLength(25)
  expect(snapshot.data.semanticSteps.map((step) => step.sequence)).toEqual(
    Array.from({ length: 25 }, (_, index) => index + 36),
  )
  expect(JSON.stringify(snapshot.data)).not.toContain("canonical message must not be read")
  expect(snapshot.data.throughPosition).toBe(60)
})

test("uses durable active state instead of scanning active deltas", async () => {
  const testDatabase = await testDatabaseCreate()
  await historyEntriesSeed(testDatabase.database, testDatabase.fixture, 3)
  const created = await runCreate(testDatabase.database, testDatabase.fixture.userId, testDatabase.fixture.sessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${testDatabase.fixture.sessionId}-active-client-run`,
    snapshot: {
      configuration: { model: "bounded-model", provider: "deterministic" },
      configurationRevision: `${testDatabase.fixture.sessionId}-revision`,
      target: { agentId: testDatabase.fixture.agentId, serverId: testDatabase.fixture.serverId },
    },
    streamId: `${testDatabase.fixture.sessionId}-active-stream`,
  })
  expect(created.success).toBe(true)
  if (!created.success) return

  const updated = await runActiveStateRepositoryUpsert(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.sessionId,
    created.data.run.id,
    { lastSequence: 42, partialText: "Durable active text", status: "accepted" },
  )
  expect(updated.success).toBe(true)

  const snapshot = await sessionBoundedSnapshot(
    testDatabase.database,
    testDatabase.fixture.userId,
    testDatabase.fixture.organizationId,
    testDatabase.fixture.sessionId,
    { cursorCodec: testDatabase.cursorCodec },
  )
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return
  expect(snapshot.data.state.run).toMatchObject({
    lastSequence: 42,
    partialText: "Durable active text",
    runId: created.data.run.id,
    sessionId: testDatabase.fixture.sessionId,
    status: "accepted",
  })
  const [run] = await testDatabase.database.select().from(runTable).where(eq(runTable.id, created.data.run.id)).limit(1)
  expect(run?.status).toBe("accepted")
})
