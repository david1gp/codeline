import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { agentTable } from "../src/agents/db/agentTable.js"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { apiIdempotencyRequestHashCreate } from "../src/api/idempotency/apiIdempotencyRequestHashCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseTransactionRun } from "../src/database/databaseTransactionRun.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalBacklogRead } from "../src/journal/actions/journalBacklogRead.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { serverTable } from "../src/servers/db/serverTable.js"
import { sessionCreate } from "../src/session/actions/sessionCreate.js"
import { sessionDelete } from "../src/session/actions/sessionDelete.js"
import { sessionLoad } from "../src/session/actions/sessionLoad.js"
import { sessionRename } from "../src/session/actions/sessionRename.js"
import { apiSessionRenameRoutesAdd } from "../src/session/api/apiSessionRenameRoutesAdd.js"
import { sessionDetailResponseCreate } from "../src/session/api/sessionDetailResponseCreate.js"
import { sessionJournalRecipientResolverCreate } from "../src/session/db/sessionJournalRecipientResolverCreate.js"
import { sessionRepositoryArchive } from "../src/session/db/sessionRepositoryArchive.js"
import { sessionRepositoryDelete } from "../src/session/db/sessionRepositoryDelete.js"
import { sessionRepositoryPin } from "../src/session/db/sessionRepositoryPin.js"
import { sessionRepositoryRename } from "../src/session/db/sessionRepositoryRename.js"
import { sessionTable } from "../src/session/db/sessionTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `session-task4-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const identityKey = `task4-drizzle-user-${uuidv7()}`
const userId = `development:${identityKey}`
const serverId = `task4-drizzle-server-${uuidv7()}`
const agentId = `task4-drizzle-agent-${uuidv7()}`
const otherOrganizationId = `task4-drizzle-other-organization-${uuidv7()}`
const otherServerId = `task4-drizzle-other-server-${uuidv7()}`
const otherAgentId = `task4-drizzle-other-agent-${uuidv7()}`
const renameApi = new Hono<AppEnvironment>()
renameApi.use("*", async (context, next) => {
  context.set("database", database)
  context.set("requestIdentity", { organizationId: userId, userId })
  await next()
})
apiSessionRenameRoutesAdd(renameApi, {
  database,
  journalCursorCodec: journalCursorCodec.data,
  journalPostCommitPublish: async () => createResult(undefined),
})

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, { displayName: "Task 4 Drizzle User", identityKey })
  if (!user.success) throw new Error(user.errorMessage)
  await database
    .insert(organizationTable)
    .values({ id: userId, externalId: userId, name: "Task 4 Drizzle Organization" })
  await database.insert(serverTable).values({
    endpoint: "http://task4-drizzle-server.test",
    id: serverId,
    name: "Task 4 Drizzle Server",
    organizationId: userId,
  })
  await database.insert(agentTable).values({ id: agentId, name: "Task 4 Drizzle Agent", role: "coding", serverId })
  await database.insert(organizationTable).values({
    id: otherOrganizationId,
    externalId: otherOrganizationId,
    name: "Task 4 Drizzle Other Organization",
  })
  await database.insert(serverTable).values({
    endpoint: "http://task4-drizzle-other-server.test",
    id: otherServerId,
    name: "Task 4 Drizzle Other Server",
    organizationId: otherOrganizationId,
  })
  await database
    .insert(agentTable)
    .values({ id: otherAgentId, name: "Task 4 Drizzle Other Agent", role: "coding", serverId: otherServerId })
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(sessionTable).where(eq(sessionTable.userId, userId))
    await database.delete(serverTable).where(eq(serverTable.id, otherServerId))
    await database.delete(serverTable).where(eq(serverTable.id, serverId))
    await database.delete(organizationTable).where(eq(organizationTable.id, otherOrganizationId))
    await database.delete(organizationTable).where(eq(organizationTable.id, userId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "Drizzle session representation preconditions and idempotency are transactional",
  async () => {
    const created = await sessionCreate(
      database,
      userId,
      {
        clientRequestId: `task4-session-${uuidv7()}`,
        metadata: { stable: "value" },
        primaryAgentId: agentId,
        serverId,
        title: "Original title",
      },
      { organizationId: userId },
    )
    expect(created.success).toBe(true)
    if (!created.success) return
    const sessionId = created.data.session.id

    const loaded = await sessionLoad(database, userId, userId, sessionId)
    expect(loaded.success).toBe(true)
    if (!loaded.success) return
    const representation = sessionDetailResponseCreate(loaded.data)
    expect(representation.success).toBe(true)
    if (!representation.success) return
    const initialEtag = representation.data.etag
    await database.update(serverTable).set({ name: "Changed server label" }).where(eq(serverTable.id, serverId))
    await database.update(agentTable).set({ name: "Changed agent label" }).where(eq(agentTable.id, agentId))
    const relabeled = await sessionLoad(database, userId, userId, sessionId)
    expect(relabeled.success).toBe(true)
    if (!relabeled.success) return
    const relabeledRepresentation = sessionDetailResponseCreate(relabeled.data)
    expect(relabeledRepresentation).toMatchObject({
      success: true,
      data: { etag: initialEtag, agent: { id: agentId }, server: { id: serverId } },
    })
    const idempotencyKey = `task4-rename-${uuidv7()}`
    const requestHash = apiIdempotencyRequestHashCreate({ ifMatch: initialEtag, payload: { title: "Renamed title" } })

    const renamed = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryRename(transaction, userId, sessionId, "Renamed title", {
        expectedEtag: initialEtag,
        idempotencyKey,
        organizationId: userId,
        requireIfMatch: true,
        requestHash,
      }),
    )
    expect(renamed).toMatchObject({ success: true, data: { replayed: false, responseBody: { revision: 2 } } })
    if (!renamed.success || renamed.data.responseBody === undefined) return
    const renamedResponse = renamed.data.responseBody

    const replayed = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryRename(transaction, userId, sessionId, "Renamed title", {
        expectedEtag: initialEtag,
        idempotencyKey,
        organizationId: userId,
        requireIfMatch: true,
        requestHash,
      }),
    )
    expect(replayed).toMatchObject({ success: true, data: { replayed: true, responseBody: renamed.data.responseBody } })

    const conflicting = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryRename(transaction, userId, sessionId, "Different title", {
        expectedEtag: initialEtag,
        idempotencyKey,
        organizationId: userId,
        requireIfMatch: true,
        requestHash: apiIdempotencyRequestHashCreate({ ifMatch: initialEtag, payload: { title: "Different title" } }),
      }),
    )
    expect(conflicting).toMatchObject({ code: "idempotency_conflict", success: false })

    const concurrentKey = `task4-concurrent-${uuidv7()}`
    const concurrentHash = apiIdempotencyRequestHashCreate({
      ifMatch: renamedResponse.etag,
      payload: { title: "Concurrent title" },
    })
    const concurrent = await Promise.all(
      [0, 1].map(() =>
        databaseTransactionRun(database, (transaction) =>
          sessionRepositoryRename(transaction, userId, sessionId, "Concurrent title", {
            expectedEtag: renamedResponse.etag,
            idempotencyKey: concurrentKey,
            organizationId: userId,
            requireIfMatch: true,
            requestHash: concurrentHash,
          }),
        ),
      ),
    )
    expect(concurrent.filter((result) => result.success)).toHaveLength(2)
    expect(concurrent.filter((result) => result.success && result.data.replayed)).toHaveLength(1)

    const missingIfMatch = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryRename(transaction, userId, sessionId, "Must not write", {
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(missingIfMatch).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })
    if (!missingIfMatch.success) expect(JSON.parse(missingIfMatch.errorData ?? "{}")).toHaveProperty("currentEtag")

    const unauthorized = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryRename(transaction, userId, sessionId, "Unauthorized", {
        expectedEtag: concurrent.find((result) => result.success)?.data.responseBody?.etag,
        organizationId: "other-organization",
        requireIfMatch: true,
      }),
    )
    expect(unauthorized).toMatchObject({ success: false })

    const current = await sessionLoad(database, userId, userId, sessionId)
    expect(current.success).toBe(true)
    if (!current.success) return
    const currentRepresentation = sessionDetailResponseCreate(current.data)
    expect(currentRepresentation.success).toBe(true)
    if (!currentRepresentation.success) return
    const deleted = await sessionDelete(database, userId, sessionId, {
      expectedEtag: currentRepresentation.data.etag,
      organizationId: userId,
      requireIfMatch: true,
    })
    expect(deleted).toMatchObject({ success: true, data: { id: sessionId } })
  },
)

