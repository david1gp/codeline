import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentDetailResponseSchema } from "../src/agents/api/agentDetailResponseSchema.js"
import { apiAgentRoutesAdd } from "../src/agents/api/apiAgentRoutesAdd.js"
import { agentListResponseSchema } from "../src/agents/api/agentListResponseSchema.js"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { providerApiConnectionTestResponseSchema } from "../src/providers/api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../src/providers/api/providerApiModelsResponseSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const ownerIdentityKey = `agent-api-owner-${uuidv7()}`
const otherIdentityKey = `agent-api-other-${uuidv7()}`
const ownerUserId = `development:${ownerIdentityKey}`
const otherUserId = `development:${otherIdentityKey}`
const serverId = `agent-api-server-${uuidv7()}`
const existingAgentId = `agent-api-existing-${uuidv7()}`

const deterministicConfiguration = {
  model: "development-default",
  provider: "deterministic",
  tools: { bash: false, webfetch: false },
} as const
const cliproxyConfiguration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "cliproxyapi",
  tools: { bash: false, webfetch: false },
} as const
const codexConfiguration = {
  apiKey: "$CODEX_LB_API_TOKEN",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "codex-lb",
  tools: { bash: false, webfetch: false },
} as const

beforeAll(async () => {
  if (!databaseAvailable) return

  const owner = await developmentIdentityUpsert(database, {
    displayName: "Agent API Owner",
    identityKey: ownerIdentityKey,
  })
  if (!owner.success) throw new Error(owner.errorMessage)
  const other = await developmentIdentityUpsert(database, {
    displayName: "Agent API Other",
    identityKey: otherIdentityKey,
  })
  if (!other.success) throw new Error(other.errorMessage)
  await database.insert(organizationTable).values([
    { id: ownerUserId, externalId: ownerUserId, name: "Agent API Owner Organization" },
    { id: otherUserId, externalId: otherUserId, name: "Agent API Other Organization" },
  ])

  await database.insert(serverTable).values({
    endpoint: "http://agent-api-server.test",
    id: serverId,
    name: "Agent API Server",
    organizationId: ownerUserId,
  })
  await database.insert(agentTable).values({
    configuration: deterministicConfiguration,
    id: existingAgentId,
    name: "Existing Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, ownerUserId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, otherUserId))
  }
  await databaseConnectionClose(connection)
})

function appForUser(userId: string, authorizationValues: string[], organizationId = userId): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId, userId })
    await next()
  })
  apiAgentRoutesAdd(app, {
    environment: {
      CLIPROXYAPI_API_KEY: "cliproxy-secret",
      CODEX_LB_API_TOKEN: "codex-secret",
    },
    fetch: async (_input, init) => {
      authorizationValues.push(new Headers(init?.headers).get("authorization") ?? "")
      return new Response(JSON.stringify({ data: [{ id: "gpt-test" }, { id: "other-model" }] }))
    },
  })
  return app
}

test("agent routes require an authenticated identity", async () => {
  const app = new Hono<AppEnvironment>()
  apiAgentRoutesAdd(app)

  const response = await app.request("http://codeline.test/servers/server/agents")
  expect(response.status).toBe(401)
})

