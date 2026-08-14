import type { ProjectGitDiffSummary } from "./projectGitDiffSummarySchema.js"
import type { ProjectGitStatusFile } from "./projectGitStatusFileSchema.js"

export type ProjectGitPanelBranch = {
  isCurrent: boolean
  name: string
}

/** Mirrors ProjectGitStatus but accepts readonly file lists from fixtures. */
export type ProjectGitPanelStatus = {
  branch: string | null
  files: readonly ProjectGitStatusFile[]
  isDirty: boolean
  isGitRepository: boolean
}

/**
 * Rendering contract of the project Git panel, so production filesystem-backed
 * state and demo fixtures can supply the same shape without the view knowing
 * the source.
 */
export type ProjectGitPanelView = {
  actionStatus: () => "error" | "idle" | "loading" | "success"
  branchDelete: (branch: string) => void
  branchRename: (event: SubmitEvent, branch: string) => void
  branchSwitch: (branch: string) => void
  diffSummary: () => ProjectGitDiffSummary | null
  loadStatus: () => "error" | "loading" | "ready"
  localBranches: () => readonly ProjectGitPanelBranch[]
  message: () => string
  renameCancel: () => void
  renameOpen: (branch: string) => void
  renamingBranch: () => string | null
  retry: () => void
  status: () => ProjectGitPanelStatus | null
}
