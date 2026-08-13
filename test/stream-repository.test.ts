import { afterAll, afterEach, beforeAll, expect, test } from "bun:test"
import { createResultError } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamAppend } from "../src/stream/actions/streamAppend.js"
import { streamCheckpointAdvance } from "../src/stream/actions/streamCheckpointAdvance.js"
import { streamCheckpointLoadOrCreate } from "../src/stream/actions/streamCheckpointLoadOrCreate.js"
import { streamListAfter } from "../src/stream/actions/streamListAfter.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `stream-test-agent-${uuidv7()}`,
  serverId: `stream-test-server-${uuidv7()}`,
  userKey: `stream-test-user-${uuidv7()}`,
}
let userId: string | undefined
let sessionId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentUserUpsert(database, {
    displayName: "Stream Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id

  await database.insert(serverTable).values({
    endpoint: "http://stream-test-server.test",
    id: fixture.serverId,
    name: "Stream Test Server",
    ownerUserId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Stream Test Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  sessionId = `stream-test-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Stream Test Session",
    userId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  await client.end()
})

afterEach(async () => {
  if (sessionId !== undefined)
    await database.update(sessionTable).set({ archivedAt: null }).where(eq(sessionTable.id, sessionId))
})

test.skipIf(!databaseAvailable)("stream append is ordered, JSON-aware, idempotent, and conflict-safe", async () => {
  if (userId === undefined || sessionId === undefined) return
  const streamId = `stream-${uuidv7()}`
  const first = await streamAppend(database, userId, sessionId, {
    eventType: "delta",
    idempotencyKey: "event-one",
    payload: { text: "one", nested: { value: 1 } },
    sequence: 2,
    streamId,
  })
  expect(first).toMatchObject({ success: true, data: { created: true, event: { sequence: 2 } } })

  const second = await streamAppend(database, userId, sessionId, {
    eventType: "delta",
    idempotencyKey: "event-zero",
    payload: ["zero", true],
    sequence: 1,
    streamId,
  })
  expect(second).toMatchObject({ success: true, data: { created: true, event: { sequence: 1 } } })

  const repeated = await streamAppend(database, userId, sessionId, {
    eventType: "delta",
    idempotencyKey: "event-one",
    payload: { nested: { value: 1 }, text: "one" },
    sequence: 2,
    streamId,
  })
  expect(repeated).toMatchObject({ success: true, data: { created: false, event: { sequence: 2 } } })

  const idempotencyConflict = await streamAppend(database, userId, sessionId, {
    eventType: "delta",
    idempotencyKey: "event-one",
    payload: { text: "different" },
    sequence: 2,
    streamId,
  })
  expect(idempotencyConflict).toEqual(
    createResultError("streamRepositoryAppend", "The stream event idempotency key conflicts with an existing event."),
  )

  const sequenceConflict = await streamAppend(database, userId, sessionId, {
    eventType: "other",
    idempotencyKey: "event-two",
    payload: null,
    sequence: 2,
    streamId,
  })
  expect(sequenceConflict).toEqual(
    createResultError("streamRepositoryAppend", "The stream event sequence conflicts with an existing event."),
  )

  const page = await streamListAfter(database, userId, sessionId, streamId, { afterSequence: 0, limit: 1 })
  expect(page).toMatchObject({ success: true, data: [{ sequence: 1, payload: ["zero", true] }] })
  if (!page.success) return
  const rest = await streamListAfter(database, userId, sessionId, streamId, {
    afterSequence: page.data[0]?.sequence ?? 0,
    limit: 100,
  })
  expect(rest).toMatchObject({ success: true, data: [{ sequence: 2 }] })
})

test.skipIf(!databaseAvailable)("stream operations enforce ownership and cursor bounds", async () => {
  if (userId === undefined || sessionId === undefined) return
  const streamId = `stream-owner-${uuidv7()}`
  const appended = await streamAppend(database, userId, sessionId, {
    eventType: "notice",
    idempotencyKey: "owner-event",
    payload: { ok: true },
    sequence: 1,
    streamId,
  })
  expect(appended.success).toBe(true)

  expect(
    await streamListAfter(database, "development:unknown", sessionId, streamId, { afterSequence: 0, limit: 10 }),
  ).toMatchObject({
    success: false,
    errorMessage: "The session could not be found.",
  })
  expect(
    await streamAppend(database, userId, sessionId, {
      eventType: "x",
      idempotencyKey: "bad",
      payload: {},
      sequence: 0,
      streamId,
    }),
  ).toMatchObject({
    success: false,
  })
  expect(await streamListAfter(database, userId, sessionId, streamId, { afterSequence: -1, limit: 10 })).toMatchObject({
    success: false,
  })
  expect(await streamListAfter(database, userId, sessionId, streamId, { afterSequence: 0, limit: 101 })).toMatchObject({
    success: false,
  })
})

test.skipIf(!databaseAvailable)("checkpoints create at zero and advance monotonically", async () => {
  if (userId === undefined || sessionId === undefined) return
  const streamId = `stream-checkpoint-${uuidv7()}`
  const created = await streamCheckpointLoadOrCreate(database, userId, sessionId, streamId)
  expect(created).toMatchObject({ success: true, data: { created: true, checkpoint: { lastSequence: 0 } } })
  const repeated = await streamCheckpointLoadOrCreate(database, userId, sessionId, streamId)
  expect(repeated).toMatchObject({ success: true, data: { created: false, checkpoint: { lastSequence: 0 } } })

  expect(await streamCheckpointAdvance(database, userId, sessionId, streamId, 3)).toMatchObject({
    success: true,
    data: { advanced: true, checkpoint: { lastSequence: 3 } },
  })
  expect(await streamCheckpointAdvance(database, userId, sessionId, streamId, 2)).toMatchObject({
    success: true,
    data: { advanced: false, checkpoint: { lastSequence: 3 } },
  })
  expect(await streamCheckpointAdvance(database, userId, sessionId, `missing-${streamId}`, 1)).toMatchObject({
    success: false,
  })
})

test.skipIf(!databaseAvailable)("archived streams remain readable but cannot start or advance", async () => {
  if (userId === undefined || sessionId === undefined) return
  const streamId = `stream-archived-${uuidv7()}`
  const appended = await streamAppend(database, userId, sessionId, {
    eventType: "before_archive",
    idempotencyKey: "archived-event",
    payload: { retained: true },
    sequence: 1,
    streamId,
  })
  expect(appended.success).toBe(true)
  const checkpoint = await streamCheckpointLoadOrCreate(database, userId, sessionId, streamId)
  expect(checkpoint).toMatchObject({ success: true, data: { created: true, checkpoint: { lastSequence: 0 } } })
  await database.update(sessionTable).set({ archivedAt: new Date() }).where(eq(sessionTable.id, sessionId))

  expect(await streamListAfter(database, userId, sessionId, streamId, { afterSequence: 0, limit: 10 })).toMatchObject({
    success: true,
    data: [{ sequence: 1 }],
  })
  expect(
    await streamAppend(database, userId, sessionId, {
      eventType: "after_archive",
      idempotencyKey: "new-archived-event",
      payload: {},
      sequence: 2,
      streamId,
    }),
  ).toMatchObject({ success: false, errorMessage: "The session is archived." })
  expect(
    await streamAppend(database, userId, sessionId, {
      eventType: "before_archive",
      idempotencyKey: "archived-event",
      payload: { retained: true },
      sequence: 1,
      streamId,
    }),
  ).toMatchObject({ success: true, data: { created: false } })
  expect(await streamCheckpointLoadOrCreate(database, userId, sessionId, `new-${streamId}`)).toMatchObject({
    success: false,
    errorMessage: "The session is archived.",
  })
  expect(await streamCheckpointLoadOrCreate(database, userId, sessionId, streamId)).toMatchObject({
    success: true,
    data: { created: false, checkpoint: { lastSequence: 0 } },
  })
  expect(await streamCheckpointAdvance(database, userId, sessionId, streamId, 1)).toMatchObject({
    success: false,
    errorMessage: "The session is archived.",
  })
  await database.update(sessionTable).set({ archivedAt: null }).where(eq(sessionTable.id, sessionId))
})

test.skipIf(!databaseAvailable)("stream appends participate in caller-owned transaction rollback", async () => {
  if (userId === undefined || sessionId === undefined) return
  const streamId = `stream-rollback-${uuidv7()}`
  const result = await databaseTransactionRun(database, async (transaction) => {
    const appended = await streamAppend(transaction, userId as string, sessionId as string, {
      eventType: "rolled_back",
      idempotencyKey: "rollback-event",
      payload: { discarded: true },
      sequence: 1,
      streamId,
    })
    if (!appended.success) return appended
    return createResultError("streamRollbackTest", "Rollback requested.")
  })
  expect(result).toEqual(createResultError("streamRollbackTest", "Rollback requested."))
  expect(await streamListAfter(database, userId, sessionId, streamId, { afterSequence: 0, limit: 10 })).toMatchObject({
    success: true,
    data: [],
  })
})
