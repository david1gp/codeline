import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { inArray } from "drizzle-orm"
import { Hono } from "hono"
import * as v from "valibot"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalSequenceCounterTable } from "../src/journal/db/journalSequenceCounterTable.js"
import { apiMessageRoutesAdd } from "../src/message/api/apiMessageRoutesAdd.js"
import { messageTable } from "../src/message/db/messageTable.js"
import { metricsCollectorCreate } from "../src/metrics/metricsCollectorCreate.js"
import { runCreate } from "../src/run/actions/runCreate.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionBoundedSnapshot } from "../src/session/actions/sessionBoundedSnapshot.js"
import { sessionListSnapshot } from "../src/session/actions/sessionListSnapshot.js"
import { apiSessionRoutesAdd } from "../src/session/api/apiSessionRoutesAdd.js"
import { sessionBoundedSnapshotSchema } from "../src/session/api/sessionBoundedSnapshotSchema.js"
import { sessionRepresentationEtagCreate } from "../src/session/api/sessionRepresentationEtagCreate.js"
import { sessionRepresentationSchemaVersion } from "../src/session/api/sessionRepresentationSchemaVersion.js"
import { sessionListCursorCodecCreate } from "../src/session/db/sessionListCursorCodecCreate.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const fixturePrefix = `task8-snapshot-${uuidv7()}`
const userId = `${fixturePrefix}-user`
const otherUserId = `${fixturePrefix}-other-user`
const organizationId = `${fixturePrefix}-organization`
const otherOrganizationId = `${fixturePrefix}-other-organization`
const serverId = `${fixturePrefix}-server`
const otherServerId = `${fixturePrefix}-other-server`
const agentId = `${fixturePrefix}-agent`
const otherAgentId = `${fixturePrefix}-other-agent`
const tiedUpdatedAt = new Date("2026-08-22T12:00:00.000Z")
const oldUpdatedAt = new Date("2026-08-21T12:00:00.000Z")
const listSessionIds = {
  low: `${fixturePrefix}-session-a`,
  middle: `${fixturePrefix}-session-m`,
  high: `${fixturePrefix}-session-z`,
  old: `${fixturePrefix}-session-old`,
  otherOrganization: `${fixturePrefix}-session-other-org`,
  otherUser: `${fixturePrefix}-session-other-user`,
}
const settledSessionId = `${fixturePrefix}-settled`
const activeSessionId = `${fixturePrefix}-active`
const codecResult = journalCursorCodecCreate({
  randomBytes: (size) => randomBytes(size),
  secret: `${fixturePrefix}-cursor-secret`,
})
const metricsCollector = metricsCollectorCreate()

const httpApi = new Hono<AppEnvironment>()
httpApi.use("*", async (context, next) => {
  context.set("database", database)
  context.set("requestIdentity", { organizationId, userId })
  await next()
})
if (codecResult.success) {
  apiSessionRoutesAdd(httpApi, {
    database,
    journalCursorCodec: codecResult.data,
    journalPostCommitPublish: async () => createResult(undefined),
    metricsCollector,
  })
  apiMessageRoutesAdd(httpApi, {
    journalCursorCodec: codecResult.data,
    journalPostCommitPublish: async () => createResult(undefined),
  })
}

const snapshotDependencies = () => {
  if (!codecResult.success) throw new Error(codecResult.errorMessage)
  const encodeGlobalSequence = codecResult.data.encodeGlobalSequence
  if (encodeGlobalSequence === undefined) throw new Error("The global cursor encoder is required.")
  const sessionListCursorCodec = sessionListCursorCodecCreate(codecResult.data)
  if (!sessionListCursorCodec.success) throw new Error(sessionListCursorCodec.errorMessage)
  return {
    cursorCodec: { ...codecResult.data, encodeGlobalSequence, sessionList: sessionListCursorCodec.data },
    etagCreate: sessionRepresentationEtagCreate,
    schemaVersion: sessionRepresentationSchemaVersion,
  }
}

