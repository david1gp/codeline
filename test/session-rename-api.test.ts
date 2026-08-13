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
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `session-rename-user-${crypto.randomUUID()}`
const userId = `development:${identityKey}`
const serverId = `session-rename-server-${crypto.randomUUID()}`
const agentId = `session-rename-agent-${crypto.randomUUID()}`
const configuration = {
  databaseUrl: Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline",
  developmentIdentity: { displayName: "Session Rename Test User", identityKey },
  nodeEnv: "development" as const,
}
const app = appCreate({ configuration, database })

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentUserUpsert(database, { displayName: "Session Rename Test User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database.insert(serverTable).values({
    endpoint: "http://session-rename-server.test",
    id: serverId,
    name: "Session Rename Test Server",
    ownerUserId: userId,
  })
  await database.insert(agentTable).values({ id: agentId, name: "Session Rename Test Agent", role: "coding", serverId })
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(developmentUserTable).where(eq(developmentUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "authorized active-session rename validates, persists, and rejects archived sessions",
  async () => {
    const created = await sessionCreate(database, userId, {
      clientRequestId: `session-rename-${crypto.randomUUID()}`,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title: "Original title",
    })
    expect(created.success).toBe(true)
    if (!created.success) return
    const sessionId = created.data.session.id

    const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ extra: "rejected", title: "  Renamed title  " }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renamed.status).toBe(400)

    const validRename = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "  Renamed title  " }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(validRename.status).toBe(200)
    expect(await validRename.json()).toMatchObject({ session: { id: sessionId, title: "Renamed title" } })

    const archived = await sessionArchive(database, userId, sessionId)
    expect(archived.success).toBe(true)
    const renameArchived = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Archived title" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renameArchived.status).toBe(409)
  },
)
