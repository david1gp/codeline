import { FilesPage } from "./FilesPage.js"
import { filesScreenViewCreate } from "./filesScreenViewCreate.js"

export function FilesRoutePage() {
  const state = filesScreenViewCreate()
  return <FilesPage state={state} />
}
