import { expect, test } from "bun:test"

const sidebarSource = await Bun.file(
  new URL("../../../src/session/ui/SessionCreationResourceSidebar.tsx", import.meta.url),
).text()
const sidebarStateSource = await Bun.file(
  new URL("../../../src/session/ui/sessionCreationResourceSidebarStateCreate.ts", import.meta.url),
).text()
const selectedSessionSource = await Bun.file(
  new URL("../../../src/session/ui/SelectedSession.tsx", import.meta.url),
).text()
const chatSource = await Bun.file(new URL("../../../src/session/ui/SessionChat.tsx", import.meta.url)).text()
const stylesSource = await Bun.file(new URL("../../../src/ui/styles.css", import.meta.url)).text()
const shellStateSource = await Bun.file(
  new URL("../../../src/ui/applicationShellStateCreate.ts", import.meta.url),
).text()

test("the creation sidebar selects a global preset and editable model without skill or tool controls", () => {
  expect(sidebarSource).toContain('from "#ui/input/select/SelectSingleNative.jsx"')
  expect(sidebarSource).toContain('from "#ui/input/input/Input.jsx"')
  expect(sidebarSource).toContain("state.presetOptions")
  expect(sidebarSource).toContain("props.target.modelChange")
  expect(sidebarSource).toContain("state.agentOptions")
  expect(sidebarSource).toContain("state.serverOptions")
  expect(sidebarSource).toContain("Alternative agent (clears preset)")
  expect(sidebarSource).not.toContain("SelectMultiple")
  expect(sidebarSource).not.toContain("Skill groups")
  expect(sidebarSource).not.toContain("toolToggle")
  expect(sidebarSource).toContain("SessionCreationContextPopover")
  expect(sidebarSource).toContain("Changes apply to the new session only.")
  expect(sidebarSource).not.toContain("fetch(")
})

test("project selection moves above the creation textarea without duplicating in the context sidebar", () => {
  expect(sidebarSource).not.toContain('from "#ui/input/select/SelectSingle.jsx"')
  expect(sidebarSource).not.toContain("<SessionProjectSelector")
  expect(sidebarSource).not.toContain("controls.project")
  expect(selectedSessionSource.match(/<SessionProjectSelector/g)).toHaveLength(1)
  expect(selectedSessionSource).toContain('idPrefix="workspace-setup-project"')
  expect(chatSource).toContain("{props.projectSelector}")
  expect(chatSource.indexOf("{props.projectSelector}")).toBeLessThan(chatSource.indexOf("<textarea"))
})

test("the creation sidebar wires an accessible session context resize handle to shell state", () => {
  const normalized = sidebarSource.replace(/\s+/g, " ")

  expect(normalized).toContain("<Show when={props.shell}>")
  expect(normalized).toContain('class="application-shell-resize-handle session-context-resize-handle"')
  expect(normalized).toContain('classList={{ "is-resizing": shell().isResizing("session-context") }}')
  expect(normalized).toContain("tabIndex={0}")
  expect(normalized).toContain('aria-label="Resize session context"')
  expect(normalized).toContain('aria-orientation="vertical"')
  expect(normalized).toContain('aria-valuemin="240"')
  expect(normalized).toContain('aria-valuemax="520"')
  expect(normalized).toContain("aria-valuenow={state.width()}")
  expect(normalized).toContain('onKeyDown={(event) => shell().resizeKeyDown("session-context", event)}')
  expect(normalized).toContain("onPointerCancel={shell().resizeCancel}")
  expect(normalized).toContain('onPointerDown={(event) => shell().resizeStart("session-context", event)}')
  expect(normalized).toContain("onLostPointerCapture={shell().resizeEnd}")
  expect(normalized).toContain("onPointerMove={shell().resizeMove}")
  expect(normalized).toContain("onPointerUp={shell().resizeEnd}")
})

test("the creation sidebar applies the CSS width variable with a 320px fallback and exact stacked breakpoint", () => {
  const normalizedStyles = stylesSource.replace(/\s+/g, " ")

  expect(sidebarStateSource).toContain("props().shell?.sessionContextWidth() ?? 320")
  expect(sidebarSource).toContain('style={{ "--session-context-width": `${state.width()}px` }}')
  expect(normalizedStyles).toContain(
    ".session-context-panel { width: var(--session-context-width, 320px); min-width: var(--session-context-width, 320px); }",
  )
  expect(normalizedStyles).toContain(
    "@media (max-width: 1100px) { .session-context-resize-handle { display: none; } .session-context-panel { width: 100%; min-width: 0; } }",
  )
})

test("the stacked session context breakpoint applies at exactly 1100px across utilities, plain CSS, and shell state", () => {
  // Plain CSS `max-width: 1100px` includes exactly 1100, and the desktop condition is strictly above it.
  expect(stylesSource).toContain("@media (max-width: 1100px)")
  expect(shellStateSource).toContain("const sessionContextBreakpoint = 1100")
  expect(shellStateSource).toContain("viewportWidthRead() > sessionContextBreakpoint")

  // Tailwind compiles `max-[n]` to `width < n`, so exact-1100 stacking needs the 1101 utility threshold.
  for (const source of [selectedSessionSource, sidebarSource]) {
    expect(source).not.toContain("max-[1100px]:")
  }
  expect(selectedSessionSource).toContain("max-[1101px]:flex-col")
  expect(selectedSessionSource).toContain("max-[1101px]:overflow-y-auto")
  expect(selectedSessionSource).toContain("max-[1101px]:min-h-[60vh]")
  expect(sidebarSource).toContain("max-[1101px]:w-full")
  expect(sidebarSource).toContain("max-[1101px]:border-l-0")
  expect(sidebarSource).toContain("max-[1101px]:border-t")
})

test("the creation surface renders a filling composer beside the compact sidebar", () => {
  const normalized = selectedSessionSource.replace(/\s+/g, " ")

  expect(normalized).toContain("<SessionChat isFilling projectSelector={")
  expect(normalized).toContain(
    "providerModel={props.providerModel} sessionTarget={props.sessionTarget} state={props.state.initialChat} />",
  )
  expect(normalized).toContain(
    '<SessionCreationResourceSidebar idPrefix="workspace-setup-resources" shell={props.shell} state={props.resources!} target={resources() as SessionTargetSelectorState} />',
  )
  // The full-height creation editor replaces the broad resource panel.
  expect(normalized).not.toContain('<SessionResourceSelector idPrefix="workspace-setup-resources"')
  // Mobile keeps the surface usable by stacking the sidebar under the editor.
  expect(normalized).toContain("max-[1101px]:flex-col")
})

test("the composer only fills remaining height when the creation surface asks for it", () => {
  expect(chatSource).toContain("isFilling?: boolean")
  expect(chatSource).toContain('"flex min-h-0 flex-1 flex-col": props.isFilling === true')
  expect(chatSource).toContain('"max-h-[200px]": props.isFilling !== true')
})
