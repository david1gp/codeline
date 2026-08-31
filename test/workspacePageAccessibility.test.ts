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

test("workspace surfaces share the active project state", async () => {
  const workspacePage = (await Bun.file(new URL("../src/ui/WorkspacePage.tsx", import.meta.url)).text()).replace(
    /\s+/g,
    " ",
  )
  const sidebar = await Bun.file(new URL("../src/ui/SessionSidebar.tsx", import.meta.url)).text()

  expect(workspacePage.split("activeProject={props.state.activeProject}").length - 1).toBe(3)
  expect(sidebar).toContain("activeProject={props.activeProject}")
})

test("the pending project identity scopes resource inspection and session creation", async () => {
  const source = await Bun.file(new URL("../src/ui/workspaceScreenStateCreate.ts", import.meta.url)).text()

  expect(source).toContain('if (target?.kind === "registered") return target.projectId')
  expect(source).toContain(
    "pendingSessionProjectId() === null ? (projectPathOverride.get() ?? activeProject.project().path) : null",
  )
  expect(source).toContain("projectId: pendingSessionProjectId")
  expect(source).toContain(
    "projectPath: () => (navigation.selectedSessionId() === null ? pendingSessionInspectionProjectPath() : null)",
  )
  expect(source).toContain("activeProjectId: pendingSessionProjectId")
  expect(source).toContain(
    "projectId: () => (navigation.selectedSessionId() === null ? pendingSessionProjectId() : null)",
  )
  expect(source).toContain("activeProjectPath: pendingSessionProjectPath")
  expect(source).toContain("? pendingSessionInspectionProjectPath()")
})