test.skipIf(!databaseAvailable)(
  "the Drizzle rename route returns canonical representations and conflicts",
  async () => {
    const created = await sessionCreate(
      database,
      userId,
      {
        clientRequestId: `task4-route-session-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Route title",
      },
      { organizationId: userId },
    )
    expect(created.success).toBe(true)
    if (!created.success) return
    const sessionId = created.data.session.id
    const loaded = await sessionLoad(database, userId, userId, sessionId)
    expect(loaded.success).toBe(true)
    if (!loaded.success) return
    const initial = sessionDetailResponseCreate(loaded.data)
    expect(initial.success).toBe(true)
    if (!initial.success) return

    const missing = await renameApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Missing If-Match" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(missing.status).toBe(412)
    expect(await missing.json()).toMatchObject({ error: { currentEtag: initial.data.etag, currentRevision: 1 } })

    const malformed = await renameApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Malformed If-Match" }),
      headers: { "Content-Type": "application/json", "If-Match": "malformed" },
      method: "PATCH",
    })
    expect(malformed.status).toBe(400)

    const key = `task4-route-key-${uuidv7()}`
    const renamed = await renameApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Route renamed" }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, "If-Match": initial.data.etag },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(renamed.headers.get("Idempotency-Replayed")).toBe("false")
    const renamedBody = await renamed.json()
    expect(renamedBody).toMatchObject({
      etag: renamed.headers.get("ETag"),
      revision: 2,
      session: { title: "Route renamed" },
    })

    const replayed = await renameApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Route renamed" }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, "If-Match": initial.data.etag },
      method: "PATCH",
    })
    expect(replayed.status).toBe(200)
    expect(replayed.headers.get("Idempotency-Replayed")).toBe("true")
    expect(await replayed.json()).toEqual(renamedBody)

    const conflict = await renameApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Different route payload" }),
      headers: { "Content-Type": "application/json", "Idempotency-Key": key, "If-Match": initial.data.etag },
      method: "PATCH",
    })
    expect(conflict.status).toBe(409)

    const unauthorizedApi = new Hono<AppEnvironment>()
    unauthorizedApi.use("*", async (context, next) => {
      context.set("database", database)
      context.set("requestIdentity", { organizationId: "other-organization", userId })
      await next()
    })
    apiSessionRenameRoutesAdd(unauthorizedApi, {
      database,
      journalCursorCodec: journalCursorCodec.data,
      journalPostCommitPublish: async () => createResult(undefined),
    })
    const unauthorized = await unauthorizedApi.request(`http://codeline.test/sessions/${sessionId}`, {
      body: JSON.stringify({ title: "Unauthorized route payload" }),
      headers: { "Content-Type": "application/json", "If-Match": initial.data.etag },
      method: "PATCH",
    })
    expect(unauthorized.status).toBe(404)
  },
)

