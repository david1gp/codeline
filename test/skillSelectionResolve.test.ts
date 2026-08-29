import { afterAll, beforeAll, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import { skillCatalogDiscover } from "../src/skills/actions/skillCatalogDiscover.js"
import { skillDescriptionCatalogRender } from "../src/skills/actions/skillDescriptionCatalogRender.js"
import { skillPresetCatalogLoad } from "../src/skills/actions/skillPresetCatalogLoad.js"
import { skillPresetResolve } from "../src/skills/actions/skillPresetResolve.js"
import { skillSelectionPreSessionResolve } from "../src/skills/actions/skillSelectionPreSessionResolve.js"
import { skillSelectionResolve } from "../src/skills/actions/skillSelectionResolve.js"

let rootDirectory: string
let globalSkillsPath: string
let projectRoot: string

async function writeSkill(skillsRoot: string, bundlePath: string, name: string, description: string): Promise<void> {
  const bundleDirectory = path.join(skillsRoot, bundlePath)
  await fs.mkdir(bundleDirectory, { recursive: true })
  await fs.writeFile(
    path.join(bundleDirectory, "SKILL.md"),
    [`---`, `name: ${name}`, `description: ${description}`, `---`, `Instructions for ${name}.`].join("\n"),
    "utf8",
  )
}

beforeAll(async () => {
  rootDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "codeline-skills-selection-"))
  globalSkillsPath = path.join(rootDirectory, "global", "skills")
  projectRoot = path.join(rootDirectory, "project")
  const projectSkillsPath = path.join(projectRoot, ".agents", "skills")
  const presetDirectory = path.join(projectRoot, ".agents", "skill-presets")
  await fs.mkdir(projectSkillsPath, { recursive: true })
  await fs.mkdir(presetDirectory, { recursive: true })

  await writeSkill(globalSkillsPath, "global", "global-skill", "Global skill 😀")
  await writeSkill(projectSkillsPath, "team", "team-guide", "Team guide")
  await writeSkill(projectSkillsPath, "team/alpha", "alpha", "Alpha skill")
  await writeSkill(projectSkillsPath, "team/beta", "beta", "Beta skill")
  await fs.writeFile(
    path.join(presetDirectory, "focused.yaml"),
    [
      "version: 1",
      "name: focused",
      "description: Focused project skills",
      "includeSkills:",
      "  - global-skill",
      "  - missing-skill",
      "excludeSkills:",
      "  - beta",
      "  - missing-excluded-skill",
      "includeFolders:",
      "  - team",
      "  - missing-folder",
    ].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(presetDirectory, "all.yaml"),
    ["version: 1", "name: all", "description: A replacement All preset"].join("\n"),
    "utf8",
  )
  await fs.writeFile(
    path.join(presetDirectory, "claimed.yaml"),
    ["version: 1", "name: claimed", "immutable: true"].join("\n"),
    "utf8",
  )
  await fs.writeFile(path.join(presetDirectory, "invalid.yaml"), "name: invalid\nversion: [1\n", "utf8")
  await fs.writeFile(path.join(presetDirectory, "ignored.md"), "not a preset", "utf8")
})

afterAll(async () => {
  await fs.rm(rootDirectory, { force: true, recursive: true })
})

