import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { createResult } from "@adaptive-ds/result"
import { eq } from "drizzle-orm"
import { appCreate } from "../src/app/appCreate.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { databaseUrl } from "../src/database/databaseUrl.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { developmentIdentityUpsert } from "../src/identity/db/developmentIdentityUpsert.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { journalEventTable } from "../src/journal/db/journalEventTable.js"
import { noteTable } from "../src/note/db/noteTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  organizationExternalId: `note-api-external-${uuidv7()}`,
  organizationId: `note-api-organization-${uuidv7()}`,
  userKey: `note-api-user-${uuidv7()}`,
}
const published: Array<typeof journalEventTable.$inferSelect> = []
let publicationObservedCommittedState = true
let userId: string | undefined

const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `note-api-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)

const configuration = {
  authMode: "development" as const,
  databaseUrl,
  developmentIdentity: { displayName: "Note API User", identityKey: fixture.userKey },
  nodeEnv: "development" as const,
  oidcOrganizationId: fixture.organizationExternalId,
}

const app = appCreate({
  ...appSseTestDependenciesCreate(journalCursorCodec.data),
  configuration,
  database,
  journalCursorCodec: journalCursorCodec.data,
  journalPostCommitPublish: async (events) => {
    for (const event of events) {
      const persisted = await database
        .select({ id: journalEventTable.id })
        .from(journalEventTable)
        .where(eq(journalEventTable.id, event.id))
      if (persisted.length !== 1) publicationObservedCommittedState = false
    }
    published.push(...events)
    return createResult(undefined)
  },
})

beforeAll(async () => {
  if (!databaseAvailable) return
  const user = await developmentIdentityUpsert(database, {
    displayName: "Note API User",
    identityKey: fixture.userKey,
  })
  if (!user.success) throw new Error(user.errorMessage)
  userId = user.data.id
  await database.insert(organizationTable).values({
    externalId: fixture.organizationExternalId,
    id: fixture.organizationId,
    name: "Note API Organization",
  })
  await database.insert(organizationMemberTable).values({
    createdAt: new Date(),
    issuer: "urn:codeline:development",
    organizationId: fixture.organizationId,
    subject: fixture.userKey,
    updatedAt: new Date(),
    userId,
  })
})

afterAll(async () => {
  if (userId !== undefined) {
    await database.delete(noteTable).where(eq(noteTable.userId, userId))
    await database
      .delete(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, fixture.organizationId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database.delete(applicationUserTable).where(eq(applicationUserTable.id, userId))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)(
  "serves typed note CRUD routes with preconditions, idempotency, and journal invalidation",
  async () => {
    if (userId === undefined) return

    const firstId = `note-api-first-${uuidv7()}`
    const secondId = `note-api-second-${uuidv7()}`
    const jsonHeaders = { "Content-Type": "application/json" }
    const firstInput = {
      content: "first",
      createdAt: 1_000,
      id: firstId,
      projectPath: "project",
      updatedAt: 1_000,
    }
    const firstCreated = await app.request("http://codeline.test/api/notes", {
      body: JSON.stringify(firstInput),
      headers: { ...jsonHeaders, "Idempotency-Key": "note-api-create-first" },
      method: "POST",
    })
    expect(firstCreated.status).toBe(201)
    expect(firstCreated.headers.get("ETag")).toBeString()
    const first = await firstCreated.json()
    expect(first).toMatchObject({ content: firstInput.content, id: firstId, revision: 1, sortOrder: 0 })
    expect(firstCreated.headers.get("Idempotency-Replayed")).toBe("false")
    expect(published).toHaveLength(1)

    const replayed = await app.request("http://codeline.test/api/notes", {
      body: JSON.stringify(firstInput),
      headers: { ...jsonHeaders, "Idempotency-Key": "note-api-create-first" },
      method: "POST",
    })
    expect(replayed.status).toBe(200)
    expect(replayed.headers.get("Idempotency-Replayed")).toBe("true")
    expect(published).toHaveLength(1)

    const secondCreated = await app.request("http://codeline.test/api/notes", {
      body: JSON.stringify({
        ...firstInput,
        content: "second",
        id: secondId,
        updatedAt: 2_000,
      }),
      headers: jsonHeaders,
      method: "POST",
    })
    expect(secondCreated.status).toBe(201)
    const second = await secondCreated.json()
    expect(second).toMatchObject({ content: "second", id: secondId, revision: 1, sortOrder: 1 })

    const list = await app.request("http://codeline.test/api/notes")
    expect(list.status).toBe(200)
    const listEtag = list.headers.get("ETag")
    expect(listEtag).toBeString()
    expect((await list.json()).map((note: { id: string }) => note.id)).toEqual([firstId, secondId])
    const notModified = await app.request("http://codeline.test/api/notes", {
      headers: { "If-None-Match": listEtag ?? "" },
    })
    expect(notModified.status).toBe(304)

    const firstDetail = await app.request(`http://codeline.test/api/notes/${firstId}`)
    expect(firstDetail.status).toBe(200)
    const firstEtag = firstDetail.headers.get("ETag")
    expect(firstEtag).toBeString()

    const updated = await app.request(`http://codeline.test/api/notes/${firstId}`, {
      body: JSON.stringify({
        content: "updated",
        projectPath: "project",
        updatedAt: 3_000,
      }),
      headers: { ...jsonHeaders, "Idempotency-Key": "note-api-update-first", "If-Match": firstEtag ?? "" },
      method: "PATCH",
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ content: "updated", id: firstId, revision: 2 })
    expect(published).toHaveLength(3)

    const stale = await app.request(`http://codeline.test/api/notes/${firstId}`, {
      body: JSON.stringify({ content: "stale", projectPath: "project", updatedAt: 4_000 }),
      headers: { ...jsonHeaders, "If-Match": firstEtag ?? "" },
      method: "PATCH",
    })
    expect(stale.status).toBe(412)
    expect((await stale.json()).error.code).toBe("precondition_failed")
    expect(published).toHaveLength(3)

    const secondDetail = await app.request(`http://codeline.test/api/notes/${secondId}`)
    const secondEtag = secondDetail.headers.get("ETag")
    expect(secondDetail.status).toBe(200)
    expect(secondEtag).toBeString()
    const reordered = await app.request(`http://codeline.test/api/notes/${secondId}/reorder`, {
      body: JSON.stringify({ direction: "up", projectPath: "project" }),
      headers: { ...jsonHeaders, "If-Match": secondEtag ?? "" },
      method: "POST",
    })
    expect(reordered.status).toBe(200)
    expect(await reordered.json()).toMatchObject({ id: secondId, revision: 2, sortOrder: 0 })
    expect(published).toHaveLength(5)

    const currentFirst = await app.request(`http://codeline.test/api/notes/${firstId}`)
    const currentFirstEtag = currentFirst.headers.get("ETag")
    expect(currentFirst.status).toBe(200)
    const deleted = await app.request(`http://codeline.test/api/notes/${firstId}`, {
      headers: { "If-Match": currentFirstEtag ?? "" },
      method: "DELETE",
    })
    expect(deleted.status).toBe(200)
    expect(await deleted.json()).toMatchObject({ id: firstId, revision: 4 })
    expect(published).toHaveLength(6)
    expect(publicationObservedCommittedState).toBe(true)

    const missing = await app.request(`http://codeline.test/api/notes/${firstId}`)
    expect(missing.status).toBe(404)
    const remaining = await app.request("http://codeline.test/api/notes")
    expect(remaining.status).toBe(200)
    expect((await remaining.json()).map((note: { id: string }) => note.id)).toEqual([secondId])
  },
)
