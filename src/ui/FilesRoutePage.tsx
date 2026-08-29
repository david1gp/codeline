import { useContext } from "solid-js"
import { apiFetchContext } from "./apiFetchContext.js"
import { FilesPage } from "./FilesPage.js"
import { filesScreenViewCreate } from "./filesScreenViewCreate.js"

export function FilesRoutePage() {
  const fetcher = useContext(apiFetchContext)
  const state = filesScreenViewCreate({ fetcher })
  return <FilesPage state={state} />
}
