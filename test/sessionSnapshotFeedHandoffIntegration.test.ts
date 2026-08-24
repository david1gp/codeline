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
import { identitySessionCreate } from "../src/identity/actions/identitySessionCreate.js"
import { authenticationMiddleware } from "../src/identity/api/authenticationMiddleware.js"
import { identitySessionCookieName } from "../src/identity/api/identitySessionCookieName.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalPostCommitPublishCreate } from "../src/journal/actions/journalPostCommitPublishCreate.js"
import { journalWriteCreate } from "../src/journal/actions/journalWriteCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { sessionListSnapshotResponseSchema } from "../src/session/api/sessionListSnapshotResponseSchema.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { streamLiveSubscriptionCreate } from "../src/stream/actions/streamLiveSubscriptionCreate.js"
import { streamSseConnectionWriterCreate } from "../src/stream/actions/streamSseConnectionWriterCreate.js"
import { streamSseSchedulerCreate } from "../src/stream/actions/streamSseSchedulerCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixturePrefix = `snapshot-feed-handoff-${crypto.randomUUID()}`
const fixture = {
  agentId: `${fixturePrefix}-agent`,
  organizationId: `${fixturePrefix}-organization`,
  serverId: `${fixturePrefix}-server`,
  sessionId: `${fixturePrefix}-session`,
  sessionToken: `${fixturePrefix}-token`,
  userId: `${fixturePrefix}-user`,
}
const issuer = "https://snapshot-feed-handoff.test/issuer"
const cursorCodecResult = journalCursorCodecCreate({
  randomBytes: (size) => randomBytes(size),
  secret: `${fixturePrefix}-cursor-secret`,
})
if (!cursorCodecResult.success) throw new Error(cursorCodecResult.errorMessage)
const cursorCodec = cursorCodecResult.data
const liveSubscription = streamLiveSubscriptionCreate()
const postCommitPublish = journalPostCommitPublishCreate({
  cursorCodec,
  liveSubscription,
})
const app = new Hono<AppEnvironment>()
const api = new Hono<AppEnvironment>()
const configuration = {
  authMode: "oidc" as const,
  databaseUrl: "file:./data/db.sqlite",
  nodeEnv: "test" as const,
  oidcIssuer: issuer,
  oidcOrganizationId: fixture.organizationId,
  publicOrigin: "https://snapshot-feed-handoff.test/",
}
app.use("/api/*", authenticationMiddleware(configuration, database))
apiSessionRoutesAdd(api, {
  database,
  journalCursorCodec: cursorCodec,
  journalPostCommitPublish: postCommitPublish,
})
apiEventsRoutesAdd(api, {
  backlogRead: journalBacklogRead,
  connectionWriterCreate: streamSseConnectionWriterCreate,
  cursorCodec,
  liveSubscription,
  metricsCollector: metricsCollectorCreate(),
  now: Date.now,
  scheduler: streamSseSchedulerCreate(),
})
app.route("/api", api)

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values({ displayName: fixture.userId, id: fixture.userId })
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: fixture.organizationId,
  })
  await database.insert(organizationMemberTable).values({
    issuer,
    organizationId: fixture.organizationId,
    subject: fixture.userId,
    userId: fixture.userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://snapshot-feed-handoff-server.test",
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
    title: "Snapshot feed handoff session",
    userId: fixture.userId,
  })
  await database.insert(journalSequenceCounterTable).values({ nextSequence: 1, userId: fixture.userId })
  const identitySession = await identitySessionCreate(database, fixture.userId, {
    credentialCreate: () => fixture.sessionToken,
    idCreate: () => `${fixturePrefix}-identity-session`,
  })
  if (!identitySession.success) throw new Error(identitySession.errorMessage)
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(journalEventTable).where(eq(journalEventTable.userId, fixture.userId))
    await database.delete(journalSequenceCounterTable).where(eq(journalSequenceCounterTable.userId, fixture.userId))
    await database.delete(identitySessionTable).where(eq(identitySessionTable.userId, fixture.userId))
    await database.delete(sessionTable).where(eq(sessionTable.id, fixture.sessionId))
    await database.delete(agentTable).where(eq(agentTable.id, fixture.agentId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationMemberTable).where(eq(organizationMemberTable.userId, fixture.userId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, fixture.userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "replays one journal event published between an authenticated list snapshot and feed attachment",
  async () => {
    const headers = { Cookie: `${identitySessionCookieName}=${fixture.sessionToken}` }
    const snapshotResponse = await app.request("https://snapshot-feed-handoff.test/api/sessions?limit=25", { headers })
    expect(snapshotResponse.status).toBe(200)
    const snapshotParsed = v.safeParse(sessionListSnapshotResponseSchema, await snapshotResponse.json())
    expect(snapshotParsed.success).toBe(true)
    if (!snapshotParsed.success) return

    const asOfCursor = snapshotParsed.output.asOfCursor
    const asOf = cursorCodec.validate(asOfCursor, fixture.userId)
    expect(asOf).toMatchObject({ success: true, data: { sequence: 0 } })
    if (!asOf.success) return
    const asOfSequence = asOf.data.sequence

    const journalWrite = journalWriteCreate({
      database,
      postCommitPublish,
      resolveRecipients: async () => createResult([fixture.userId]),
    })
    const published = await journalWrite.run({
      resources: [{ resourceId: fixture.sessionId, resourceType: "session" }],
      write: async (_transaction, journal) => {
        const appended = await journal.append({
          eventType: "invalidate",
          payload: { resourceId: fixture.sessionId, resourceType: "session", revision: 2 },
          resource: { resourceId: fixture.sessionId, resourceType: "session" },
        })
        if (!appended.success) return appended
        return createResult(undefined)
      },
    })
    expect(published).toMatchObject({ success: true })
    if (!published.success) return

    const feedResponse = await app.request(
      `https://snapshot-feed-handoff.test/api/events?after=${encodeURIComponent(asOfCursor)}`,
      { headers },
    )
    expect(feedResponse.status).toBe(200)
    const reader = feedResponse.body?.getReader()
    expect(reader).toBeDefined()
    if (reader === undefined) return
    const first = await Promise.race([
      reader.read(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timed out waiting for the replayed event.")), 1_000),
      ),
    ])
    expect(first.done).toBe(false)
    if (first.done || first.value === undefined) return

    const text = new TextDecoder().decode(first.value)
    const dataLines = [...text.matchAll(/^data: (.+)$/gm)].map((match) => match[1])
    expect(dataLines).toHaveLength(1)
    const frame = JSON.parse(dataLines[0] ?? "null") as {
      eventType?: string
      id?: string
      resourceId?: string
      resourceType?: string
      revision?: number
      sequence?: number
    }
    expect(frame).toMatchObject({
      eventType: "invalidate",
      resourceId: fixture.sessionId,
      resourceType: "session",
      revision: 2,
      sequence: asOfSequence + 1,
    })
    expect(frame.id).toEqual(expect.any(String))
    expect((text.match(/^id: /gm) ?? []).length).toBe(1)
    await reader.cancel()
    expect(liveSubscription.subscriberCount(fixture.userId)).toBe(0)

    const journalEvents = await database
      .select({ sequence: journalEventTable.sequence })
      .from(journalEventTable)
      .where(eq(journalEventTable.userId, fixture.userId))
    expect(journalEvents).toEqual([{ sequence: 1 }])
  },
)
