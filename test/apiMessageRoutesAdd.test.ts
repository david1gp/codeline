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
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `message-api-agent-${uuidv7()}`,
  serverId: `message-api-server-${uuidv7()}`,
  userKey: `message-api-user-${uuidv7()}`,
}
const configuration = {
  databaseUrl: Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline",
  developmentIdentity: { displayName: "Message API User", identityKey: fixture.userKey },
  nodeEnv: "development" as const,
}
const app = appCreate({ configuration, database })
let userId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentUserUpsert(database, {
    displayName: "Message API User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(serverTable).values({
    endpoint: "http://message-api-server.test",
    id: fixture.serverId,
    name: "Message API Server",
    ownerUserId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Message API Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)("message HTTP route validates and appends finalized plain text", async () => {
  if (userId === undefined) return
  const session = await sessionCreate(database, userId, {
    clientRequestId: `message-api-session-${uuidv7()}`,
    metadata: {},
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Message API session",
  })
  expect(session.success).toBe(true)
  if (!session.success) return

  const input = {
    clientRequestId: `message-api-request-${uuidv7()}`,
    content: "hello from HTTP",
    role: "user",
  }
  const created = await app.request(`http://codeline.test/api/sessions/${session.data.session.id}/messages`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(created.status).toBe(201)
  expect(await created.json()).toMatchObject({ created: true, message: { content: input.content, sequence: 1 } })

  const repeated = await app.request(`http://codeline.test/api/sessions/${session.data.session.id}/messages`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(repeated.status).toBe(200)

  const invalid = await app.request(`http://codeline.test/api/sessions/${session.data.session.id}/messages`, {
    body: JSON.stringify({ ...input, role: "tool" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalid.status).toBe(400)
})
