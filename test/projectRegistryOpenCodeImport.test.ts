import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { createClient } from "@libsql/client"
import { Hono } from "hono"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { projectTable } from "../src/project/db/projectTable.js"
import { projectRegistryOpenCodeImport } from "../src/project/projectRegistryOpenCodeImport.js"

async function codelineDatabaseCreate() {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-codeline."))
  const filePath = path.join(directoryPath, "codeline.db")
  const migrated = await databaseMigrate(filePath)
  if (!migrated.success) {
    await fs.rm(directoryPath, { force: true, recursive: true })
    throw new Error(migrated.errorMessage)
  }

  const connection = databaseConnectionCreate(filePath)
  return {
    database: connection.db,
    dispose: async () => {
      await databaseConnectionClose(connection)
      await fs.rm(directoryPath, { force: true, recursive: true })
    },
  }
}

async function openCodeDatabaseCreate(setup: (client: ReturnType<typeof createClient>) => Promise<void>) {
  const directoryPath = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-source."))
  const filePath = path.join(directoryPath, "opencode.db")
  const client = createClient({ url: `file://${filePath}` })
  try {
    await setup(client)
  } finally {
    client.close()
  }

  return {
    filePath,
    dispose: () => fs.rm(directoryPath, { force: true, recursive: true }),
  }
}

async function openCodeProjectTablesCreate(client: ReturnType<typeof createClient>) {
  await client.execute("CREATE TABLE project (id TEXT PRIMARY KEY, worktree TEXT NOT NULL)")
  await client.execute(
    "CREATE TABLE project_directory (project_id TEXT NOT NULL, directory TEXT NOT NULL, PRIMARY KEY (project_id, directory))",
  )
}

test("imports only validated directory metadata without a session-table dependency and is idempotent", async () => {
  const rootsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-roots."))
  const projectDirectory = path.join(rootsDirectory, "project")
  const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-outside."))
  const symlinkDirectory = path.join(rootsDirectory, "linked-project")
  const codeline = await codelineDatabaseCreate()
  const openCode = await openCodeDatabaseCreate(async (client) => {
    await openCodeProjectTablesCreate(client)
    await client.execute("INSERT INTO project (id, worktree) VALUES (?, ?), (?, ?)", [
      "global",
      path.join(rootsDirectory, "global-project"),
      "fallback-project",
      path.join(rootsDirectory, "fallback-project"),
    ])
    await client.execute(
      "INSERT INTO project_directory (project_id, directory) VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)",
      [
        "project-one",
        `${projectDirectory}/.`,
        "project-two",
        projectDirectory,
        "outside-project",
        outsideDirectory,
        "symlink-project",
        symlinkDirectory,
        "missing-project",
        path.join(rootsDirectory, "missing-project"),
      ],
    )
  })

  try {
    await fs.mkdir(projectDirectory)
    await fs.symlink(projectDirectory, symlinkDirectory)
    await codeline.database.insert(applicationUserTable).values([
      { displayName: "OpenCode Import User One", id: "opencode-import-user-one" },
      { displayName: "OpenCode Import User Two", id: "opencode-import-user-two" },
    ])

    const first = await projectRegistryOpenCodeImport(
      codeline.database,
      "opencode-import-user-one",
      openCode.filePath,
      [rootsDirectory],
    )
    expect(first).toEqual({ success: true, data: { importedCount: 1 } })

    const repeated = await projectRegistryOpenCodeImport(
      codeline.database,
      "opencode-import-user-one",
      openCode.filePath,
      [rootsDirectory],
    )
    expect(repeated).toEqual({ success: true, data: { importedCount: 1 } })

    const second = await projectRegistryOpenCodeImport(
      codeline.database,
      "opencode-import-user-two",
      openCode.filePath,
      [rootsDirectory],
    )
    expect(second).toEqual({ success: true, data: { importedCount: 1 } })

    const projects = await codeline.database
      .select({ path: projectTable.path, userId: projectTable.userId })
      .from(projectTable)
      .orderBy(projectTable.userId)
    expect(projects).toEqual([
      { path: projectDirectory, userId: "opencode-import-user-one" },
      { path: projectDirectory, userId: "opencode-import-user-two" },
    ])

    const sourceClient = createClient({ url: `file://${openCode.filePath}` })
    try {
      const tables = await sourceClient.execute("SELECT name FROM sqlite_master WHERE type = 'table'")
      expect(tables.rows.map((row) => row.name)).not.toContain("session")
      expect(tables.rows.map((row) => row.name)).not.toContain("message")
      expect(tables.rows.map((row) => row.name)).not.toContain("workspace")
    } finally {
      sourceClient.close()
    }
  } finally {
    await codeline.dispose()
    await openCode.dispose()
    await fs.rm(rootsDirectory, { force: true, recursive: true })
    await fs.rm(outsideDirectory, { force: true, recursive: true })
  }
})

