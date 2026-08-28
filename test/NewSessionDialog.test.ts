import { expect, test } from "bun:test"

const dialog = await Bun.file(new URL("../src/ui/NewSessionDialog.tsx", import.meta.url)).text()
const state = await Bun.file(new URL("../src/ui/newSessionDialogStateCreate.ts", import.meta.url)).text()

test("the existing-project dialog action hands off to the no-session workspace", () => {
  expect(dialog).toContain("state.formSubmit")
  expect(dialog).not.toContain("sessionCreateStart")
  expect(state).toContain("const projectSelectionConfirm = () =>")
  expect(state).toContain("options.projectPathOverride.set(projectPath)")
  expect(state).toContain("open.set(false)")
  expect(state).toContain("options.sessionTarget.sessionNew?.()")
  expect(state).not.toContain("options.sessionTarget.sessionCreateStart")
})

test("the handoff action identifies project selection and preserves new-project flow", () => {
  expect(state).toContain('return "Use project"')
  expect(state).toContain('return "New Project"')
})
