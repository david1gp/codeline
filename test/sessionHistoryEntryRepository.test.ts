import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionHistoryEntryPositionAllocate } from "../src/session/db/sessionHistoryEntryPositionAllocate.js"
import { sessionHistoryEntryRepositoryUpsert } from "../src/session/db/sessionHistoryEntryRepositoryUpsert.js"
import { sessionHistoryEntryTable } from "../src/session/db/sessionHistoryEntryTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-session-history-entry."))
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const fixture = {
  agentId: "session-history-entry-agent",
  organizationId: "session-history-entry-organization",
  sessionId: "session-history-entry-session",
  userId: "session-history-entry-user",
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values({ displayName: "Session History Entry User", id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Session History Entry Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-history-entry.test",
    id: "session-history-entry-server",
    name: "Session History Entry Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session History Entry Agent",
    role: "coding",
    serverId: "session-history-entry-server",
  })
  await database.insert(sessionTable).values({
    clientRequestId: "session-history-entry-request",
    id: fixture.sessionId,
    primaryAgentId: fixture.agentId,
    serverId: "session-history-entry-server",
    title: "Session History Entry Session",
    userId: fixture.userId,
  })
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

test("allocates positions from the session counter and preserves them on updates", async () => {
  const allocated = await databaseTransactionRun(database, async (transaction) => {
    const first = await sessionHistoryEntryPositionAllocate(transaction, fixture.userId, fixture.sessionId)
    if (!first.success) return first
    const second = await sessionHistoryEntryPositionAllocate(transaction, fixture.userId, fixture.sessionId)
    if (!second.success) return second
    return createResult({ first: first.data, second: second.data })
  })
  expect(allocated).toEqual({ success: true, data: { first: 1, second: 2 } })

  const created = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      id: "session-history-entry-run-entry",
      kind: "run",
      payload: { status: "accepted" },
      sourceId: "session-history-entry-run",
      sourceType: "run",
    }),
  )
  expect(created).toMatchObject({
    success: true,
    data: { changed: true, created: true, entry: { changePosition: 3, position: 3 } },
  })

  const updated = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      id: "session-history-entry-run-entry",
      kind: "run",
      payload: { status: "running" },
      sourceId: "session-history-entry-run",
      sourceType: "run",
    }),
  )
  expect(updated).toMatchObject({
    success: true,
    data: { changed: true, created: false, entry: { changePosition: 4, position: 3 } },
  })
})

test("retries are idempotent and retain the stable entry identity", async () => {
  const input = {
    id: "session-history-entry-message-entry",
    kind: "message" as const,
    payload: { content: "hello", role: "user" },
    sourceId: "session-history-entry-message",
    sourceType: "message" as const,
  }
  const created = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, input),
  )
  expect(created).toMatchObject({ success: true, data: { changed: true, created: true, entry: { position: 5 } } })
  if (!created.success) return

  const repeated = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      ...input,
      payload: { role: "user", content: "hello" },
    }),
  )
  expect(repeated).toEqual({ success: true, data: { changed: false, created: false, entry: created.data.entry } })

  const immutableMessage = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      ...input,
      payload: { content: "changed", role: "user" },
    }),
  )
  expect(immutableMessage).toMatchObject({
    success: false,
    errorMessage: "The message history entry is immutable.",
  })

  const conflictingId = await databaseTransactionRun(database, (transaction) =>
    sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      ...input,
      id: "session-history-entry-other-id",
    }),
  )
  expect(conflictingId).toMatchObject({
    success: false,
    errorMessage: "The session history entry source identity conflicts with the existing entry.",
  })
})

test("caller transaction rollback removes the entry and counter allocation", async () => {
  const rolledBack = await databaseTransactionRun(database, async (transaction) => {
    const saved = await sessionHistoryEntryRepositoryUpsert(transaction, fixture.userId, fixture.sessionId, {
      kind: "tool",
      payload: { name: "terminal" },
      sourceDetailId: "session-history-entry-tool-call",
      sourceId: "session-history-entry-tool-run",
      sourceType: "tool",
    })
    if (!saved.success) return saved
    return createResultError("testRollback", "roll back projection")
  })
  expect(rolledBack).toEqual(createResultError("testRollback", "roll back projection"))

  const entries = await database
    .select()
    .from(sessionHistoryEntryTable)
    .where(eq(sessionHistoryEntryTable.sessionId, fixture.sessionId))
  expect(entries.map((entry) => entry.position)).toEqual([3, 5])

  const [session] = await database.select().from(sessionTable).where(eq(sessionTable.id, fixture.sessionId))
  expect(session?.nextHistoryPosition).toBe(6)
})

test("schema constraints reject invalid projection rows and ownership", async () => {
  const base = {
    changePosition: 20,
    id: "session-history-entry-invalid-row",
    kind: "message",
    payload: { content: "invalid", role: "user" },
    position: 20,
    sessionId: fixture.sessionId,
    sourceDetailId: "",
    sourceId: "session-history-entry-invalid-source",
    sourceType: "message",
    userId: fixture.userId,
  }
  const invalidInsert = async (overrides: Record<string, unknown>) =>
    await database.insert(sessionHistoryEntryTable).values({ ...base, ...overrides } as never)

  await expect(invalidInsert({ id: "invalid-kind", kind: "invalid" })).rejects.toThrow()
  await expect(invalidInsert({ id: "invalid-source-type", sourceType: "invalid" })).rejects.toThrow()
  await expect(invalidInsert({ id: "invalid-source-id", sourceId: "x".repeat(257) })).rejects.toThrow()
  await expect(invalidInsert({ id: "invalid-detail-id", sourceDetailId: "x".repeat(257) })).rejects.toThrow()
  await expect(invalidInsert({ id: "invalid-position", position: 0 })).rejects.toThrow()
  await expect(invalidInsert({ id: "invalid-position-safe", position: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow()
  await expect(invalidInsert({ changePosition: 19, id: "invalid-change-order" })).rejects.toThrow()
  await expect(
    invalidInsert({ changePosition: Number.MAX_SAFE_INTEGER + 1, id: "invalid-change-safe" }),
  ).rejects.toThrow()
  await expect(invalidInsert({ id: "missing-user", userId: "session-history-entry-missing-user" })).rejects.toThrow()
  await expect(
    invalidInsert({ id: "missing-session", sessionId: "session-history-entry-missing-session" }),
  ).rejects.toThrow()
})

test("allocates distinct consecutive positions across concurrent transactions", async () => {
  const [before] = await database
    .select({ nextHistoryPosition: sessionTable.nextHistoryPosition })
    .from(sessionTable)
    .where(eq(sessionTable.id, fixture.sessionId))
  const allocationCount = 8
  const allocated = await Promise.all(
    Array.from({ length: allocationCount }, () =>
      databaseTransactionRun(database, (transaction) =>
        sessionHistoryEntryPositionAllocate(transaction, fixture.userId, fixture.sessionId),
      ),
    ),
  )

  expect(allocated.every((result) => result.success)).toBe(true)
  const positions = allocated.flatMap((result) => (result.success ? [result.data] : []))
  expect(new Set(positions).size).toBe(allocationCount)
  expect(positions.sort((left, right) => left - right)).toEqual(
    Array.from({ length: allocationCount }, (_, index) => (before?.nextHistoryPosition ?? 1) + index),
  )
  const [after] = await database
    .select({ nextHistoryPosition: sessionTable.nextHistoryPosition })
    .from(sessionTable)
    .where(eq(sessionTable.id, fixture.sessionId))
  expect(after?.nextHistoryPosition).toBe((before?.nextHistoryPosition ?? 1) + allocationCount)
})