async function responseJsonRead(response: Response): Promise<unknown> {
  const bytes = new Uint8Array(await response.arrayBuffer())
  const encoding = response.headers.get("Content-Encoding")
  if (encoding === "gzip" || encoding === "deflate") {
    const decompressed = new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(encoding)))
    return decompressed.json()
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Task 8 Snapshot User", id: userId },
    { displayName: "Task 8 Snapshot Other User", id: otherUserId },
  ])
  await database.insert(organizationTable).values([
    { externalId: organizationId, id: organizationId, name: "Task 8 Snapshot Organization" },
    { externalId: otherOrganizationId, id: otherOrganizationId, name: "Task 8 Snapshot Other Organization" },
  ])
  await database.insert(serverTable).values([
    {
      endpoint: "http://task8-snapshot-server.test",
      id: serverId,
      name: "Task 8 Snapshot Server",
      organizationId,
    },
    {
      endpoint: "http://task8-snapshot-other-server.test",
      id: otherServerId,
      name: "Task 8 Snapshot Other Server",
      organizationId: otherOrganizationId,
    },
  ])
  await database.insert(agentTable).values([
    { id: agentId, name: "Task 8 Snapshot Agent", role: "coding", serverId },
    { id: otherAgentId, name: "Task 8 Snapshot Other Agent", role: "coding", serverId: otherServerId },
  ])
  await database.insert(journalSequenceCounterTable).values([
    { nextSequence: 42, userId },
    { nextSequence: 8, userId: otherUserId },
  ])
  await database.insert(sessionTable).values([
    {
      clientRequestId: `${fixturePrefix}-request-a`,
      createdAt: tiedUpdatedAt,
      id: listSessionIds.low,
      metadata: { order: "a" },
      primaryAgentId: agentId,
      serverId,
      title: "Tied low",
      updatedAt: tiedUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-m`,
      createdAt: tiedUpdatedAt,
      id: listSessionIds.middle,
      metadata: { order: "m" },
      primaryAgentId: agentId,
      serverId,
      title: "Tied middle",
      updatedAt: tiedUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-z`,
      createdAt: tiedUpdatedAt,
      id: listSessionIds.high,
      metadata: { order: "z" },
      primaryAgentId: agentId,
      serverId,
      title: "Tied high",
      updatedAt: tiedUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-old`,
      createdAt: oldUpdatedAt,
      id: listSessionIds.old,
      metadata: { order: "old" },
      primaryAgentId: agentId,
      serverId,
      title: "Older",
      updatedAt: oldUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-other-org`,
      createdAt: tiedUpdatedAt,
      id: listSessionIds.otherOrganization,
      metadata: { order: "other-org" },
      primaryAgentId: otherAgentId,
      serverId: otherServerId,
      title: "Other organization",
      updatedAt: tiedUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-other-user`,
      createdAt: tiedUpdatedAt,
      id: listSessionIds.otherUser,
      metadata: { order: "other-user" },
      primaryAgentId: agentId,
      serverId,
      title: "Other user",
      updatedAt: tiedUpdatedAt,
      userId: otherUserId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-settled`,
      createdAt: tiedUpdatedAt,
      id: settledSessionId,
      metadata: { snapshot: "settled" },
      primaryAgentId: agentId,
      revision: 7,
      serverId,
      title: "Settled session",
      updatedAt: tiedUpdatedAt,
      userId,
    },
    {
      clientRequestId: `${fixturePrefix}-request-active`,
      createdAt: tiedUpdatedAt,
      id: activeSessionId,
      metadata: { snapshot: "active" },
      primaryAgentId: agentId,
      serverId,
      title: "Active session",
      updatedAt: tiedUpdatedAt,
      userId,
    },
  ])
  await database.insert(messageTable).values([
    {
      agentId,
      clientRequestId: `${fixturePrefix}-message-3`,
      content: "third",
      createdAt: new Date("2026-08-22T12:00:03.000Z"),
      finalizedAt: new Date("2026-08-22T12:00:03.000Z"),
      id: `${fixturePrefix}-message-3`,
      metadata: { sequence: 3 },
      role: "assistant",
      sequence: 3,
      sessionId: settledSessionId,
    },
    {
      agentId,
      clientRequestId: `${fixturePrefix}-message-1`,
      content: "first",
      createdAt: new Date("2026-08-22T12:00:01.000Z"),
      finalizedAt: new Date("2026-08-22T12:00:01.000Z"),
      id: `${fixturePrefix}-message-1`,
      metadata: { sequence: 1 },
      role: "user",
      sequence: 1,
      sessionId: settledSessionId,
    },
    {
      agentId,
      clientRequestId: `${fixturePrefix}-message-2`,
      content: "second",
      createdAt: new Date("2026-08-22T12:00:02.000Z"),
      finalizedAt: new Date("2026-08-22T12:00:02.000Z"),
      id: `${fixturePrefix}-message-2`,
      metadata: { sequence: 2 },
      role: "assistant",
      sequence: 2,
      sessionId: settledSessionId,
    },
  ])
})

