import type { ProjectApiDirectoryResponse } from "./api/projectApiDirectoryResponseSchema.js"
import type { ProjectApiPreviewResponse } from "./api/projectApiPreviewResponseSchema.js"
import type { ProjectGitPanelView } from "./projectGitPanelView.js"

export type ProjectBrowserEntry = ProjectApiDirectoryResponse["entries"][number]

/** The schema pairs image and pdf in one member, so narrow on kind explicitly. */
export type ProjectBrowserBinaryPreview = Extract<ProjectApiPreviewResponse, { url: string }> & {
  kind: "image" | "pdf"
}

export type ProjectBrowserTextPreview = Extract<ProjectApiPreviewResponse, { kind: "text" }>

export type ProjectBrowserSelectedFile = {
  name: string
  path: string
}

export type ProjectBrowserTab = {
  displayMode: "preview" | "source"
  path: string
}

/**
 * Rendering contract of the project browser, so production filesystem-backed
 * state and demo fixtures can supply the same shape without the view knowing
 * the source.
 */
export type ProjectBrowserView = {
  currentPath: () => string
  directoryOpen: (entry: ProjectBrowserEntry) => void
  directoryStatus: () => "complete" | "error" | "loading"
  displayMode: () => "preview" | "source"
  displayModeSelect: (displayMode: "preview" | "source") => void
  downloadUrl: () => string | null
  entries: () => readonly ProjectBrowserEntry[]
  fileOpen: (entry: ProjectBrowserEntry) => void
  git: ProjectGitPanelView
  imagePreview: () => ProjectBrowserBinaryPreview | null
  isMarkdownPreview: () => boolean
  markdownPreviewHtml: () => string
  parentOpen: () => void
  pdfPreview: () => ProjectBrowserBinaryPreview | null
  preview: () => ProjectApiPreviewResponse | null
  previewStatus: () => "complete" | "error" | "idle" | "loading"
  retryDirectory: () => void
  retryPreview: () => void
  selectedFile: () => ProjectBrowserSelectedFile | null
  tabClose: (path: string) => void
  tabSelect: (path: string) => void
  tabs: () => readonly ProjectBrowserTab[]
  textPreview: () => ProjectBrowserTextPreview | null
}
