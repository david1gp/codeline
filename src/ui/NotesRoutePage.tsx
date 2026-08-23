import { useContext } from "solid-js"
import { NotesPage } from "../note/ui/NotesPage.js"
import { notesPageStateCreate } from "../note/ui/notesPageStateCreate.js"
import { apiFetchContext } from "./apiFetchContext.js"

export function NotesRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const state = notesPageStateCreate({ fetcher })
  return <NotesPage state={state} />
}
