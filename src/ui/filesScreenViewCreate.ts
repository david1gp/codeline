import { createMemo } from "solid-js"
import type { ProjectBrowserView } from "../project/projectBrowserView.js"
import { projectBrowserViewCreate } from "../project/projectBrowserViewCreate.js"
import type { ProjectRegistryState } from "../project/ui/projectRegistryStateCreate.js"
import { filesPageStateCreate } from "./filesPageStateCreate.js"
import type { FilesScreenView } from "./filesScreenView.js"

type FilesScreenViewOptions = {
  accountId?: () => string | null
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectRegistry?: ProjectRegistryState
  storage?: Pick<Storage, "getItem" | "setItem">
}

/**
 * Composes registered-project state with the filesystem-backed browser behind
 * the view contract, keeping the production wiring outside view-only TSX.
 * The browser is rebuilt whenever the browsed project root changes, matching
 * the previous per-project remount behavior.
 */
export function filesScreenViewCreate(options: FilesScreenViewOptions = {}): FilesScreenView {
  const state = filesPageStateCreate(options)

  const browser = createMemo<ProjectBrowserView | null>(() => {
    const projectId = state.selectedProject()?.id
    if (projectId === undefined) return null
    return projectBrowserViewCreate({ apiBase: options.apiBase, fetcher: options.fetcher, projectId })
  })

  return { ...state, browser }
}
