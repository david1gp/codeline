import { expect, test } from "bun:test"

const selector = await Bun.file(new URL("../src/ui/SessionResourceSelector.tsx", import.meta.url)).text()
const inspector = await Bun.file(new URL("../src/ui/SkillCatalogInspector.tsx", import.meta.url)).text()
const capturedContext = await Bun.file(new URL("../src/ui/SessionCapturedContextInspector.tsx", import.meta.url)).text()

test("the resource selector renders preset, recursive folder, skill, and tool controls from generic #ui inputs", () => {
  expect(selector).toContain('from "#ui/input/select/SelectSingleNative.jsx"')
  expect(selector).toContain('from "#ui/input/check/Checkbox.jsx"')
  expect(selector).toContain('from "#ui/interactive/details/Details.jsx"')
  expect(selector).toContain("<For each={props.state.folders()}>")
  expect(selector).toContain("props.state.folderToggle(folder.path, checked)")
  expect(selector).toContain("props.state.skillToggle(skill.name, checked)")
  expect(selector).toContain('props.state.toolToggle(agent.agentId, "bash", checked)')
  expect(selector).toContain('props.state.toolToggle(agent.agentId, "webfetch", checked)')
  expect(selector).toContain('props.state.toolToggle(agent.agentId, "read", checked)')
  expect(selector).toContain('props.state.toolToggle(agent.agentId, "write", checked)')
  expect(selector).toContain('props.state.toolToggle(agent.agentId, "edit", checked)')
})

test("the resource selector advertises all five tool toggles", () => {
  const toolNames = [...selector.matchAll(/toolToggle\(agent\.agentId, "([a-z]+)"/g)].map(([, name]) => name)
  expect([...new Set(toolNames)].sort()).toEqual(["bash", "edit", "read", "webfetch", "write"])
  expect(selector).not.toContain('"glob"')
  expect(selector).not.toContain('"grep"')
  expect(selector).not.toContain('"websearch"')
})

test("preset-excluded skills are shown as disabled and labelled rather than hidden", () => {
  expect(selector).toContain('disabled={props.state.presetName() === "all" || skill.isExcluded}')
  expect(selector).toContain("excluded by preset")
})

test("the resource selector disables skill and folder toggles and indicates inclusions when All preset is active", () => {
  expect(selector).toContain('disabled={props.state.presetName() === "all"}')
  expect(selector).toContain("All discovered skills are included.")
  expect(selector).toContain("displayName")
})

test("the selector shows the effective skill count and labels the catalog tokens as an estimate", () => {
  expect(selector).toContain("props.state.descriptionCatalog().estimatedTokens")
  expect(selector).toContain("tokens of catalog context (estimate)")
  expect(selector).toContain("{props.state.activeSkills().length} active skills")
})

test("an immutable session renders the captured context inspector and never the mutable controls", () => {
  expect(selector).toContain("<Show when={!props.state.isMutable()}>")
  expect(selector).toContain("<Match when={!props.state.isMutable()}>")
  expect(selector).toContain("<SessionCapturedContextInspector")
  expect(selector).not.toContain("SessionResourceCapturedSummary")
})

test("the captured context inspector is read-only and shows prompt, sources, skills, and tools", () => {
  expect(capturedContext).toContain('from "#ui/input/textarea/Textarea.jsx"')
  expect(capturedContext).toContain("Captured when this session was created and cannot be changed.")
  expect(capturedContext).toContain("This session was created before the execution context was captured.")
  expect(capturedContext).toContain("System prompt")
  expect(capturedContext).toContain("Included AGENTS.md sources")
  expect(capturedContext).toContain("Skill groups")
  expect(capturedContext).toContain("<For each={state.instructions()}>")
  expect(capturedContext).toContain("<For each={state.skillGroups()}>")
  expect(capturedContext).toContain("<For each={state.skills()}>")
  expect(capturedContext).toContain("<For each={state.tools()}>")
  expect(capturedContext).toContain("readOnly")
  for (const mutator of ["presetSelect", "skillToggle", "folderToggle", "toolToggle", "onInput"]) {
    expect(capturedContext).not.toContain(mutator)
  }
})

test("the captured context inspector omits digests, resource bundles, and discovery diagnostics", () => {
  for (const noise of ["digest", "Diagnostics", "diagnostics", "collisions", "resources.map", "bytes"]) {
    expect(capturedContext).not.toContain(noise)
  }
})

test("the selector distinguishes offline, loading, and error states with a retry", () => {
  expect(selector).toContain('props.state.status() === "offline"')
  expect(selector).toContain('props.state.status() === "loading"')
  expect(selector).toContain('props.state.status() === "error"')
  expect(selector).toContain("onClick={props.state.retry}")
})

test("the inspector exposes roots, groups, bundles, collisions, validation, and instruction sources", () => {
  expect(inspector).toContain('title="Skill roots and groups"')
  expect(inspector).toContain('title="Skill bundles"')
  expect(inspector).toContain('title="Name collisions"')
  expect(inspector).toContain('title="Validation"')
  expect(inspector).toContain('title="Instruction sources"')
  expect(inspector).toContain("<For each={props.state.roots()}>")
  expect(inspector).toContain("<For each={props.state.groups()}>")
  expect(inspector).toContain("<For each={props.state.skillBundles()}>")
  expect(inspector).toContain("<For each={props.state.collisions()}>")
  expect(inspector).toContain("<For each={props.state.instructionSnapshots()}>")
  expect(inspector).toContain("props.state.missingSkillNames()")
  expect(inspector).toContain("props.state.missingFolderPaths()")
})

test("the inspector is a read-only view that never mutates the pending selection", () => {
  expect(inspector).not.toContain("skillToggle")
  expect(inspector).not.toContain("folderToggle")
  expect(inspector).not.toContain("toolToggle")
  expect(inspector).not.toContain("presetSelect")
})
