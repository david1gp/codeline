import { expect, test } from "bun:test"

const source = await Bun.file(new URL("../src/ui/SessionList.tsx", import.meta.url)).text()

test("project rows use a discriminated target without exposing registered paths", () => {
  expect(source).toContain("sessionCreateInProject?: (target: SessionProjectTarget) => void")
  expect(source).toContain('{ kind: "registered", projectId: project.projectId }')
  expect(source).toContain('{ kind: "path", projectPath: project.projectPath }')
  expect(source).not.toContain("projectPath: project.projectPath, projectId: project.projectId")
})
