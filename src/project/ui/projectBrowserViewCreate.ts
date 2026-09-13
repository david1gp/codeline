import { projectBrowserStateCreate } from "./projectBrowserStateCreate.js"
import type { ProjectBrowserView } from "./projectBrowserView.js"
import { projectGitPanelStateCreate } from "./projectGitPanelStateCreate.js"

type ProjectBrowserViewOptions = {
  apiBase?: string
  fetcher?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  projectId: string
}

/**
 * Composes the filesystem-backed browser and Git state behind the view
 * contract, keeping the production wiring outside the view-only TSX files.
 */
export function projectBrowserViewCreate(options: ProjectBrowserViewOptions): ProjectBrowserView {
  return {
    ...projectBrowserStateCreate(options),
    git: projectGitPanelStateCreate(options),
  }
}
