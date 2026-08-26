import { afterAll, beforeAll, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { createResultErrorCode } from "@adaptive-ds/result"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { apiSessionExecutionSelectionDefaultRoutesAdd } from "../src/session/api/apiSessionExecutionSelectionDefaultRoutesAdd.js"
import { sessionExecutionSelectionDefaultResponseSchema } from "../src/session/api/sessionExecutionSelectionDefaultResponseSchema.js"
import { sessionExecutionSelectionErrorCodes } from "../src/session/errors/sessionExecutionSelectionErrorCodes.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootPath = await mkdtemp(path.join(os.tmpdir(), "codeline-selection-default-api."))
const projectPath = path.join(rootPath, "project")
await mkdir(projectPath)
const databasePath = path.join(rootPath, "db.sqlite")
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
const userId = `selection-default-api-user-${uuidv7()}`
const otherUserId = `selection-default-api-other-user-${uuidv7()}`
let activeUserId = userId
const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("requestIdentity", { userId: activeUserId })
  await next()
})
apiSessionExecutionSelectionDefaultRoutesAdd(app, { database, projectRootDirs: [rootPath] })

const selection = {
  tools: {
    primary: { agentId: "api-primary", tools: { bash: true, webfetch: false } },
    selectableSubagents: [],
  },
  version: 1 as const,
}

beforeAll(async () => {
  await database.insert(applicationUserTable).values([
    { displayName: "Selection Default API User", id: userId },
    { displayName: "Selection Default API Other User", id: otherUserId },
  ])
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await rm(rootPath, { force: true, recursive: true })
})

function projectQuery(pathValue = projectPath): string {
  return `?projectPath=${encodeURIComponent(pathValue)}`
}

test("authenticated default execution selection API loads, upserts, scopes, and deletes", async () => {
  const put = await app.request("http://codeline.test/project/execution-selection-default", {
    body: JSON.stringify({ executionSelection: selection, projectPath }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  })
  expect(put.status).toBe(200)
  const putBody = await put.json()
  expect(v.safeParse(sessionExecutionSelectionDefaultResponseSchema, putBody).success).toBe(true)
  expect(putBody).toMatchObject({ projectPath, revision: 1, executionSelection: selection })
  expect(put.headers.get("ETag")).toEqual(expect.any(String))

  const loaded = await app.request(`http://codeline.test/project/execution-selection-default${projectQuery()}`)
  expect(loaded.status).toBe(200)
  expect(await loaded.json()).toMatchObject({ projectPath, revision: 1, executionSelection: selection })
  const notModified = await app.request(`http://codeline.test/project/execution-selection-default${projectQuery()}`, {
    headers: { "If-None-Match": loaded.headers.get("ETag") as string },
  })
  expect(notModified.status).toBe(304)

  activeUserId = otherUserId
  expect((await app.request(`http://codeline.test/project/execution-selection-default${projectQuery()}`)).status).toBe(
    404,
  )
  activeUserId = userId
  expect(
    (
      await app.request(
        `http://codeline.test/project/execution-selection-default${projectQuery(path.join(os.tmpdir(), "outside"))}`,
      )
    ).status,
  ).toBe(400)

  const deleted = await app.request(`http://codeline.test/project/execution-selection-default${projectQuery()}`, {
    method: "DELETE",
  })
  expect(deleted.status).toBe(204)
  expect((await app.request(`http://codeline.test/project/execution-selection-default${projectQuery()}`)).status).toBe(
    404,
  )
})

test("default execution selection API requires an authenticated user", async () => {
  const unauthenticated = new Hono<AppEnvironment>()
  apiSessionExecutionSelectionDefaultRoutesAdd(unauthenticated, { database, projectRootDirs: [rootPath] })
  const response = await unauthenticated.request(
    `http://codeline.test/project/execution-selection-default${projectQuery()}`,
  )
  expect(response.status).toBe(401)
})

test("default execution selection API classifies action failures by typed code", async () => {
  const validationApp = new Hono<AppEnvironment>()
  validationApp.use("*", async (context, next) => {
    context.set("requestIdentity", { userId })
    await next()
  })
  apiSessionExecutionSelectionDefaultRoutesAdd(validationApp, {
    database,
    projectRootDirs: [rootPath],
    sessionExecutionSelectionDefaultLoad: async () =>
      createResultErrorCode(
        "test",
        "An unrelated validation message.",
        sessionExecutionSelectionErrorCodes.projectPathInvalid,
      ),
  })
  const validationResponse = await validationApp.request(
    `http://codeline.test/project/execution-selection-default${projectQuery()}`,
  )
  expect(validationResponse.status).toBe(400)

  const internalApp = new Hono<AppEnvironment>()
  internalApp.use("*", async (context, next) => {
    context.set("requestIdentity", { userId })
    await next()
  })
  apiSessionExecutionSelectionDefaultRoutesAdd(internalApp, {
    database,
    projectRootDirs: [rootPath],
    sessionExecutionSelectionDefaultLoad: async () =>
      createResultErrorCode("test", "The project path is invalid.", "session.execution-selection.unexpected"),
  })
  const internalResponse = await internalApp.request(
    `http://codeline.test/project/execution-selection-default${projectQuery()}`,
  )
  expect(internalResponse.status).toBe(500)
})
