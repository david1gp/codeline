import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { Hono } from "hono"
import * as v from "valibot"
import type { AppEnvironment } from "../src/api/appEnvironment.js"
import { databaseConnectionClose } from "../src/database/databaseConnectionClose.js"
import { databaseConnectionCreate } from "../src/database/databaseConnectionCreate.js"
import { databaseMigrate } from "../src/database/databaseMigrate.js"
import { applicationUserTable } from "../src/identity/db/applicationUserTable.js"
import { apiProjectRoutesAdd } from "../src/project/api/apiProjectRoutesAdd.js"
import { apiSkillRoutesAdd } from "../src/skills/api/apiSkillRoutesAdd.js"
import { skillCatalogInspectionResponseSchema } from "../src/skills/api/skillCatalogInspectionResponseSchema.js"
import { skillPresetInspectionResponseSchema } from "../src/skills/api/skillPresetInspectionResponseSchema.js"
import { skillSelectionDefaultResponseSchema } from "../src/skills/api/skillSelectionDefaultResponseSchema.js"
import { skillSelectionInspectionResponseSchema } from "../src/skills/api/skillSelectionInspectionResponseSchema.js"
import { uuidv7 } from "../src/uuid/uuidv7.js"

const rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-skill-api-"))
const projectRoot = path.join(rootDirectory, "project")
const globalSkillsPath = path.join(rootDirectory, "global", "skills")
const databasePath = path.join(rootDirectory, "db.sqlite")
const userId = `skill-api-user-${uuidv7()}`
const otherUserId = `skill-api-other-user-${uuidv7()}`
const migrated = await databaseMigrate(databasePath)
if (!migrated.success) throw new Error(migrated.errorMessage)
const connection = databaseConnectionCreate(databasePath)
const database = connection.db
let projectId: string
let activeUserId = userId

const app = new Hono<AppEnvironment>()
app.use("*", async (context, next) => {
  context.set("requestIdentity", { userId: activeUserId })
  await next()
})
apiProjectRoutesAdd(app, { rootDirs: [rootDirectory] })
apiSkillRoutesAdd(app, { database, globalSkillsPath, rootDirs: [rootDirectory] })

