import { expect, test } from "bun:test"
import { noteGroupsDerive } from "../src/note/ui/noteGroupsDerive.js"

test("note groups use discovered labels without changing group or note ordering", () => {
  const notes = [
    { id: "unassigned", content: "unassigned", projectPath: null, sortOrder: 0, updatedAt: 1 },
    { id: "legacy", content: "legacy", projectPath: "packages/legacy", sortOrder: 0, updatedAt: 2 },
    { id: "opaque", content: "opaque", projectPath: "opaque-project-id", sortOrder: 1, updatedAt: 3 },
    { id: "opaque-first", content: "first", projectPath: "opaque-project-id", sortOrder: 0, updatedAt: 4 },
  ]

  const [unassignedNote, legacyNote, opaqueNote, firstNote] = notes

  expect(noteGroupsDerive(notes, [{ id: "opaque-project-id", label: "Codeline" }])).toEqual([
    {
      label: "Codeline",
      projectPath: "opaque-project-id",
      notes: [firstNote!, opaqueNote!],
    },
    {
      label: "packages/legacy",
      projectPath: "packages/legacy",
      notes: [legacyNote!],
    },
    {
      label: "Unassigned",
      projectPath: null,
      notes: [unassignedNote!],
    },
  ])
})
