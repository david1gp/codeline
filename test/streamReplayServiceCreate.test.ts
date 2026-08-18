import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamReplayServiceCreate } from "../src/stream/actions/streamReplayServiceCreate.js"
import { streamCheckpointTable } from "../src/stream/db/streamCheckpointTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `stream-replay-agent-${uuidv7()}`,
  serverId: `stream-replay-server-${uuidv7()}`,
  userKey: `stream-replay-user-${uuidv7()}`,
}
let userId: string | undefined
let sessionId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Stream Replay User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database
    .insert(organizationTable)
    .values({ id: userId, externalId: userId, name: "Stream Replay Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://stream-replay-server.test",
    id: fixture.serverId,
    name: "Stream Replay Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Stream Replay Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  sessionId = `stream-replay-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Stream Replay Session",
    userId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "stream replay service appends contiguously and replays durable event IDs",
  async () => {
    if (userId === undefined || sessionId === undefined) return
    const service = streamReplayServiceCreate({
      database,
      inactivityTimeoutMs: 60_000,
      sessionId,
      streamId: `stream-replay-${uuidv7()}`,
      userId,
    })

    const first = await service.append({
      eventType: "delta",
      idempotencyKey: "first",
      payload: { text: "one" },
      sequence: 1,
    })
    expect(first).toMatchObject({ success: true, data: { created: true, event: { sequence: 1 } } })
    if (!first.success) return

    const repeated = await service.append({
      eventType: "delta",
      idempotencyKey: "first",
      payload: { text: "one" },
      sequence: 1,
    })
    expect(repeated).toMatchObject({ success: true, data: { created: false, event: { id: first.data.event.id } } })

    const second = await service.append({
      eventType: "finished",
      idempotencyKey: "second",
      payload: { done: true },
      sequence: 2,
    })
    expect(second).toMatchObject({ success: true, data: { created: true, checkpoint: { lastSequence: 2 } } })

    const replay = await service.replay({ afterSequence: 1, limit: 10 })
    expect(replay).toMatchObject({
      success: true,
      data: {
        checkpoint: { lastSequence: 2 },
        events: [{ sequence: 2, id: second.success ? second.data.event.id : "" }],
        stale: false,
      },
    })
  },
)

test.skipIf(!databaseAvailable)(
  "stream replay service rolls back sequence gaps and reports stale checkpoints",
  async () => {
    if (userId === undefined || sessionId === undefined) return
    const streamId = `stream-stale-${uuidv7()}`
    const now = new Date()
    const service = streamReplayServiceCreate({
      database,
      inactivityTimeoutMs: 100,
      now: () => now,
      sessionId,
      streamId,
      userId,
    })

    const gap = await service.append({
      eventType: "gap",
      idempotencyKey: "gap",
      payload: {},
      sequence: 2,
    })
    expect(gap).toMatchObject({
      success: false,
      errorMessage: "The stream event sequence must immediately follow the stream checkpoint.",
    })

    const initial = await service.replay()
    expect(initial).toMatchObject({
      success: true,
      data: { checkpoint: { lastSequence: 0 }, events: [], stale: false },
    })
    if (!initial.success) return

    await database
      .update(streamCheckpointTable)
      .set({ updatedAt: new Date(now.getTime() - 1_000) })
      .where(eq(streamCheckpointTable.id, initial.data.checkpoint.id))

    const stale = await service.replay()
    expect(stale).toMatchObject({ success: true, data: { stale: true, events: [] } })

    const resumed = await service.append({
      eventType: "resumed",
      idempotencyKey: "resumed",
      payload: { ok: true },
      sequence: 1,
    })
    expect(resumed).toMatchObject({
      code: "stream_stale",
      errorMessage: "The stream is stale.",
      success: false,
    })
    expect(await service.replay()).toMatchObject({ success: true, data: { events: [], stale: true } })

    const freshService = streamReplayServiceCreate({
      database,
      inactivityTimeoutMs: 60_000,
      sessionId,
      streamId: `stream-resumed-${uuidv7()}`,
      userId,
    })
    expect(
      await freshService.append({
        eventType: "resumed",
        idempotencyKey: "resumed",
        payload: { ok: true },
        sequence: 1,
      }),
    ).toMatchObject({ success: true, data: { created: true, checkpoint: { lastSequence: 1 } } })

    const fresh = await freshService.replay()
    expect(fresh).toMatchObject({ success: true, data: { stale: false, events: [{ sequence: 1 }] } })
  },
)
