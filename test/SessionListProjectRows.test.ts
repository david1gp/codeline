import { expect, test } from "bun:test"

const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()
const projectRowSource = await Bun.file(new URL("../src/ui/ProjectRow.tsx", import.meta.url)).text()

test("project rows use a discriminated target without exposing registered paths", () => {
  expect(source).toContain("sessionCreateInProject?: (target: SessionProjectTarget) => void")
  expect(projectRowSource).toContain('{ kind: "registered", projectId: props.project.projectId }')
  expect(projectRowSource).toContain('{ kind: "path", projectPath: props.project.projectPath }')
  expect(projectRowSource).not.toContain("projectPath: project.projectPath, projectId: project.projectId")
})
