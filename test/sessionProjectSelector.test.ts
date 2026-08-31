import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"
import type { SessionResourceSelectorView } from "../src/ui/sessionResourceSelectorView.js"

mock.module("solid-js", () => solidRuntime)

const { sessionProjectSelectorStateCreate } = await import("../src/ui/sessionProjectSelectorStateCreate.js")

const selectorSource = await Bun.file(new URL("../src/ui/SessionProjectSelector.tsx", import.meta.url)).text()
const stateSource = await Bun.file(new URL("../src/ui/sessionProjectSelectorStateCreate.ts", import.meta.url)).text()

test("the project selector renders a typed search input driving the shared project search", () => {
  expect(selectorSource).toContain('from "#ui/input/input/Input.jsx"')
  expect(selectorSource).toContain('aria-label="Search projects"')
  expect(selectorSource).toContain("value={state.search()}")
  expect(selectorSource).toContain("onInput={state.searchInput}")
  expect(stateSource).toContain("resources().projectSearchChange(value)")
  expect(stateSource).toContain("resources().projectSearch()")
})

test("the project selector renders grouped, scrollable, accessible options over the derived option list", () => {
  expect(selectorSource).toContain("each={state.projectOptions()}")
  expect(selectorSource).toContain('role="listbox"')
  expect(selectorSource).toContain('role="option"')
  expect(selectorSource).toContain("aria-selected={state.isSelected(item().value)}")
  expect(selectorSource).toContain("max-h-[45vh]")
  expect(selectorSource).toContain("overflow-y-auto")
  // Group headings stay visible as non-option labels.
  expect(selectorSource).toContain('entry.type === "group" ? entry.label : ""')
})

test("the project selector uses available width and keeps the popover within small viewports", () => {
  expect(selectorSource).toContain('class="grid w-full min-w-0 gap-1.5"')
  expect(selectorSource).toContain("!w-full")
  expect(selectorSource).toContain('innerClass="grid w-[min(92vw,22rem)] gap-2"')
})

test("the project selector keeps a persistent New Project action wired to the existing dialog", () => {
  expect(selectorSource).toContain('from "./NewProjectDialog.js"')
  expect(selectorSource).toContain("onClick={state.newProjectStart}")
  expect(selectorSource).toContain("open={state.newProjectOpen}")
  expect(selectorSource).toContain("onProjectConfirmed={state.newProjectConfirmed}")
  // The action sits outside the filtered option list, so search never hides it.
  const listboxEnd = selectorSource.indexOf("</div>", selectorSource.indexOf('role="listbox"'))
  expect(selectorSource.indexOf("onClick={state.newProjectStart}")).toBeGreaterThan(listboxEnd)
})

test("starting a new project opens the dialog after the selector popover closes", async () => {
  const resources = {
    projectOptions: () => [],
    projectRegistryStatus: () => "ready" as const,
    projectSearch: () => "query",
    projectSearchChange: () => undefined,
    projects: () => [],
    projectSelect: () => undefined,
    selectedProjectId: () => null,
  } as unknown as SessionResourceSelectorView
  const root = createRoot((dispose) => ({
    dispose,
    state: sessionProjectSelectorStateCreate({ idPrefix: () => "project", resources: () => resources }),
  }))

  root.state.openChange(true)
  root.state.newProjectStart()

  expect(root.state.open()).toBe(false)
  expect(root.state.newProjectOpen()).toBe(false)
  await Promise.resolve()
  expect(root.state.newProjectOpen()).toBe(false)
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(root.state.newProjectOpen()).toBe(true)
  root.dispose()
})

test("a confirmed new project is selected once the shared registry lists it", () => {
  expect(stateSource).toContain("pendingProjectId.set(project.id)")
  const normalizedState = stateSource.replace(/\s+/g, "")
  expect(normalizedState).toContain("!resources().projects().some((project)=>project.id===projectId)")
  expect(stateSource).toContain("resources().projectSelect(projectId)")
})

test("the project selector keeps keyboard usability and current selection semantics", () => {
  expect(stateSource).toContain('const optionNavigationKeys = ["ArrowDown", "ArrowUp", "Home", "End"]')
  expect(selectorSource).toContain("onKeyDown={state.optionKeyDown}")
  expect(selectorSource).toContain("onKeyDown={state.searchKeyDown}")
  // Selection stays owned by the shared resource selector.
  expect(stateSource).toContain("resources().selectedProjectId()")
  expect(stateSource).not.toContain("fetch(")
})

test("the project selector distinguishes loading, empty search, and empty registry states", () => {
  expect(stateSource).toContain('resources().projectRegistryStatus() === "loading"')
  expect(stateSource).toContain("Loading registered projects…")
  expect(stateSource).toContain("No projects match your search.")
  expect(stateSource).toContain("No registered projects available.")
})
