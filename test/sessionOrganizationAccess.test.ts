import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { and, eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { identitySessionTable } from "../src/identity/db/identitySessionTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { runTable } from "../src/run/db/runTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionChatAdapterCreate } from "../src/session/actions/sessionChatAdapterCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-organization-agent-${uuidv7()}`,
  organizationId: `session-organization-${uuidv7()}`,
  otherOrganizationId: `session-organization-other-${uuidv7()}`,
  serverId: `session-organization-server-${uuidv7()}`,
  userKey: `session-organization-user-${uuidv7()}`,
}
const userId = `development:${fixture.userKey}`
const issuer = "https://session-organization-zitadel.test"
const identitySession = {
  createdAt: new Date("2026-08-18T12:00:00.000Z"),
  expiresAt: new Date("2026-08-19T12:00:00.000Z"),
  id: `session-organization-identity-${uuidv7()}`,
  lastUsedAt: null,
  revokedAt: null,
  tokenHash: "unused-by-test-identity-session-load",
  userId,
} satisfies typeof identitySessionTable.$inferSelect
const configuration = {
  authMode: "oidc" as const,
  databaseUrl,
  nodeEnv: "test" as const,
  oidcOrganizationId: fixture.organizationId,
  oidcProviders: {
    authworks: {
      clientId: "session-organization-authworks-client",
      issuer: "https://session-organization-authworks.test",
      organizationId: fixture.organizationId,
    },
    zitadel: {
      clientId: "session-organization-zitadel-client",
      issuer,
      organizationId: fixture.organizationId,
    },
  },
  publicOrigin: "https://codeline.test",
}
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `session-organization-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const app = appCreate({
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  database,
  journalCursorCodec: journalCursorCodec.data,
  identitySessionLoad: async () => createResult(identitySession),
  sessionChatAdapter: sessionChatAdapterCreate,
})

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentIdentityUpsert(database, {
    displayName: "Session Organization Access User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  await database.insert(organizationTable).values([
    { id: fixture.organizationId, externalId: fixture.organizationId, name: "Session Organization" },
    {
      id: fixture.otherOrganizationId,
      externalId: fixture.otherOrganizationId,
      name: "Other Session Organization",
    },
  ])
  await database.insert(organizationMemberTable).values({
    issuer,
    organizationId: fixture.organizationId,
    subject: `subject-${fixture.userKey}`,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-organization-server.test",
    id: fixture.serverId,
    name: "Session Organization Server",
    organizationId: fixture.organizationId,
  })
  await database.insert(agentTable).values({
    configuration: { model: "session-organization-model", provider: "deterministic" },
    id: fixture.agentId,
    name: "Session Organization Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
    await database.delete(serverTable).where(eq(serverTable.id, fixture.serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.otherOrganizationId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "rechecks current organization access through the second provider for existing sessions, idempotency, listing, and chat",
  async () => {
    const clientRequestId = `session-organization-request-${uuidv7()}`
    const body = {
      clientRequestId,
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Session organization access",
    }
    const createHeaders = {
      Cookie: "__Host-codeline-session=opaque-session",
      Origin: "https://codeline.test",
      "Content-Type": "application/json",
    }

    const created = await app.request("https://codeline.test/api/sessions", {
      body: JSON.stringify(body),
      headers: createHeaders,
      method: "POST",
    })
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { session: { id: string } }
    const sessionId = createdBody.session.id

    const loaded = await app.request(`https://codeline.test/api/sessions/${sessionId}`, {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toMatchObject({
      agent: { id: fixture.agentId },
      server: { id: fixture.serverId },
      session: { id: sessionId },
    })

    const listed = await app.request("https://codeline.test/api/sessions?includeArchived=1", {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(listed.status).toBe(200)
    expect((await listed.json()).sessions.map((entry: { id: string }) => entry.id)).toContain(sessionId)

    const repeated = await app.request("https://codeline.test/api/sessions", {
      body: JSON.stringify(body),
      headers: createHeaders,
      method: "POST",
    })
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toMatchObject({ created: false, session: { id: sessionId } })

    await database
      .update(serverTable)
      .set({ organizationId: fixture.otherOrganizationId })
      .where(eq(serverTable.id, fixture.serverId))

    const reassignedLoad = await app.request(`https://codeline.test/api/sessions/${sessionId}`, {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(reassignedLoad.status).toBe(404)

    const reassignedList = await app.request("https://codeline.test/api/sessions?search=Session%20organization", {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(reassignedList.status).toBe(200)
    expect(await reassignedList.json()).toMatchObject({ sessions: [] })

    const reassignedRetry = await app.request("https://codeline.test/api/sessions", {
      body: JSON.stringify(body),
      headers: createHeaders,
      method: "POST",
    })
    expect(reassignedRetry.status).toBe(404)
    const idempotentRows = await database
      .select({ id: sessionTable.id })
      .from(sessionTable)
      .where(and(eq(sessionTable.userId, userId), eq(sessionTable.clientRequestId, clientRequestId)))
    expect(idempotentRows).toHaveLength(1)

    const chat = await app.request(`https://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        context: [],
        messages: [{ content: "Must not execute", id: `prompt-${uuidv7()}`, role: "user" }],
        runId: `run-${uuidv7()}`,
        state: {},
        threadId: sessionId,
        tools: [],
      }),
      headers: createHeaders,
      method: "POST",
    })
    expect(chat.status).toBe(404)
    expect(await database.select().from(runTable).where(eq(runTable.sessionId, sessionId))).toEqual([])
    expect(await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))).toEqual([])

    await database
      .update(serverTable)
      .set({ organizationId: fixture.organizationId })
      .where(eq(serverTable.id, fixture.serverId))
    await database
      .delete(organizationMemberTable)
      .where(
        and(
          eq(organizationMemberTable.organizationId, fixture.organizationId),
          eq(organizationMemberTable.userId, userId),
        ),
      )

    const membershipLossLoad = await app.request(`https://codeline.test/api/sessions/${sessionId}`, {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(membershipLossLoad.status).toBe(401)
    const membershipLossList = await app.request("https://codeline.test/api/sessions", {
      headers: { Cookie: "__Host-codeline-session=opaque-session" },
    })
    expect(membershipLossList.status).toBe(401)
    const membershipLossChat = await app.request(`https://codeline.test/api/sessions/${sessionId}/chat`, {
      body: JSON.stringify({
        messages: [{ content: "Must not execute", id: `membership-loss-${uuidv7()}`, role: "user" }],
        runId: `membership-loss-run-${uuidv7()}`,
        threadId: sessionId,
      }),
      headers: createHeaders,
      method: "POST",
    })
    expect(membershipLossChat.status).toBe(401)
  },
)
