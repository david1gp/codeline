import { afterAll, beforeAll, expect, test } from "bun:test"
import { createResult } from "@adaptive-ds/result"
import { and, asc, eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import type { ApplicationUser } from "../src/identity/db/applicationUserTable.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionBranch } from "../src/session/actions/sessionBranch.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { apiSessionBranchRoutesAdd } from "../src/session/api/apiSessionBranchRoutesAdd.js"
import { sessionJournalRecipientResolverCreate } from "../src/session/db/sessionJournalRecipientResolverCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-branch-agent-${uuidv7()}`,
  serverId: `session-branch-server-${uuidv7()}`,
  userKey: `session-branch-user-${uuidv7()}`,
}
let developmentUser: ApplicationUser | undefined
let sourceSessionId: string | undefined
let selectedMessageId: string | undefined
const app = new Hono<AppEnvironment>()

test("requires authenticated session database and journal publisher at construction", () => {
  expect(() => apiSessionBranchRoutesAdd(new Hono<AppEnvironment>(), {} as never)).toThrow(
    "The authenticated session database is required.",
  )
})

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Session Branch User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  developmentUser = user.data
  await database
    .insert(organizationTable)
    .values({ id: developmentUser.id, externalId: developmentUser.id, name: "Session Branch Organization" })

  await database.insert(serverTable).values({
    endpoint: "http://session-branch-server.test",
    id: fixture.serverId,
    name: "Session Branch Server",
    organizationId: developmentUser.id,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Branch Agent",
    role: "coding",
    serverId: fixture.serverId,
  })

  const source = await sessionCreate(
    database,
    developmentUser.id,
    {
      clientRequestId: `session-branch-source-${uuidv7()}`,
      metadata: { branch: "source" },
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Branch source",
    },
    { organizationId: developmentUser.id },
  )
  if (!source.success) throw new Error(source.errorMessage)
  sourceSessionId = source.data.session.id

  const userMessage = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-user-${uuidv7()}`,
    content: "Start with this context.",
    role: "user",
  })
  if (!userMessage.success) throw new Error(userMessage.errorMessage)
  const assistantMessage = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-assistant-${uuidv7()}`,
    content: "Here is the finalized answer.",
    role: "assistant",
  })
  if (!assistantMessage.success) throw new Error(assistantMessage.errorMessage)
  selectedMessageId = assistantMessage.data.message.id
  const afterSelected = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-after-${uuidv7()}`,
    content: "This must not be copied.",
    role: "user",
  })
  if (!afterSelected.success) throw new Error(afterSelected.errorMessage)

  app.use("*", async (context, next) => {
    if (developmentUser === undefined) return next()
    context.set("database", database)
    context.set("requestIdentity", { organizationId: developmentUser.id, userId: developmentUser.id })
    await next()
  })
  apiSessionBranchRoutesAdd(app, {
    database,
    journalPostCommitPublish: async () => createResult(undefined),
  })
})

afterAll(async () => {
  if (developmentUser !== undefined)
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, developmentUser.id))
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("branches an owned active session through a finalized message", async () => {
  if (developmentUser === undefined || sourceSessionId === undefined || selectedMessageId === undefined) return

  const input = {
    clientRequestId: `session-branch-request-${uuidv7()}`,
    messageId: selectedMessageId,
  }
  const response = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(201)
  const body = await response.json()
  expect(body).toMatchObject({
    created: true,
    session: { archivedAt: null, parentSessionId: sourceSessionId, title: "Branch source" },
  })
  const targetSessionId = body.session.id as string

  const copied = await database
    .select({ message: messageTable })
    .from(messageTable)
    .where(eq(messageTable.sessionId, targetSessionId))
    .orderBy(asc(messageTable.sequence))
  expect(
    copied.map((row) => ({ content: row.message.content, role: row.message.role, sequence: row.message.sequence })),
  ).toEqual([
    { content: "Start with this context.", role: "user", sequence: 1 },
    { content: "Here is the finalized answer.", role: "assistant", sequence: 2 },
  ])
  expect(copied.every((row) => row.message.id !== selectedMessageId)).toBe(true)
})

test.skipIf(!databaseAvailable)("does not branch a session for another owner", async () => {
  if (sourceSessionId === undefined || selectedMessageId === undefined) return

  const unauthorized = await sessionBranch(
    database,
    "development:unknown-session-branch-user",
    developmentUser?.id ?? "missing-organization",
    sourceSessionId,
    {
      clientRequestId: `session-branch-unauthorized-${uuidv7()}`,
      messageId: selectedMessageId,
    },
  )
  expect(unauthorized).toMatchObject({ success: false, errorMessage: "The session could not be found." })
})

test.skipIf(!databaseAvailable)("denies branch journal recipients when the source organization changes", async () => {
  if (developmentUser === undefined || sourceSessionId === undefined || selectedMessageId === undefined) return

  const otherOrganizationId = `session-branch-denied-organization-${uuidv7()}`
  await database.insert(organizationTable).values({
    externalId: otherOrganizationId,
    id: otherOrganizationId,
    name: "Session Branch Denied Organization",
  })
  await database
    .update(serverTable)
    .set({ organizationId: otherOrganizationId })
    .where(eq(serverTable.id, fixture.serverId))
  const denied = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({
      clientRequestId: `session-branch-denied-${uuidv7()}`,
      messageId: selectedMessageId,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(denied.status).toBe(404)
  await database
    .update(serverTable)
    .set({ organizationId: developmentUser.id })
    .where(eq(serverTable.id, fixture.serverId))
  await database.delete(organizationTable).where(eq(organizationTable.id, otherOrganizationId))
})

test.skipIf(!databaseAvailable)("denies create journal recipients outside the transaction organization", async () => {
  if (developmentUser === undefined) return
  const otherOrganizationId = `session-create-denied-organization-${uuidv7()}`
  await database.insert(organizationTable).values({
    externalId: otherOrganizationId,
    id: otherOrganizationId,
    name: "Session Create Denied Organization",
  })
  await database
    .update(serverTable)
    .set({ organizationId: otherOrganizationId })
    .where(eq(serverTable.id, fixture.serverId))

  const denied = await sessionCreate(
    database,
    developmentUser.id,
    {
      clientRequestId: `session-create-denied-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Denied create",
    },
    {
      journal: {
        postCommitPublish: async () => createResult(undefined),
        resolveRecipients: sessionJournalRecipientResolverCreate({
          organizationId: developmentUser.id,
          pendingSessionAuthorization: {
            primaryAgentId: fixture.agentId,
            serverId: fixture.serverId,
            userId: developmentUser.id,
          },
        }),
      },
      organizationId: developmentUser.id,
    },
  )
  expect(denied).toMatchObject({ success: false })

  await database
    .update(serverTable)
    .set({ organizationId: developmentUser.id })
    .where(eq(serverTable.id, fixture.serverId))
  await database.delete(organizationTable).where(eq(organizationTable.id, otherOrganizationId))
})

