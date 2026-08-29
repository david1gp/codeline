import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"

describe("project registry HTTP routes", () => {
  let rootDirectory: string
  let projectRoot: string
  let outsideRoot: string
  let databasePath: string
  let app: Hono<AppEnvironment>
  let disposeDatabase: () => Promise<void>
  let activeUserId = "project-registry-api-user-one"
  const firstUserId = "project-registry-api-user-one"
  const secondUserId = "project-registry-api-user-two"

  beforeAll(async () => {
    rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-api-roots-"))
    projectRoot = path.join(rootDirectory, "project")
    outsideRoot = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-registry-api-outside-"))
    databasePath = path.join(rootDirectory, "db.sqlite")
    await fs.mkdir(projectRoot)
    await fs.writeFile(path.join(projectRoot, "README.md"), "registry project\n", "utf8")

    const migrated = await databaseMigrate(databasePath)
    if (!migrated.success) throw new Error(migrated.errorMessage)
    const connection = databaseConnectionCreate(databasePath)
    disposeDatabase = async () => {
      await databaseConnectionClose(connection)
    }
    app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      if (activeUserId.length > 0) context.set("requestIdentity", { userId: activeUserId })
      await next()
    })
    apiProjectRoutesAdd(app, { database: connection.db, rootDirs: [rootDirectory] })

    await connection.db.insert(applicationUserTable).values([
      { displayName: "Registry API User One", id: firstUserId },
      { displayName: "Registry API User Two", id: secondUserId },
    ])

    await fs.writeFile(path.join(outsideRoot, "outside.txt"), "outside\n", "utf8")
  })

  afterAll(async () => {
    await Promise.all([
      fs.rm(rootDirectory, { force: true, recursive: true }),
      fs.rm(outsideRoot, { force: true, recursive: true }),
      disposeDatabase(),
    ])
  })

  test("requires authentication and isolates registry CRUD by user", async () => {
    activeUserId = ""
    const unauthorized = await app.request("http://codeline.test/project/registry")
    expect(unauthorized.status).toBe(401)

    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: `${projectRoot}/.` }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(registered.status).toBe(200)

    const canonical = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(canonical.status).toBe(200)
    const firstBody = (await canonical.json()) as { project: { available: boolean; id: string; label: string } }
    expect(firstBody.project).toMatchObject({ available: true, label: "Registered Project" })
    expect(firstBody.project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)

    const firstList = await app.request("http://codeline.test/project/list")
    expect(await firstList.json()).toEqual({
      projects: [firstBody.project],
      truncated: false,
    })

    activeUserId = secondUserId
    const secondList = await app.request("http://codeline.test/project/registry")
    expect(await secondList.json()).toEqual({ projects: [], truncated: false })
    const hidden = await app.request(`http://codeline.test/project/registry/${firstBody.project.id}`)
    expect(hidden.status).toBe(404)
    expect(JSON.stringify(await hidden.json())).not.toContain(projectRoot)
    const hiddenFilesystem = await app.request(
      `http://codeline.test/project/text?project=${firstBody.project.id}&path=README.md`,
    )
    expect(hiddenFilesystem.status).toBe(404)

    const secondRegistration = await app.request("http://codeline.test/project/register", {
      body: JSON.stringify({ path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    expect(secondRegistration.status).toBe(200)
    const secondBody = (await secondRegistration.json()) as { project: { id: string } }
    expect(secondBody.project.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(secondBody.project.id).not.toBe(firstBody.project.id)

    const firstProjectRename = await app.request(`http://codeline.test/project/registry/${firstBody.project.id}`, {
      body: JSON.stringify({ displayName: "Should not be visible" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(firstProjectRename.status).toBe(404)
    const firstProjectRemove = await app.request(`http://codeline.test/project/remove/${firstBody.project.id}`, {
      method: "DELETE",
    })
    expect(firstProjectRemove.status).toBe(404)
  })

  test("renames and removes a project without touching its files", async () => {
    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id

    const renamed = await app.request(`http://codeline.test/project/rename/${projectId}`, {
      body: JSON.stringify({ displayName: "Renamed Project" }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    })
    expect(renamed.status).toBe(200)
    expect(await renamed.json()).toMatchObject({
      project: { id: projectId, label: "Renamed Project", available: true },
    })

    const removed = await app.request(`http://codeline.test/project/registry/${projectId}`, { method: "DELETE" })
    expect(removed.status).toBe(204)
    expect(await fs.readFile(path.join(projectRoot, "README.md"), "utf8")).toBe("registry project\n")
    expect((await (await app.request("http://codeline.test/project/registry")).json()).projects).toEqual([])
  })

  test("keeps unavailable registrations visible while rejecting unsafe registration and use", async () => {
    activeUserId = firstUserId
    const registered = await app.request("http://codeline.test/project/registry", {
      body: JSON.stringify({ displayName: "Registered Project", path: projectRoot }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    })
    const projectId = ((await registered.json()) as { project: { id: string } }).project.id

    expect(
      (
        await app.request("http://codeline.test/project/registry", {
          body: JSON.stringify({ path: outsideRoot }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(400)
    const symlinkPath = path.join(rootDirectory, "linked-project")
    await fs.symlink(outsideRoot, symlinkPath)
    expect(
      (
        await app.request("http://codeline.test/project/registry", {
          body: JSON.stringify({ path: symlinkPath }),
          headers: { "Content-Type": "application/json" },
          method: "POST",
        })
      ).status,
    ).toBe(400)

    await fs.rm(projectRoot, { force: true, recursive: true })
    const listed = await app.request("http://codeline.test/project/registry")
    expect(await listed.json()).toEqual({
      projects: [{ available: false, id: projectId, label: "Registered Project" }],
      truncated: false,
    })
    const resolved = await app.request(`http://codeline.test/project/resolve?project=${projectId}`)
    expect(resolved.status).toBe(200)
    expect(await resolved.json()).toEqual({
      project: { available: false, id: projectId, label: "Registered Project" },
    })
    const filesystem = await app.request(`http://codeline.test/project/text?project=${projectId}&path=README.md`)
    expect(filesystem.status).toBe(404)
  })
})
