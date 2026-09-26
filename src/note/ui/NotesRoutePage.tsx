import { useContext } from "solid-js"
import { NotesPage } from "./NotesPage.js"
import { notesPageStateCreate } from "./notesPageStateCreate.js"
import { apiFetchContext } from "../../ui/apiFetchContext.js"

export function NotesRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const state = notesPageStateCreate({ fetcher })
  return <NotesPage state={state} />
}
