import { afterAll, beforeAll, expect, test } from "bun:test"
import { inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { runCancel } from "../src/run/actions/runCancel.js"
import { runChildCreate } from "../src/run/actions/runChildCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { runLoad } from "../src/run/actions/runLoad.js"
import { serverRepositoryList } from "../src/servers/db/serverRepositoryList.js"
import { serverRepositoryLoad } from "../src/servers/db/serverRepositoryLoad.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { streamAppend } from "../src/stream/actions/streamAppend.js"
import { streamListAfter } from "../src/stream/actions/streamListAfter.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const databaseUrl = Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline"
const client = postgres(databaseUrl)
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const organizationId = `server-access-organization-${uuidv7()}`
const otherOrganizationId = `server-access-other-organization-${uuidv7()}`
const memberUserId = `development:server-access-member-${uuidv7()}`
const secondMemberUserId = `development:server-access-second-member-${uuidv7()}`
const foreignUserId = `development:server-access-foreign-${uuidv7()}`
const serverId = `server-access-server-${uuidv7()}`
const foreignServerId = `server-access-foreign-server-${uuidv7()}`
const agentId = `server-access-agent-${uuidv7()}`

beforeAll(async () => {
  if (!databaseAvailable) return

  for (const [userId, displayName] of [
    [memberUserId, "Server Access Member"],
    [secondMemberUserId, "Server Access Second Member"],
    [foreignUserId, "Server Access Foreign Member"],
  ] as const) {
    const identityKey = userId.slice("development:".length)
    const user = await developmentIdentityUpsert(database, { displayName, identityKey })
    if (!user.success) throw new Error(user.errorMessage)
  }

  await database.insert(organizationTable).values([
    { id: organizationId, externalId: organizationId, name: "Server Access Organization" },
    { id: otherOrganizationId, externalId: otherOrganizationId, name: "Other Server Access Organization" },
  ])
  await database.insert(organizationMemberTable).values([
    {
      issuer: "urn:codeline:development",
      organizationId,
      subject: memberUserId.slice("development:".length),
      userId: memberUserId,
    },
    {
      issuer: "urn:codeline:development",
      organizationId,
      subject: secondMemberUserId.slice("development:".length),
      userId: secondMemberUserId,
    },
    {
      issuer: "urn:codeline:development",
      organizationId: otherOrganizationId,
      subject: foreignUserId.slice("development:".length),
      userId: foreignUserId,
    },
  ])
  await database.insert(serverTable).values([
    { endpoint: "http://server-access.test", id: serverId, name: "Shared Server", organizationId },
    {
      endpoint: "http://foreign-server-access.test",
      id: foreignServerId,
      name: "Foreign Server",
      organizationId: otherOrganizationId,
    },
  ])
  await database.insert(agentTable).values({ id: agentId, name: "Shared Agent", role: "coding", serverId })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(sessionTable).where(inArray(sessionTable.serverId, [serverId, foreignServerId]))
    await database.delete(serverTable).where(inArray(serverTable.id, [serverId, foreignServerId]))
    await database.delete(organizationTable).where(inArray(organizationTable.id, [organizationId, otherOrganizationId]))
    await database
      .delete(applicationUserTable)
      .where(inArray(applicationUserTable.id, [memberUserId, secondMemberUserId, foreignUserId]))
  }
  await client.end()
})

function appForUser(userId: string, organizationId: string) {
  return appCreate({
    configuration: {
      authMode: "development",
      databaseUrl,
      developmentIdentity: {
        displayName: "Server Access Test User",
        identityKey: userId.slice("development:".length),
      },
      nodeEnv: "development",
      oidcOrganizationId: organizationId,
    },
    database,
    projectRootDirs: [],
  })
}

test.skipIf(!databaseAvailable)("server access uses organization scope instead of the former user owner", async () => {
  const servers = await serverRepositoryList(database, organizationId)
  expect(servers).toMatchObject({ success: true, data: [{ id: serverId }] })

  const loaded = await serverRepositoryLoad(database, organizationId, serverId)
  expect(loaded).toMatchObject({ success: true, data: { id: serverId } })
})

