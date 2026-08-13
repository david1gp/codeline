import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `session-http-user-${crypto.randomUUID()}`
const userId = `development:${identityKey}`
const serverId = `session-http-server-${crypto.randomUUID()}`
const agentId = `session-http-agent-${crypto.randomUUID()}`
const configuration = {
  databaseUrl: Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline",
  developmentIdentity: {
    displayName: "Session HTTP Test User",
    identityKey,
  },
  nodeEnv: "development" as const,
}
const app = appCreate({ configuration, database })

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentUserUpsert(database, {
    displayName: "Session HTTP Test User",
    identityKey,
  })
  if (!user.success) throw new Error(user.errorMessage)

  await database.insert(serverTable).values({
    endpoint: "http://session-http-server.test",
    id: serverId,
    name: "Session HTTP Server",
    ownerUserId: userId,
  })
  await database.insert(agentTable).values({
    id: agentId,
    name: "Session HTTP Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "session HTTP routes implement create, read, list, rename, archive, and delete",
  async () => {
    const input = {
      clientRequestId: `session-http-request-${crypto.randomUUID()}`,
      metadata: { project: "codeline" },
      primaryAgentId: agentId,
      serverId,
      title: "HTTP session",
    }

    const created = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const createdBody = await created.json()
    expect(created.status).toBe(201)
    expect(createdBody).toMatchObject({ created: true, session: { title: "HTTP session" } })
    const sessionId = createdBody.session.id as string

    const repeated = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({ ...input, title: "Changed by retry" }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(repeated.status).toBe(200)
    expect(await repeated.json()).toMatchObject({ created: false, session: { id: sessionId, title: "HTTP session" } })

    const loaded = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    expect(loaded.status).toBe(200)
    expect(await loaded.json()).toMatchObject({
      session: { id: sessionId },
      server: { id: serverId },
      agent: { id: agentId },
    })

    const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Renamed HTTP session" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({ session: { title: "Renamed HTTP session" } })

    const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, { method: "POST" })
    expect(archived.status).toBe(200)
    expect(await archived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })

    const defaultList = await app.request("http://codeline.test/api/sessions")
    expect(defaultList.status).toBe(200)
    expect(await defaultList.json()).toMatchObject({ sessions: [] })
    const archivedList = await app.request("http://codeline.test/api/sessions?includeArchived=1")
    expect(archivedList.status).toBe(200)
    expect(await archivedList.json()).toMatchObject({ sessions: [{ session: { id: sessionId } }] })

    const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, { method: "DELETE" })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toMatchObject({ session: { id: sessionId } })
    const missing = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    expect(missing.status).toBe(404)
  },
)

test.skipIf(!databaseAvailable)("session HTTP routes validate requests and cursors", async () => {
  const invalidCreate = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify({ title: "missing identifiers" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalidCreate.status).toBe(400)
  expect(await invalidCreate.json()).toMatchObject({ error: { code: "bad_request" } })

  const invalidQuery = await app.request("http://codeline.test/api/sessions?limit=0")
  expect(invalidQuery.status).toBe(400)
  expect(await invalidQuery.json()).toMatchObject({ error: { code: "bad_request" } })

  const invalidCursor = await app.request("http://codeline.test/api/sessions?cursor=invalid")
  expect(invalidCursor.status).toBe(400)
  expect(await invalidCursor.json()).toMatchObject({ error: { code: "bad_request" } })
})

test.skipIf(!databaseAvailable)("session and message HTTP routes persist the complete lifecycle", async () => {
  const input = {
    clientRequestId: `session-flow-request-${crypto.randomUUID()}`,
    metadata: { project: "codeline" },
    primaryAgentId: agentId,
    serverId,
    title: "Persistence flow",
  }

  const created = await app.request("http://codeline.test/api/sessions", {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(created.status).toBe(201)
  const createdBody = await created.json()
  const sessionId = createdBody.session.id as string

  const userMessage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-user-${crypto.randomUUID()}`,
      content: "Please inspect this persistence flow.",
      role: "user",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(userMessage.status).toBe(201)
  expect(await userMessage.json()).toMatchObject({ message: { role: "user", sequence: 1 } })

  const assistantMessage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-assistant-${crypto.randomUUID()}`,
      content: "The persistence flow is complete.",
      role: "assistant",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(assistantMessage.status).toBe(201)
  expect(await assistantMessage.json()).toMatchObject({ message: { role: "assistant", sequence: 2 } })

  const firstMessagePage = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages?limit=1`)
  expect(firstMessagePage.status).toBe(200)
  const firstMessagePageBody = await firstMessagePage.json()
  expect(firstMessagePageBody.messages).toHaveLength(1)
  expect(firstMessagePageBody.messages[0]).toMatchObject({ role: "user", sequence: 1 })
  expect(firstMessagePageBody.nextCursor).toEqual(expect.any(String))

  const secondMessagePage = await app.request(
    `http://codeline.test/api/sessions/${sessionId}/messages?cursor=${encodeURIComponent(firstMessagePageBody.nextCursor)}&limit=1`,
  )
  expect(secondMessagePage.status).toBe(200)
  expect(await secondMessagePage.json()).toMatchObject({
    messages: [{ role: "assistant", sequence: 2 }],
    nextCursor: null,
  })

  const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Renamed persistence flow" }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })
  expect(renamed.status).toBe(200)
  expect(await renamed.json()).toMatchObject({ session: { id: sessionId, title: "Renamed persistence flow" } })

  const readBeforeArchive = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(readBeforeArchive.status).toBe(200)
  expect(await readBeforeArchive.json()).toMatchObject({
    session: { id: sessionId, title: "Renamed persistence flow" },
  })

  const listedBeforeArchive = await app.request("http://codeline.test/api/sessions")
  expect(listedBeforeArchive.status).toBe(200)
  expect(await listedBeforeArchive.json()).toMatchObject({ sessions: [{ session: { id: sessionId } }] })

  const archived = await app.request(`http://codeline.test/api/sessions/${sessionId}/archive`, { method: "POST" })
  expect(archived.status).toBe(200)
  expect(await archived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })

  const writeAfterArchive = await app.request(`http://codeline.test/api/sessions/${sessionId}/messages`, {
    body: JSON.stringify({
      clientRequestId: `session-flow-after-archive-${crypto.randomUUID()}`,
      content: "This write must be rejected.",
      role: "user",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(writeAfterArchive.status).toBe(409)

  const listedAfterArchive = await app.request("http://codeline.test/api/sessions")
  expect(await listedAfterArchive.json()).toMatchObject({ sessions: [] })
  const listedArchived = await app.request("http://codeline.test/api/sessions?includeArchived=1")
  expect(await listedArchived.json()).toMatchObject({
    sessions: [{ session: { id: sessionId, archivedAt: expect.any(String) } }],
  })
  const readArchived = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(readArchived.status).toBe(200)
  expect(await readArchived.json()).toMatchObject({ session: { id: sessionId, archivedAt: expect.any(String) } })

  const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, { method: "DELETE" })
  expect(deleted.status).toBe(200)
  expect(await deleted.json()).toMatchObject({ session: { id: sessionId } })

  const missing = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(missing.status).toBe(404)
  const messagesAfterDelete = await database.select().from(messageTable).where(eq(messageTable.sessionId, sessionId))
  expect(messagesAfterDelete).toEqual([])
})
