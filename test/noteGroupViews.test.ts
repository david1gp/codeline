import { expect, test } from "bun:test"

test("note list and workspace render resolved group labels", async () => {
  const notesPage = await Bun.file(new URL("../src/note/ui/NotesPage.tsx", import.meta.url)).text()
  const workspacePage = await Bun.file(new URL("../src/note/ui/NoteWorkspacePage.tsx", import.meta.url)).text()

  expect(notesPage).toContain("{group.label}")
  expect(notesPage).toContain('group.projectPath === null ? "Unassigned notes" : group.label')
  expect(notesPage).not.toContain('{group.projectPath ?? "Unassigned"}')
  expect(workspacePage).toContain("{group.label}")
  expect(workspacePage).not.toContain('{group.projectPath ?? "Unassigned"}')
})