afterAll(async () => {
  await database.delete(sessionTable).where(inArray(sessionTable.userId, [userId, otherUserId]))
  await database.delete(agentTable).where(inArray(agentTable.id, [agentId, otherAgentId]))
  await database.delete(serverTable).where(inArray(serverTable.id, [serverId, otherServerId]))
  await database.delete(organizationTable).where(inArray(organizationTable.id, [organizationId, otherOrganizationId]))
  await database.delete(applicationUserTable).where(inArray(applicationUserTable.id, [userId, otherUserId]))
  await databaseConnectionClose(connection)
})

test("paginates tied updatedAt values without duplicates", async () => {
  const first = await sessionListSnapshot(
    database,
    userId,
    organizationId,
    { limit: 2, search: "Tied" },
    snapshotDependencies(),
  )
  expect(first.success).toBe(true)
  if (!first.success) return
  expect(first.data.sessions.map((session) => session.id)).toEqual([listSessionIds.high, listSessionIds.middle])
  expect(first.data.nextCursor).not.toBeNull()

  const second = await sessionListSnapshot(
    database,
    userId,
    organizationId,
    { cursor: first.data.nextCursor ?? undefined, limit: 2, search: "Tied" },
    snapshotDependencies(),
  )
  expect(second.success).toBe(true)
  if (!second.success) return
  expect(second.data.sessions.map((session) => session.id)).toEqual([listSessionIds.low])
  expect(new Set([...first.data.sessions, ...second.data.sessions].map((session) => session.id)).size).toBe(3)
})

test("rejects tampered and request-mismatched session list cursors", async () => {
  const first = await sessionListSnapshot(
    database,
    userId,
    organizationId,
    { limit: 2, search: "Tied" },
    snapshotDependencies(),
  )
  expect(first.success).toBe(true)
  if (!first.success || first.data.nextCursor === null) return
  expect(first.data.nextCursor).not.toContain(userId)

  const cursorParts = first.data.nextCursor.split(".")
  const ciphertext = cursorParts[2] ?? ""
  const replacement = ciphertext.startsWith("A") ? "B" : "A"
  const tampered = [cursorParts[0], cursorParts[1], `${replacement}${ciphertext.slice(1)}`].join(".")
  const tamperedResult = await sessionListSnapshot(
    database,
    userId,
    organizationId,
    { cursor: tampered, limit: 2, search: "Tied" },
    snapshotDependencies(),
  )
  expect(tamperedResult).toMatchObject({ code: "cursor_invalid", success: false })

  const mismatchedRequests = [
    {
      expectedCode: "cursor_owner_mismatch",
      organizationId,
      userId: otherUserId,
      options: { cursor: first.data.nextCursor, limit: 2, search: "Tied" },
    },
    {
      expectedCode: "cursor_owner_mismatch",
      organizationId: otherOrganizationId,
      userId,
      options: { cursor: first.data.nextCursor, limit: 2, search: "Tied" },
    },
    {
      expectedCode: "cursor_invalid",
      organizationId,
      userId,
      options: { cursor: first.data.nextCursor, limit: 2, search: "Older" },
    },
    {
      expectedCode: "cursor_invalid",
      organizationId,
      userId,
      options: { cursor: first.data.nextCursor, includeArchived: true, limit: 2, search: "Tied" },
    },
    {
      expectedCode: "cursor_invalid",
      organizationId,
      userId,
      options: { cursor: first.data.nextCursor, limit: 1, search: "Tied" },
    },
  ]
  for (const request of mismatchedRequests) {
    const result = await sessionListSnapshot(
      database,
      request.userId,
      request.organizationId,
      request.options,
      snapshotDependencies(),
    )
    expect(result).toMatchObject({ code: request.expectedCode, success: false })
  }
})

