import { expect, test } from "bun:test"
import type { DatabaseClient } from "../src/database/databaseClient.js"
import { noteCreate } from "../src/note/actions/noteCreate.js"
import { noteReorder } from "../src/note/actions/noteReorder.js"
import { noteUpdate } from "../src/note/actions/noteUpdate.js"

const database = {} as DatabaseClient

test("noteCreate returns an action Result error for invalid input", async () => {
  const result = await noteCreate(database, "user-1", { content: "missing required fields" })

  expect(result).toMatchObject({
    errorMessage: "The note creation input is invalid.",
    op: "noteCreate",
    success: false,
  })
})

test("noteUpdate returns an action Result error for invalid input", async () => {
  const result = await noteUpdate(database, "user-1", "note-1", { content: "missing required fields" })

  expect(result).toMatchObject({
    errorMessage: "The note update input is invalid.",
    op: "noteUpdate",
    success: false,
  })
})

test("noteReorder returns an action Result error for invalid input", async () => {
  const result = await noteReorder(database, "user-1", "note-1", { direction: "sideways" })

  expect(result).toMatchObject({
    errorMessage: "The note reorder input is invalid.",
    op: "noteReorder",
    success: false,
  })
})