test.skipIf(!databaseAvailable)("two members of one organization share server, agent, and target access", async () => {
  const firstApp = appForUser(memberUserId, organizationId)
  const secondApp = appForUser(secondMemberUserId, organizationId)
  const foreignApp = appForUser(foreignUserId, otherOrganizationId)

  const firstServers = await firstApp.request("/api/servers")
  const secondServers = await secondApp.request("/api/servers")
  expect(firstServers.status).toBe(200)
  expect(secondServers.status).toBe(200)
  expect(await firstServers.json()).toEqual(await secondServers.json())

  const agents = await secondApp.request(`/api/servers/${serverId}/agents`)
  expect(agents.status).toBe(200)
  expect(await agents.json()).toMatchObject({ agents: [{ id: agentId }] })

  const firstSession = await firstApp.request("/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `server-access-private-session-${uuidv7()}`,
      primaryAgentId: agentId,
      serverId,
      title: "Private session",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(firstSession.status).toBe(201)
  const firstSessionBody = (await firstSession.json()) as { session: { id: string } }
  const hiddenSession = await secondApp.request(`/api/sessions/${firstSessionBody.session.id}`)
  expect(hiddenSession.status).toBe(404)
  const foreignHiddenSession = await foreignApp.request(`/api/sessions/${firstSessionBody.session.id}`)
  expect(foreignHiddenSession.status).toBe(404)

  const firstSessionList = await firstApp.request("/api/sessions")
  const secondSessionList = await secondApp.request("/api/sessions")
  const foreignSessionList = await foreignApp.request("/api/sessions")
  expect(firstSessionList.status).toBe(200)
  expect(secondSessionList.status).toBe(200)
  expect(foreignSessionList.status).toBe(200)
  expect(
    (await firstSessionList.json()).sessions.map((entry: { session: { id: string } }) => entry.session.id),
  ).toContain(firstSessionBody.session.id)
  expect(
    (await secondSessionList.json()).sessions.map((entry: { session: { id: string } }) => entry.session.id),
  ).not.toContain(firstSessionBody.session.id)
  expect(
    (await foreignSessionList.json()).sessions.map((entry: { session: { id: string } }) => entry.session.id),
  ).not.toContain(firstSessionBody.session.id)

  const secondSessionSearch = await secondApp.request("/api/sessions?search=Private%20session")
  expect(secondSessionSearch.status).toBe(200)
  expect((await secondSessionSearch.json()).sessions).toEqual([])

  const message = await firstApp.request(`/api/sessions/${firstSessionBody.session.id}/messages`, {
    body: JSON.stringify({
      clientRequestId: `server-access-private-message-${uuidv7()}`,
      content: "Private message",
      role: "user",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(message.status).toBe(201)
  for (const app of [secondApp, foreignApp]) {
    const messages = await app.request(`/api/sessions/${firstSessionBody.session.id}/messages`)
    expect(messages.status).toBe(404)
    const mutation = await app.request(`/api/sessions/${firstSessionBody.session.id}/messages`, {
      body: JSON.stringify({
        clientRequestId: `server-access-private-message-${uuidv7()}`,
        content: "Must remain private",
        role: "user",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(mutation.status).toBe(404)
  }

  const root = await runCreate(database, memberUserId, firstSessionBody.session.id, {
    budget: { maxChildDepth: 1, maxChildRuns: 1, maxDurationMs: 60_000 },
    clientRunId: `server-access-private-run-${uuidv7()}`,
    snapshot: {
      configuration: { model: "server-access-model", provider: "deterministic" },
      configurationRevision: "server-access-revision",
      target: { agentId, serverId },
    },
    streamId: `server-access-private-stream-${uuidv7()}`,
  })
  expect(root.success).toBe(true)
  if (!root.success) return
  for (const userId of [secondMemberUserId, foreignUserId]) {
    expect(await runLoad(database, userId, firstSessionBody.session.id, root.data.run.clientRunId)).toMatchObject({
      errorMessage: "The run could not be found.",
      success: false,
    })
    expect(await runCancel(database, userId, firstSessionBody.session.id, root.data.run.id)).toMatchObject({
      errorMessage: "The run could not be found.",
      success: false,
    })
    expect(
      await runChildCreate(database, userId, firstSessionBody.session.id, {
        delegationKey: `server-access-private-delegation-${uuidv7()}`,
        parentAttemptId: root.data.attempt.id,
        parentRunId: root.data.run.id,
        task: "Must remain private",
      }),
    ).toMatchObject({ errorMessage: "The root run could not be found.", success: false })
  }

  const streamId = `server-access-private-stream-${uuidv7()}`
  expect(
    await streamAppend(database, memberUserId, firstSessionBody.session.id, {
      eventType: "private",
      idempotencyKey: "private-event",
      payload: { private: true },
      sequence: 1,
      streamId,
    }),
  ).toMatchObject({ success: true, data: { created: true } })
  for (const userId of [secondMemberUserId, foreignUserId]) {
    expect(
      await streamListAfter(database, userId, firstSessionBody.session.id, streamId, { afterSequence: 0, limit: 10 }),
    ).toMatchObject({
      errorMessage: "The session could not be found.",
      success: false,
    })
    expect(
      await streamAppend(database, userId, firstSessionBody.session.id, {
        eventType: "private",
        idempotencyKey: `private-event-${uuidv7()}`,
        payload: { shouldNotWrite: true },
        sequence: 2,
        streamId,
      }),
    ).toMatchObject({ errorMessage: "The session could not be found.", success: false })
  }

  const session = await secondApp.request("/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `server-access-session-${uuidv7()}`,
      primaryAgentId: agentId,
      serverId,
      title: "Shared target session",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(session.status).toBe(201)
})

test.skipIf(!databaseAvailable)(
  "a member of another organization gets no foreign server disclosure or use",
  async () => {
    const foreignApp = appForUser(foreignUserId, otherOrganizationId)

    const servers = await foreignApp.request("/api/servers")
    expect(servers.status).toBe(200)
    expect(await servers.json()).toEqual({ servers: [{ id: foreignServerId, name: "Foreign Server" }] })

    const agents = await foreignApp.request(`/api/servers/${serverId}/agents`)
    expect(agents.status).toBe(404)

    const hiddenServer = await serverRepositoryLoad(database, otherOrganizationId, serverId)
    expect(hiddenServer).toMatchObject({ success: false, errorMessage: "The server could not be found." })

    const session = await foreignApp.request("/api/sessions", {
      body: JSON.stringify({
        clientRequestId: `server-access-foreign-session-${uuidv7()}`,
        primaryAgentId: agentId,
        serverId,
        title: "Foreign target session",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(session.status).toBe(404)
  },
)
