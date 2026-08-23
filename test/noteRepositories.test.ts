import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test"
import type { Result } from "@adaptive-ds/result"
import { eq, inArray } from "drizzle-orm"
import type { DatabaseExecutor } from "../src/database/databaseClient.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseExecutorTransactionRun } from "../src/database/databaseExecutorTransactionRun.js"
import { databaseReadyCheck } from "../src/database/databaseReadyCheck.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { noteRepositoryCreate } from "../src/note/db/noteRepositoryCreate.js"
import { noteRepositoryDelete } from "../src/note/db/noteRepositoryDelete.js"
import { noteRepositoryList } from "../src/note/db/noteRepositoryList.js"
import { noteRepositoryLoad } from "../src/note/db/noteRepositoryLoad.js"
import { noteRepositoryReorder } from "../src/note/db/noteRepositoryReorder.js"
import { noteRepositoryUpdate } from "../src/note/db/noteRepositoryUpdate.js"
import { noteTable } from "../src/note/db/noteTable.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { databaseTestConnectionCreate } from "./databaseTestConnectionCreate.js"

const connection = databaseTestConnectionCreate()
const database = connection.db
const databaseAvailable = await databaseReadyCheck(database).then((result) => result.success)
const fixture = {
  organizationId: `note-repository-organization-${uuidv7()}`,
  userId: `note-repository-user-${uuidv7()}`,
  otherUserId: `note-repository-other-user-${uuidv7()}`,
  nonMemberUserId: `note-repository-non-member-${uuidv7()}`,
}
const noteIds = {
  alphaFirst: `note-alpha-first-${uuidv7()}`,
  alphaUnordered: `note-alpha-unordered-${uuidv7()}`,
  betaFirst: `note-beta-first-${uuidv7()}`,
  otherUser: `note-other-user-${uuidv7()}`,
}

function noteValues(
  id: string,
  userId: string,
  projectPath: string | null,
  sortOrder: number | null,
  updatedAt: number,
) {
  const timestamp = new Date(updatedAt)
  return {
    content: id,
    createdAt: timestamp,
    id,
    projectPath,
    revision: 1,
    sortOrder,
    updatedAt: timestamp,
    userId,
  }
}

async function mutationRun<T>(operation: (database: DatabaseExecutor) => Promise<Result<T>>) {
  return databaseExecutorTransactionRun(database, operation)
}

beforeAll(async () => {
  if (!databaseAvailable) return
  await database.insert(applicationUserTable).values([
    { displayName: "Note Repository User", id: fixture.userId },
    { displayName: "Note Repository Other User", id: fixture.otherUserId },
    { displayName: "Note Repository Non-member", id: fixture.nonMemberUserId },
  ])
  await database.insert(organizationTable).values({
    externalId: fixture.organizationId,
    id: fixture.organizationId,
    name: "Note Repository Organization",
  })
  await database.insert(organizationMemberTable).values([
    {
      createdAt: new Date(),
      issuer: "urn:test:note-repository",
      organizationId: fixture.organizationId,
      subject: fixture.userId,
      updatedAt: new Date(),
      userId: fixture.userId,
    },
    {
      createdAt: new Date(),
      issuer: "urn:test:note-repository",
      organizationId: fixture.organizationId,
      subject: fixture.otherUserId,
      updatedAt: new Date(),
      userId: fixture.otherUserId,
    },
  ])
})

beforeEach(async () => {
  if (!databaseAvailable) return
  await database.delete(noteTable).where(inArray(noteTable.userId, [fixture.userId, fixture.otherUserId]))
  await database
    .insert(noteTable)
    .values([
      noteValues(noteIds.alphaFirst, fixture.userId, "alpha", 5, 1_000),
      noteValues(noteIds.alphaUnordered, fixture.userId, "alpha", null, 2_000),
      noteValues(noteIds.betaFirst, fixture.userId, "beta", 0, 3_000),
      noteValues(noteIds.otherUser, fixture.otherUserId, "alpha", 0, 4_000),
    ])
})

