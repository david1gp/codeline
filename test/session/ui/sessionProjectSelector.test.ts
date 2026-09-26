import { expect, test } from "bun:test"

const selectorSource = await Bun.file(
  new URL("../../../src/session/ui/SessionProjectSelector.tsx", import.meta.url),
).text()
const popoverSource = await Bun.file(
  new URL("../../../src/session/ui/SessionProjectPopover.tsx", import.meta.url),
).text()
const popoverStateSource = await Bun.file(
  new URL("../../../src/session/ui/sessionProjectPopoverStateCreate.ts", import.meta.url),
).text()
const stateSource = await Bun.file(
  new URL("../../../src/session/ui/sessionProjectSelectorStateCreate.ts", import.meta.url),
).text()

test("the project selector reuses the shared searchable picker", () => {
  expect(popoverSource).toContain('from "../../ui/SearchablePicker.js"')
  expect(popoverSource).toContain('ariaLabel="Registered projects"')
  expect(popoverSource).toContain("items={state.projectItems()}")
  expect(popoverSource).toContain("selectedId={state.selectedProjectId()}")
  expect(popoverSource).toContain("renderLeading={(project)")
  expect(popoverStateSource).toContain("sessionProjectPickerItemsDerive(resources().projects())")
})

test("the project selector keeps the shared picker project visuals and trigger sizing", () => {
  expect(popoverSource).toContain("<SearchablePicker")
  expect(popoverSource).toContain('<ProjectAvatar class="size-5"')
  expect(popoverSource).toContain("New Project")
  expect(popoverSource).toContain("!w-full")
  expect(popoverSource).toContain('classesPopoverContentMerge("grid w-[min(92vw,22rem)] gap-2")')
})

test("the project selector keeps the controlled dialog mounted outside the dismissing popover", () => {
  expect(selectorSource).toContain('from "../../project/ui/NewProjectDialog.js"')
  expect(selectorSource).toContain("<SessionProjectPopover")
  expect(selectorSource).toContain("onNewProject={state.newProjectStart}")
  expect(selectorSource).toContain("open={state.newProjectOpen}")
  expect(selectorSource).toContain("onProjectConfirmed={state.newProjectConfirmed}")
  expect(popoverSource).toContain("onClick={state.newProjectStart}")
  expect(popoverSource).not.toContain("<NewProjectDialog")
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

test("the project selector keeps shared keyboard and selection ownership", () => {
  expect(popoverSource).toContain("active={state.open()}")
  expect(popoverSource).toContain("idPrefix={props.idPrefix}")
  expect(popoverStateSource).toContain("resources().selectedProjectId()")
  expect(popoverStateSource).not.toContain("fetch(")
})

test("the project selector distinguishes loading, empty search, and empty registry states", () => {
  expect(popoverStateSource).toContain('resources().projectRegistryStatus() === "loading"')
  expect(popoverStateSource).toContain("Loading registered projects…")
  expect(popoverStateSource).toContain("No projects match your search.")
  expect(popoverStateSource).toContain("No registered projects available.")
})
