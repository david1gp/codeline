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
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const identityKey = `session-rename-user-${uuidv7()}`
const userId = `development:${identityKey}`
const serverId = `session-rename-server-${uuidv7()}`
const agentId = `session-rename-agent-${uuidv7()}`
const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Session Rename Test User", identityKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: userId,
}
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `session-rename-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const app = appCreate({ configuration, database, journalCursorCodec: journalCursorCodec.data })

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, { displayName: "Session Rename Test User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database
    .insert(organizationTable)
    .values({ id: userId, externalId: userId, name: "Session Rename Organization" })
  await database.insert(organizationMemberTable).values({
    issuer: "urn:codeline:development",
    organizationId: userId,
    subject: identityKey,
    userId,
  })
  await database.insert(serverTable).values({
    endpoint: "http://session-rename-server.test",
    id: serverId,
    name: "Session Rename Test Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({ id: agentId, name: "Session Rename Test Agent", role: "coding", serverId })
})

afterAll(async () => {
  if (databaseAvailable) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "authorized active-session rename validates, persists, and rejects archived sessions",
  async () => {
    const created = await sessionCreate(
      database,
      userId,
      {
        clientRequestId: `session-rename-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Original title",
      },
      { organizationId: userId },
    )
    expect(created.success).toBe(true)
    if (!created.success) return
    const sessionId = created.data.session.id
    const initial = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    const initialEtag = initial.headers.get("ETag") as string

    const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ extra: "rejected", title: "  Renamed title  " }),
      headers: { "Content-Type": "application/json", "If-Match": initialEtag },
      method: "PATCH",
    })
    expect(renamed.status).toBe(400)

    const validRename = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "  Renamed title  " }),
      headers: { "Content-Type": "application/json", "If-Match": initialEtag },
      method: "PATCH",
    })
    expect(validRename.status).toBe(200)
    expect(await validRename.json()).toMatchObject({ session: { id: sessionId, title: "Renamed title" } })

    const archived = await sessionArchive(database, userId, sessionId)
    expect(archived.success).toBe(true)
    const archivedRead = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
    const renameArchived = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Archived title" }),
      headers: { "Content-Type": "application/json", "If-Match": archivedRead.headers.get("ETag") as string },
      method: "PATCH",
    })
    expect(renameArchived.status).toBe(409)
  },
)

test.skipIf(!databaseAvailable)("session representations support 200, 304, retry deduplication, and 412", async () => {
  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `session-representation-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title: "Representation title",
    },
    { organizationId: userId },
  )
  expect(created.success).toBe(true)
  if (!created.success) return
  const sessionId = created.data.session.id

  const initial = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  expect(initial.status).toBe(200)
  expect(initial.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(initial.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
  const initialBody = await initial.json()
  const initialEtag = initial.headers.get("ETag")
  expect(initialEtag).toMatch(/^"[^"\r\n]+"$/)
  expect(initialBody).toMatchObject({
    revision: 1,
    session: { id: sessionId, revision: 1, title: "Representation title" },
  })

  const notModified = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    headers: { "If-None-Match": initialEtag as string },
  })
  expect(notModified.status).toBe(304)
  expect(notModified.headers.get("ETag")).toBe(initialEtag)

  const compressed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(compressed.status).toBe(200)
  expect(compressed.headers.get("Content-Encoding")).toBe("gzip")

  const idempotencyKey = `rename-retry-${uuidv7()}`
  const renamed = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Renamed representation" }),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "If-Match": initialEtag as string,
    },
    method: "PATCH",
  })
  expect(renamed.status).toBe(200)
  const renamedBody = await renamed.json()
  expect(renamedBody).toMatchObject({ session: { title: "Renamed representation" } })
  expect(renamed.headers.get("Idempotency-Replayed")).toBe("false")

  const retried = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Renamed representation" }),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
      "If-Match": initialEtag as string,
    },
    method: "PATCH",
  })
  expect(retried.status).toBe(200)
  expect(await retried.json()).toMatchObject({
    revision: renamedBody.revision,
    session: { title: "Renamed representation" },
  })
  expect(retried.headers.get("Idempotency-Replayed")).toBe("true")

  const stale = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Stale representation" }),
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": `rename-stale-${uuidv7()}`,
      "If-Match": initialEtag as string,
    },
    method: "PATCH",
  })
  expect(stale.status).toBe(412)
  expect(await stale.json()).toMatchObject({
    error: {
      code: "precondition_failed",
      currentRevision: renamedBody.revision,
      status: 412,
    },
  })

  const missingIfMatch = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    body: JSON.stringify({ title: "Missing precondition" }),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  })
  expect(missingIfMatch.status).toBe(412)
  expect(await missingIfMatch.json()).toMatchObject({ error: { currentEtag: expect.any(String), currentRevision: 2 } })

  const staleDelete = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    headers: { "If-Match": initialEtag as string },
    method: "DELETE",
  })
  expect(staleDelete.status).toBe(412)

  const currentRead = await app.request(`http://codeline.test/api/sessions/${sessionId}`)
  const deleted = await app.request(`http://codeline.test/api/sessions/${sessionId}`, {
    headers: { "If-Match": currentRead.headers.get("ETag") as string },
    method: "DELETE",
  })
  expect(deleted.status).toBe(200)
})
