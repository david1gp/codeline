import type { SelectSingleEntry } from "#ui/input/select/SelectSingleEntry.js"
import type { ProjectBrowserView } from "../project/projectBrowserView.js"

export type FilesScreenProject = {
  id: string
  label: string
  parentFolder: { id: string; label: string } | null
}

/**
 * Rendering contract of the project files screen, so production API-backed
 * state and demo fixtures can supply the same shape without the view knowing
 * the source.
 */
export type FilesScreenView = {
  browser: () => ProjectBrowserView | null
  projectSelectorOptions: () => SelectSingleEntry[]
  projects: () => readonly FilesScreenProject[]
  projectSelect: (projectId: string) => void
  retry: () => void
  selectedProject: () => FilesScreenProject | null
  status: () => "error" | "loading" | "ready"
  truncated: () => boolean
}