test.skipIf(!databaseAvailable)(
  "agent routes persist owned configurations and test proposed or persisted providers",
  async () => {
    const authorizationValues: string[] = []
    const app = appForUser(ownerUserId, authorizationValues)

    const detail = await app.request(`http://codeline.test/servers/${serverId}/agents/${existingAgentId}`)
    expect(detail.status).toBe(200)
    const detailBody = await detail.json()
    expect(v.safeParse(agentDetailResponseSchema, detailBody).success).toBe(true)
    expect(detailBody).toMatchObject({
      agent: {
        configuration: deterministicConfiguration,
        id: existingAgentId,
        name: "Existing Agent",
        role: "coding",
        serverId,
      },
    })
    expect(v.safeParse(agentDetailResponseSchema, detailBody).success).toBe(true)

    const list = await app.request(`http://codeline.test/servers/${serverId}/agents`)
    expect(list.status).toBe(200)
    const listBody = await list.json()
    expect(v.safeParse(agentListResponseSchema, listBody).success).toBe(true)
    expect(list.headers.get("Cache-Control")).toBe("private, no-cache")
    expect(list.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
    expect(list.headers.get("ETag")).toBe(listBody.etag)

    const notModified = await app.request(`http://codeline.test/servers/${serverId}/agents`, {
      headers: { "If-None-Match": listBody.etag },
    })
    expect(notModified.status).toBe(304)
    expect(notModified.headers.get("ETag")).toBe(listBody.etag)

    const detailNotModified = await app.request(`http://codeline.test/servers/${serverId}/agents/${existingAgentId}`, {
      headers: { "If-None-Match": detailBody.etag },
    })
    expect(detailNotModified.status).toBe(304)
    expect(detailNotModified.headers.get("Cache-Control")).toBe("private, no-cache")

    const created = await app.request(`http://codeline.test/servers/${serverId}/agents`, {
      body: JSON.stringify({ configuration: cliproxyConfiguration, name: "Managed Agent", role: "coding" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const createdBody = await created.json()
    expect(v.safeParse(agentDetailResponseSchema, createdBody).success).toBe(true)
    expect(createdBody.agent.configuration).toEqual(cliproxyConfiguration)
    expect(JSON.stringify(createdBody)).not.toContain("cliproxy-secret")
    const createdAgentId = createdBody.agent.id as string

    const proposedModels = await app.request(`http://codeline.test/servers/${serverId}/agents/models`, {
      body: JSON.stringify({ configuration: cliproxyConfiguration }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(proposedModels.status).toBe(200)
    expect(v.safeParse(providerApiModelsResponseSchema, await proposedModels.json()).success).toBe(true)
    expect(authorizationValues.at(-1)).toBe("Bearer cliproxy-secret")

    const proposedConnection = await app.request(`http://codeline.test/servers/${serverId}/agents/connection-test`, {
      body: JSON.stringify({ configuration: cliproxyConfiguration }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(proposedConnection.status).toBe(200)
    expect(v.safeParse(providerApiConnectionTestResponseSchema, await proposedConnection.json()).success).toBe(true)

    const updated = await app.request(`http://codeline.test/servers/${serverId}/agents/${createdAgentId}`, {
      body: JSON.stringify({ configuration: codexConfiguration }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    })
    expect(updated.status).toBe(200)
    const updatedBody = await updated.json()
    expect(v.safeParse(agentDetailResponseSchema, updatedBody).success).toBe(true)
    expect(updatedBody.agent.configuration).toEqual(codexConfiguration)

    const persistedModels = await app.request(
      `http://codeline.test/servers/${serverId}/agents/${createdAgentId}/models`,
      {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    )
    expect(persistedModels.status).toBe(200)
    expect(v.safeParse(providerApiModelsResponseSchema, await persistedModels.json()).success).toBe(true)
    expect(authorizationValues.at(-1)).toBe("Bearer codex-secret")

    const persistedConnection = await app.request(
      `http://codeline.test/servers/${serverId}/agents/${createdAgentId}/connection-test`,
      {
        body: "{}",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    )
    expect(persistedConnection.status).toBe(200)
    expect(v.safeParse(providerApiConnectionTestResponseSchema, await persistedConnection.json()).success).toBe(true)

    const literalSecret = "resolved-agent-secret"
    const invalidUpdate = await app.request(`http://codeline.test/servers/${serverId}/agents/${createdAgentId}`, {
      body: JSON.stringify({
        configuration: {
          apiKey: literalSecret,
          baseUrl: "https://provider.test/v1",
          model: "gpt-test",
          provider: "cliproxyapi",
        },
      }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    })
    expect(invalidUpdate.status).toBe(400)
    expect(await invalidUpdate.text()).not.toContain(literalSecret)

    const otherApp = appForUser(otherUserId, [])
    const hidden = await otherApp.request(`http://codeline.test/servers/${serverId}/agents/${createdAgentId}`)
    expect(hidden.status).toBe(404)
    const hiddenProposal = await otherApp.request(`http://codeline.test/servers/${serverId}/agents/models`, {
      body: JSON.stringify({ configuration: cliproxyConfiguration }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(hiddenProposal.status).toBe(404)
  },
)
