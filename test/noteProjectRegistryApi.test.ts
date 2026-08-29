import { afterAll, beforeAll, expect, test } from "bun:test"
import { randomBytes } from "node:crypto"
import { mkdir, mkdtemp, rm, symlink, unlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { organizationMemberTable } from "../src/identity/db/organizationMemberTable.js"
import { organizationTable } from "../src/identity/db/organizationTable.js"
import { journalCursorCodecCreate } from "../src/journal/actions/journalCursorCodecCreate.js"
import { apiNoteRoutesAdd } from "../src/note/api/apiNoteRoutesAdd.js"
import { noteTable } from "../src/note/db/noteTable.js"
import { projectRegistryRepositoryDelete } from "../src/project/db/projectRegistryRepositoryDelete.js"
import { projectRegistryRepositoryUpsert } from "../src/project/db/projectRegistryRepositoryUpsert.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"
import { appSseTestDependenciesCreate } from "./appSseTestDependenciesCreate.js"

const databaseRoot = await mkdtemp(path.join(os.tmpdir(), "codeline-note-project-registry-"))
const databasePath = path.join(databaseRoot, "db.sqlite")
const projectsRoot = path.join(databaseRoot, "projects")
const projectOnePath = path.join(projectsRoot, "one")
const projectTwoPath = path.join(projectsRoot, "two")
const historicalPath = path.join(projectsRoot, "historical")
const userOneId = `note-project-user-one-${uuidv7()}`
const userTwoId = `note-project-user-two-${uuidv7()}`
const organizationId = `note-project-organization-${uuidv7()}`
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const journalCursorCodec = journalCursorCodecCreate({ randomBytes, secret: `note-project-${uuidv7()}` })
if (!journalCursorCodec.success) throw new Error(journalCursorCodec.errorMessage)
const journal = appSseTestDependenciesCreate(journalCursorCodec.data)
let activeUserId = userOneId
const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("requestIdentity", { organizationId, userId: activeUserId })
  await next()
})
apiNoteRoutesAdd(app, {
  database,
  journalPostCommitPublish: journal.journalPostCommitPublish,
  projectRootDirs: [projectsRoot],
})

const jsonHeaders = { "Content-Type": "application/json" }

beforeAll(async () => {
  await mkdir(projectOnePath, { recursive: true })
  await mkdir(projectTwoPath)
  await mkdir(historicalPath)
  await database.insert(applicationUserTable).values([
    { displayName: "Note Project User One", id: userOneId },
    { displayName: "Note Project User Two", id: userTwoId },
  ])
  await database.insert(organizationTable).values({
    externalId: organizationId,
    id: organizationId,
    name: "Note Project Organization",
  })
  await database.insert(organizationMemberTable).values([
    {
      createdAt: new Date(),
      issuer: "urn:test:note-project",
      organizationId,
      subject: userOneId,
      updatedAt: new Date(),
      userId: userOneId,
    },
    {
      createdAt: new Date(),
      issuer: "urn:test:note-project",
      organizationId,
      subject: userTwoId,
      updatedAt: new Date(),
      userId: userTwoId,
    },
  ])
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(databaseRoot, { force: true, recursive: true })
})

