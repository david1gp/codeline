import { afterEach, describe, expect, test } from "bun:test"
import { gitStoreWrite } from "@adaptive-ds/git-store"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import * as v from "valibot"
import { configurationStoreCreate } from "../../../src/configuration/configurationStoreCreate.js"
import { globalAgentPresetDefaultMembershipAdd } from "../../../src/configuration/globalAgentPresetDefaultMembershipAdd.js"
import { globalAgentPresetDocumentDefaults } from "../../../src/configuration/globalAgentPresetDocumentDefaults.js"
import { globalAgentPresetDocumentSchema } from "../../../src/configuration/globalAgentPresetDocumentSchema.js"
import {
  globalAgentPresetResourcesResolve,
  globalAgentPresetResourcesResolveForPreset,
} from "../../../src/configuration/globalAgentPresetResourcesResolve.js"
import {
  globalAgentPresetDocumentFilePath,
  globalAgentPresetDocumentRead,
  globalAgentPresetDocumentWrite,
} from "../../../src/configuration/globalAgentPresetStore.js"

const directories: string[] = []

function tempDirectory(): string {
  const path = mkdtempSync(join(Bun.env.TMPDIR ?? "/tmp", "codeline-presets-"))
  directories.push(path)
  return path
}

async function createStore() {
  const result = await configurationStoreCreate({
    authorEmail: "preset-test@example.com",
    authorName: "Preset Test",
    branch: "main",
    dir: tempDirectory(),
  })
  if (!result.success) throw new Error(result.errorMessage)
  return result.data
}

afterEach(() => {
  while (directories.length > 0) {
    const path = directories.pop()
    if (path !== undefined) rmSync(path, { force: true, recursive: true })
  }
})

