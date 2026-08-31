import { expect, test } from "bun:test"

const selectorSource = await Bun.file(new URL("../src/ui/SessionProjectSelector.tsx", import.meta.url)).text()
const popoverSource = await Bun.file(new URL("../src/ui/SessionProjectPopover.tsx", import.meta.url)).text()
const popoverStateSource = await Bun.file(
  new URL("../src/ui/sessionProjectPopoverStateCreate.ts", import.meta.url),
).text()
const stateSource = await Bun.file(new URL("../src/ui/sessionProjectSelectorStateCreate.ts", import.meta.url)).text()

test("the project selector renders a typed search input driving the shared project search", () => {
  expect(popoverSource).toContain('from "#ui/input/input/Input.jsx"')
  expect(popoverSource).toContain('aria-label="Search projects"')
  expect(popoverSource).toContain("value={state.search()}")
  expect(popoverSource).toContain("onInput={state.searchInput}")
  expect(popoverStateSource).toContain("resources().projectSearchChange(value)")
  expect(popoverStateSource).toContain("resources().projectSearch()")
})

test("the project selector renders grouped, scrollable, accessible options over the derived option list", () => {
  expect(popoverSource).toContain("each={state.projectGroups()}")
  expect(popoverSource).toContain('role="listbox"')
  expect(popoverSource).toContain('role="group"')
  expect(popoverSource).toContain('role="option"')
  expect(popoverSource).toContain("aria-selected={state.isSelected(project.id)}")
  expect(popoverSource).toContain("max-h-[45vh]")
  expect(popoverSource).toContain("overflow-y-auto")
  expect(popoverSource).toContain("projectFolderIconSelect(false)")
  expect(popoverSource).toContain("<ProjectAvatar name={project.label} faviconUrl={project.faviconUrl} />")
  expect(popoverSource).toContain('class="ml-3 border-line-subtle border-l"')
})

test("the project selector uses available width and keeps the popover within small viewports", () => {
  expect(selectorSource).toContain('class="grid w-full min-w-0 gap-1.5"')
  expect(popoverSource).toContain("!w-full")
  expect(popoverSource).toContain('classesPopoverContentMerge("grid w-[min(92vw,22rem)] gap-2")')
})

test("the project selector keeps the controlled dialog mounted outside the dismissing popover", () => {
  expect(selectorSource).toContain('from "./NewProjectDialog.js"')
  expect(selectorSource).toContain("<SessionProjectPopover")
  expect(selectorSource).toContain("onNewProject={state.newProjectStart}")
  expect(selectorSource).toContain("open={state.newProjectOpen}")
  expect(selectorSource).toContain("onProjectConfirmed={state.newProjectConfirmed}")
  expect(popoverSource).toContain("onClick={state.newProjectStart}")
  expect(popoverSource).not.toContain("<NewProjectDialog")
  // The action sits outside the filtered option list, so search never hides it.
  const listboxEnd = popoverSource.indexOf("</div>", popoverSource.indexOf('role="listbox"'))
  expect(popoverSource.indexOf("onClick={state.newProjectStart}")).toBeGreaterThan(listboxEnd)
})

test("the popover hands focus to the controlled dialog without an asynchronous open race", () => {
  expect(popoverStateSource).toContain("triggerElement?.focus()")
  expect(popoverStateSource).toContain("options.onNewProject()")
  expect(popoverStateSource).toContain("event.preventDefault()")
  expect(stateSource).toContain("newProjectStart: () => newProjectOpen.set(true)")
  expect(stateSource).not.toContain("queueMicrotask")
  expect(stateSource).not.toContain("setTimeout")
})

test("a confirmed new project is selected once the shared registry lists it", () => {
  expect(stateSource).toContain("pendingProjectId.set(project.id)")
  const normalizedState = stateSource.replace(/\s+/g, "")
  expect(normalizedState).toContain("!resources().projects().some((project)=>project.id===projectId)")
  expect(stateSource).toContain("resources().projectSelect(projectId)")
})

test("the project selector keeps keyboard usability and current selection semantics", () => {
  expect(popoverStateSource).toContain('const optionNavigationKeys = ["ArrowDown", "ArrowUp", "Home", "End"]')
  expect(popoverSource).toContain("onKeyDown={state.optionKeyDown}")
  expect(popoverSource).toContain("onKeyDown={state.searchKeyDown}")
  // Selection stays owned by the shared resource selector.
  expect(popoverStateSource).toContain("resources().selectedProjectId()")
  expect(popoverStateSource).not.toContain("fetch(")
})

test("the project selector distinguishes loading, empty search, and empty registry states", () => {
  expect(popoverStateSource).toContain('resources().projectRegistryStatus() === "loading"')
  expect(popoverStateSource).toContain("Loading registered projects…")
  expect(popoverStateSource).toContain("No projects match your search.")
  expect(popoverStateSource).toContain("No registered projects available.")
})
