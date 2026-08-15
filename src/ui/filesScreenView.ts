import type { ProjectBrowserView } from "../project/projectBrowserView.js"

export type FilesScreenProject = {
  id: string
  label: string
}

/**
 * Rendering contract of the project files screen, so production API-backed
 * state and demo fixtures can supply the same shape without the view knowing
 * the source.
 */
export type FilesScreenView = {
  browser: () => ProjectBrowserView | null
  projects: () => readonly FilesScreenProject[]
  projectSelect: (event: Event & { currentTarget: HTMLSelectElement }) => void
  retry: () => void
  selectedProject: () => FilesScreenProject | null
  status: () => "error" | "loading" | "ready"
  truncated: () => boolean
}
