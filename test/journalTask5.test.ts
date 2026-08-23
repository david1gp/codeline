import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult, createResultError, type Result } from "@adaptive-ds/result"
import { asc, eq, inArray } from "drizzle-orm"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import type { JournalEventRecipientResolver } from "../src/journal/actions/journalEventRecipientResolver.js"
import { journalWriteCreate } from "../src/journal/actions/journalWriteCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import type { JournalEventAppendInput } from "../src/journal/schema/journalEventAppendInputSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const fixturePrefix = `task5-journal-${uuidv7()}`
const orderingUserId = `${fixturePrefix}-ordering`
const fanoutUserAId = `${fixturePrefix}-fanout-a`
const fanoutUserBId = `${fixturePrefix}-fanout-b`
const cursorUserId = `${fixturePrefix}-cursor`
const rollbackUserId = `${fixturePrefix}-rollback`
const publicationUserId = `${fixturePrefix}-publication`
const publicationFailureUserId = `${fixturePrefix}-publication-failure`
const fixtureUserIds = [
  orderingUserId,
  fanoutUserAId,
  fanoutUserBId,
  cursorUserId,
  rollbackUserId,
  publicationUserId,
  publicationFailureUserId,
]
const recipientsByResourceId = new Map<string, readonly string[]>()

beforeAll(async () => {
  await database.insert(applicationUserTable).values(fixtureUserIds.map((id) => ({ displayName: id, id })))
})

afterAll(async () => {
  await database.delete(applicationUserTable).where(eq(applicationUserTable.id, orderingUserId))
  for (const userId of fixtureUserIds.slice(1)) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

function journalWriterCreate(published: Array<typeof journalEventTable.$inferSelect>) {
  return journalWriteCreate({
    database,
    resolveRecipients: journalRecipientsResolve,
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

const journalRecipientsResolve: JournalEventRecipientResolver = async (transaction, resource) => {
  const expectedUserIds = recipientsByResourceId.get(resource.resourceId) ?? []
  if (expectedUserIds.length === 0) return createResult([])
  const users = await transaction
    .select({ id: applicationUserTable.id })
    .from(applicationUserTable)
    .where(inArray(applicationUserTable.id, [...expectedUserIds]))
  return createResult(users.map((user) => user.id))
}

function journalResource(resourceId: string, authorizedUserIds: readonly string[]) {
  recipientsByResourceId.set(resourceId, authorizedUserIds)
  return { resourceId, resourceType: "test-resource" }
}

test("allocates ordered per-user sequences under concurrent SQLite writes", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const writer = journalWriterCreate(published)
  const results = await Promise.all(
    Array.from({ length: 24 }, (_, index) =>
      journalAppend(writer, {
        eventType: "invalidate",
        payload: { index, resourceId: "ordered-resource" },
        resource: journalResource("ordered-resource", [orderingUserId]),
      }),
    ),
  )

  expect(results.every((result) => result.success)).toBe(true)
  const events = await database
    .select()
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, orderingUserId))
    .orderBy(asc(journalEventTable.sequence))
  expect(events.map((event) => event.sequence)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1))
  expect(published).toHaveLength(24)
  const [counter] = await database
    .select()
    .from(journalSequenceCounterTable)
    .where(eq(journalSequenceCounterTable.userId, orderingUserId))
  expect(counter?.nextSequence).toBe(25)
})

test("fans out shared-resource events with independent ordered user journals", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  const writer = journalWriterCreate(published)
  const results = await Promise.all(
    Array.from({ length: 12 }, (_, index) =>
      journalAppend(writer, {
        eventType: "invalidate",
        payload: { resourceId: "shared-resource", version: index },
        resource: journalResource("shared-resource", [fanoutUserBId, fanoutUserAId]),
      }),
    ),
  )

  expect(results.every((result) => result.success)).toBe(true)
  expect(published).toHaveLength(24)
  expect(published.every((event) => [fanoutUserAId, fanoutUserBId].includes(event.userId))).toBe(true)
  for (const userId of [fanoutUserAId, fanoutUserBId]) {
    const events = await database
      .select()
      .from(journalEventTable)
      .where(eq(journalEventTable.userId, userId))
      .orderBy(asc(journalEventTable.sequence))
    expect(events.map((event) => event.sequence)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1))
    expect(events.map((event) => (event.payload as { resourceId?: unknown }).resourceId)).toEqual(
      Array.from({ length: 12 }, () => "shared-resource"),
    )
  }
})

test("rejects opaque cursors belonging to another journal owner", async () => {
  const codec = journalCursorCodecCreate({
    randomBytes: (size) => randomBytes(size),
    secret: "task5-test-cursor-secret",
  })
  expect(codec.success).toBe(true)
  if (!codec.success) return

  const encoded = codec.data.encode(cursorUserId, 17)
  expect(encoded.success).toBe(true)
  if (!encoded.success) return
  expect(encoded.data).not.toContain(cursorUserId)
  expect(codec.data.validate(encoded.data, cursorUserId)).toMatchObject({ success: true, data: { sequence: 17 } })
  expect(codec.data.validate(encoded.data, fanoutUserAId)).toMatchObject({
    code: "cursor_owner_mismatch",
    success: false,
  })
  expect(codec.data.decode(`${encoded.data}invalid`)).toMatchObject({ success: false })
})

