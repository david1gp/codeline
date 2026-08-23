import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"
import { agentTable } from "../src/agents/db/agentTable.js"
import { appCreate } from "../src/app/appCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `message-api-agent-${uuidv7()}`,
  serverId: `message-api-server-${uuidv7()}`,
  userKey: `message-api-user-${uuidv7()}`,
}
const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Message API User", identityKey: fixture.userKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: `development:${fixture.userKey}`,
}
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `message-api-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const app = appCreate({ configuration, database, journalCursorCodec: journalCursorCodec.data })
let userId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Message API User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Message API Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: fixture.userKey,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://message-api-server.test",
    id: fixture.serverId,
    name: "Message API Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Message API Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("message HTTP route validates and appends finalized plain text", async () => {
  if (userId === undefined) return
  const session = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `message-api-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Message API session",
    },
    { organizationId: userId },
  )
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
