import { expect, test } from "bun:test"
import { noteProjectChoicesResolve } from "../src/note/ui/noteProjectChoicesResolve.js"

const projects = [
  { id: "a".repeat(64), label: "alpha" },
  { id: "b".repeat(64), label: "beta" },
]

test("note project choices store opaque IDs and display discovered labels", () => {
  expect(noteProjectChoicesResolve(projects, projects[1]!.id)).toEqual(projects)
})

test("note project choices preserve an existing value that is absent from discovery", () => {
  expect(noteProjectChoicesResolve(projects, "legacy/project")).toEqual([
    { id: "legacy/project", label: "legacy/project" },
    ...projects,
  ])
})
