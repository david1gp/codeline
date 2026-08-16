import { expect, test } from "bun:test"

test("the context-owned mobile session drawer is a full-width modal and isolates the workspace", async () => {
  const source = await Bun.file(new URL("../src/ui/WorkspacePage.tsx", import.meta.url)).text()
  const appSource = await Bun.file(new URL("../src/ui/App.tsx", import.meta.url)).text()

  expect(source).toContain('id="mobile-session-drawer"')
  expect(source).toContain('role="dialog"')
  expect(source).toContain('aria-modal="true"')
  expect(source).toContain('aria-labelledby="mobile-session-drawer-heading"')
  expect(source).toContain("tabIndex={-1}")
  expect(source).toContain("ref={state.sessionDrawerElement}")
  expect(source).toContain("inert={state.isSessionDrawerOpen()}")
  expect(source).toContain("w-full")
  expect(appSource).toContain("inert={navigation.sessionDrawer.isSessionDrawerOpen()}")
})