beforeAll(async () => {
  await fs.mkdir(path.join(projectRoot, ".agents", "skills", "team"), { recursive: true })
  await fs.mkdir(path.join(globalSkillsPath, "global"), { recursive: true })
  await fs.mkdir(path.join(projectRoot, ".agents", "skill-presets"), { recursive: true })
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skills", "team", "SKILL.md"),
    ["---", "name: team", "description: Team skill", "---", "Team instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(globalSkillsPath, "global", "SKILL.md"),
    ["---", "name: global", "description: Global skill", "---", "Global instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(projectRoot, ".agents", "skill-presets", "focused.yaml"),
    [
      "version: 1",
      "name: focused",
      "description: Focused skills",
      "includeSkills:",
      "  - team",
      "  - global",
      "excludeSkills:",
      "  - global",
    ].join("\n"),
    "utf8",
  )
  await database.insert(applicationUserTable).values([
    { displayName: "Skill API User", id: userId },
    { displayName: "Skill API Other User", id: otherUserId },
  ])
  const list = await app.request("http://codeline.test/project/list")
  const projects = (await list.json()) as { projects: Array<{ id: string; label: string }> }
  projectId = projects.projects.find(({ label }) => label === "project")!.id
})

afterAll(async () => {
  await databaseConnectionClose(connection)
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

function projectQuery(): string {
  return `project=${encodeURIComponent(projectId)}`
}

function projectPathQuery(): string {
  return `projectPath=${encodeURIComponent(projectRoot)}`
}

test("authenticated skill inspection APIs return sanitized catalogs, presets, and effective selection", async () => {
  const catalogResponse = await app.request(`http://codeline.test/project/skills/catalog?${projectQuery()}`)
  expect(catalogResponse.status).toBe(200)
  const catalog = await catalogResponse.json()
  expect(v.safeParse(skillCatalogInspectionResponseSchema, catalog).success).toBe(true)
  expect(catalog).toMatchObject({
    projectId,
    skills: [
      { bundlePath: "global/skills/global", name: "global", source: "global" },
      { bundlePath: ".agents/skills/team", name: "team", source: "project" },
    ],
  })
  expect(JSON.stringify(catalog)).not.toContain(rootDirectory)

  const presetsResponse = await app.request(`http://codeline.test/project/skills/presets?${projectQuery()}`)
  expect(presetsResponse.status).toBe(200)
  const presets = await presetsResponse.json()
  expect(v.safeParse(skillPresetInspectionResponseSchema, presets).success).toBe(true)
  expect(presets).toMatchObject({
    presets: [{ displayName: "All", immutable: true, name: "all" }, { name: "focused" }],
  })

  const initialSelectionResponse = await app.request(`http://codeline.test/project/skills/selection?${projectQuery()}`)
  expect(initialSelectionResponse.status).toBe(200)
  const initialSelection = await initialSelectionResponse.json()
  expect(initialSelection).toMatchObject({
    preset: { displayName: "All", immutable: true, name: "all" },
    selection: {
      activeSkills: [{ name: "global" }, { name: "team" }],
      excludedSkillNames: [],
      presetName: "all",
      userOverride: { disabledSkills: [], enabledSkills: [] },
    },
  })

  const saved = await app.request("http://codeline.test/project/skill-selection-default", {
    body: JSON.stringify({
      override: { disabledSkills: ["team"], enabledSkills: ["global"] },
      presetName: "focused",
      projectPath: projectRoot,
    }),
    headers: { "Content-Type": "application/json" },
    method: "PUT",
  })
  expect(saved.status).toBe(200)
  const savedBody = await saved.json()
  expect(v.safeParse(skillSelectionDefaultResponseSchema, savedBody).success).toBe(true)
  expect(savedBody).toMatchObject({ presetName: "focused", projectPath: projectRoot, revision: 1 })
  const etag = saved.headers.get("ETag")
  expect(etag).toEqual(expect.any(String))

  const loaded = await app.request(`http://codeline.test/project/skill-selection-default?${projectPathQuery()}`)
  expect(loaded.status).toBe(200)
  expect(await loaded.json()).toMatchObject({ presetName: "focused", revision: 1 })
  const notModified = await app.request(`http://codeline.test/project/skill-selection-default?${projectPathQuery()}`, {
    headers: { "If-None-Match": etag as string },
  })
  expect(notModified.status).toBe(304)

  const selectionResponse = await app.request(`http://codeline.test/project/skills/selection?${projectQuery()}`)
  expect(selectionResponse.status).toBe(200)
  const selection = await selectionResponse.json()
  expect(v.safeParse(skillSelectionInspectionResponseSchema, selection).success).toBe(true)
  expect(selection).toMatchObject({
    preset: { name: "focused" },
    selection: {
      activeSkills: [],
      excludedSkillNames: ["global", "team"],
      presetName: "focused",
      userOverride: { disabledSkills: ["team"], enabledSkills: ["global"] },
    },
  })
})

test("skill defaults are authenticated, user/project scoped, and reject paths outside configured projects", async () => {
  const unauthenticated = new Hono<AppEnvironment>()
  apiSkillRoutesAdd(unauthenticated, { database, globalSkillsPath, rootDirs: [rootDirectory] })
  expect((await unauthenticated.request("http://codeline.test/project/skills/catalog")).status).toBe(401)
  expect((await unauthenticated.request("http://codeline.test/project/skill-selection-default")).status).toBe(401)

  activeUserId = otherUserId
  expect((await app.request(`http://codeline.test/project/skill-selection-default?${projectPathQuery()}`)).status).toBe(
    404,
  )
  activeUserId = userId
  expect(
    (
      await app.request(
        `http://codeline.test/project/skill-selection-default?projectPath=${encodeURIComponent(path.join(os.tmpdir(), "outside"))}`,
      )
    ).status,
  ).toBe(400)

  const deleted = await app.request(`http://codeline.test/project/skill-selection-default?${projectPathQuery()}`, {
    method: "DELETE",
  })
  expect(deleted.status).toBe(204)
  expect((await app.request(`http://codeline.test/project/skill-selection-default?${projectPathQuery()}`)).status).toBe(
    404,
  )
})
