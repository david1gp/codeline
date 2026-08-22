import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import postgres from "postgres"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { mutationIdempotencyTable } from "../src/api/db/mutationIdempotencyTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { apiMessageRoutesAdd } from "../src/message/api/apiMessageRoutesAdd.js"
import { messageAppendResponseSchema } from "../src/message/api/messageAppendResponseSchema.js"
import { messagePageResponseSchema } from "../src/message/api/messagePageResponseSchema.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `message-http-agent-${uuidv7()}`,
  organizationId: `message-http-organization-${uuidv7()}`,
  otherOrganizationId: `message-http-other-organization-${uuidv7()}`,
  serverId: `message-http-server-${uuidv7()}`,
  userKey: `message-http-user-${uuidv7()}`,
}
const codecResult = journalCursorCodecCreate({ randomBytes, secret: `message-http-${uuidv7()}` })
if (!codecResult.success) throw new Error(codecResult.errorMessage)

let userId: string | undefined
let sessionId: string | undefined
const published: Array<typeof journalEventTable.$inferSelect> = []
const publisher = async (events: readonly (typeof journalEventTable.$inferSelect)[]) => {
  published.push(...events)
  return createResult(undefined)
}
const api = new Hono<AppEnvironment>()
api.use("*", async (context, next) => {
  context.set("database", database)
  context.set("requestIdentity", { organizationId: fixture.organizationId, userId: userId as string })
  await next()
})
apiMessageRoutesAdd(api, { journalCursorCodec: codecResult.data, journalPostCommitPublish: publisher })

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Message HTTP User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values([
    { externalId: fixture.organizationId, id: fixture.organizationId, name: "Message HTTP Organization" },
    { externalId: fixture.otherOrganizationId, id: fixture.otherOrganizationId, name: "Other Organization" },
  ])
  await database.insert(serverTable).values({
    endpoint: "http://message-http-server.test",
    id: fixture.serverId,
    name: "Message HTTP Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Message HTTP Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  const session = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-http-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message HTTP session",
    },
    { organizationId: fixture.organizationId },
  )
  if (!session.success) throw new Error(session.errorMessage)
  sessionId = session.data.session.id
})

afterAll(async () => {
  if (databaseAvailable) {
    if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database
      .delete(organizationTable)
      .where(inArray(organizationTable.id, [fixture.organizationId, fixture.otherOrganizationId]))
  }
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "writes validated messages transactionally and publishes one replayable invalidation",
  async () => {
    if (userId === undefined || sessionId === undefined) return
    const input = {
      clientRequestId: `message-http-key-${uuidv7()}`,
      content: "hello from the Drizzle route",
      role: "user",
    } as const
    const created = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.clientRequestId },
      method: "POST",
    })
    expect(created.status).toBe(201)
    expect(created.headers.get("Idempotency-Replayed")).toBe("false")
    const createdBody = await created.json()
    expect(v.safeParse(messageAppendResponseSchema, createdBody).success).toBe(true)
    expect(createdBody).toMatchObject({ created: true, message: { content: input.content, sequence: 1 } })

    const repeated = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.clientRequestId },
      method: "POST",
    })
    expect(repeated.status).toBe(200)
    expect(repeated.headers.get("Idempotency-Replayed")).toBe("true")
    expect(await repeated.json()).toEqual({ ...createdBody, created: false })

    const conflict = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify({ ...input, content: "different" }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": input.clientRequestId },
      method: "POST",
    })
    expect(conflict.status).toBe(409)

    const unsupported = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify({ ...input, clientRequestId: `message-http-run-${uuidv7()}`, runId: "deferred" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(unsupported.status).toBe(400)
    expect((await unsupported.json()).error.message).toContain("Run-start")

    const missingKey = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify({ content: input.content, role: input.role }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(missingKey.status).toBe(400)

    const [session] = await database
      .select({ revision: sessionTable.revision })
      .from(sessionTable)
      .where(eq(sessionTable.id, sessionId))
    expect(session?.revision).toBe(2)
    expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))).toHaveLength(1)
    expect(
      await database
        .select()
        .from(mutationIdempotencyTable)
        .where(eq(mutationIdempotencyTable.idempotencyKey, input.clientRequestId)),
    ).toHaveLength(1)
    const events = await database.select().from(journalEventTable).where(eq(journalEventTable.userId, userId))
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ eventType: "invalidate", sequence: 1, payload: { resourceId: sessionId } })
    expect(published).toHaveLength(1)
    const after = codecResult.data.encodeDeterministic(userId, 0)
    if (!after.success) throw new Error(after.errorMessage)
    const replay = await journalBacklogRead({ cursorCodec: codecResult.data, database }, { after: after.data, userId })
    expect(replay.success).toBe(true)
    if (!replay.success) return
    const replayedFrames = []
    for await (const page of replay.data.pages) {
      if (page.success) replayedFrames.push(...page.data)
    }
    expect(replayedFrames).toHaveLength(1)
    expect(replayedFrames[0]).toMatchObject({ data: { sequence: 1 }, event: "invalidate" })
  },
)

