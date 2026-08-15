import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import postgres from "postgres"
import * as v from "valibot"
import { agentDetailResponseSchema } from "../src/agents/api/agentDetailResponseSchema.js"
import { apiAgentRoutesAdd } from "../src/agents/api/apiAgentRoutesAdd.js"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { providerApiConnectionTestResponseSchema } from "../src/providers/api/providerApiConnectionTestResponseSchema.js"
import { providerApiModelsResponseSchema } from "../src/providers/api/providerApiModelsResponseSchema.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const databaseUrl = Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline"
const client = postgres(databaseUrl)
const database = drizzle(client, { schema: databaseSchema })
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
} as const
const cliproxyConfiguration = {
  apiKey: "$CLIPROXYAPI_API_KEY",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "cliproxyapi",
} as const
const codexConfiguration = {
  apiKey: "$CODEX_LB_API_TOKEN",
  baseUrl: "https://provider.test/v1",
  model: "gpt-test",
  provider: "codex-lb",
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

  await database.insert(serverTable).values({
    endpoint: "http://agent-api-server.test",
    id: serverId,
    name: "Agent API Server",
    ownerUserId,
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
  await client.end()
})

function appForUser(userId: string, authorizationValues: string[]): Hono<AppEnvironment> {
  const app = new Hono<AppEnvironment>()
  app.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { userId })
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
    expect(detailBody).toEqual({
      agent: {
        configuration: deterministicConfiguration,
        id: existingAgentId,
        name: "Existing Agent",
        role: "coding",
        serverId,
      },
    })

    const created = await app.request(`http://codeline.test/servers/${serverId}/agents`, {
      body: JSON.stringify({ configuration: cliproxyConfiguration, name: "Managed Agent", role: "coding" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    })
    expect(created.status).toBe(201)
    const createdBody = await created.json()
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
    expect((await updated.json()).agent.configuration).toEqual(codexConfiguration)

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
