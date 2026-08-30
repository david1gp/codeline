import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createResult, createResultError } from "@adaptive-ds/result"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { projectConfiguredRootsReconcile } from "../src/project/db/projectConfiguredRootsReconcile.js"
import { projectTable } from "../src/project/db/projectTable.js"

const sameUserId = "project-registry-reconcile-gate-same-user"
const firstUserId = "project-registry-reconcile-gate-first-user"
const secondUserId = "project-registry-reconcile-gate-second-user"
const retryUserId = "project-registry-reconcile-gate-retry-user"
const visibilityUserId = "project-registry-reconcile-gate-visibility-user"

type ProjectConfiguredRootsReconcile = typeof projectConfiguredRootsReconcile

function deferredCreate(): { promise: Promise<void>; resolve: () => void } {
  let resolvePromise!: () => void
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve
  })
  return { promise, resolve: resolvePromise }
}

describe("project registry list configured-root reconciliation gate", () => {
  let rootDirectory: string
  let databaseDirectory: string
  let database: ReturnType<typeof databaseConnectionCreate>["db"]
  let disposeDatabase: () => Promise<void>

  beforeAll(async () => {
    rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-gate-roots-"))
    databaseDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-gate-database-"))
    const databasePath = path.join(databaseDirectory, "db.sqlite")
    const migrated = await databaseMigrate(databasePath)
    if (!migrated.success) throw new Error(migrated.errorMessage)

    const connection = databaseConnectionCreate(databasePath)
    database = connection.db
    disposeDatabase = async () => {
      await databaseConnectionClose(connection)
    }
    await database.insert(applicationUserTable).values([
      { displayName: "Same User", id: sameUserId },
      { displayName: "First User", id: firstUserId },
      { displayName: "Second User", id: secondUserId },
      { displayName: "Retry User", id: retryUserId },
      { displayName: "Visibility User", id: visibilityUserId },
    ])
  })

  afterAll(async () => {
    await disposeDatabase()
    await Promise.all([
      fs.rm(rootDirectory, { force: true, recursive: true }),
      fs.rm(databaseDirectory, { force: true, recursive: true }),
    ])
  })

  function registryApp(options: { reconcile?: ProjectConfiguredRootsReconcile; rootDirs?: readonly string[] } = {}) {
    const app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      const userId = context.req.header("x-user-id")
      if (userId !== undefined) context.set("requestIdentity", { userId })
      await next()
    })
    apiProjectRoutesAdd(app, {
      database,
      ...(options.reconcile === undefined ? {} : { projectConfiguredRootsReconcile: options.reconcile }),
      rootDirs: options.rootDirs ?? [rootDirectory],
    })
    return app
  }

  function registryListRequest(app: Hono<AppEnvironment>, userId: string) {
    return app.request("http://codeline.test/project/registry", {
      headers: { "x-user-id": userId },
    })
  }

  test("deduplicates concurrent and later list reconciliation for one user", async () => {
    let calls = 0
    const started = deferredCreate()
    const released = deferredCreate()
    const app = registryApp({
      reconcile: async () => {
        calls += 1
        started.resolve()
        await released.promise
        return createResult([])
      },
    })

    const first = registryListRequest(app, sameUserId)
    await started.promise
    const second = registryListRequest(app, sameUserId)
    await Promise.resolve()
    expect(calls).toBe(1)
    released.resolve()

    expect((await Promise.all([first, second])).every((response) => response.status === 200)).toBe(true)
    expect((await registryListRequest(app, sameUserId)).status).toBe(200)
    expect(calls).toBe(1)
  })

  test("runs independently per user without exposing another user's rows", async () => {
    const projectPath = path.join(rootDirectory, "isolated-project")
    await fs.mkdir(projectPath)
    await database.insert(projectTable).values({
      displayName: "First User Project",
      id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f90",
      path: projectPath,
      userId: firstUserId,
    })
    const calls: string[] = []
    const app = registryApp({
      reconcile: async (_database, userId, rootDirs) => {
        calls.push(`${userId}:${rootDirs.join(",")}`)
        return createResult([])
      },
    })

    const [first, second] = await Promise.all([
      registryListRequest(app, firstUserId),
      registryListRequest(app, secondUserId),
    ])
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect((await first.json()).projects).toEqual([
      expect.objectContaining({ id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1f90", label: "First User Project" }),
    ])
    expect((await second.json()).projects).toEqual([])
    expect(calls).toHaveLength(2)
    expect(calls.map((call) => call.split(":")[0]).sort()).toEqual([firstUserId, secondUserId].sort())

    await registryListRequest(app, firstUserId)
    await registryListRequest(app, secondUserId)
    expect(calls).toHaveLength(2)
  })

  test("fails the list on reconciliation failure and retries the next request", async () => {
    let calls = 0
    const app = registryApp({
      reconcile: async () => {
        calls += 1
        return calls === 1
          ? createResultError("testProjectConfiguredRootsReconcile", "configured roots unavailable")
          : createResult([])
      },
    })

    const failed = await registryListRequest(app, retryUserId)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({
      error: {
        code: "internal_server_error",
        message: "The project registry request could not be completed.",
      },
    })
    expect((await registryListRequest(app, retryUserId)).status).toBe(200)
    expect((await registryListRequest(app, retryUserId)).status).toBe(200)
    expect(calls).toBe(2)
  })

  test("makes configured-root projects visible in the first registry list", async () => {
    const configuredRoot = path.join(rootDirectory, "configured-root")
    const projectPath = path.join(configuredRoot, "first-load-project")
    await fs.mkdir(projectPath, { recursive: true })

    const listed = await registryListRequest(registryApp({ rootDirs: [configuredRoot] }), visibilityUserId)
    expect(listed.status).toBe(200)
    expect(await listed.json()).toMatchObject({
      folders: [expect.objectContaining({ label: "configured-root" })],
      projects: [expect.objectContaining({ label: "first-load-project" })],
    })
  })
})
