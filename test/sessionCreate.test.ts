import { afterAll, beforeAll, expect, test } from "bun:test"
import { and, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../src/session/actions/sessionDelete.js"
import { sessionList } from "../src/session/actions/sessionList.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { sessionPin } from "../src/session/actions/sessionPin.js"
import { sessionRename } from "../src/session/actions/sessionRename.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-test-agent-${uuidv7()}`,
  serverId: `session-test-server-${uuidv7()}`,
  userKey: `session-test-user-${uuidv7()}`,
}
let userId: string | undefined

beforeAll(async () => {
  if (!databaseAvailable) return

  const user = await developmentIdentityUpsert(database, {
    displayName: "Session Test User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({ id: userId, externalId: userId, name: "Session Test Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://session-test-server.test",
    id: fixture.serverId,
    name: "Session Test Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Test Agent",
    role: "coding",
    serverId: fixture.serverId,
  })
})

afterAll(async () => {
  if (userId !== undefined) await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  await client.end()
})

test.skipIf(!databaseAvailable)("session actions create idempotently and enforce ownership", async () => {
  if (userId === undefined) return
  const clientRequestId = `session-test-request-${uuidv7()}`
  const input = {
    clientRequestId,
    metadata: { project: "codeline" },
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Initial title",
  }

  const created = await sessionCreate(database, userId, input, { organizationId: userId })
  expect(created).toMatchObject({
    success: true,
    data: { created: true, session: { pinned: true, projectPath: "~", title: "Initial title" } },
  })
  if (!created.success) return

  const repeated = await sessionCreate(
    database,
    userId,
    { ...input, title: "Changed title" },
    { organizationId: userId },
  )
  expect(repeated).toMatchObject({ success: true, data: { created: false, session: { id: created.data.session.id } } })

  const loaded = await sessionLoad(database, userId, userId, created.data.session.id)
  expect(loaded).toMatchObject({
    success: true,
    data: {
      agent: { id: fixture.agentId },
      server: { id: fixture.serverId },
      session: { id: created.data.session.id },
    },
  })
  const hidden = await sessionLoad(database, "development:unknown-session-user", userId, created.data.session.id)
  expect(hidden).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const renamed = await sessionRename(database, userId, created.data.session.id, "Renamed title")
  expect(renamed).toMatchObject({ success: true, data: { title: "Renamed title" } })
  const unauthorizedRename = await sessionRename(
    database,
    "development:unknown-session-user",
    created.data.session.id,
    "Unauthorized title",
  )
  expect(unauthorizedRename).toMatchObject({ success: false, errorMessage: "The session could not be found." })

  const unpinned = await sessionPin(database, userId, created.data.session.id, false)
  expect(unpinned).toMatchObject({ success: true, data: { pinned: false } })
  const unauthorizedPin = await sessionPin(database, "development:unknown-session-user", created.data.session.id, true)
  expect(unauthorizedPin).toMatchObject({ success: false, errorMessage: "The session could not be found." })
  const pinned = await sessionPin(database, userId, created.data.session.id, true)
  expect(pinned).toMatchObject({ success: true, data: { pinned: true } })

  const archived = await sessionArchive(database, userId, created.data.session.id)
  expect(archived).toMatchObject({ success: true, data: { archivedAt: expect.any(Date) } })
  const renamedArchived = await sessionRename(database, userId, created.data.session.id, "Archived title")
  expect(renamedArchived).toMatchObject({ success: false, errorMessage: "The session is archived." })
  const pinnedArchived = await sessionPin(database, userId, created.data.session.id, false)
  expect(pinnedArchived).toMatchObject({ success: false, errorMessage: "The session is archived." })
  const withoutArchived = await sessionList(database, userId, userId, { includeArchived: false, limit: 100 })
  expect(withoutArchived).toMatchObject({ success: true, data: { rows: [] } })
  const withArchived = await sessionList(database, userId, userId, { includeArchived: true, limit: 100 })
  expect(withArchived).toMatchObject({ success: true, data: { rows: [{ session: { id: created.data.session.id } }] } })

  const deleted = await sessionDelete(database, userId, created.data.session.id)
  expect(deleted).toMatchObject({ success: true, data: { id: created.data.session.id } })
})

test.skipIf(!databaseAvailable)("session list paginates in updated order and rejects malformed cursors", async () => {
  if (userId === undefined) return
  const sessionUserId = userId
  const sessions = await Promise.all(
    ["one", "two", "three"].map((title) =>
      sessionCreate(
        database,
        sessionUserId,
        {
          clientRequestId: `session-test-page-${title}-${uuidv7()}`,
          metadata: {},
          primaryAgentId: fixture.agentId,
          serverId: fixture.serverId,
          title,
        },
        { organizationId: sessionUserId },
      ),
    ),
  )
  expect(sessions.every((result) => result.success)).toBe(true)

  const firstPage = await sessionList(database, sessionUserId, sessionUserId, { includeArchived: true, limit: 2 })
  expect(firstPage.success).toBe(true)
  if (!firstPage.success || firstPage.data.nextCursor === null) return
  expect(firstPage.data.rows).toHaveLength(2)

  const secondPage = await sessionList(database, sessionUserId, sessionUserId, {
    cursor: firstPage.data.nextCursor,
    includeArchived: true,
    limit: 2,
  })
  expect(secondPage).toMatchObject({ success: true, data: { nextCursor: null } })
  if (!secondPage.success) return
  expect(secondPage.data.rows).toHaveLength(1)
  expect(new Set(secondPage.data.rows.map((row) => row.session.id)).size).toBe(1)

  const invalidCursor = await sessionList(database, sessionUserId, sessionUserId, {
    cursor: "not-a-cursor",
    includeArchived: true,
    limit: 2,
  })
  expect(invalidCursor).toMatchObject({ success: false, errorMessage: "The session list cursor is invalid." })

  await database.delete(sessionTable).where(and(eq(sessionTable.userId, sessionUserId), eq(sessionTable.title, "one")))
  await database.delete(sessionTable).where(and(eq(sessionTable.userId, sessionUserId), eq(sessionTable.title, "two")))
  await database
    .delete(sessionTable)
    .where(and(eq(sessionTable.userId, sessionUserId), eq(sessionTable.title, "three")))
})
