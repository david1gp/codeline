import { afterAll, beforeAll, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
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
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { sessionTable } from "../src/session/db/sessionTable.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `session-search-user-${uuidv7()}`
const userId = `development:${identityKey}`
const serverId = `session-search-server-${uuidv7()}`
const agentId = `session-search-agent-${uuidv7()}`
const configuration = {
  authMode: "development" as const,
  databaseUrl: Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline",
  developmentIdentity: { displayName: "Session Search Test User", identityKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: userId,
}
const app = appCreate({ configuration, database })

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, { displayName: "Session Search Test User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database
    .insert(organizationTable)
    .values({ id: userId, externalId: userId, name: "Session Search Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: identityKey,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-search-server.test",
    id: serverId,
    metadata: { searchMarker: "Server metadata marker" },
    name: "Session Search Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    configuration: { searchMarker: "Agent configuration marker" },
    id: agentId,
    name: "Session Search Agent",
    role: "coding",
    serverId,
  })
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)(
  "session search matches title, metadata, related names, and configuration while preserving ownership, archive, and order",
  async () => {
    const activeInput = {
      clientRequestId: `session-search-active-${uuidv7()}`,
      metadata: { searchMarker: "Lunar metadata % _ marker" },
      primaryAgentId: agentId,
      serverId,
      title: "Search target session",
    }
    const active = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify(activeInput),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const activeBody = await active.json()
    const secondActive = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        ...activeInput,
        clientRequestId: `session-search-active-second-${uuidv7()}`,
        title: "Search target second",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const secondActiveBody = await secondActive.json()
    const archived = await app.request("http://codeline.test/api/sessions", {
      body: JSON.stringify({
        ...activeInput,
        clientRequestId: `session-search-archived-${uuidv7()}`,
        title: "Archived search target",
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const archivedId = (await archived.json()).session.id as string
    await app.request(`http://codeline.test/api/sessions/${archivedId}/archive`, { method: "POST" })
    await database.insert(messageTable).values({
      agentId,
      clientRequestId: `session-search-message-${uuidv7()}`,
      content: "message-only-search-marker",
      id: `session-search-message-${uuidv7()}`,
      role: "user",
      sequence: 1,
      sessionId: activeBody.session.id,
    })

    const foreignIdentityKey = `session-search-foreign-${uuidv7()}`
    const foreignUserId = `development:${foreignIdentityKey}`
    const foreignServerId = `foreign-search-server-${uuidv7()}`
    const foreignAgentId = `foreign-search-agent-${uuidv7()}`
    const foreignUser = await developmentIdentityUpsert(database, {
      displayName: "Foreign Search User",
      identityKey: foreignIdentityKey,
    })
    if (!foreignUser.success) throw new Error(foreignUser.errorMessage)
    await database
      .insert(organizationTable)
      .values({ id: foreignUserId, externalId: foreignUserId, name: "Foreign Search Organization" })
    await database.insert(serverTable).values({
      endpoint: "http://foreign-search-server.test",
      id: foreignServerId,
      name: "Foreign Search Server",
      organizationId: foreignUserId,
    })
    await database.insert(agentTable).values({
      id: foreignAgentId,
      name: "Foreign Search Agent",
      role: "coding",
      serverId: foreignServerId,
    })
    await database.insert(sessionTable).values({
      clientRequestId: `foreign-search-request-${uuidv7()}`,
      id: `foreign-search-session-${uuidv7()}`,
      metadata: { searchMarker: "Lunar metadata marker" },
      primaryAgentId: foreignAgentId,
      serverId: foreignServerId,
      title: "Foreign search target",
      userId: foreignUserId,
    })

    const idsFor = async (term: string) => {
      const response = await app.request(`http://codeline.test/api/sessions?search=${encodeURIComponent(term)}`)
      return (await response.json()).sessions.map((row: { session: { id: string } }) => row.session.id)
    }
    const activeIds = [secondActiveBody.session.id, activeBody.session.id]
    expect(await idsFor("SEARCH TARGET")).toEqual([secondActiveBody.session.id, activeBody.session.id])
    for (const term of ["lUnAr", "server metadata", "search agent", "agent configuration"])
      expect(await idsFor(term)).toEqual(activeIds)
    expect(await idsFor("%")).toEqual(activeIds)
    expect(await idsFor("_")).toEqual(activeIds)
    expect(await idsFor("message-only-search-marker")).toEqual([])
    expect(await idsFor("archived search target")).toEqual([])
    const archivedSearch = await app.request(
      `http://codeline.test/api/sessions?includeArchived=1&search=${encodeURIComponent("archived search target")}`,
    )
    expect((await archivedSearch.json()).sessions.map((row: { session: { id: string } }) => row.session.id)).toEqual([
      archivedId,
    ])
    const activeSessions = await app.request("http://codeline.test/api/sessions")
    expect((await activeSessions.json()).sessions.map((row: { session: { id: string } }) => row.session.id)).toEqual(
      activeIds,
    )
    const invalidSearch = await app.request(`http://codeline.test/api/sessions?search=${"x".repeat(101)}`)
    expect(invalidSearch.status).toBe(400)
  },
)
