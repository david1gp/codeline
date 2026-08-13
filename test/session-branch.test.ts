import { afterAll, beforeAll, expect, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import postgres from "postgres"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseSchema } from "../src/database/databaseSchema.js"
import { developmentUserTable } from "../src/identity/db/developmentUserTable.js"
import { type DevelopmentUser, developmentUserUpsert } from "../src/identity/db/developmentUserUpsert.js"
import { messageAppend } from "../src/message/actions/messageAppend.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { apiSessionBranchRoutesAdd } from "../src/session/api/apiSessionBranchRoutesAdd.js"
import { sessionArchive } from "../src/session/actions/sessionArchive.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"

const client = postgres(Bun.env.DATABASE_URL ?? "postgres://codeline:codeline@127.0.0.1:6002/codeline")
const database = drizzle(client, { schema: databaseSchema })
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  agentId: `session-branch-agent-${crypto.randomUUID()}`,
  serverId: `session-branch-server-${crypto.randomUUID()}`,
  userKey: `session-branch-user-${crypto.randomUUID()}`,
}
let developmentUser: DevelopmentUser | undefined
let sourceSessionId: string | undefined
let selectedMessageId: string | undefined
const app = new Hono<AppEnvironment>()

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentUserUpsert(database, {
    displayName: "Session Branch User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  developmentUser = user.data

  await database.insert(serverTable).values({
    endpoint: "http://session-branch-server.test",
    id: fixture.serverId,
    name: "Session Branch Server",
    ownerUserId: developmentUser.id,
  })
  await database.insert(agentTable).values({
    id: fixture.agentId,
    name: "Session Branch Agent",
    role: "coding",
    serverId: fixture.serverId,
  })

  const source = await sessionCreate(database, developmentUser.id, {
    clientRequestId: `session-branch-source-${crypto.randomUUID()}`,
    metadata: { branch: "source" },
    primaryAgentId: fixture.agentId,
    serverId: fixture.serverId,
    title: "Branch source",
  })
  if (!source.success) throw new Error(source.errorMessage)
  sourceSessionId = source.data.session.id

  const userMessage = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-user-${crypto.randomUUID()}`,
    content: "Start with this context.",
    role: "user",
  })
  if (!userMessage.success) throw new Error(userMessage.errorMessage)
  const assistantMessage = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-assistant-${crypto.randomUUID()}`,
    content: "Here is the finalized answer.",
    role: "assistant",
  })
  if (!assistantMessage.success) throw new Error(assistantMessage.errorMessage)
  selectedMessageId = assistantMessage.data.message.id
  const afterSelected = await messageAppend(database, developmentUser.id, sourceSessionId, {
    clientRequestId: `session-branch-after-${crypto.randomUUID()}`,
    content: "This must not be copied.",
    role: "user",
  })
  if (!afterSelected.success) throw new Error(afterSelected.errorMessage)

  app.use("*", async (context, next) => {
    if (developmentUser === undefined) return next()
    context.set("database", database)
    context.set("developmentUser", developmentUser)
    await next()
  })
  apiSessionBranchRoutesAdd(app)
})

afterAll(async () => {
  if (developmentUser !== undefined)
    await database.delete(developmentUserTable).where(eq(developmentUserTable.id, developmentUser.id))
  await client.end()
})

test.skipIf(!databaseAvailable)("branches an owned active session through a finalized message", async () => {
  if (developmentUser === undefined || sourceSessionId === undefined || selectedMessageId === undefined) return

  const input = {
    clientRequestId: `session-branch-request-${crypto.randomUUID()}`,
    messageId: selectedMessageId,
  }
  const response = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify(input),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(response.status).toBe(201)
  const body = await response.json()
  expect(body).toMatchObject({ created: true, session: { archivedAt: null, title: "Branch source" } })
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

test.skipIf(!databaseAvailable)("branches idempotently and rejects invalid or archived sources", async () => {
  if (sourceSessionId === undefined || selectedMessageId === undefined) return

  const input = {
    clientRequestId: `session-branch-idempotent-${crypto.randomUUID()}`,
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

  const invalid = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({
      ...input,
      clientRequestId: `session-branch-invalid-${crypto.randomUUID()}`,
      messageId: "missing",
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(invalid.status).toBe(404)

  const archived = await sessionArchive(database, developmentUser?.id ?? "", sourceSessionId)
  expect(archived.success).toBe(true)
  const rejected = await app.request(`http://codeline.test/sessions/${sourceSessionId}/branch`, {
    body: JSON.stringify({ ...input, clientRequestId: `session-branch-archived-${crypto.randomUUID()}` }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  expect(rejected.status).toBe(409)
})

test.skipIf(!databaseAvailable)("keeps branch routes strict and ownership-aware", async () => {
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
