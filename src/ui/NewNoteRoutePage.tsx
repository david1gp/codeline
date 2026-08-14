import { NewNotePage } from "../note/ui/NewNotePage.js"
import { newNotePageStateCreate } from "../note/ui/newNotePageStateCreate.js"

export function NewNoteRoutePage() {
  const state = newNotePageStateCreate()
  return <NewNotePage state={state} />
}