test.skipIf(!databaseAvailable)(
  "isolates message writes and serves opaque consistent page cursors with correct ETags",
  async () => {
    if (userId === undefined || sessionId === undefined) return
    const authenticatedUserId = userId
    const authenticatedSessionId = sessionId
    const secondInput = {
      clientRequestId: `message-http-second-${uuidv7()}`,
      content: "second message",
      role: "assistant",
    } as const
    const second = await api.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify(secondInput),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(second.status).toBe(201)

    const firstPageResponse = await api.request(`http://codeline.test/sessions/${sessionId}/messages?limit=1`)
    expect(firstPageResponse.status).toBe(200)
    const firstPage = await firstPageResponse.json()
    expect(firstPage.asOfCursor).not.toContain(userId)
    expect(codecResult.data.validate(firstPage.asOfCursor, userId).success).toBe(true)
    expect(firstPage).not.toHaveProperty("asOfSequence")
    expect(v.safeParse(messagePageResponseSchema, firstPage).success).toBe(true)
    expect(firstPageResponse.headers.get("ETag")).toBe(firstPage.etag)
    expect(firstPage.nextCursor).toEqual(expect.any(String))

    const notModified = await api.request(`http://codeline.test/sessions/${sessionId}/messages?limit=1`, {
      headers: { "If-None-Match": firstPage.etag },
    })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get("ETag")).toBe(firstPage.etag)

    const secondPage = await api.request(
      `http://codeline.test/sessions/${sessionId}/messages?cursor=${encodeURIComponent(firstPage.nextCursor)}&limit=1`,
    )
    expect(secondPage.status).toBe(200)
    expect((await secondPage.json()).messages.map((message: { sequence: number }) => message.sequence)).toEqual([2])

    let releaseWriter: (() => void) | undefined
    let writerReadyResolve: (() => void) | undefined
    const writerReady = new Promise<void>((resolve) => {
      writerReadyResolve = resolve
    })
    const writer = database.transaction(async (transaction) => {
      await transaction
        .update(sessionTable)
        .set({ revision: 99, title: "uncommitted", updatedAt: new Date("2026-08-23T00:00:00.000Z") })
        .where(eq(sessionTable.id, authenticatedSessionId))
      await transaction.insert(messageTable).values({
        agentId: fixture.agentId,
        clientRequestId: `message-http-uncommitted-${uuidv7()}`,
        content: "uncommitted message",
        id: uuidv7(),
        metadata: {},
        role: "user",
        sequence: 3,
        sessionId: authenticatedSessionId,
      })
      await transaction
        .update(journalSequenceCounterTable)
        .set({ nextSequence: 99 })
        .where(eq(journalSequenceCounterTable.userId, authenticatedUserId))
      writerReadyResolve?.()
      await new Promise<void>((resolve) => {
        releaseWriter = resolve
      })
      throw new Error("rollback consistency fixture")
    })
    await writerReady
    const consistentPage = await api.request(`http://codeline.test/sessions/${sessionId}/messages`)
    releaseWriter?.()
    await writer.catch(() => undefined)
    expect(consistentPage.status).toBe(200)
    const consistentBody = await consistentPage.json()
    expect(consistentBody.revision).toBe(3)
    expect(consistentBody.messages.map((message: { sequence: number }) => message.sequence)).toEqual([1, 2])
    expect(codecResult.data.validate(consistentBody.asOfCursor, userId)).toMatchObject({
      success: true,
      data: { sequence: 2 },
    })

    const otherOrganizationApi = new Hono<AppEnvironment>()
    otherOrganizationApi.use("*", async (context, next) => {
      context.set("database", database)
      context.set("requestIdentity", { organizationId: fixture.otherOrganizationId, userId: userId as string })
      await next()
    })
    apiMessageRoutesAdd(otherOrganizationApi, {
      journalCursorCodec: codecResult.data,
      journalPostCommitPublish: publisher,
    })
    const isolated = await otherOrganizationApi.request(`http://codeline.test/sessions/${sessionId}/messages`, {
      body: JSON.stringify({
        clientRequestId: `message-http-isolated-${uuidv7()}`,
        content: "must not write",
        role: "user",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const isolatedBody = await isolated.text()
    expect({ body: isolatedBody, status: isolated.status }).toEqual({
      body: JSON.stringify({ error: { code: "not_found", message: "The requested resource was not found." } }),
      status: 404,
    })
  },
)
