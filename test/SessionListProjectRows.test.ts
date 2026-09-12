import { expect, test } from "bun:test"

const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
const projectRowSource = await Bun.file(new URL("../src/ui/ProjectRow.tsx", import.meta.url)).text()
const sidebarSource = await Bun.file(new URL("../src/ui/SessionSidebar.tsx", import.meta.url)).text()
const targetSelectorSource = await Bun.file(
  new URL("../src/ui/sessionTargetSelectorStateCreate.ts", import.meta.url),
).text()

test("project rows use a discriminated target without exposing registered paths", () => {
  expect(source).toContain("sessionCreateInProject?: (target: SessionProjectTarget) => void")
  expect(projectRowSource).toContain('{ kind: "registered", projectId: props.project.projectId }')
  expect(projectRowSource).toContain('{ kind: "path", projectPath: props.project.projectPath }')
  expect(projectRowSource).not.toContain("projectPath: project.projectPath, projectId: project.projectId")
})

test("project-name selection navigates without replacing the explicit create action", () => {
  expect(source).toContain("sessionNewInProject?: (target: SessionProjectTarget) => void")
  expect(projectRowSource).toContain("sessionNewInProject?: (target: SessionProjectTarget) => void")
  expect(projectRowSource).toContain("props.sessionNewInProject(")
  expect(projectRowSource).toContain("props.sessionCreateInProject?.(")
  expect(sidebarSource).toContain("sessionNewInProject={(target) => props.sessionTarget.sessionNewInProject(target)}")
  expect(sidebarSource).toContain(
    "sessionCreateInProject={(target) => void props.sessionTarget.sessionCreateStart(target)}",
  )
  expect(targetSelectorSource).toContain("const sessionNewInProject = (projectTarget: SessionProjectTarget)")
  expect(targetSelectorSource).toContain("options.pendingProjectTargetSet?.(projectTarget)")
  expect(targetSelectorSource).toContain("options.sessionNew?.()")
})