test("notes resolve authorized project IDs, preserve path snapshots, and reject cross-user or raw references", async () => {
  const firstProject = await projectRegistryRepositoryUpsert(database, userOneId, { path: projectOnePath })
  const secondProject = await projectRegistryRepositoryUpsert(database, userOneId, { path: projectTwoPath })
  const otherProject = await projectRegistryRepositoryUpsert(database, userTwoId, { path: projectOnePath })
  expect(firstProject.success && secondProject.success && otherProject.success).toBe(true)
  if (!firstProject.success || !secondProject.success || !otherProject.success) return

  const crossUser = await app.request("http://codeline.test/notes", {
    body: JSON.stringify({
      content: "cross user",
      createdAt: 1,
      id: `note-cross-user-${uuidv7()}`,
      projectId: otherProject.data.id,
      updatedAt: 1,
    }),
    headers: jsonHeaders,
    method: "POST",
  })
  expect(crossUser.status).toBe(404)

  const rawPath = await app.request("http://codeline.test/notes", {
    body: JSON.stringify({
      content: "raw path",
      createdAt: 1,
      id: `note-raw-path-${uuidv7()}`,
      projectPath: projectOnePath,
      updatedAt: 1,
    }),
    headers: jsonHeaders,
    method: "POST",
  })
  expect(rawPath.status).toBe(400)

  const unregistered = await app.request("http://codeline.test/notes", {
    body: JSON.stringify({
      content: "unregistered",
      createdAt: 1,
      id: `note-unregistered-${uuidv7()}`,
      projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f31",
      updatedAt: 1,
    }),
    headers: jsonHeaders,
    method: "POST",
  })
  expect(unregistered.status).toBe(404)

  const created = await app.request("http://codeline.test/notes", {
    body: JSON.stringify({
      content: "created",
      createdAt: 1,
      id: `note-created-${uuidv7()}`,
      projectId: firstProject.data.id,
      updatedAt: 1,
    }),
    headers: jsonHeaders,
    method: "POST",
  })
  expect(created.status).toBe(201)
  const createdBody = (await created.json()) as { id: string; projectId: string; projectPath: string }
  expect(createdBody).toMatchObject({ projectId: firstProject.data.id, projectPath: projectOnePath })

  const createdEtag = created.headers.get("ETag")
  activeUserId = userTwoId
  const crossUserUpdate = await app.request(`http://codeline.test/notes/${createdBody.id}`, {
    body: JSON.stringify({ content: "cross user update", projectId: firstProject.data.id, updatedAt: 2 }),
    headers: { ...jsonHeaders, "If-Match": createdEtag ?? "" },
    method: "PATCH",
  })
  expect(crossUserUpdate.status).toBe(404)
  activeUserId = userOneId

  const updated = await app.request(`http://codeline.test/notes/${createdBody.id}`, {
    body: JSON.stringify({
      content: "updated",
      projectId: secondProject.data.id,
      updatedAt: 2,
    }),
    headers: { ...jsonHeaders, "If-Match": createdEtag ?? "" },
    method: "PATCH",
  })
  expect(updated.status).toBe(200)
  expect(await updated.json()).toMatchObject({ projectId: secondProject.data.id, projectPath: projectTwoPath })

  const stored = await database.select().from(noteTable)
  expect(stored.find((note) => note.id === createdBody.id)?.projectPath).toBe(projectTwoPath)

  await rm(projectTwoPath, { force: true, recursive: true })
  const unavailableAssignment = await app.request("http://codeline.test/notes")
  const unavailableNotes = (await unavailableAssignment.json()) as Array<{
    content: string
    id: string
    projectId: string
    projectPath: string
  }>
  expect(unavailableNotes.find((note) => note.id === createdBody.id)).toMatchObject({
    projectId: secondProject.data.id,
    projectPath: projectTwoPath,
  })

  const unavailableDetail = unavailableNotes.find((note) => note.id === createdBody.id)
  if (unavailableDetail === undefined) return
  const retained = await app.request(`http://codeline.test/notes/${createdBody.id}`, {
    body: JSON.stringify({ content: "retained", projectId: unavailableDetail.projectId, updatedAt: 3 }),
    headers: {
      ...jsonHeaders,
      "If-Match": (await app.request(`http://codeline.test/notes/${createdBody.id}`)).headers.get("ETag") ?? "",
    },
    method: "PATCH",
  })
  expect(retained.status).toBe(200)
  expect(await retained.json()).toMatchObject({ projectId: secondProject.data.id, projectPath: projectTwoPath })

  const unavailableCreate = await app.request("http://codeline.test/notes", {
    body: JSON.stringify({
      content: "unavailable",
      createdAt: 4,
      id: `note-unavailable-${uuidv7()}`,
      projectId: secondProject.data.id,
      updatedAt: 4,
    }),
    headers: jsonHeaders,
    method: "POST",
  })
  expect(unavailableCreate.status).toBe(404)

  await projectRegistryRepositoryDelete(database, userOneId, secondProject.data.id)
  const removedAssignment = await app.request("http://codeline.test/notes")
  expect((await removedAssignment.json()).find((note: { id: string }) => note.id === createdBody.id)).toMatchObject({
    projectId: null,
    projectPath: projectTwoPath,
  })

  const removedDetail = await app.request(`http://codeline.test/notes/${createdBody.id}`)
  const removedReordered = await app.request(`http://codeline.test/notes/${createdBody.id}/reorder`, {
    body: JSON.stringify({ direction: "up", projectId: secondProject.data.id }),
    headers: { ...jsonHeaders, "If-Match": removedDetail.headers.get("ETag") ?? "" },
    method: "POST",
  })
  expect(removedReordered.status).toBe(404)

  const historicalId = `note-historical-${uuidv7()}`
  await database.insert(noteTable).values({
    content: "historical",
    createdAt: new Date(5),
    id: historicalId,
    projectPath: historicalPath,
    revision: 1,
    sortOrder: 0,
    updatedAt: new Date(5),
    userId: userOneId,
  })
  const historical = await app.request("http://codeline.test/notes")
  expect(await historical.json()).toContainEqual({
    content: "historical",
    createdAt: 5,
    id: historicalId,
    projectId: null,
    projectPath: historicalPath,
    revision: 1,
    sortOrder: 0,
    updatedAt: 5,
    userId: userOneId,
  })
})