describe("global agent preset model and store", () => {
  test("provides category defaults, command dynamic inclusion, and automatic default membership", () => {
    const defaults = globalAgentPresetDocumentDefaults()
    expect(Object.keys(defaults.categories).sort()).toEqual(["commands", "skills", "subagents", "tools"])
    expect(defaults.categories.commands.sets[0]?.includeAllResources).toBe(true)
    expect(defaults.categories.skills.sets[0]?.includeAllResources).toBe(false)
    expect(defaults.categories.skills.sets[0]?.includeNewResources).toBe(true)
    expect(
      globalAgentPresetResourcesResolve(
        defaults,
        "tools",
        ["default-tools"],
        ["bash", "webfetch", "read", "write", "edit"],
      ),
    ).toEqual(["bash", "webfetch", "read", "write", "edit"])
    const toggled = structuredClone(defaults)
    toggled.categories.tools.sets[0]!.resourceNames = ["read"]
    expect(
      globalAgentPresetResourcesResolve(
        toggled,
        "tools",
        ["default-tools"],
        ["bash", "webfetch", "read", "write", "edit"],
      ),
    ).toEqual(["read"])
    expect(globalAgentPresetResourcesResolve(defaults, "skills", ["default-skills"], ["review", "review"])).toEqual([
      "review",
    ])
    const explicit = structuredClone(defaults)
    explicit.categories.skills.sets[0]!.includeNewResources = false
    const withSkill = globalAgentPresetDefaultMembershipAdd(explicit, "skills", "review")
    expect(withSkill.categories.skills.sets[0]?.resourceNames).toEqual(["review"])
    expect(
      globalAgentPresetDefaultMembershipAdd(withSkill, "skills", "review").categories.skills.sets[0]?.resourceNames,
    ).toEqual(["review"])
    const dynamic = structuredClone(defaults)
    expect(
      globalAgentPresetDefaultMembershipAdd(dynamic, "skills", "review").categories.skills.sets[0]?.resourceNames,
    ).toEqual([])
    expect(globalAgentPresetResourcesResolve(dynamic, "skills", ["default-skills"], ["review", "review"])).toEqual([
      "review",
    ])
    expect(
      globalAgentPresetResourcesResolve(defaults, "commands", ["default-commands"], ["test", "test", "build"]),
    ).toEqual(["test", "build"])
  })

  test("validates preset refs and resolves unique resource unions including individual subagents", () => {
    const document = globalAgentPresetDocumentDefaults()
    document.categories.skills.sets.push({
      id: "core",
      name: "Core",
      resourceNames: ["review", "review"],
      includeNewResources: false,
      includeAllResources: false,
    })
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(false)
    document.categories.skills.sets[1]!.resourceNames = ["review"]
    document.presets.push({
      id: "work",
      name: "Work",
      skillSetIds: ["core", "default-skills"],
      commandSetIds: [],
      toolSetIds: [],
      subagentSetIds: [],
      subagentNames: ["planner", "reviewer"],
      executionAgentId: "base-agent",
      modelId: "model-x",
    })
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(true)
    expect(globalAgentPresetResourcesResolveForPreset(document, "skills", "work")).toEqual(["review"])
    expect(globalAgentPresetResourcesResolveForPreset(document, "subagents", "work")).toEqual(["planner", "reviewer"])
    expect(globalAgentPresetResourcesResolveForPreset(document, "tools", "missing")).toBeUndefined()
  })

  test("accepts legacy sets without exclusions and validates unique tombstone names", () => {
    const document = globalAgentPresetDocumentDefaults()
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(true)
    document.categories.skills.sets[0]!.excludedResourceNames = ["review", "review"]
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(false)
    document.categories.skills.sets[0]!.excludedResourceNames = ["review"]
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(true)
    document.categories.skills.sets[0]!.excludedResourceNames = [""]
    expect(v.safeParse(globalAgentPresetDocumentSchema, document).success).toBe(false)
  })

  test("resolves dynamic sets minus their own exclusions without hiding a name from another selected set", () => {
    const document = globalAgentPresetDocumentDefaults()
    document.categories.skills.sets[0]!.resourceNames = ["review"]
    document.categories.skills.sets[0]!.excludedResourceNames = ["review"]
    document.categories.skills.sets.push({
      id: "selected",
      name: "Selected",
      resourceNames: ["review"],
      includeNewResources: false,
      includeAllResources: false,
    })
    expect(
      globalAgentPresetResourcesResolve(document, "skills", ["default-skills"], ["review", "future", "future"]),
    ).toEqual(["future"])
    expect(
      globalAgentPresetResourcesResolve(document, "skills", ["default-skills", "selected"], ["review", "future"]),
    ).toEqual(["future", "review"])
    document.categories.commands.sets[0]!.includeNewResources = false
    document.categories.commands.sets[0]!.includeAllResources = false
    document.categories.commands.sets[0]!.excludedResourceNames = ["test"]
    expect(
      globalAgentPresetResourcesResolve(document, "commands", ["default-commands"], ["test", "build", "build"]),
    ).toEqual(["build"])
  })

  test("new default resources clear prior exclusions while retaining dynamic inclusion", () => {
    const document = globalAgentPresetDocumentDefaults()
    document.categories.skills.sets[0]!.excludedResourceNames = ["review"]
    const next = globalAgentPresetDefaultMembershipAdd(document, "skills", "review")
    expect(next.categories.skills.sets[0]).toMatchObject({
      includeNewResources: true,
      resourceNames: [],
      excludedResourceNames: [],
    })
    expect(globalAgentPresetResourcesResolve(next, "skills", ["default-skills"], ["review", "future"])).toEqual([
      "review",
      "future",
    ])
  })

  test("reads defaults before first write and persists validated data separately", async () => {
    const store = await createStore()
    const initial = await globalAgentPresetDocumentRead(store.gitStore)
    expect(initial.success).toBe(true)
    if (!initial.success) return
    expect(initial.data).toEqual(globalAgentPresetDocumentDefaults())

    const document = globalAgentPresetDocumentDefaults()
    document.presets.push({
      id: "default",
      name: "Default",
      skillSetIds: [],
      commandSetIds: [],
      toolSetIds: [],
      subagentSetIds: [],
      subagentNames: [],
      executionAgentId: "agent-base",
      modelId: "model-base",
    })
    const written = await globalAgentPresetDocumentWrite(store.gitStore, document)
    expect(written.success).toBe(true)
    const read = await globalAgentPresetDocumentRead(store.gitStore)
    expect(read.success).toBe(true)
    if (read.success) expect(read.data).toEqual(document)
    const invalid = await globalAgentPresetDocumentWrite(store.gitStore, { version: 1 })
    expect(invalid.success).toBe(false)
    expect(await Bun.file(join(store.gitStore.dir, "global-agent-presets.json")).exists()).toBe(true)
    expect(await Bun.file(join(store.gitStore.dir, "configuration.json")).exists()).toBe(false)
  })

  test("persists optional exclusions and reads legacy documents unchanged", async () => {
    const store = await createStore()
    const legacy = globalAgentPresetDocumentDefaults()
    expect((await globalAgentPresetDocumentWrite(store.gitStore, legacy)).success).toBe(true)
    const readLegacy = await globalAgentPresetDocumentRead(store.gitStore)
    expect(readLegacy.success && readLegacy.data).toEqual(legacy)
    const excluded = structuredClone(legacy)
    excluded.categories.commands.sets[0]!.excludedResourceNames = ["test"]
    expect((await globalAgentPresetDocumentWrite(store.gitStore, excluded)).success).toBe(true)
    const readExcluded = await globalAgentPresetDocumentRead(store.gitStore)
    expect(readExcluded.success && readExcluded.data).toEqual(excluded)
  })

  test("returns defaults only when the document is absent and reports Git read failures", async () => {
    const store = await createStore()
    const unrelated = await gitStoreWrite(
      store.gitStore,
      "unrelated.json",
      { present: true },
      "test: add unrelated file",
    )
    expect(unrelated.success).toBe(true)
    const absent = await globalAgentPresetDocumentRead(store.gitStore)
    expect(absent.success).toBe(true)
    if (absent.success) expect(absent.data).toEqual(globalAgentPresetDocumentDefaults())

    const failed = await globalAgentPresetDocumentRead({ ...store.gitStore, dir: tempDirectory() })
    expect(failed.success).toBe(false)
    if (!failed.success) expect(failed.errorMessage).toContain("revision could not be read")

    const path = join(store.gitStore.dir, globalAgentPresetDocumentFilePath)
    expect(await Bun.file(path).exists()).toBe(false)
  })
})
