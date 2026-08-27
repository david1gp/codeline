import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { skillCatalogDiscover } from "../src/skills/actions/skillCatalogDiscover.js"

let rootDirectory: string
let globalSkillsPath: string
let projectRoot: string

async function writeSkill(
  skillsRoot: string,
  bundlePath: string,
  name: string,
  description: string,
  body: string,
  resources: Record<string, string> = {},
): Promise<void> {
  const bundleDirectory = path.join(skillsRoot, bundlePath)
  await fs.mkdir(bundleDirectory, { recursive: true })
  await fs.writeFile(
    path.join(bundleDirectory, "SKILL.md"),
    [`---`, `name: ${name}`, `description: ${description}`, `---`, body].join("\n"),
    "utf8",
  )
  await Promise.all(
    Object.entries(resources).map(async ([resourcePath, content]) => {
      const filePath = path.join(bundleDirectory, resourcePath)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, content, "utf8")
    }),
  )
}

beforeAll(async () => {
  rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-skills-discovery-"))
  globalSkillsPath = path.join(rootDirectory, "global", "skills")
  projectRoot = path.join(rootDirectory, "project")
  const projectSkillsPath = path.join(projectRoot, ".agents", "skills")
  await fs.mkdir(projectSkillsPath, { recursive: true })

  await writeSkill(globalSkillsPath, "shared", "shared", "Global shared skill", "global shared body")
  await writeSkill(globalSkillsPath, "parent", "parent-skill", "Parent skill", "parent body", {
    "reference.md": "parent reference",
  })
  await writeSkill(globalSkillsPath, "parent/nested", "nested-skill", "Nested skill", "nested body", {
    "reference.md": "nested reference",
  })
  await fs.mkdir(path.join(globalSkillsPath, "bad"), { recursive: true })
  await fs.writeFile(path.join(globalSkillsPath, "bad", "SKILL.md"), "not frontmatter", "utf8")
  await fs.mkdir(path.join(globalSkillsPath, "binary"), { recursive: true })
  await fs.writeFile(path.join(globalSkillsPath, "binary", "SKILL.md"), Buffer.from([0, 1, 2]))

  await writeSkill(projectSkillsPath, "shared", "shared", "Project shared skill", "project shared body", {
    "project.md": "project resource",
  })
  await writeSkill(projectSkillsPath, "team", "team-guide", "Team guide", "team body", { "team.md": "team resource" })
  await writeSkill(projectSkillsPath, "team/alpha", "alpha", "Alpha skill", "alpha body", {
    "reference.md": "alpha reference",
  })
  await writeSkill(projectSkillsPath, "team/beta", "beta", "Beta skill", "beta body")
  await writeSkill(projectSkillsPath, "duplicates/a", "duplicate", "First duplicate", "first duplicate body")
  await writeSkill(projectSkillsPath, "duplicates/b", "duplicate", "Second duplicate", "second duplicate body")
})

afterAll(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("discovers recursive bundles, resources, groups, precedence, collisions, and diagnostics deterministically", async () => {
  const first = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  const second = await skillCatalogDiscover({ globalSkillsPath, projectRoot })

  expect(first.success).toBe(true)
  expect(second.success).toBe(true)
  if (!first.success || !second.success) return

  expect(first.data.digest).toBe(second.data.digest)
  expect(first.data.bundles.map(({ source, bundlePath }) => `${source}:${bundlePath}`)).toEqual([
    "global:parent",
    "global:parent/nested",
    "global:shared",
    "project:duplicates/a",
    "project:duplicates/b",
    "project:shared",
    "project:team",
    "project:team/alpha",
    "project:team/beta",
  ])
  expect(first.data.skills.map(({ name }) => name)).toEqual(
    ["alpha", "duplicate", "nested-skill", "parent-skill", "shared", "team-guide", "beta"].sort(),
  )

  const shared = first.data.skills.find(({ name }) => name === "shared")
  expect(shared).toMatchObject({ source: "project", bundlePath: "shared", body: "project shared body" })
  const duplicate = first.data.skills.find(({ name }) => name === "duplicate")
  expect(duplicate).toMatchObject({ source: "project", bundlePath: "duplicates/a" })
  expect(first.data.collisions.map(({ name }) => name)).toEqual(["duplicate", "shared"])
  expect(first.data.collisions.find(({ name }) => name === "shared")?.winner).toMatchObject({
    source: "project",
    bundlePath: "shared",
  })
  expect(first.data.collisions.find(({ name }) => name === "duplicate")?.winner).toMatchObject({
    source: "project",
    bundlePath: "duplicates/a",
  })

  const parent = first.data.bundles.find(({ name }) => name === "parent-skill")
  const nested = first.data.bundles.find(({ name }) => name === "nested-skill")
  const team = first.data.bundles.find(({ name }) => name === "team-guide")
  const alpha = first.data.bundles.find(({ name }) => name === "alpha")
  expect(parent?.resources.map(({ path: resourcePath }) => resourcePath)).toEqual(["reference.md"])
  expect(nested?.resources.map(({ path: resourcePath }) => resourcePath)).toEqual(["reference.md"])
  expect(team?.resources.map(({ path: resourcePath }) => resourcePath)).toEqual(["team.md"])
  expect(alpha?.resources.map(({ path: resourcePath }) => resourcePath)).toEqual(["reference.md"])
  expect(parent?.resources.some(({ content }) => content === "nested reference")).toBe(false)
  expect(team?.resources.some(({ content }) => content === "alpha reference")).toBe(false)

  expect(first.data.groups.map(({ source, path: groupPath }) => `${source}:${groupPath}`)).toEqual([
    "global:bad",
    "global:binary",
    "global:parent",
    "global:parent/nested",
    "global:shared",
    "project:duplicates",
    "project:duplicates/a",
    "project:duplicates/b",
    "project:shared",
    "project:team",
    "project:team/alpha",
    "project:team/beta",
  ])
  expect(first.data.diagnostics.map(({ code, relativePath }) => ({ code, relativePath }))).toEqual([
    { code: "frontmatter-missing", relativePath: "bad/SKILL.md" },
    { code: "binary-content", relativePath: "binary/SKILL.md" },
  ])
  expect(first.data.roots).toMatchObject([
    { source: "global", precedence: 0, canonicalPath: globalSkillsPath },
    { source: "project", precedence: 1, canonicalPath: path.join(projectRoot, ".agents", "skills") },
  ])
  expect(Object.isFrozen(first.data)).toBe(true)
  expect(Object.isFrozen(first.data.skills[0])).toBe(true)
  expect(Object.isFrozen(first.data.skills[0]?.resources)).toBe(true)
})

test("reports bounded discovery diagnostics without accepting invalid limits", async () => {
  const limited = await skillCatalogDiscover({ globalSkillsPath, maxDiagnostics: 1, projectRoot })
  expect(limited).toMatchObject({ success: true, data: { diagnostics: [{ code: "diagnostic-limit-exceeded" }] } })

  const invalid = await skillCatalogDiscover({ globalSkillsPath, maxBundles: -1, projectRoot })
  expect(invalid).toMatchObject({ success: false, errorMessage: "The skill discovery limit is invalid." })
})
