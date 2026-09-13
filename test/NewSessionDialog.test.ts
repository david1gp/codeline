import { expect, test } from "bun:test"

const dialog = await Bun.file(new URL("../src/ui/NewSessionDialog.tsx", import.meta.url)).text()
const state = await Bun.file(new URL("../src/ui/newSessionDialogStateCreate.ts", import.meta.url)).text()
const sidebar = await Bun.file(new URL("../src/ui/SessionSidebar.tsx", import.meta.url)).text()
const app = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()
const navigation = await Bun.file(new URL("../src/ui/primaryNavigationStateCreate.ts", import.meta.url)).text()
const workspace = await Bun.file(new URL("../src/ui/workspaceScreenStateCreate.ts", import.meta.url)).text()
const route = await Bun.file(new URL("../src/ui/WorkspaceRoutePage.tsx", import.meta.url)).text()

test("New Session opens the production project dialog through workspace registration", () => {
  expect(sidebar).not.toContain("NewSessionDialog")
  expect(sidebar).not.toContain("CorvuDialog")
  expect(app).toContain('aria-label="New session"')
  expect(app).toContain("onClick={navigation.workspaceActions.sessionNew}")
  expect(navigation).toContain("sessionNew: () => workspaceActions.get()?.sessionNew()")
  expect(workspace).toContain("sessionNew: () => newSessionDialogOpenState.set(true)")
  expect(route).toContain('from "./NewSessionDialog.js"')
  expect(route).toContain('buttonClass="hidden"')
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