test("persists before publication and publishes nothing for rolled-back writes", async () => {
  const published: Array<typeof journalEventTable.$inferSelect> = []
  let persistedAtPublication = false
  const writer = journalWriteCreate({
    database,
    resolveRecipients: journalRecipientsResolve,
    postCommitPublish: async (events) => {
      const [event] = events
      if (event !== undefined) {
        const persisted = await database
          .select({ id: journalEventTable.id })
          .from(journalEventTable)
          .where(eq(journalEventTable.id, event.id))
        persistedAtPublication = persisted.length === 1
      }
      published.push(...events)
      return createResult(undefined)
    },
  })

  const rolledBack: Result<void> = await writer.run({
    resources: [journalResource("rolled-back-resource", [rollbackUserId])],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "invalidate",
        payload: { resourceId: "rolled-back-resource" },
        resource: journalResource("rolled-back-resource", [rollbackUserId]),
      })
      if (!appended.success) return createResultError("journalTask5Rollback", appended.errorMessage)
      return createResultError("journalTask5Rollback", "The test transaction must roll back.")
    },
  })
  expect(rolledBack).toMatchObject({ success: false })
  expect(published).toHaveLength(0)
  expect(
    await database.select().from(journalEventTable).where(eq(journalEventTable.userId, rollbackUserId)),
  ).toHaveLength(0)
  expect(
    await database
      .select()
      .from(journalSequenceCounterTable)
      .where(eq(journalSequenceCounterTable.userId, rollbackUserId)),
  ).toHaveLength(0)

  const committed = await journalAppend(writer, {
    eventType: "invalidate",
    payload: { resourceId: "committed-resource" },
    resource: journalResource("committed-resource", [rollbackUserId]),
  })
  expect(committed).toMatchObject({ success: true })
  expect(persistedAtPublication).toBe(true)
  expect(published).toHaveLength(1)
})

test("keeps post-commit publication ordered per user across concurrent commits", async () => {
  const publicationOrder: number[] = []
  let publicationStarted!: () => void
  let releasePublication!: () => void
  const firstPublicationStarted = new Promise<void>((resolve) => {
    publicationStarted = resolve
  })
  const firstPublicationReleased = new Promise<void>((resolve) => {
    releasePublication = resolve
  })
  let publicationCount = 0
  const writer = journalWriteCreate({
    database,
    resolveRecipients: journalRecipientsResolve,
    postCommitPublish: async (events) => {
      const event = events[0]
      if (event === undefined) return createResultError("journalTask5Publication", "The event is missing.")
      publicationOrder.push(event.sequence)
      publicationCount += 1
      if (publicationCount === 1) {
        publicationStarted()
        await firstPublicationReleased
      }
      return createResult(undefined)
    },
  })

  const first = journalAppend(writer, {
    eventType: "invalidate",
    payload: { resourceId: "publication-order-resource", version: 1 },
    resource: journalResource("publication-order-resource", [publicationUserId]),
  })
  await firstPublicationStarted

  const second = journalAppend(writer, {
    eventType: "invalidate",
    payload: { resourceId: "publication-order-resource", version: 2 },
    resource: journalResource("publication-order-resource", [publicationUserId]),
  })
  await Bun.sleep(25)
  expect(publicationOrder).toEqual([1])

  releasePublication()
  expect((await first).success).toBe(true)
  expect((await second).success).toBe(true)
  expect(publicationOrder).toEqual([1, 2])
})

test("reports post-commit publication failure after durable commit", async () => {
  const resourceId = "publication-failure-resource"
  const writer = journalWriteCreate({
    database,
    resolveRecipients: journalRecipientsResolve,
    postCommitPublish: async () =>
      createResultError("journalTask5PublicationFailure", "The test publisher is unavailable."),
  })

  const result = await writer.run({
    resources: [journalResource(resourceId, [publicationFailureUserId])],
    write: async (_transaction, journal) => {
      const appended = await journal.append({
        eventType: "invalidate",
        payload: { resourceId },
        resource: journalResource(resourceId, [publicationFailureUserId]),
      })
      return appended.success ? createResult(undefined) : createResultError("journalTask5Append", appended.errorMessage)
    },
  })

  expect(result).toMatchObject({
    code: "journal_publication_failed",
    success: false,
  })
  if (result.success) return
  expect(result.errorMessage).toContain("transaction committed")
  expect(JSON.parse(result.errorData ?? "{}")).toMatchObject({
    committed: true,
    durableJournal: true,
    publicationFailed: true,
    recovery: "journal-replay-on-reconnect",
  })
  expect(
    await database.select().from(journalEventTable).where(eq(journalEventTable.userId, publicationFailureUserId)),
  ).toHaveLength(1)
  const [counter] = await database
    .select()
    .from(journalSequenceCounterTable)
    .where(eq(journalSequenceCounterTable.userId, publicationFailureUserId))
  expect(counter?.nextSequence).toBe(2)
})

test("enforces resolver, mutation, and journal-write phases in transaction order", async () => {
  const phaseOrder: string[] = []
  const resourceId = "transaction-api-resource"
  const writer = journalWriteCreate({
    database,
    resolveRecipients: async (transaction, resource) => {
      phaseOrder.push(`resolve:${resource.resourceId}`)
      const users = await transaction
        .select({ id: applicationUserTable.id })
        .from(applicationUserTable)
        .where(eq(applicationUserTable.id, orderingUserId))
      return createResult(users.map((user) => user.id))
    },
    postCommitPublish: async () => createResult(undefined),
  })

  const result = await writer.run({
    mutate: async () => {
      phaseOrder.push("mutate")
      return createResult("domain-result")
    },
    resources: [{ resourceId, resourceType: "test-resource" }],
    write: async (_transaction, journal) => {
      phaseOrder.push("write")
      const appended = await journal.append({
        eventType: "invalidate",
        payload: { resourceId },
        resource: { resourceId, resourceType: "test-resource" },
      })
      return appended.success ? createResult(undefined) : appended
    },
  })

  expect(result).toMatchObject({ success: true, data: "domain-result" })
  expect(phaseOrder).toEqual([`resolve:${resourceId}`, "mutate", "write"])
})