afterAll(async () => {
  if (databaseAvailable) {
    await database.delete(noteTable).where(inArray(noteTable.userId, [fixture.userId, fixture.otherUserId]))
    await database
      .delete(organizationMemberTable)
      .where(eq(organizationMemberTable.organizationId, fixture.organizationId))
    await database.delete(organizationTable).where(eq(organizationTable.id, fixture.organizationId))
    await database
      .delete(applicationUserTable)
      .where(inArray(applicationUserTable.id, [fixture.userId, fixture.otherUserId, fixture.nonMemberUserId]))
  }
  await databaseConnectionClose(connection)
})

test.skipIf(!databaseAvailable)("lists and loads notes within authenticated organization ownership", async () => {
  const listed = await noteRepositoryList(database, fixture.userId, fixture.organizationId)
  expect(listed).toMatchObject({ success: true })
  if (!listed.success) return
  expect(listed.data.map((note) => note.id)).toEqual([noteIds.betaFirst, noteIds.alphaFirst, noteIds.alphaUnordered])

  const loaded = await noteRepositoryLoad(database, fixture.userId, noteIds.alphaFirst, fixture.organizationId)
  expect(loaded).toMatchObject({ success: true, data: { id: noteIds.alphaFirst } })

  const privateDetail = await noteRepositoryLoad(
    database,
    fixture.otherUserId,
    noteIds.alphaFirst,
    fixture.organizationId,
  )
  expect(privateDetail).toEqual({ success: true, data: undefined })

  const unauthorized = await noteRepositoryList(database, fixture.nonMemberUserId, fixture.organizationId)
  expect(unauthorized.success).toBe(false)
})

test.skipIf(!databaseAvailable)(
  "creates, updates, reorders, and deletes with deterministic project compaction",
  async () => {
    const createdId = `note-created-${uuidv7()}`
    const created = await mutationRun((transaction) =>
      noteRepositoryCreate(transaction, fixture.userId, {
        content: "created",
        createdAt: 5_000,
        id: createdId,
        projectPath: "alpha",
        updatedAt: 5_000,
        organizationId: fixture.organizationId,
      }),
    )
    expect(created).toMatchObject({
      success: true,
      data: { created: true, responseBody: { id: createdId, sortOrder: 2 } },
    })

    const alphaAfterCreate = await noteRepositoryList(database, fixture.userId)
    expect(alphaAfterCreate.success).toBe(true)
    if (!alphaAfterCreate.success) return
    expect(alphaAfterCreate.data.filter((note) => note.projectPath === "alpha").map((note) => note.id)).toEqual([
      noteIds.alphaFirst,
      noteIds.alphaUnordered,
      createdId,
    ])

    const updated = await mutationRun((transaction) =>
      noteRepositoryUpdate(transaction, fixture.userId, createdId, {
        content: "moved",
        projectPath: "beta",
        updatedAt: 6_000,
        organizationId: fixture.organizationId,
      }),
    )
    expect(updated).toMatchObject({
      success: true,
      data: { responseBody: { id: createdId, projectPath: "beta", sortOrder: 1 } },
    })

    const reordered = await mutationRun((transaction) =>
      noteRepositoryReorder(transaction, fixture.userId, noteIds.alphaUnordered, {
        direction: "up",
        projectPath: "alpha",
        organizationId: fixture.organizationId,
      }),
    )
    expect(reordered).toMatchObject({
      success: true,
      data: { responseBody: { id: noteIds.alphaUnordered, sortOrder: 0 } },
    })

    const deleted = await mutationRun((transaction) =>
      noteRepositoryDelete(transaction, fixture.userId, noteIds.alphaFirst, {
        organizationId: fixture.organizationId,
      }),
    )
    expect(deleted).toMatchObject({ success: true, data: { deleted: true, responseBody: { id: noteIds.alphaFirst } } })

    const remaining = await noteRepositoryList(database, fixture.userId)
    expect(remaining.success).toBe(true)
    if (!remaining.success) return
    expect(
      remaining.data.filter((note) => note.projectPath === "alpha").map((note) => [note.id, note.sortOrder]),
    ).toEqual([[noteIds.alphaUnordered, 0]])
    expect(
      remaining.data.filter((note) => note.projectPath === "beta").map((note) => [note.id, note.sortOrder]),
    ).toEqual([
      [noteIds.betaFirst, 0],
      [createdId, 1],
    ])
  },
)
