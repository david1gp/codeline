import { expect, test } from "bun:test"
import { noteMutators } from "../src/note/noteMutators.js"

type TestNote = {
  id: string
  userId: string
  content: string
  projectPath: string | null
  sortOrder: number | null
  createdAt: number
  updatedAt: number
}

function noteTransactionCreate(notes: TestNote[], userId = "user-1") {
  return {
    run: async () => notes.filter((note) => note.userId === userId),
    mutate: {
      note: {
        insert: async (note: TestNote) => notes.push(note),
        update: async (update: Partial<TestNote> & Pick<TestNote, "id">) => {
          const existing = notes.find((note) => note.id === update.id)
          if (existing !== undefined) Object.assign(existing, update)
        },
        delete: async ({ id }: Pick<TestNote, "id">) => {
          const index = notes.findIndex((note) => note.id === id)
          if (index >= 0) notes.splice(index, 1)
        },
      },
    },
  }
}

function noteCreateInput(overrides: Partial<TestNote> = {}): TestNote {
  return {
    content: "content",
    createdAt: 1,
    id: "note-1",
    projectPath: "packages/codeline",
    sortOrder: 0,
    updatedAt: 1,
    userId: "user-1",
    ...overrides,
  }
}

test("note mutators expose stable create, update, delete, and reorder commands", () => {
  expect(Object.keys(noteMutators.note).filter((key) => key !== "~")).toEqual(["create", "update", "delete", "reorder"])
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

test("note create appends after deterministic compaction", async () => {
  const notes = [
    noteCreateInput({ id: "note-1", sortOrder: 4 }),
    noteCreateInput({ id: "note-2", sortOrder: null, updatedAt: 2 }),
  ]
  const tx = noteTransactionCreate(notes)

  await noteMutators.note.create.fn({
    args: { content: "new", createdAt: 3, id: "note-3", projectPath: "packages/codeline", updatedAt: 3 },
    ctx: { userId: "user-1" },
    tx: tx as never,
  })

  expect(notes.map((note) => [note.id, note.sortOrder])).toEqual([
    ["note-1", 0],
    ["note-2", 1],
    ["note-3", 2],
  ])
})

test("note update compacts the source project and appends to the destination", async () => {
  const notes = [
    noteCreateInput({ id: "note-1", projectPath: "source", sortOrder: 0 }),
    noteCreateInput({ id: "note-2", projectPath: "source", sortOrder: 2 }),
    noteCreateInput({ id: "note-3", projectPath: "destination", sortOrder: 0 }),
  ]
  const tx = noteTransactionCreate(notes)

  await noteMutators.note.update.fn({
    args: { content: "moved", id: "note-2", projectPath: "destination", updatedAt: 4 },
    ctx: { userId: "user-1" },
    tx: tx as never,
  })

  expect(notes.map((note) => [note.id, note.projectPath, note.sortOrder])).toEqual([
    ["note-1", "source", 0],
    ["note-2", "destination", 1],
    ["note-3", "destination", 0],
  ])
})

test("note update preserves the position within the current project", async () => {
  const notes = [
    noteCreateInput({ id: "note-1", sortOrder: 0 }),
    noteCreateInput({ id: "note-2", sortOrder: null, updatedAt: 2 }),
  ]
  const tx = noteTransactionCreate(notes)

  await noteMutators.note.update.fn({
    args: { content: "updated", id: "note-2", projectPath: "packages/codeline", updatedAt: 4 },
    ctx: { userId: "user-1" },
    tx: tx as never,
  })

  expect(notes.map((note) => [note.id, note.sortOrder, note.content])).toEqual([
    ["note-1", 0, "content"],
    ["note-2", 1, "updated"],
  ])
})

test("note delete compacts the remaining project notes", async () => {
  const notes = [
    noteCreateInput({ id: "note-1", sortOrder: 0 }),
    noteCreateInput({ id: "note-2", sortOrder: 3 }),
    noteCreateInput({ id: "note-3", sortOrder: null, updatedAt: 2 }),
  ]
  const tx = noteTransactionCreate(notes)

  await noteMutators.note.delete.fn({ args: "note-2", ctx: { userId: "user-1" }, tx: tx as never })

  expect(notes.map((note) => [note.id, note.sortOrder])).toEqual([
    ["note-1", 0],
    ["note-3", 1],
  ])
})

test("note reorder swaps adjacent notes and validates authorization and project membership", async () => {
  const notes = [noteCreateInput({ id: "note-1", sortOrder: 0 }), noteCreateInput({ id: "note-2", sortOrder: 1 })]
  const tx = noteTransactionCreate(notes)

  await noteMutators.note.reorder.fn({
    args: { direction: "down", id: "note-1", projectPath: "packages/codeline" },
    ctx: { userId: "user-1" },
    tx: tx as never,
  })

  expect(notes.map((note) => [note.id, note.sortOrder])).toEqual([
    ["note-1", 1],
    ["note-2", 0],
  ])
  await expect(
    noteMutators.note.reorder.fn({
      args: { direction: "up", id: "note-1", projectPath: null },
      ctx: { userId: "user-1" },
      tx: tx as never,
    }),
  ).rejects.toThrow("requested project")
  await expect(
    noteMutators.note.delete.fn({
      args: "note-1",
      ctx: { userId: "user-2" },
      tx: noteTransactionCreate(notes, "user-2") as never,
    }),
  ).rejects.toThrow("could not be found")
})

test("notes remain private between users sharing an organization", async () => {
  const notes = [
    noteCreateInput({ id: "note-user-1", userId: "user-1" }),
    noteCreateInput({ id: "note-user-2", userId: "user-2" }),
  ]
  const userTwoTransaction = noteTransactionCreate(notes, "user-2")

  await expect(
    noteMutators.note.update.fn({
      args: { content: "must remain private", id: "note-user-1", projectPath: "packages/codeline", updatedAt: 2 },
      ctx: { userId: "user-2" },
      tx: userTwoTransaction as never,
    }),
  ).rejects.toThrow("could not be found")

  expect(notes.find((note) => note.id === "note-user-1")?.content).toBe("content")
  expect(notes.filter((note) => note.userId === "user-2").map((note) => note.id)).toEqual(["note-user-2"])
})
