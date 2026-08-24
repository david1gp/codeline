import { expect, mock, test } from "bun:test"
import * as solidRuntime from "solid-js/dist/solid.js"
import { createRoot } from "solid-js/dist/solid.js"

mock.module("solid-js", () => solidRuntime)

const { notesPageStateCreate } = await import("../src/note/ui/notesPageStateCreate.js")

const note = {
  content: "Heading\nDetails",
  createdAt: 100,
  id: "note-1",
  projectPath: "/workspace/codeline",
  revision: 1,
  sortOrder: 0,
  updatedAt: 100,
  userId: "user-1",
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))

test("notes page state loads typed notes, project labels, and refreshes after retry", async () => {
  let noteListCalls = 0
  const root = createRoot((dispose) => ({
    dispose,
    state: notesPageStateCreate({
      accountId: () => "notes-page-state",
      fetcher: async (input) => {
        if (String(input) === "/api/notes") {
          noteListCalls += 1
          return Response.json([{ ...note, content: noteListCalls === 1 ? note.content : "Updated" }])
        }
        return Response.json({ projects: [{ id: "/workspace/codeline", label: "Codeline" }], truncated: false })
      },
    }),
  }))

  await tick()
  expect(root.state.groups()).toEqual([{ label: "Codeline", notes: [note], projectPath: "/workspace/codeline" }])
  expect(root.state.isLoading()).toBe(false)
  expect(root.state.isEmpty()).toBe(false)
  expect(noteListCalls).toBe(1)

  root.state.revalidate()
  expect(root.state.groups()[0]?.notes[0]?.content).toBe(note.content)
  await tick()
  expect(noteListCalls).toBe(2)
  expect(root.state.groups()[0]?.notes[0]?.content).toBe("Updated")
  root.dispose()
})
