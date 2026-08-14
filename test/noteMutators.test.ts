import { expect, test } from "bun:test"
import { noteMutators } from "../src/note/noteMutators.js"

test("note mutators expose stable create, update, and delete commands", () => {
  expect(Object.keys(noteMutators.note).filter((key) => key !== "~")).toEqual(["create", "update", "delete"])
  expect(
    noteMutators.note.create({
      content: "first line\nsecond line",
      createdAt: 1,
      id: "note-1",
      projectPath: "packages/codeline",
      updatedAt: 1,
    }),
  ).toMatchObject({ args: { id: "note-1" } })
  expect(
    noteMutators.note.update({
      content: "updated",
      id: "note-1",
      projectPath: null,
      updatedAt: 2,
    }),
  ).toMatchObject({ args: { projectPath: null, updatedAt: 2 } })
  expect(noteMutators.note.delete("note-1")).toMatchObject({ args: "note-1" })
})