test("isolates authenticated accounts and organizations", async () => {
  const organization = await sessionListSnapshot(database, userId, organizationId, {}, snapshotDependencies())
  expect(organization.success).toBe(true)
  if (!organization.success) return
  expect(organization.data.sessions.every((session) => session.id !== listSessionIds.otherOrganization)).toBe(true)
  expect(organization.data.sessions.every((session) => session.id !== listSessionIds.otherUser)).toBe(true)

  const otherOrganization = await sessionListSnapshot(database, userId, otherOrganizationId, {}, snapshotDependencies())
  expect(otherOrganization.success).toBe(true)
  if (!otherOrganization.success) return
  expect(otherOrganization.data.sessions.map((session) => session.id)).toEqual([listSessionIds.otherOrganization])

  const otherAccount = await sessionListSnapshot(database, otherUserId, organizationId, {}, snapshotDependencies())
  expect(otherAccount.success).toBe(true)
  if (!otherAccount.success) return
  expect(otherAccount.data.sessions.map((session) => session.id)).toEqual([listSessionIds.otherUser])
})

test("returns the authenticated global journal boundary as a global cursor", async () => {
  const snapshot = await sessionListSnapshot(database, userId, organizationId, {}, snapshotDependencies())
  expect(snapshot.success).toBe(true)
  if (!snapshot.success || !codecResult.success) return
  if (!("asOfCursor" in snapshot.data)) return
  if (codecResult.data.decodeGlobalSequence === undefined) return
  const decoded = codecResult.data.decodeGlobalSequence(snapshot.data.asOfCursor)
  expect(decoded).toMatchObject({
    success: true,
    data: { globalSequence: 41, journalId: userId, version: 1 },
  })
  expect(snapshot.data.asOfCursor).not.toContain(userId)
})

test("returns durable active state in the bounded snapshot", async () => {
  const created = await runCreate(database, userId, activeSessionId, {
    budget: { maxDurationMs: 10_000 },
    clientRunId: `${fixturePrefix}-active-run`,
    snapshot: {
      configuration: { model: "task8-model", provider: "deterministic" },
      configurationRevision: "task8-revision",
      target: { agentId, serverId },
    },
    streamId: `${fixturePrefix}-active-stream`,
  })
  expect(created.success).toBe(true)
  if (!created.success) return

  const snapshot = await sessionBoundedSnapshot(
    database,
    userId,
    organizationId,
    activeSessionId,
    snapshotDependencies(),
  )
  expect(snapshot).toMatchObject({
    success: true,
    data: { session: { id: activeSessionId }, state: { run: { sessionId: activeSessionId, status: "accepted" } } },
  })
})

test("returns a bounded payload with a selected-session cursor", async () => {
  const snapshot = await sessionBoundedSnapshot(
    database,
    userId,
    organizationId,
    settledSessionId,
    snapshotDependencies(),
  )
  expect(snapshot.success).toBe(true)
  if (!snapshot.success) return
  expect(v.safeParse(sessionBoundedSnapshotSchema, snapshot.data).success).toBe(true)
  expect(snapshot.data.session.id).toBe(settledSessionId)
  expect(snapshot.data.detailCursor).toEqual(expect.any(String))
  expect(snapshot.data.throughPosition).toBe(0)
  expect(snapshot.data.semanticSteps).toEqual([])
  expect(snapshot.data.latestAnswer).toBeNull()
})

