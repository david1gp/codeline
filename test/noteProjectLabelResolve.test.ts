import { expect, test } from "bun:test"
import { noteProjectLabelResolve } from "../src/note/ui/noteProjectLabelResolve.js"

const projects = [{ id: "opaque-project-id", label: "Codeline" }]

test("note project labels resolve discovered IDs and preserve legacy paths", () => {
  expect(noteProjectLabelResolve(projects, "opaque-project-id")).toBe("Codeline")
  expect(noteProjectLabelResolve(projects, "packages/codeline")).toBe("packages/codeline")
  expect(noteProjectLabelResolve(projects, null)).toBe("Unassigned")
})
