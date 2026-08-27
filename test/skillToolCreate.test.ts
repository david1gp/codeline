import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { skillCatalogDiscover } from "../src/skills/actions/skillCatalogDiscover.js"
import { skillToolCreate } from "../src/skills/runtime/skillToolCreate.js"

let rootDirectory: string
let globalSkillsPath: string
let projectRoot: string

beforeAll(async () => {
  rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-skill-tool-"))
  globalSkillsPath = path.join(rootDirectory, "global", "skills")
  projectRoot = path.join(rootDirectory, "project")
  const skillsPath = path.join(projectRoot, ".agents", "skills")
  await fs.mkdir(path.join(skillsPath, "demo", "docs"), { recursive: true })
  await fs.mkdir(path.join(skillsPath, "inactive"), { recursive: true })
  await fs.writeFile(
    path.join(skillsPath, "demo", "SKILL.md"),
    ["---", "name: demo", "description: Demo skill", "---", "Use the demo instructions."].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(skillsPath, "demo", "docs", "reference.md"), "Snapshotted reference.", "utf8")
  await fs.writeFile(
    path.join(skillsPath, "inactive", "SKILL.md"),
    ["---", "name: inactive", "description: Inactive skill", "---", "Do not load this."].join("\n"),
    "utf8",
  )
})

afterAll(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("lists active snapshotted skills and loads only their snapshotted resources", async () => {
  const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  const sourceSkills = structuredClone(catalog.data.skills)
  const demo = sourceSkills.find(({ name }) => name === "demo")
  if (demo === undefined) return
  const tool = skillToolCreate({ activeSkills: [demo] })
  demo.body = "Changed after tool creation."
  const context = {
    outputLimit: 100_000,
    signal: new AbortController().signal,
    timeoutMs: null,
    toolCallId: "skill-call",
  }

  const listing = await tool.execute(context, { name: "demo" })
  expect(listing).toMatchObject({ success: true, data: { directory: "demo", name: "demo" } })
  if (!listing.success) return
  expect(listing.data.output).toContain("Use the demo instructions.")
  expect(listing.data.output).not.toContain("Changed after tool creation.")
  expect(listing.data.output).toContain("<file>docs/reference.md</file>")
  expect(listing.data.output).not.toContain("Snapshotted reference.")

  const loaded = await tool.execute(context, { name: "demo", resourcePath: "docs/reference.md" })
  expect(loaded).toMatchObject({ success: true, data: { directory: "demo", name: "demo" } })
  if (loaded.success) expect(loaded.data.output).toContain("Snapshotted reference.")

  const alias = await tool.execute(context, { name: "demo", path: "docs/reference.md" })
  expect(alias).toMatchObject({ success: true, data: { name: "demo" } })
})

test("rejects inactive skills and resources outside the immutable active snapshot", async () => {
  const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return
  const demo = catalog.data.skills.find(({ name }) => name === "demo")
  if (demo === undefined) return
  const tool = skillToolCreate({ activeSkills: [demo] })
  const context = {
    outputLimit: 100_000,
    signal: new AbortController().signal,
    timeoutMs: null,
    toolCallId: "skill-call",
  }

  expect(await tool.execute(context, { name: "inactive" })).toMatchObject({
    code: "tool.unknown",
    success: false,
  })
  expect(await tool.execute(context, { name: "demo", resourcePath: "missing.md" })).toMatchObject({
    code: "tool.unknown",
    success: false,
  })
  expect(await tool.execute(context, { name: "demo", resourcePath: "../SKILL.md" })).toMatchObject({
    code: "tool.unknown",
    success: false,
  })
})
