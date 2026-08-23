import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runRetryAttemptCreate } from "../src/run/actions/runRetryAttemptCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamReplayRunServiceCreate } from "../src/stream/actions/streamReplayRunServiceCreate.js"
import { streamReplayServiceCreate } from "../src/stream/actions/streamReplayServiceCreate.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `stream-run-agent-${uuidv7()}`,
  serverId: `stream-run-server-${uuidv7()}`,
  userKey: `stream-run-user-${uuidv7()}`,
}
let userId: string | undefined
let sessionId: string | undefined
let runId: string | undefined
let firstStreamId: string | undefined
let secondStreamId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Stream Replay Run User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database
    .insert(organizationTable)
    .values({ id: userId, externalId: userId, name: "Stream Replay Run Organization" })
  await database.insert(serverTable).values({
    endpoint: "http://stream-replay-run-server.test",
    id: fixture.serverId,
    name: "Stream Replay Run Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Stream Replay Run Agent",
    role: "coding",
    serverId: fixture.serverId,
  })

  sessionId = `stream-replay-run-session-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Stream Replay Run Session",
    userId,
  })

  firstStreamId = `stream-replay-run-first-${uuidv7()}`
  const created = await runCreate(database, userId, sessionId, {
    budget: { maxAttempts: 2, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
    clientRunId: `stream-replay-run-${uuidv7()}`,
    snapshot: {
      configuration: { model: "stream-replay-run-model", provider: "deterministic" },
      configurationRevision: "stream-replay-run-revision",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId: firstStreamId,
  })
  if (!created.success) throw new Error(created.errorMessage)
  runId = created.data.run.id
  const running = await runTransition(database, userId, sessionId, runId, { status: "running" })
  if (!running.success) throw new Error(running.errorMessage)
  const failed = await runTransition(database, userId, sessionId, runId, {
    failure: { code: "provider_failed", message: "temporary" },
    status: "failed",
  })
  if (!failed.success) throw new Error(failed.errorMessage)
  const retried = await runRetryAttemptCreate(database, userId, sessionId, runId)
  if (!retried.success) throw new Error(retried.errorMessage)
  secondStreamId = retried.data.attempt.streamId

  const firstService = streamReplayServiceCreate({
    database,
    inactivityTimeoutMs: 60_000,
    sessionId,
    streamId: firstStreamId,
    userId,
  })
  for (const event of [
    {
      eventType: "TEXT_MESSAGE_CONTENT",
      idempotencyKey: "first",
      payload: { delta: "before retry", type: "TEXT_MESSAGE_CONTENT" },
      sequence: 1,
    },
    {
      eventType: "RUN_ERROR",
      idempotencyKey: "retry-error",
      payload: { code: "provider_failed", message: "temporary", type: "RUN_ERROR" },
      sequence: 2,
    },
  ]) {
    const appended = await firstService.append(event)
    if (!appended.success) throw new Error(appended.errorMessage)
  }
  const secondService = streamReplayServiceCreate({
    database,
    inactivityTimeoutMs: 60_000,
    sessionId,
    streamId: secondStreamId,
    userId,
  })
  const appended = await secondService.append({
    eventType: "RUN_FINISHED",
    idempotencyKey: "finished",
    payload: { type: "RUN_FINISHED" },
    sequence: 1,
  })
  if (!appended.success) throw new Error(appended.errorMessage)
})

afterAll(async () => {
  if (userId !== undefined) {
    await database.delete(runTable).where(eq(runTable.userId, userId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "run replay orders attempts, resolves opaque cursors, and reports aggregate progress",
  async () => {
    if (userId === undefined || sessionId === undefined || firstStreamId === undefined) return
    const service = streamReplayRunServiceCreate({
      database,
      inactivityTimeoutMs: 60_000,
      sessionId,
      streamId: firstStreamId,
      userId,
    })

    const replay = await service.replay()
    expect(replay).toMatchObject({
      success: true,
      data: { events: [{ sequence: 1 }, { sequence: 1 }], stale: false },
    })

    const cursor = await service.cursor(replay.success ? replay.data.events[0]?.id : undefined)
    expect(cursor).toMatchObject({ success: true, data: { afterSequence: 1, targetIndex: 0 } })
    if (!cursor.success) return
    const resumed = await service.replay({ after: cursor.data })
    expect(resumed).toMatchObject({ success: true, data: { events: [{ sequence: 1 }] } })

    expect(await service.status()).toMatchObject({
      success: true,
      data: { lastSequence: 3, stale: false },
    })
  },
)
