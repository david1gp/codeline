import { expect, test } from "bun:test"
import { sessionResourceSkillCatalogEstimate } from "../src/ui/sessionResourceSkillCatalogEstimate.js"
import { sessionResourceSkillSelectionDerive } from "../src/ui/sessionResourceSkillSelectionDerive.js"
import { sessionResourceSkillTreeDerive } from "../src/ui/sessionResourceSkillTreeDerive.js"

const overrideEmpty = { disabledSkills: [], enabledSkills: [] }

const skills = [
  {
    bundlePath: ".agents/skills/code",
    description: "Refactor TypeScript.",
    name: "code-style",
    source: "project" as const,
  },
  {
    bundlePath: ".agents/skills/code/release",
    description: "Split changes into commits.",
    name: "commits",
    source: "project" as const,
  },
  {
    bundlePath: "global/skills/browser",
    description: "Drive a real browser.",
    name: "agent-browser",
    source: "global" as const,
  },
]

const groups = [
  { path: ".agents/skills/code", source: "project" as const },
  { path: ".agents/skills/code/release", source: "project" as const },
  { path: "global/skills/browser", source: "global" as const },
]

test("pending per-skill changes layer over the server selection and stay expressed against the preset", () => {
  const derived = sessionResourceSkillSelectionDerive({
    delta: { disabledSkills: ["commits"], enabledSkills: ["agent-browser"] },
    loadedOverride: { disabledSkills: [], enabledSkills: ["commits"] },
    presetExcludeSkillNames: [],
    serverActiveSkillNames: ["code-style", "commits"],
  })

  expect(derived.activeSkillNames).toEqual(["agent-browser", "code-style"])
  expect(derived.requestOverride).toEqual({ disabledSkills: ["commits"], enabledSkills: ["agent-browser"] })
})

test("preset exclusions win over every pending or persisted enablement", () => {
  const derived = sessionResourceSkillSelectionDerive({
    delta: { disabledSkills: [], enabledSkills: ["agent-browser"] },
    loadedOverride: { disabledSkills: [], enabledSkills: ["agent-browser"] },
    presetExcludeSkillNames: ["agent-browser"],
    serverActiveSkillNames: ["agent-browser", "code-style"],
  })

  expect(derived.activeSkillNames).toEqual(["code-style"])
})

test("an empty delta reproduces the server selection and the override it was resolved from", () => {
  const derived = sessionResourceSkillSelectionDerive({
    delta: overrideEmpty,
    loadedOverride: { disabledSkills: ["commits"], enabledSkills: [] },
    presetExcludeSkillNames: [],
    serverActiveSkillNames: ["code-style"],
  })

  expect(derived.activeSkillNames).toEqual(["code-style"])
  expect(derived.requestOverride).toEqual({ disabledSkills: ["commits"], enabledSkills: [] })
})

test("re-enabling a pending disabled skill removes it from both override lists", () => {
  const derived = sessionResourceSkillSelectionDerive({
    delta: { disabledSkills: [], enabledSkills: ["commits"] },
    loadedOverride: { disabledSkills: ["commits"], enabledSkills: [] },
    presetExcludeSkillNames: [],
    serverActiveSkillNames: ["code-style"],
  })

  expect(derived.activeSkillNames).toEqual(["code-style", "commits"])
  expect(derived.requestOverride).toEqual({ disabledSkills: [], enabledSkills: ["commits"] })
})

test("every directory below a root is a group carrying its descendant skills recursively", () => {
  const folders = sessionResourceSkillTreeDerive({
    activeSkillNames: ["code-style", "commits", "agent-browser"],
    excludedSkillNames: [],
    groups,
    skills,
  })

  expect(folders.map(({ depth, path, selection }) => ({ depth, path, selection }))).toEqual([
    { depth: 0, path: ".agents/skills/code", selection: "all" },
    { depth: 1, path: ".agents/skills/code/release", selection: "all" },
    { depth: 0, path: "global/skills/browser", selection: "all" },
  ])
  expect(folders[0]?.descendantSkillNames).toEqual(["code-style", "commits"])
  expect(folders[0]?.skills.map(({ name }) => name)).toEqual(["code-style"])
  expect(folders[1]?.descendantSkillNames).toEqual(["commits"])
})

test("folder selection reports partial when only some descendants are active", () => {
  const folders = sessionResourceSkillTreeDerive({
    activeSkillNames: ["code-style"],
    excludedSkillNames: [],
    groups,
    skills,
  })

  expect(folders.find(({ path }) => path === ".agents/skills/code")?.selection).toBe("partial")
  expect(folders.find(({ path }) => path === ".agents/skills/code/release")?.selection).toBe("none")
  expect(folders.find(({ path }) => path === "global/skills/browser")?.selection).toBe("none")
})

test("preset-excluded skills are marked and removed from the recursive folder toggle set", () => {
  const folders = sessionResourceSkillTreeDerive({
    activeSkillNames: ["code-style"],
    excludedSkillNames: ["commits"],
    groups,
    skills,
  })

  expect(folders.find(({ path }) => path === ".agents/skills/code")?.descendantSkillNames).toEqual(["code-style"])
  expect(folders.find(({ path }) => path === ".agents/skills/code")?.selection).toBe("all")
  const release = folders.find(({ path }) => path === ".agents/skills/code/release")
  expect(release?.descendantSkillNames).toEqual([])
  expect(release?.selection).toBe("none")
  expect(release?.skills).toEqual([
    {
      bundlePath: ".agents/skills/code/release",
      description: "Split changes into commits.",
      isActive: false,
      isExcluded: true,
      name: "commits",
      source: "project",
    },
  ])
})

test("the description catalog estimate renders sorted entries and ceil(characters / 4) tokens", () => {
  const estimate = sessionResourceSkillCatalogEstimate([skills[1]!, skills[0]!])

  expect(estimate.content).toBe(
    [
      "Available skills:",
      "- code-style: Refactor TypeScript.",
      "  location: .agents/skills/code",
      "- commits: Split changes into commits.",
      "  location: .agents/skills/code/release",
    ].join("\n"),
  )
  expect(estimate.characterCount).toBe(estimate.content.length)
  expect(estimate.estimatedTokens).toBe(Math.ceil(estimate.content.length / 4))
})

test("an empty active skill list renders no catalog and estimates no tokens", () => {
  expect(sessionResourceSkillCatalogEstimate([])).toEqual({ characterCount: 0, content: "", estimatedTokens: 0 })
})
