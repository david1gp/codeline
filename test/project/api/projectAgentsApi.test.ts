import { expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../../../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../../../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../../../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../../../src/database/databaseMigrate.js"
import { applicationUserTable } from "../../../src/identity/db/applicationUserTable.js"
import { apiProjectRoutesAdd } from "../../../src/project/api/apiProjectRoutesAdd.js"
import { projectApiAgentsResponseSchema } from "../../../src/project/api/projectApiAgentsResponseSchema.js"
import { providerAgentCatalogLoad } from "../../../src/providers/catalog/providerAgentCatalogLoad.js"

test("project agent catalog authenticates, isolates projects and redacts local executable agents", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-project-agents-api-"))
  const databasePath = path.join(root, "db.sqlite")
  const first = path.join(root, "first")
  const second = path.join(root, "second")
  await fs.mkdir(path.join(first, ".agents", "agents"), { recursive: true })
  await fs.mkdir(second)
  const catalog = await providerAgentCatalogLoad(process.cwd())
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  const globalId = catalog.data.agents[0]?.id
  expect(globalId).toBeDefined()
  if (globalId === undefined) return
  await fs.writeFile(path.join(first, ".agents", "agents", `${globalId}.md`), "---\nmode: primary\ndescription: Project override\n---\nPrivate prompt")
  await fs.writeFile(path.join(first, ".agents", "agents", "project-only.md"), "---\nmode: primary\n---\nPrivate prompt")
  const migrated = await databaseMigrate(databasePath)
  expect(migrated.success).toBe(true)
  const connection = databaseConnectionCreate(databasePath)
  try {
    await connection.db.insert(applicationUserTable).values([
      { id: "agent-owner", displayName: "Owner" }, { id: "agent-outsider", displayName: "Outsider" },
    ])
    let userId = "agent-owner"
    const app = new Hono<AppEnvironment>()
    app.use("*", async (context, next) => {
      if (userId) context.set("requestIdentity", { userId })
      await next()
    })
    apiProjectRoutesAdd(app, { database: connection.db, rootDirs: [root], providerAgentCatalog: catalog.data })
    const register = async (projectPath: string) => {
      const result = await app.request("http://codeline.test/project/registry", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: projectPath }),
      })
      expect(result.status).toBe(200)
      return ((await result.json()) as { project: { id: string } }).project.id
    }
    const firstId = await register(first)
    const secondId = await register(second)
    const url = (id: string) => `http://codeline.test/project/agents?project=${id}`
    const response = await app.request(url(firstId))
    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("private, no-cache")
    const body = v.parse(projectApiAgentsResponseSchema, await response.json())
    expect(body.projectAgentIds).toEqual([globalId, "project-only"].sort())
    expect(body.agents.find(({ id }) => id === globalId)?.description).toBe("Project override")
    expect(body.agents.find(({ id }) => id === "project-only")?.mode).toBe("primary")
    for (const forbidden of ["prompt", "permission", "tools", "connection", "Private prompt"]) {
      expect(JSON.stringify(body)).not.toContain(forbidden)
    }
    const other = v.parse(projectApiAgentsResponseSchema, await (await app.request(url(secondId))).json())
    expect(other.projectAgentIds).toEqual([])
    expect(other.agents.some(({ id }) => id === "project-only")).toBe(false)
    userId = "agent-outsider"
    expect((await app.request(url(firstId))).status).toBe(404)
    userId = ""
    expect((await app.request(url(firstId))).status).toBe(401)
  } finally {
    await databaseConnectionClose(connection)
    await fs.rm(root, { recursive: true, force: true })
  }
})
