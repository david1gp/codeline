import { expect, test } from "bun:test"
import { noteProjectLabelResolve } from "../src/note/ui/noteProjectLabelResolve.js"

const projects = [
  { available: true, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb4", label: "Codeline" },
  { available: false, id: "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb5", label: "Unavailable Project" },
]

test("note project labels resolve registered IDs and preserve legacy paths", () => {
  expect(noteProjectLabelResolve(projects, "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb4")).toBe("Codeline")
  expect(noteProjectLabelResolve(projects, "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb5")).toBe("Unavailable Project")
  expect(noteProjectLabelResolve(projects, "0198e6b5-8c2a-7b1d-9e4f-2a6c8d0e1fb6", "packages/codeline")).toBe(
    "packages/codeline",
  )
  expect(noteProjectLabelResolve(projects, null)).toBe("Unassigned")
})