test("serves authenticated Drizzle shell/list snapshots with keysets and global cursors", async () => {
  const firstResponse = await httpApi.request("http://codeline.test/sessions?limit=2&search=Tied", {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(firstResponse.status).toBe(200)
  expect(firstResponse.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(firstResponse.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
  expect(firstResponse.headers.get("Content-Encoding")).toBe("gzip")
  const first = (await responseJsonRead(firstResponse)) as {
    asOfCursor: string
    etag: string
    nextCursor: string | null
    sessions: Array<{ id: string }>
  }
  expect(first.sessions.map((session) => session.id)).toEqual([listSessionIds.high, listSessionIds.middle])
  expect(first.asOfCursor).not.toContain(userId)
  expect(firstResponse.headers.get("ETag")).toBe(first.etag)

  const repeatedBodyResponse = await httpApi.request("http://codeline.test/sessions?limit=2&search=Tied", {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(repeatedBodyResponse.status).toBe(200)
  const repeatedBody = (await responseJsonRead(repeatedBodyResponse)) as typeof first
  expect(repeatedBody.sessions).toEqual(first.sessions)
  expect(repeatedBody.nextCursor).not.toBe(first.nextCursor)
  expect(repeatedBody.asOfCursor).not.toBe(first.asOfCursor)
  expect(repeatedBodyResponse.headers.get("ETag")).not.toBe(first.etag)

  const secondResponse = await httpApi.request(
    `http://codeline.test/sessions?cursor=${encodeURIComponent(first.nextCursor ?? "")}&limit=2&search=Tied`,
  )
  expect(secondResponse.status).toBe(200)
  const second = (await secondResponse.json()) as { sessions: Array<{ id: string }> }
  expect(second.sessions.map((session) => session.id)).toEqual([listSessionIds.low])

  const cursorParts = (first.nextCursor ?? "").split(".")
  const ciphertext = cursorParts[2] ?? ""
  const replacement = ciphertext.startsWith("A") ? "B" : "A"
  const tamperedCursor = [cursorParts[0], cursorParts[1], `${replacement}${ciphertext.slice(1)}`].join(".")
  const tamperedResponse = await httpApi.request(
    `http://codeline.test/sessions?cursor=${encodeURIComponent(tamperedCursor)}&limit=2&search=Tied`,
  )
  expect(tamperedResponse.status).toBe(400)
  for (const query of [
    `limit=2&search=Older&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    `includeArchived=1&limit=2&search=Tied&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
    `limit=1&search=Tied&cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
  ]) {
    const response = await httpApi.request(`http://codeline.test/sessions?${query}`)
    expect(response.status).toBe(400)
  }

  const detail = await httpApi.request(`http://codeline.test/sessions/${settledSessionId}`)
  expect(detail.status).toBe(200)
  const detailBody = (await detail.json()) as { asOfCursor: string; etag: string; session: { id: string } }
  expect(detailBody.session.id).toBe(settledSessionId)
  expect(detailBody.asOfCursor).not.toContain(userId)
  const detail304 = await httpApi.request(`http://codeline.test/sessions/${settledSessionId}`, {
    headers: { "If-None-Match": detailBody.etag },
  })
  expect(detail304.status).toBe(304)
})

test("serves ordered message pages and bounded snapshots", async () => {
  const firstMessages = await httpApi.request(`http://codeline.test/sessions/${settledSessionId}/messages?limit=2`, {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(firstMessages.status).toBe(200)
  expect(firstMessages.headers.get("Content-Encoding")).toBe("gzip")
  const first = (await responseJsonRead(firstMessages)) as {
    messages: Array<{ sequence: number }>
    nextCursor: string | null
  }
  expect(first.messages.map((message) => message.sequence)).toEqual([1, 2])
  expect(first.nextCursor).not.toBeNull()

  const secondMessages = await httpApi.request(
    `http://codeline.test/sessions/${settledSessionId}/messages?cursor=${encodeURIComponent(first.nextCursor ?? "")}`,
  )
  expect(secondMessages.status).toBe(200)
  expect((await secondMessages.json()).messages.map((message: { sequence: number }) => message.sequence)).toEqual([3])

  const snapshot = await httpApi.request(`http://codeline.test/sessions/${settledSessionId}/bounded-snapshot`, {
    headers: { "Accept-Encoding": "gzip" },
  })
  expect(snapshot.status).toBe(200)
  expect(snapshot.headers.get("Cache-Control")).toBe("private, no-cache")
  expect(snapshot.headers.get("Vary")).toBe("Cookie, Accept-Encoding")
  expect(snapshot.headers.get("Content-Encoding")).toBe("gzip")
  const body = (await responseJsonRead(snapshot)) as {
    detailCursor: string
    latestAnswer: unknown
    semanticSteps: unknown[]
    session: { id: string }
    throughPosition: number
  }
  expect(body.session.id).toBe(settledSessionId)
  expect(body.detailCursor).toEqual(expect.any(String))
  expect(body.throughPosition).toBe(0)
  expect(body.semanticSteps).toEqual([])
  expect(body.latestAnswer).toBeNull()

  const active = await httpApi.request(`http://codeline.test/sessions/${activeSessionId}/bounded-snapshot`)
  expect(active.status).toBe(200)
})

test("does not serve a session or messages across organization scope", async () => {
  const otherOrganizationApi = new Hono<AppEnvironment>()
  otherOrganizationApi.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId: otherOrganizationId, userId })
    await next()
  })
  const otherUserApi = new Hono<AppEnvironment>()
  otherUserApi.use("*", async (context, next) => {
    context.set("database", database)
    context.set("requestIdentity", { organizationId, userId: otherUserId })
    await next()
  })
  if (codecResult.success) {
    apiSessionRoutesAdd(otherOrganizationApi, {
      database,
      journalCursorCodec: codecResult.data,
      journalPostCommitPublish: async () => createResult(undefined),
    })
    apiMessageRoutesAdd(otherOrganizationApi, {
      journalCursorCodec: codecResult.data,
      journalPostCommitPublish: async () => createResult(undefined),
    })
    apiSessionRoutesAdd(otherUserApi, {
      database,
      journalCursorCodec: codecResult.data,
      journalPostCommitPublish: async () => createResult(undefined),
    })
  }

  const firstResponse = await httpApi.request("http://codeline.test/sessions?limit=2&search=Tied")
  const first = (await firstResponse.json()) as { nextCursor: string | null }
  const reusedCursor = await otherOrganizationApi.request(
    `http://codeline.test/sessions?cursor=${encodeURIComponent(first.nextCursor ?? "")}&limit=2&search=Tied`,
  )
  expect(reusedCursor.status).toBe(400)
  const reusedByOtherUser = await otherUserApi.request(
    `http://codeline.test/sessions?cursor=${encodeURIComponent(first.nextCursor ?? "")}&limit=2&search=Tied`,
  )
  expect(reusedByOtherUser.status).toBe(400)
  expect((await otherOrganizationApi.request("http://codeline.test/sessions")).status).toBe(200)
  expect((await otherOrganizationApi.request(`http://codeline.test/sessions/${settledSessionId}`)).status).toBe(404)
  expect(
    (await otherOrganizationApi.request(`http://codeline.test/sessions/${settledSessionId}/messages`)).status,
  ).toBe(404)
  expect(
    (await otherOrganizationApi.request(`http://codeline.test/sessions/${settledSessionId}/bounded-snapshot`)).status,
  ).toBe(404)
})
