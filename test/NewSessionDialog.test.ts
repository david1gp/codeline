import { expect, test } from "bun:test"

const dialog = await Bun.file(new URL("../src/ui/NewSessionDialog.tsx", import.meta.url)).text()
const state = await Bun.file(new URL("../src/ui/newSessionDialogStateCreate.ts", import.meta.url)).text()
const sidebar = await Bun.file(new URL("../src/ui/SessionSidebar.tsx", import.meta.url)).text()

test("New Session navigates directly instead of opening the project dialog", () => {
  expect(sidebar).not.toContain("NewSessionDialog")
  expect(sidebar).not.toContain("CorvuDialog")
  expect(sidebar).toContain("props.sessionTarget.sessionNew?.()")
})

test("the existing-project dialog action hands off to the no-session workspace", () => {
  expect(dialog).toContain("state.formSubmit")
  expect(dialog).not.toContain("sessionCreateStart")
  expect(state).toContain("const projectSelectionConfirm = () =>")
  expect(state).toContain("options.projectPathOverride.set(null)")
  expect(state).toContain("open.set(false)")
  expect(state).toContain("options.sessionTarget.sessionNew?.()")
  expect(state).not.toContain("options.sessionTarget.sessionCreateStart")
})

test("the handoff action identifies project selection and preserves new-project flow", () => {
  expect(state).toContain('return "Use project"')
  expect(state).toContain('return "New Project"')
})