test("notes remain private when the authenticated registry user changes", async () => {
  activeUserId = userTwoId
  const list = await app.request("http://codeline.test/notes")
  expect(list.status).toBe(200)
  expect(await list.json()).toEqual([])
  activeUserId = userOneId
})

test("note responses canonicalize available historical project paths without rewriting snapshots", async () => {
  activeUserId = userOneId
  const projectPath = path.join(projectsRoot, "legacy-syntax")
  const historicalProjectPath = `${projectPath}/.`
  const project = await projectRegistryRepositoryUpsert(database, userOneId, { path: projectPath })
  expect(project.success).toBe(true)
  if (!project.success) return

  const noteId = `note-legacy-syntax-${uuidv7()}`
  const reorderNoteId = `note-legacy-syntax-reorder-${uuidv7()}`
  await mkdir(projectPath)
  await database.insert(noteTable).values([
    {
      content: "legacy syntax",
      createdAt: new Date(6),
      id: noteId,
      projectPath: historicalProjectPath,
      revision: 1,
      sortOrder: 0,
      updatedAt: new Date(6),
      userId: userOneId,
    },
    {
      content: "legacy syntax reorder",
      createdAt: new Date(7),
      id: reorderNoteId,
      projectPath: historicalProjectPath,
      revision: 1,
      sortOrder: 1,
      updatedAt: new Date(7),
      userId: userOneId,
    },
  ])

  try {
    const available = await app.request("http://codeline.test/notes")
    const availableNotes = (await available.json()) as Array<{ id: string; projectId: string; projectPath: string }>
    expect(availableNotes.find((note) => note.id === noteId)).toMatchObject({
      projectId: project.data.id,
      projectPath: historicalProjectPath,
    })
    expect(availableNotes.find((note) => note.id === reorderNoteId)).toMatchObject({
      projectId: project.data.id,
      projectPath: historicalProjectPath,
    })

    const beforeUpdate = await app.request(`http://codeline.test/notes/${noteId}`)
    const updated = await app.request(`http://codeline.test/notes/${noteId}`, {
      body: JSON.stringify({ content: "legacy syntax updated", projectId: project.data.id, updatedAt: 8 }),
      headers: { ...jsonHeaders, "If-Match": beforeUpdate.headers.get("ETag") ?? "" },
      method: "PATCH",
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ projectId: project.data.id, projectPath: historicalProjectPath })
    const afterUpdate = await database.select().from(noteTable).where(eq(noteTable.id, noteId))
    expect(afterUpdate[0]?.projectPath).toBe(historicalProjectPath)

    const beforeReorder = await app.request(`http://codeline.test/notes/${reorderNoteId}`)
    const reordered = await app.request(`http://codeline.test/notes/${reorderNoteId}/reorder`, {
      body: JSON.stringify({ direction: "up", projectId: project.data.id }),
      headers: { ...jsonHeaders, "If-Match": beforeReorder.headers.get("ETag") ?? "" },
      method: "POST",
    })
    expect(reordered.status).toBe(200)
    expect(await reordered.json()).toMatchObject({ projectId: project.data.id, projectPath: historicalProjectPath })
    const afterReorder = await database.select().from(noteTable).where(eq(noteTable.id, reorderNoteId))
    expect(afterReorder[0]?.projectPath).toBe(historicalProjectPath)

    const rejected = await app.request(`http://codeline.test/notes/${noteId}`, {
      body: JSON.stringify({
        content: "should remain unchanged",
        projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f32",
        updatedAt: 9,
      }),
      headers: { ...jsonHeaders, "If-Match": updated.headers.get("ETag") ?? "" },
      method: "PATCH",
    })
    expect(rejected.status).toBe(404)

    await rm(projectPath, { force: true, recursive: true })
    const unavailable = await app.request("http://codeline.test/notes")
    const unavailableNotes = (await unavailable.json()) as Array<{
      id: string
      projectId: string
      projectPath: string
    }>
    expect(unavailableNotes.find((note) => note.id === noteId)).toMatchObject({
      projectId: project.data.id,
      projectPath: historicalProjectPath,
    })
  } finally {
    await database.delete(noteTable).where(eq(noteTable.id, noteId))
    await database.delete(noteTable).where(eq(noteTable.id, reorderNoteId))
    await projectRegistryRepositoryDelete(database, userOneId, project.data.id)
    await rm(projectPath, { force: true, recursive: true })
  }
})