test("falls back to non-global project worktrees only when the directory table is empty", async () => {
  const rootsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-fallback-roots."))
  const fallbackDirectory = path.join(rootsDirectory, "fallback-project")
  const globalDirectory = path.join(rootsDirectory, "global-project")
  const outsideDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-fallback-outside."))
  const codeline = await codelineDatabaseCreate()
  const openCode = await openCodeDatabaseCreate(async (client) => {
    await openCodeProjectTablesCreate(client)
    await client.execute("INSERT INTO project (id, worktree) VALUES (?, ?), (?, ?), (?, ?)", [
      "global",
      globalDirectory,
      "fallback-project",
      fallbackDirectory,
      "outside-project",
      outsideDirectory,
    ])
  })

  try {
    await fs.mkdir(fallbackDirectory)
    await codeline.database.insert(applicationUserTable).values({
      displayName: "OpenCode Fallback User",
      id: "opencode-fallback-user",
    })

    const imported = await projectRegistryOpenCodeImport(
      codeline.database,
      "opencode-fallback-user",
      openCode.filePath,
      [rootsDirectory],
    )
    expect(imported).toEqual({ success: true, data: { importedCount: 1 } })
    expect(await codeline.database.select({ path: projectTable.path }).from(projectTable)).toEqual([
      { path: fallbackDirectory },
    ])
  } finally {
    await codeline.dispose()
    await openCode.dispose()
    await fs.rm(rootsDirectory, { force: true, recursive: true })
    await fs.rm(outsideDirectory, { force: true, recursive: true })
  }
})

test("OpenCode import is authenticated and scopes upserts to the request user", async () => {
  const rootsDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-opencode-import-api-roots."))
  const projectDirectory = path.join(rootsDirectory, "project")
  const codeline = await codelineDatabaseCreate()
  const openCode = await openCodeDatabaseCreate(async (client) => {
    await openCodeProjectTablesCreate(client)
    await client.execute("INSERT INTO project_directory (project_id, directory) VALUES (?, ?)", [
      "project-one",
      projectDirectory,
    ])
  })

  try {
    await fs.mkdir(projectDirectory)
    await codeline.database.insert(applicationUserTable).values([
      { displayName: "OpenCode API User One", id: "opencode-api-user-one" },
      { displayName: "OpenCode API User Two", id: "opencode-api-user-two" },
    ])
    let activeUserId: string | undefined
    const app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      if (activeUserId !== undefined) context.set("requestIdentity", { userId: activeUserId })
      await next()
    })
    apiProjectRoutesAdd(app, {
      database: codeline.database,
      openCodeDatabasePath: openCode.filePath,
      rootDirs: [rootsDirectory],
    })

    const unauthorized = await app.request("http://codeline.test/project/registry/import", { method: "POST" })
    expect(unauthorized.status).toBe(401)

    activeUserId = "opencode-api-user-one"
    const first = await app.request("http://codeline.test/project/registry/import", { method: "POST" })
    expect(first.status).toBe(200)
    expect(await first.json()).toEqual({ importedCount: 1 })

    activeUserId = "opencode-api-user-two"
    const second = await app.request("http://codeline.test/project/registry/import", { method: "POST" })
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual({ importedCount: 1 })

    const projects = await codeline.database
      .select({ path: projectTable.path, userId: projectTable.userId })
      .from(projectTable)
      .orderBy(projectTable.userId)
    expect(projects).toHaveLength(2)
    expect(new Set(projects.map((project) => project.userId))).toEqual(
      new Set(["opencode-api-user-one", "opencode-api-user-two"]),
    )
  } finally {
    await codeline.dispose()
    await openCode.dispose()
    await fs.rm(rootsDirectory, { force: true, recursive: true })
  }
})