test("loads YAML presets and resolves recursive groups with exclusion precedence", async () => {
  const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  const presets = await skillPresetCatalogLoad({ projectRoot })
  expect(catalog.success).toBe(true)
  expect(presets.success).toBe(true)
  if (!catalog.success || !presets.success) return

  expect(presets.data.presets).toEqual([
    {
      description: "All discovered skills.",
      displayName: "All",
      excludeSkills: [],
      immutable: true,
      includeFolders: [],
      includeSkills: [],
      name: "all",
      version: 1,
    },
    {
      description: "Focused project skills",
      excludeSkills: ["beta", "missing-excluded-skill"],
      includeFolders: ["team", "missing-folder"],
      includeSkills: ["global-skill", "missing-skill"],
      name: "focused",
      version: 1,
    },
  ])
  expect(presets.data.diagnostics).toMatchObject([
    { code: "reserved-name", relativePath: ".agents/skill-presets/all.yaml" },
    { code: "invalid-preset", relativePath: ".agents/skill-presets/claimed.yaml" },
    { code: "invalid-yaml", relativePath: ".agents/skill-presets/invalid.yaml" },
  ])
  const defaultPreset = skillPresetResolve({ catalog: presets.data })
  expect(defaultPreset).toMatchObject({ success: true, data: { displayName: "All", name: "all", immutable: true } })

  const allSelection = skillSelectionResolve({
    catalog: catalog.data,
    override: { disabledSkills: ["beta"], enabledSkills: ["beta", "missing-skill"] },
    preset: defaultPreset.success ? defaultPreset.data : undefined,
  })
  expect(allSelection).toMatchObject({
    success: true,
    data: {
      activeSkills: [{ name: "alpha" }, { name: "global-skill" }, { name: "team-guide" }],
      excludedSkillNames: ["beta"],
      missingSkillNames: ["missing-skill"],
      presetName: "all",
      userOverride: { disabledSkills: ["beta"], enabledSkills: ["beta", "missing-skill"] },
    },
  })

  const selection = skillSelectionResolve({
    catalog: catalog.data,
    override: { disabledSkills: ["team-guide"], enabledSkills: ["beta"] },
    preset: presets.data.presets.find(({ name }) => name === "focused"),
  })
  expect(selection).toMatchObject({
    success: true,
    data: {
      activeSkills: [{ name: "alpha" }, { name: "global-skill" }],
      excludedSkillNames: ["beta", "team-guide"],
      missingFolderPaths: ["missing-folder"],
      missingSkillNames: ["missing-excluded-skill", "missing-skill"],
      presetName: "focused",
      userOverride: { disabledSkills: ["team-guide"], enabledSkills: ["beta"] },
    },
  })
  if (!selection.success) return
  expect(Object.isFrozen(selection.data)).toBe(true)
  expect(Object.isFrozen(selection.data.activeSkills[0])).toBe(true)

  const mutableCatalog = structuredClone(catalog.data)
  const mutableSkill = mutableCatalog.skills.find(({ name }) => name === "alpha")
  if (mutableSkill === undefined) return
  const immutableBody = selection.data.activeSkills.find(({ name }) => name === "alpha")?.body
  mutableSkill.body = "Changed after selection."
  expect(selection.data.activeSkills.find(({ name }) => name === "alpha")?.body).toBe(immutableBody)
})

test("request-time skill overrides take precedence over the persisted user preference", async () => {
  const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  const presets = await skillPresetCatalogLoad({ projectRoot })
  expect(catalog.success).toBe(true)
  expect(presets.success).toBe(true)
  if (!catalog.success || !presets.success) return

  const defaulted = skillSelectionPreSessionResolve({
    catalog: catalog.data,
    presetCatalog: presets.data,
  })
  expect(defaulted).toMatchObject({
    success: true,
    data: {
      activeSkills: [{ name: "alpha" }, { name: "beta" }, { name: "global-skill" }, { name: "team-guide" }],
      presetName: "all",
    },
  })

  const persisted = skillSelectionPreSessionResolve({
    catalog: catalog.data,
    defaultPreference: {
      override: { disabledSkills: ["team-guide"], enabledSkills: ["beta"] },
      presetName: "focused",
    },
    presetCatalog: presets.data,
  })
  expect(persisted).toMatchObject({
    success: true,
    data: { activeSkills: [{ name: "alpha" }, { name: "global-skill" }] },
  })

  const overridden = skillSelectionPreSessionResolve({
    catalog: catalog.data,
    defaultPreference: {
      override: { disabledSkills: ["team-guide"], enabledSkills: ["beta"] },
      presetName: "focused",
    },
    presetCatalog: presets.data,
    request: { override: { disabledSkills: ["alpha"], enabledSkills: ["team-guide"] } },
  })
  expect(overridden).toMatchObject({
    success: true,
    data: {
      activeSkills: [{ name: "global-skill" }, { name: "team-guide" }],
      excludedSkillNames: ["alpha", "beta"],
      userOverride: { disabledSkills: ["alpha"], enabledSkills: ["team-guide"] },
    },
  })
})

test("renders only active skill descriptions with the documented token estimate", async () => {
  const catalog = await skillCatalogDiscover({ globalSkillsPath, projectRoot })
  expect(catalog.success).toBe(true)
  if (!catalog.success) return

  const rendered = skillDescriptionCatalogRender({ activeSkills: [catalog.data.skills[0]!] })
  expect(rendered.success).toBe(true)
  if (!rendered.success) return
  expect(rendered.data.skills).toHaveLength(1)
  expect(rendered.data.content).toContain("location:")
  expect(rendered.data.content).not.toContain("Instructions for")
  expect(rendered.data.characterCount).toBe(rendered.data.content.length)
  expect(rendered.data.estimatedTokens).toBe(Math.ceil(rendered.data.content.length / 4))
  expect(rendered.data.estimatedTokensIsEstimate).toBe(true)
  expect(skillDescriptionCatalogRender([])).toMatchObject({
    success: true,
    data: { characterCount: 0, content: "", estimatedTokens: 0, estimatedTokensIsEstimate: true, skills: [] },
  })
})
