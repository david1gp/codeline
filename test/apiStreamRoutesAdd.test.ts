import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import type { ApplicationUser } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runChildStreamResolve } from "../src/run/actions/runChildStreamResolve.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runTransition } from "../src/run/actions/runTransition.js"
import { streamReplayServiceCreate } from "../src/stream/actions/streamReplayServiceCreate.js"
import { apiStreamRoutesAdd } from "../src/stream/api/apiStreamRoutesAdd.js"
import { streamApiErrorResponseSchema } from "../src/stream/api/streamApiErrorResponseSchema.js"
import { streamApiStatusResponseSchema } from "../src/stream/api/streamApiStatusResponseSchema.js"
import { streamCheckpointTable } from "../src/stream/db/streamCheckpointTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `stream-api-agent-${uuidv7()}`,
  serverId: `stream-api-server-${uuidv7()}`,
  userKey: `stream-api-user-${uuidv7()}`,
}
let developmentUser: ApplicationUser | undefined
let sessionId: string | undefined
let streamId: string | undefined
let firstEventId: string | undefined
let secondEventId: string | undefined
let childStreamId: string | undefined
const app = new Hono<AppEnvironment>()

function sseEvents(text: string): Array<{ data: unknown; event: string; id: string }> {
  if (text.trim() === "") return []
  return text
    .trim()
    .split("\n\n")
    .map((entry) => {
      const lines = entry.split("\n")
      const id = lines.find((line) => line.startsWith("id: "))?.slice(4)
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7)
      const data = lines.find((line) => line.startsWith("data: "))?.slice(6)
      if (id === undefined || event === undefined || data === undefined) throw new Error("Invalid SSE event")
      return { data: JSON.parse(data) as unknown, event, id }
    })
}

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Stream API User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  developmentUser = user.data
  await database
    .insert(organizationTable)
    .values({ id: developmentUser.id, externalId: developmentUser.id, name: "Stream API Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://stream-api-server.test",
    id: fixture.serverId,
    name: "Stream API Server",
    organizationId: developmentUser.id,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Stream API Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
  sessionId = `stream-api-session-${uuidv7()}`
  streamId = `stream-api-${uuidv7()}`
  await database.insert(sessionTable).values({
    clientRequestId: uuidv7(),
    id: sessionId,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Stream API Session",
    userId: developmentUser.id,
  })

  const root = await runCreate(database, developmentUser.id, sessionId, {
    budget: { maxAttempts: 1, maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
    clientRunId: `stream-api-root-${uuidv7()}`,
    snapshot: {
      configuration: { model: "stream-api-model", provider: "deterministic" },
      configurationRevision: "stream-api-revision",
      target: { agentId: fixture.agentId, serverId: fixture.serverId },
    },
    streamId,
  })
  if (!root.success) throw new Error(root.errorMessage)
  const running = await runTransition(database, developmentUser.id, sessionId, root.data.run.id, { status: "running" })
  if (!running.success) throw new Error(running.errorMessage)
  const child = await runChildCreate(database, developmentUser.id, sessionId, {
    delegationKey: "stream-api-child",
    parentAttemptId: running.data.attempt.id,
    parentRunId: root.data.run.id,
    task: "Private child stream",
  })
  if (!child.success) throw new Error(child.errorMessage)
  childStreamId = child.data.attempt.streamId

  const service = streamReplayServiceCreate({
    database,
    inactivityTimeoutMs: 60_000,
    sessionId,
    streamId,
    userId: developmentUser.id,
  })
  const first = await service.append({
    eventType: "delta",
    idempotencyKey: "first",
    payload: { text: "one" },
    sequence: 1,
  })
  if (!first.success) throw new Error(first.errorMessage)
  firstEventId = first.data.event.id

  const second = await service.append({
    eventType: "finished",
    idempotencyKey: "second",
    payload: { done: true },
    sequence: 2,
  })
  if (!second.success) throw new Error(second.errorMessage)
  secondEventId = second.data.event.id

  const childService = streamReplayServiceCreate({
    database,
    inactivityTimeoutMs: 60_000,
    sessionId,
    streamId: childStreamId,
    userId: developmentUser.id,
  })
  const childEvent = await childService.append({
    eventType: "private",
    idempotencyKey: "private-child-event",
    payload: { private: true },
    sequence: 1,
  })
  if (!childEvent.success) throw new Error(childEvent.errorMessage)

  app.use("*", async (context, next) => {
    context.set("database", database)
    if (developmentUser === undefined) return next()
    context.set("requestIdentity", { userId: developmentUser.id })
    await next()
  })
  apiStreamRoutesAdd(app, { inactivityTimeoutMs: 60_000 })
})

afterAll(async () => {
  if (developmentUser !== undefined)
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, developmentUser.id))
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("replays authorized root-run events and resumes after a Last-Event-ID", async () => {
  if (sessionId === undefined || streamId === undefined || firstEventId === undefined || secondEventId === undefined)
    return

  const initial = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${streamId}/events`)
  expect(initial.status).toBe(200)
  expect(initial.headers.get("Content-Type")).toContain("text/event-stream")
  expect(sseEvents(await initial.text())).toEqual([
    { data: { text: "one" }, event: "delta", id: firstEventId },
    { data: { done: true }, event: "finished", id: secondEventId },
  ])

  const resumed = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${streamId}/events`, {
    headers: { "Last-Event-ID": firstEventId },
  })
  expect(resumed.status).toBe(200)
  expect(sseEvents(await resumed.text())).toEqual([{ data: { done: true }, event: "finished", id: secondEventId }])

  const queryResumed = await app.request(
    `http://codeline.test/sessions/${sessionId}/streams/${streamId}/events?afterEventId=${secondEventId}`,
  )
  expect(queryResumed.status).toBe(200)
  expect(sseEvents(await queryResumed.text())).toEqual([])
})

