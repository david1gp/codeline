import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as v from "valibot"
import { agentListResponseSchema } from "../src/agents/api/agentListResponseSchema.js"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverListResponseSchema } from "../src/servers/api/serverListResponseSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionTargetCreateResponseSchema } from "../src/session/api/sessionTargetCreateResponseSchema.js"
import { sessionTargetLoadResponseSchema } from "../src/session/api/sessionTargetLoadResponseSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const databaseUrl = Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline"
const client = postgres(databaseUrl)
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `switching-user-${uuidv7()}`
const userId = `development:${identityKey}`
const primaryServerId = `switching-server-a-${uuidv7()}`
const secondaryServerId = `switching-server-b-${uuidv7()}`
const primaryAgentId = `switching-agent-a1-${uuidv7()}`
const reviewAgentId = `switching-agent-a2-${uuidv7()}`
const secondaryAgentId = `switching-agent-b1-${uuidv7()}`
const app = appCreate({
  configuration: {
    authMode: "development" as const,
    databaseUrl,
    developmentIdentity: { displayName: "Switching Test User", identityKey },
    nodeEnv: "development" as const,
    oidcOrganizationId: userId,
  },
  database,
})

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentIdentityUpsert(database, { displayName: "Switching Test User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Switching Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: identityKey,
    userId,
  })

  await database.insert(serverTable).values([
    { endpoint: "http://switching-a.test", id: primaryServerId, name: "Aaa Switching Server", organizationId: userId },
    {
      endpoint: "http://switching-b.test",
      id: secondaryServerId,
      name: "Bbb Switching Server",
      organizationId: userId,
    },
  ])
  await database.insert(agentTable).values([
    { id: primaryAgentId, name: "Switching Coding Agent", role: "coding", serverId: primaryServerId, sortOrder: 0 },
    { id: reviewAgentId, name: "Switching Review Agent", role: "review", serverId: primaryServerId, sortOrder: 1 },
    { id: secondaryAgentId, name: "Switching Remote Agent", role: "coding", serverId: secondaryServerId, sortOrder: 0 },
  ])
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)("the server list validates and contains both switchable servers", async () => {
  const response = await app.request("/api/servers")
  expect(response.status).toBe(200)

  const body = (await response.json()) as { servers: Array<Record<string, unknown>> }
  const parsed = v.safeParse(serverListResponseSchema, body)
  expect(parsed.issues).toBeUndefined()
  expect(parsed.success).toBe(true)
  const ids = parsed.success ? parsed.output.servers.map((server) => server.id) : []
  expect(ids).toContain(primaryServerId)
  expect(ids).toContain(secondaryServerId)
  // The strict schema only passes when the route projects to the declared safe fields.
  for (const server of body.servers) expect(Object.keys(server).sort()).toEqual(["id", "name"])
})

test.skipIf(!databaseAvailable)("each server exposes its own validated agent list", async () => {
  const primary = await app.request(`/api/servers/${primaryServerId}/agents`)
  const secondary = await app.request(`/api/servers/${secondaryServerId}/agents`)
  expect([primary.status, secondary.status]).toEqual([200, 200])

  const primaryBody = (await primary.json()) as { agents: Array<Record<string, unknown>> }
  const parsedPrimary = v.safeParse(agentListResponseSchema, primaryBody)
  const parsedSecondary = v.safeParse(agentListResponseSchema, await secondary.json())
  expect(parsedPrimary.issues).toBeUndefined()
  for (const agent of primaryBody.agents) {
    expect(Object.keys(agent).sort()).toEqual(["id", "name", "parentAgentId", "role", "serverId"])
  }
  expect(parsedPrimary.success).toBe(true)
  expect(parsedSecondary.success).toBe(true)
  expect(parsedPrimary.success ? parsedPrimary.output.agents.map((agent) => agent.id) : []).toEqual([
    primaryAgentId,
    reviewAgentId,
  ])
  expect(parsedSecondary.success ? parsedSecondary.output.agents.map((agent) => agent.id) : []).toEqual([
    secondaryAgentId,
  ])
})

test.skipIf(!databaseAvailable)("an unknown server returns not found for its agents", async () => {
  const response = await app.request(`/api/servers/${primaryServerId}-missing/agents`)
  expect(response.status).toBe(404)
})

test.skipIf(!databaseAvailable)(
  "creating sessions with different targets never mutates an existing session",
  async () => {
    const create = async (serverId: string, agentId: string, clientRequestId: string) =>
      app.request("/api/sessions", {
        body: JSON.stringify({ clientRequestId, primaryAgentId: agentId, serverId, title: "Switching session" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })

    const firstResponse = await create(primaryServerId, primaryAgentId, `switching-request-1-${uuidv7()}`)
    expect(firstResponse.status).toBe(201)
    const first = v.parse(sessionTargetCreateResponseSchema, await firstResponse.json())

    const secondResponse = await create(secondaryServerId, secondaryAgentId, `switching-request-2-${uuidv7()}`)
    expect(secondResponse.status).toBe(201)
    const second = v.parse(sessionTargetCreateResponseSchema, await secondResponse.json())
    expect(second.session.id).not.toBe(first.session.id)

    const reloaded = v.parse(
      sessionTargetLoadResponseSchema,
      await (await app.request(`/api/sessions/${first.session.id}`)).json(),
    )
    expect(reloaded.session.serverId).toBe(primaryServerId)
    expect(reloaded.session.primaryAgentId).toBe(primaryAgentId)

    const reloadedSecond = v.parse(
      sessionTargetLoadResponseSchema,
      await (await app.request(`/api/sessions/${second.session.id}`)).json(),
    )
    expect(reloadedSecond.session.serverId).toBe(secondaryServerId)
    expect(reloadedSecond.session.primaryAgentId).toBe(secondaryAgentId)
  },
)

test.skipIf(!databaseAvailable)(
  "repeating a create with the same client request id returns the existing session",
  async () => {
    const clientRequestId = `switching-request-idempotent-${uuidv7()}`
    const body = JSON.stringify({
      clientRequestId,
      primaryAgentId: primaryAgentId,
      serverId: primaryServerId,
      title: "Idempotent switching session",
    })
    const headers = { "content-type": "application/json" }

    const firstResponse = await app.request("/api/sessions", { body, headers, method: "POST" })
    expect(firstResponse.status).toBe(201)
    const first = v.parse(sessionTargetCreateResponseSchema, await firstResponse.json())
    expect(first.created).toBe(true)

    const retryResponse = await app.request("/api/sessions", { body, headers, method: "POST" })
    expect(retryResponse.status).toBe(200)
    const retry = v.parse(sessionTargetCreateResponseSchema, await retryResponse.json())
    expect(retry.created).toBe(false)
    expect(retry.session.id).toBe(first.session.id)
  },
)

test.skipIf(!databaseAvailable)("a session cannot be created against an agent of another server", async () => {
  const response = await app.request("/api/sessions", {
    body: JSON.stringify({
      clientRequestId: `switching-request-mismatch-${uuidv7()}`,
      primaryAgentId: secondaryAgentId,
      serverId: primaryServerId,
      title: "Mismatched switching session",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(404)
})
