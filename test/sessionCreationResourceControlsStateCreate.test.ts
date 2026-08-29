import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)
mock.module("@adaptive-ds/solid-ui/utils/createSignalObject", () => ({
  createSignalObject: <T>(value: T) => {
    const [get, set] = solidRuntime.createSignal(value)
    return { get, set }
  },
}))

const { demoSessionResourceSelectorStateCreate } = await import(
  "../src/ui/demo/demoSessionResourceSelectorStateCreate.js"
)
const { sessionCreationResourceControlsStateCreate } = await import(
  "../src/ui/sessionCreationResourceControlsStateCreate.js"
)

function controlsCreate() {
  return solidRuntime.createRoot(() => {
    const resources = demoSessionResourceSelectorStateCreate(() => "ready")
    return { controls: sessionCreationResourceControlsStateCreate(() => resources), resources }
  })
}

test("defaults reflect the current configuration", () => {
  const { controls } = controlsCreate()

  // The demo default activates both code skills and no browser skill.
  expect(controls.project.get()).toBe("demo-project-codeline")
  expect(controls.projectOptions()).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "demo-project-codeline" },
    { type: "item", value: "demo-project-docs" },
  ])
  expect(controls.projectOptionText("demo-project-codeline")).toBe("codeline")
  expect(controls.skills.options()).toEqual(["agent-browser", "code-style", "commits"])
  expect(controls.skills.valueSignal.get()).toEqual(["code-style", "commits"])
  expect(controls.skillGroups.options()).toEqual([".agents/skills/code", "global/skills/browser"])
  expect(controls.skillGroups.valueSignal.get()).toEqual([".agents/skills/code"])
  expect(controls.preset.get()).toBe("all")
  expect(controls.isAllPreset()).toBe(true)
  expect(controls.presetOptionText("all")).toBe("All")
})

test("selecting a project updates the selected project and unselected state presents a placeholder", () => {
  const { controls } = controlsCreate()

  controls.project.set("demo-project-docs")
  expect(controls.project.get()).toBe("demo-project-docs")

  controls.project.set("")
  expect(controls.project.get()).toBe("")
  expect(controls.projectOptions()).toEqual([
    { label: "Uncategorized", type: "group" },
    { type: "item", value: "demo-project-codeline" },
    { type: "item", value: "demo-project-docs" },
  ])
  expect(controls.projectOptionText("")).toBe("Select a project…")
})

test("tool options pair every agent with the current tool catalog defaults", () => {
  const { controls } = controlsCreate()

  expect(controls.tools.options()).toEqual([
    "demo-primary::bash",
    "demo-primary::webfetch",
    "demo-primary::read",
    "demo-primary::write",
    "demo-primary::edit",
    "demo-subagent::bash",
    "demo-subagent::webfetch",
    "demo-subagent::read",
    "demo-subagent::write",
    "demo-subagent::edit",
  ])
  expect(controls.tools.valueSignal.get()).toEqual([
    "demo-primary::bash",
    "demo-primary::read",
    "demo-primary::write",
    "demo-primary::edit",
    "demo-subagent::webfetch",
    "demo-subagent::read",
  ])
  expect(controls.tools.optionText("demo-subagent::webfetch")).toBe("Explore · webfetch")
})

test("when All preset is active, skill and group toggles are ignored", () => {
  const { controls, resources } = controlsCreate()

  expect(controls.isAllPreset()).toBe(true)
  controls.skills.valueSignal.set(["code-style"])
  expect(resources.activeSkills().map(({ name }) => name)).toEqual(["code-style", "commits"])

  controls.skillGroups.valueSignal.set([])
  expect(controls.skillGroups.valueSignal.get()).toEqual([".agents/skills/code"])
})

test("selecting values toggles only the entries that actually changed when not in All preset", () => {
  const { controls, resources } = controlsCreate()

  controls.preset.set("custom")
  controls.skills.valueSignal.set(["code-style", "agent-browser"])

  expect(controls.skills.valueSignal.get()).toEqual(["agent-browser", "code-style"])
  expect(resources.activeSkills().map(({ name }) => name)).toEqual(["code-style", "agent-browser"])
})

test("a group selection recurses into every descendant skill when not in All preset", () => {
  const { controls } = controlsCreate()

  controls.preset.set("custom")
  controls.skillGroups.valueSignal.set([".agents/skills/code", "global/skills/browser"])

  expect(controls.skills.valueSignal.get()).toEqual(["agent-browser", "code-style", "commits"])

  controls.skillGroups.valueSignal.set([])

  expect(controls.skills.valueSignal.get()).toEqual([])
  expect(controls.skillGroups.valueSignal.get()).toEqual([])
})

test("a tool selection maps back to the agent and tool it encodes", () => {
  const { controls, resources } = controlsCreate()

  controls.tools.valueSignal.set(["demo-primary::bash", "demo-primary::webfetch"])

  const primary = resources.agentTools().find((agent) => agent.agentId === "demo-primary")
  const subagent = resources.agentTools().find((agent) => agent.agentId === "demo-subagent")
  expect(primary).toMatchObject({ bash: true, webfetch: true })
  // Deselecting the subagent entry disables it rather than leaving the default.
  expect(subagent).toMatchObject({ bash: false, webfetch: false })
})

test("group labels carry their skill count so the compact sidebar stays readable", () => {
  const { controls } = controlsCreate()

  expect(controls.skillGroups.optionText(".agents/skills/code")).toBe("code (2)")
  expect(controls.skillGroups.optionText("global/skills/browser")).toBe("browser (1)")
})
