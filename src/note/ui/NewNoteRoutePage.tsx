import { useContext } from "solid-js"
import { NewNotePage } from "./NewNotePage.js"
import { newNotePageStateCreate } from "./newNotePageStateCreate.js"
import { apiFetchContext } from "../../ui/apiFetchContext.js"

export function NewNoteRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const state = newNotePageStateCreate({ fetcher })
  return <NewNotePage state={state} />
}