test.skipIf(!databaseAvailable)(
  "Drizzle pin, archive, and delete enforce scoped preconditions and retry idempotency",
  async () => {
    const created = await sessionCreate(
      database,
      userId,
      {
        clientRequestId: `task4-action-session-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Action session",
      },
      { organizationId: userId },
    )
    expect(created.success).toBe(true)
    if (!created.success) return
    const sessionId = created.data.session.id
    const initial = sessionDetailResponseCreate({
      agent: { id: agentId },
      server: { id: serverId },
      session: created.data.session,
    })
    expect(initial.success).toBe(true)
    if (!initial.success) return

    const pinKey = `task4-pin-${uuidv7()}`
    const pinHash = apiIdempotencyRequestHashCreate({ ifMatch: initial.data.etag, pinned: false })
    const pinned = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, false, {
        expectedEtag: initial.data.etag,
        idempotencyKey: pinKey,
        organizationId: userId,
        requestHash: pinHash,
        requireIfMatch: true,
      }),
    )
    expect(pinned).toMatchObject({
      success: true,
      data: { replayed: false, responseBody: { revision: 2 } },
    })
    if (!pinned.success || pinned.data.responseBody === undefined) return
    expect(typeof pinned.data.responseBody.etag).toBe("string")

    const pinReplay = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, false, {
        expectedEtag: initial.data.etag,
        idempotencyKey: pinKey,
        organizationId: userId,
        requestHash: pinHash,
        requireIfMatch: true,
      }),
    )
    expect(pinReplay).toMatchObject({ success: true, data: { replayed: true, responseBody: pinned.data.responseBody } })

    const pinConflict = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, true, {
        expectedEtag: initial.data.etag,
        idempotencyKey: pinKey,
        organizationId: userId,
        requestHash: apiIdempotencyRequestHashCreate({ ifMatch: initial.data.etag, pinned: true }),
        requireIfMatch: true,
      }),
    )
    expect(pinConflict).toMatchObject({ code: "idempotency_conflict", success: false })

    const stalePin = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, true, {
        expectedEtag: initial.data.etag,
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(stalePin).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })

    const pinConcurrentKey = `task4-pin-concurrent-${uuidv7()}`
    const pinConcurrentHash = apiIdempotencyRequestHashCreate({ ifMatch: pinned.data.responseBody.etag, pinned: true })
    const pinConcurrent = await Promise.all(
      [0, 1].map(() =>
        databaseTransactionRun(database, (transaction) =>
          sessionRepositoryPin(transaction, userId, sessionId, true, {
            expectedEtag: pinned.data.responseBody?.etag,
            idempotencyKey: pinConcurrentKey,
            organizationId: userId,
            requestHash: pinConcurrentHash,
            requireIfMatch: true,
          }),
        ),
      ),
    )
    expect(pinConcurrent.filter((result) => result.success)).toHaveLength(2)
    expect(pinConcurrent.filter((result) => result.success && result.data.replayed)).toHaveLength(1)
    const currentPin = pinConcurrent.find((result) => result.success && !result.data.replayed)
    expect(currentPin?.success).toBe(true)
    if (currentPin?.success === true && currentPin.data.responseBody === undefined) return
    if (currentPin?.success !== true || currentPin.data.responseBody === undefined) return

    const missingPin = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, false, {
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(missingPin).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })
    const unauthorizedPin = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryPin(transaction, userId, sessionId, false, {
        expectedEtag: currentPin.data.responseBody?.etag,
        organizationId: "other-organization",
        requireIfMatch: true,
      }),
    )
    expect(unauthorizedPin).toMatchObject({ success: false })
    const unauthorizedArchive = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryArchive(transaction, userId, sessionId, {
        expectedEtag: currentPin.data.responseBody?.etag,
        organizationId: "other-organization",
        requireIfMatch: true,
      }),
    )
    expect(unauthorizedArchive).toMatchObject({ success: false })
    const unauthorizedDelete = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryDelete(transaction, userId, sessionId, {
        expectedEtag: currentPin.data.responseBody?.etag,
        organizationId: "other-organization",
        requireIfMatch: true,
      }),
    )
    expect(unauthorizedDelete).toMatchObject({ success: false })

    const archiveKey = `task4-archive-${uuidv7()}`
    const archiveHash = apiIdempotencyRequestHashCreate({ ifMatch: currentPin.data.responseBody.etag })
    const archiveConcurrent = await Promise.all(
      [0, 1].map(() =>
        databaseTransactionRun(database, (transaction) =>
          sessionRepositoryArchive(transaction, userId, sessionId, {
            expectedEtag: currentPin.data.responseBody?.etag,
            idempotencyKey: archiveKey,
            organizationId: userId,
            requestHash: archiveHash,
            requireIfMatch: true,
          }),
        ),
      ),
    )
    expect(archiveConcurrent.filter((result) => result.success)).toHaveLength(2)
    expect(archiveConcurrent.filter((result) => result.success && result.data.replayed)).toHaveLength(1)
    const currentArchive = archiveConcurrent.find((result) => result.success && !result.data.replayed)
    expect(currentArchive?.success).toBe(true)
    if (currentArchive?.success !== true || currentArchive.data.responseBody === undefined) return

    const staleArchive = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryArchive(transaction, userId, sessionId, {
        expectedEtag: initial.data.etag,
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(staleArchive).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })
    const missingArchive = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryArchive(transaction, userId, sessionId, {
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(missingArchive).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })

    const deleteKey = `task4-delete-${uuidv7()}`
    const deleteHash = apiIdempotencyRequestHashCreate({ ifMatch: currentArchive.data.responseBody.etag })
    const staleDelete = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryDelete(transaction, userId, sessionId, {
        expectedEtag: initial.data.etag,
        organizationId: userId,
        requireIfMatch: true,
      }),
    )
    expect(staleDelete).toMatchObject({ code: "precondition_failed", statusCode: 412, success: false })
    const deleteConcurrent = await Promise.all(
      [0, 1].map(() =>
        databaseTransactionRun(database, (transaction) =>
          sessionRepositoryDelete(transaction, userId, sessionId, {
            expectedEtag: currentArchive.data.responseBody?.etag,
            idempotencyKey: deleteKey,
            organizationId: userId,
            requestHash: deleteHash,
            requireIfMatch: true,
          }),
        ),
      ),
    )
    expect(deleteConcurrent.filter((result) => result.success)).toHaveLength(2)
    expect(deleteConcurrent.filter((result) => result.success && result.data.replayed)).toHaveLength(1)
    const deleted = deleteConcurrent.find((result) => result.success && !result.data.replayed)
    expect(deleted).toMatchObject({
      success: true,
      data: { responseBody: { deleted: true, session: { id: sessionId } } },
    })

    const deleteReplay = await databaseTransactionRun(database, (transaction) =>
      sessionRepositoryDelete(transaction, userId, sessionId, {
        expectedEtag: currentArchive.data.responseBody?.etag,
        idempotencyKey: deleteKey,
        organizationId: userId,
        requestHash: deleteHash,
        requireIfMatch: true,
      }),
    )
    expect(deleteReplay).toMatchObject({ success: true, data: { replayed: true } })

    const childParent = await sessionCreate(
      database,
      userId,
      {
        clientRequestId: `task4-child-parent-${uuidv7()}`,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Child parent",
      },
      { organizationId: userId },
    )
    expect(childParent.success).toBe(true)
    if (!childParent.success) return
    const childId = `task4-child-${uuidv7()}`
    const unrelatedId = `task4-unrelated-${uuidv7()}`
    await database.insert(sessionTable).values([
      {
        clientRequestId: childId,
        id: childId,
        metadata: {},
        parentSessionId: childParent.data.session.id,
        primaryAgentId: agentId,
        serverId,
        title: "Child",
        userId,
      },
      {
        clientRequestId: `task4-foreign-child-${uuidv7()}`,
        id: `task4-foreign-child-${uuidv7()}`,
        metadata: {},
        parentSessionId: childParent.data.session.id,
        primaryAgentId: otherAgentId,
        serverId: otherServerId,
        title: "Foreign child",
        userId,
      },
      {
        clientRequestId: unrelatedId,
        id: unrelatedId,
        metadata: {},
        primaryAgentId: agentId,
        serverId,
        title: "Unrelated",
        userId,
      },
    ])
    const parentEtag = sessionDetailResponseCreate({
      agent: { id: agentId },
      server: { id: serverId },
      session: childParent.data.session,
    })
    expect(parentEtag.success).toBe(true)
    if (!parentEtag.success) return
    const deletedParent = await sessionDelete(database, userId, childParent.data.session.id, {
      expectedEtag: parentEtag.data.etag,
      organizationId: userId,
      requireIfMatch: true,
    })
    expect(deletedParent).toMatchObject({ success: true, data: { responseBody: { deleted: true } } })
    const [child] = await database.select().from(sessionTable).where(eq(sessionTable.id, childId))
    const [foreignChild] = await database
      .select()
      .from(sessionTable)
      .where(eq(sessionTable.primaryAgentId, otherAgentId))
    const [unrelated] = await database.select().from(sessionTable).where(eq(sessionTable.id, unrelatedId))
    expect(child).toMatchObject({ parentSessionId: null, revision: 2 })
    expect(foreignChild).toMatchObject({ parentSessionId: null, revision: 1 })
    expect(unrelated).toMatchObject({ revision: 1 })
  },
)

test.skipIf(!databaseAvailable)("journals an authorized session mutation after commit and replays it", async () => {
  const created = await sessionCreate(
    database,
    userId,
    {
      clientRequestId: `task8-journal-session-${uuidv7()}`,
      metadata: {},
      primaryAgentId: agentId,
      serverId,
      title: "Journal session",
    },
    { organizationId: userId },
  )
  expect(created.success).toBe(true)
  if (!created.success) return
  const sessionId = created.data.session.id
  const loaded = await sessionLoad(database, userId, userId, sessionId)
  expect(loaded.success).toBe(true)
  if (!loaded.success) return
  const representation = sessionDetailResponseCreate(loaded.data)
  expect(representation.success).toBe(true)
  if (!representation.success) return

  const codec = journalCursorCodecCreate({ randomBytes, secret: `task8-journal-${uuidv7()}` })
  expect(codec.success).toBe(true)
  if (!codec.success) return
  const existingJournal = await database
    .select({ sequence: journalEventTable.sequence })
    .from(journalEventTable)
    .where(eq(journalEventTable.userId, userId))
  const baselineSequence = Math.max(0, ...existingJournal.map((event) => event.sequence))
  const published: Array<{ eventType: string; payload: unknown; sequence: number; userId: string }> = []
  const idempotencyKey = `task8-journal-rename-${uuidv7()}`
  const requestHash = apiIdempotencyRequestHashCreate({ ifMatch: representation.data.etag, title: "Journal renamed" })
  const journal = {
    postCommitPublish: async (events: readonly (typeof journalEventTable.$inferSelect)[]) => {
      published.push(...events)
      return createResult(undefined)
    },
    resolveRecipients: sessionJournalRecipientResolverCreate({
      organizationId: userId,
    }),
  }

  const renamed = await sessionRename(database, userId, sessionId, "Journal renamed", {
    expectedEtag: representation.data.etag,
    idempotencyKey,
    journal,
    organizationId: userId,
    requireIfMatch: true,
    requestHash,
  })
  expect(renamed).toMatchObject({ success: true, data: { replayed: false, responseBody: { revision: 2 } } })
  expect(published).toHaveLength(1)
  expect(published[0]).toMatchObject({
    eventType: "invalidate",
    payload: { resourceId: sessionId, resourceType: "session", revision: 2 },
    sequence: baselineSequence + 1,
    userId,
  })

  const replayed = await sessionRename(database, userId, sessionId, "Journal renamed", {
    expectedEtag: representation.data.etag,
    idempotencyKey,
    journal,
    organizationId: userId,
    requireIfMatch: true,
    requestHash,
  })
  expect(replayed).toMatchObject({ success: true, data: { replayed: true } })
  expect(published).toHaveLength(1)

  const changedPayload = await sessionRename(database, userId, sessionId, "Changed payload", {
    expectedEtag: representation.data.etag,
    idempotencyKey,
    journal,
    organizationId: userId,
    requireIfMatch: true,
    requestHash: apiIdempotencyRequestHashCreate({ ifMatch: representation.data.etag, title: "Changed payload" }),
  })
  expect(changedPayload).toMatchObject({ code: "idempotency_conflict", success: false })

  const cursor = codec.data.encode(userId, baselineSequence)
  expect(cursor.success).toBe(true)
  if (!cursor.success) return
  const backlog = await journalBacklogRead({ cursorCodec: codec.data, database }, { after: cursor.data, userId })
  expect(backlog.success).toBe(true)
  if (!backlog.success) return
  const frames: unknown[] = []
  for await (const page of backlog.data.pages) {
    expect(page.success).toBe(true)
    if (page.success) frames.push(...page.data)
  }
  expect(frames).toHaveLength(1)
  expect(frames[0]).toMatchObject({ data: { eventType: "invalidate", resourceId: sessionId, revision: 2 } })
})
