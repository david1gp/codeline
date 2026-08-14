import { NotesPage } from "../note/ui/NotesPage.js"
import { notesPageStateCreate } from "../note/ui/notesPageStateCreate.js"

export function NotesRoutePage() {
  const state = notesPageStateCreate()
  return <NotesPage state={state} />
}
