import { expect, test } from "bun:test"

const sidebarSource = await Bun.file(new URL("../src/ui/SessionCreationResourceSidebar.tsx", import.meta.url)).text()
const selectedSessionSource = await Bun.file(new URL("../src/ui/SelectedSession.tsx", import.meta.url)).text()
const chatSource = await Bun.file(new URL("../src/ui/SessionChat.tsx", import.meta.url)).text()

test("the creation sidebar drives skill groups, skills, and tools through the generic multi-select when mutable and lists non-interactively when All preset", () => {
  expect(sidebarSource).toContain('from "#ui/input/select/SelectMultiple.jsx"')
  expect(sidebarSource).toContain('label="Skill groups"')
  expect(sidebarSource).toContain('label="Skills"')
  expect(sidebarSource).toContain('label="Tools"')
  expect(sidebarSource).toContain("controls.skillGroups")
  expect(sidebarSource).toContain("controls.skills")
  expect(sidebarSource).toContain("controls.tools")
  expect(sidebarSource).toContain("disabled={controls.isAllPreset()}")
  expect(sidebarSource).toContain("All discovered skills are included.")
  // When All preset is active, selected items are visibly listed as non-interactive list items without remove buttons.
  expect(sidebarSource).toContain('role="list"')
  expect(sidebarSource).toContain('role="listitem"')
  // Multi-select triggers provide accessible names matching their group labels.
  expect(sidebarSource).toContain("buttonChildren: <span>{`Choose ${props.label.toLowerCase()}`}</span>")
  // The selection stays session-scoped, so the sidebar never persists a default.
  expect(sidebarSource).toContain("Changes apply to the new session only.")
  expect(sidebarSource).not.toContain("fetch(")
})

test("the creation sidebar positions the grouped project selectSingle before skills and tools", () => {
  expect(sidebarSource).toContain('from "#ui/input/select/SelectSingle.jsx"')
  expect(sidebarSource).toContain("<span class={sectionLabelClass}>Project</span>")
  expect(sidebarSource).toContain("<SelectSingle")
  expect(sidebarSource).toContain("valueSignal={controls.project}")
  expect(sidebarSource).toContain("getOptions={controls.projectOptions}")
  expect(sidebarSource).toContain("valueText={controls.projectOptionText}")
  // The project selector appears before the Switch that gates skills/tools on project selection.
  const projectIndex = sidebarSource.indexOf("valueSignal={controls.project}")
  const switchIndex = sidebarSource.indexOf("<Switch>")
  expect(projectIndex).toBeGreaterThan(0)
  expect(switchIndex).toBeGreaterThan(projectIndex)
})

test("the creation surface renders a filling composer beside the compact sidebar", () => {
  const normalized = selectedSessionSource.replace(/\s+/g, " ")

  expect(normalized).toContain(
    "<SessionChat isFilling providerModel={props.providerModel} sessionTarget={props.sessionTarget} state={props.state.initialChat} />",
  )
  expect(normalized).toContain(
    '<SessionCreationResourceSidebar idPrefix="workspace-setup-resources" state={resources()} />',
  )
  // The full-height creation editor replaces the broad resource panel.
  expect(normalized).not.toContain('<SessionResourceSelector idPrefix="workspace-setup-resources"')
  // Mobile keeps the surface usable by stacking the sidebar under the editor.
  expect(normalized).toContain("max-[1100px]:flex-col")
})

test("the composer only fills remaining height when the creation surface asks for it", () => {
  expect(chatSource).toContain("isFilling?: boolean")
  expect(chatSource).toContain('"flex min-h-0 flex-1 flex-col": props.isFilling === true')
  expect(chatSource).toContain('"max-h-[200px]": props.isFilling !== true')
})