test.skipIf(!databaseAvailable)("rejects direct replay and status requests for delegated child streams", async () => {
  if (sessionId === undefined || childStreamId === undefined) return

  const replay = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${childStreamId}/events`)
  expect(replay.status).toBe(404)

  const status = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${childStreamId}/status`)
  expect(status.status).toBe(404)
})

test.skipIf(!databaseAvailable)(
  "keeps unknown stream replay behavior and scopes child lookup by ownership",
  async () => {
    if (sessionId === undefined || childStreamId === undefined || developmentUser === undefined) return

    const unknown = await app.request(`http://codeline.test/sessions/${sessionId}/streams/unknown-stream/events`)
    expect(unknown.status).toBe(200)
    expect(await unknown.text()).toBe("")

    expect(await runChildStreamResolve(database, "not-the-owner", sessionId, childStreamId)).toMatchObject({
      data: false,
      success: true,
    })
    expect(await runChildStreamResolve(database, developmentUser.id, "not-the-session", childStreamId)).toMatchObject({
      data: false,
      success: true,
    })
  },
)

test.skipIf(!databaseAvailable)("reports stale status and returns the stale replay error contract", async () => {
  if (sessionId === undefined || streamId === undefined || secondEventId === undefined) return

  const status = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${streamId}/status`)
  expect(status.status).toBe(200)
  const statusBody = await status.json()
  expect(v.safeParse(streamApiStatusResponseSchema, statusBody).success).toBe(true)
  expect(statusBody).toMatchObject({ lastEventId: secondEventId, lastSequence: 2, stale: false, streamId })

  await database
    .update(streamCheckpointTable)
    .set({ updatedAt: new Date(Date.now() - 120_000) })
    .where(eq(streamCheckpointTable.streamId, streamId))

  const staleStatus = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${streamId}/status`)
  expect(staleStatus.status).toBe(200)
  expect(await staleStatus.json()).toMatchObject({ lastSequence: 2, stale: true, streamId })

  const staleReplay = await app.request(`http://codeline.test/sessions/${sessionId}/streams/${streamId}/events`)
  expect(staleReplay.status).toBe(409)
  const staleBody = await staleReplay.json()
  expect(v.safeParse(streamApiErrorResponseSchema, staleBody).success).toBe(true)
  expect(staleBody).toEqual({ error: { code: "stream_stale", message: "The stream is stale." } })
})