test.skipIf(!databaseAvailable)("branches idempotently and rejects invalid or archived sources", async () => {
  if (sourceSessionId === undefined || selectedMessageId === undefined) return

  const input = {
    clientRequestId: `session-branch-idempotent-${uuidv7()}`,
    messageId: selectedMessageId,
  }
  const first = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(first.status).toBe(201)
  const firstBody = await first.json()

  const repeated = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(repeated.status).toBe(200)
  expect(await repeated.json()).toMatchObject({ created: false, session: { id: firstBody.session.id } })
  const targetMessages = await database
    .select()
    .from(messageTable)
    .where(eq(messageTable.sessionId, firstBody.session.id))
  expect(targetMessages).toHaveLength(2)

  const invalidRequestId = `session-branch-invalid-${uuidv7()}`
  const invalid = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({
      ...input,
      clientRequestId: invalidRequestId,
      messageId: "missing",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalid.status).toBe(404)
  const rolledBack = await database
    .select({ id: sessionTable.id })
    .from(sessionTable)
    .where(and(eq(sessionTable.userId, developmentUser?.id ?? ""), eq(sessionTable.clientRequestId, invalidRequestId)))
  expect(rolledBack).toEqual([])

  const archived = await sessionArchive(database, developmentUser?.id ?? "", sourceSessionId)
  expect(archived.success).toBe(true)
  const rejected = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({ ...input, clientRequestId: `session-branch-archived-${uuidv7()}` }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(rejected.status).toBe(409)
})

test.skipIf(!databaseAvailable)("keeps branch routes strict and independently registerable", async () => {
  if (sourceSessionId === undefined || selectedMessageId === undefined) return

  const invalid = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({ clientRequestId: "strict", messageId: selectedMessageId, extra: true }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalid.status).toBe(400)

  const missingSource = await app.request(`http://codeline.test/sessions/missing-source/branch`, {
    body: JSON.stringify({ clientRequestId: "missing-source", messageId: selectedMessageId }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(missingSource.status).toBe(404)
})

test.skipIf(!databaseAvailable)("does not publish a journal invalidation for an archived no-op", async () => {
  if (developmentUser === undefined) return
  const created = await sessionCreate(
    database,
    developmentUser.id,
    {
      clientRequestId: `session-branch-archive-no-op-${uuidv7()}`,
      metadata: {},
      primaryAgentId: fixture.agentId,
      serverId: fixture.serverId,
      title: "Archive no-op",
    },
    { organizationId: developmentUser.id },
  )
  expect(created.success).toBe(true)
  if (!created.success) return

  const published: unknown[] = []
  const journal = {
    postCommitPublish: async (events: readonly unknown[]) => {
      published.push(...events)
      return createResult(undefined)
    },
    resolveRecipients: sessionJournalRecipientResolverCreate({ organizationId: developmentUser.id }),
  }
  const archived = await sessionArchive(database, developmentUser.id, created.data.session.id, {
    journal,
    organizationId: developmentUser.id,
  })
  expect(archived).toMatchObject({ data: { changed: true }, success: true })
  const noOp = await sessionArchive(database, developmentUser.id, created.data.session.id, {
    journal,
    organizationId: developmentUser.id,
  })
  expect(noOp).toMatchObject({ data: { changed: false }, success: true })
  expect(published).toHaveLength(1)
})