test("formerly symlinked historical note paths retain their response identity for mutations", async () => {
  activeUserId = userOneId
  const targetPath = path.join(projectsRoot, "formerly-linked-target")
  const historicalProjectPath = path.join(projectsRoot, "formerly-linked")
  const noteId = `note-formerly-linked-${uuidv7()}`
  const reorderNoteId = `note-formerly-linked-reorder-${uuidv7()}`
  const project = await projectRegistryRepositoryUpsert(database, userOneId, { path: targetPath })
  expect(project.success).toBe(true)
  if (!project.success) return

  await mkdir(targetPath)
  await symlink(targetPath, historicalProjectPath)
  await database.insert(noteTable).values([
    {
      content: "formerly linked",
      createdAt: new Date(10),
      id: noteId,
      projectPath: historicalProjectPath,
      revision: 1,
      sortOrder: 0,
      updatedAt: new Date(10),
      userId: userOneId,
    },
    {
      content: "formerly linked reorder",
      createdAt: new Date(11),
      id: reorderNoteId,
      projectPath: historicalProjectPath,
      revision: 1,
      sortOrder: 1,
      updatedAt: new Date(11),
      userId: userOneId,
    },
  ])

  try {
    const historicalId = project.data.id
    const linked = await app.request("http://codeline.test/notes")
    const linkedNotes = (await linked.json()) as Array<{ id: string; projectId: string; projectPath: string }>
    expect(linkedNotes.find((note) => note.id === noteId)).toMatchObject({
      projectId: null,
      projectPath: historicalProjectPath,
    })

    await unlink(historicalProjectPath)
    const unavailable = await app.request("http://codeline.test/notes")
    const unavailableNotes = (await unavailable.json()) as Array<{
      id: string
      projectId: string
      projectPath: string
    }>
    expect(unavailableNotes.find((note) => note.id === noteId)).toMatchObject({
      projectId: null,
      projectPath: historicalProjectPath,
    })

    const beforeUpdate = await app.request(`http://codeline.test/notes/${noteId}`)
    const updated = await app.request(`http://codeline.test/notes/${noteId}`, {
      body: JSON.stringify({ content: "formerly linked updated", projectId: historicalId, updatedAt: 12 }),
      headers: { ...jsonHeaders, "If-Match": beforeUpdate.headers.get("ETag") ?? "" },
      method: "PATCH",
    })
    expect(updated.status).toBe(200)
    expect(await updated.json()).toMatchObject({ projectId: historicalId, projectPath: targetPath })

    const beforeReorder = await app.request(`http://codeline.test/notes/${reorderNoteId}`)
    const reordered = await app.request(`http://codeline.test/notes/${reorderNoteId}/reorder`, {
      body: JSON.stringify({ direction: "up", projectId: historicalId }),
      headers: { ...jsonHeaders, "If-Match": beforeReorder.headers.get("ETag") ?? "" },
      method: "POST",
    })
    expect(reordered.status).toBe(400)

    const stored = await database.select().from(noteTable).where(eq(noteTable.userId, userOneId))
    expect(stored.find((note) => note.id === noteId)?.projectPath).toBe(targetPath)
    expect(stored.find((note) => note.id === reorderNoteId)?.projectPath).toBe(historicalProjectPath)

    const rejected = await app.request(`http://codeline.test/notes/${noteId}`, {
      body: JSON.stringify({
        content: "should remain unchanged",
        projectId: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f33",
        updatedAt: 13,
      }),
      headers: { ...jsonHeaders, "If-Match": updated.headers.get("ETag") ?? "" },
      method: "PATCH",
    })
    expect(rejected.status).toBe(404)
  } finally {
    await database.delete(noteTable).where(eq(noteTable.id, noteId))
    await database.delete(noteTable).where(eq(noteTable.id, reorderNoteId))
    await projectRegistryRepositoryDelete(database, userOneId, project.data.id)
    await rm(historicalProjectPath, { force: true, recursive: true })
    await rm(targetPath, { force: true, recursive: true })
  }
})
